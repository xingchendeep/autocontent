import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/db/client';
import { generateAll } from '@/lib/ai/service';
import { logger } from '@/lib/logger';
import type { PlatformCode } from '@/types';

const MAX_RETRIES = 3;

const callbackSchema = z.object({
  jobId: z.string().uuid(),
  itemId: z.string().uuid(),
  retryCount: z.number().int().min(0),
});

/**
 * Verifies the QStash signature using current and next signing keys.
 * Returns true if valid, false otherwise.
 */
async function verifyQStashSignature(
  signature: string | null,
  rawBody: string,
): Promise<boolean> {
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (!currentKey && !nextKey) {
    // No keys configured — skip verification in dev/test
    logger.warn('QStash signing keys not configured, skipping signature verification');
    return true;
  }

  if (!signature) return false;

  // Verify against current key, then next key as fallback
  for (const key of [currentKey, nextKey]) {
    if (!key) continue;
    try {
      const encoder = new TextEncoder();
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(key),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
      );
      const sigBytes = Buffer.from(signature, 'base64');
      const valid = await crypto.subtle.verify('HMAC', cryptoKey, sigBytes, encoder.encode(rawBody));
      if (valid) return true;
    } catch {
      // Try next key
    }
  }
  return false;
}

/**
 * Aggregates batch_job status from its items and updates the parent record.
 */
async function aggregateBatchJobStatus(jobId: string): Promise<void> {
  const db = createServiceRoleClient();

  const { data: items, error } = await db
    .from('batch_job_items')
    .select('status')
    .eq('job_id', jobId);

  if (error || !items) return;

  const statuses = (items as { status: string }[]).map((i) => i.status);
  const total = statuses.length;
  const completed = statuses.filter((s) => s === 'completed').length;
  const failed = statuses.filter((s) => s === 'failed').length;
  const pending = statuses.filter((s) => s === 'pending' || s === 'processing').length;

  // Only update job status when all items are terminal
  if (pending > 0) {
    await db
      .from('batch_jobs')
      .update({ completed_count: completed, failed_count: failed, status: 'processing' })
      .eq('id', jobId);
    return;
  }

  let jobStatus: string;
  if (completed === total) jobStatus = 'completed';
  else if (failed === total) jobStatus = 'failed';
  else jobStatus = 'partial';

  await db
    .from('batch_jobs')
    .update({ completed_count: completed, failed_count: failed, status: jobStatus })
    .eq('id', jobId);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Read raw body once — used for both signature verification and JSON parsing
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: 'Failed to read body' }, { status: 400 });
  }

  const signature = req.headers.get('upstash-signature');
  const valid = await verifyQStashSignature(signature, rawBody);
  if (!valid) {
    logger.warn('jobs/callback: invalid QStash signature');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = callbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { jobId, itemId, retryCount } = parsed.data;
  const db = createServiceRoleClient();

  // Fetch the item
  const { data: item, error: fetchError } = await db
    .from('batch_job_items')
    .select('id, job_id, input_content, status, retry_count')
    .eq('id', itemId)
    .eq('job_id', jobId)
    .maybeSingle();

  if (fetchError || !item) {
    logger.error('jobs/callback: item not found', { jobId, itemId });
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  const row = item as {
    id: string;
    job_id: string;
    input_content: string;
    status: string;
    retry_count: number;
  };

  // Skip already-terminal items
  if (row.status === 'completed' || row.status === 'failed') {
    return NextResponse.json({ ok: true });
  }

  // Fetch parent job for platform list
  const { data: job, error: jobFetchError } = await db
    .from('batch_jobs')
    .select('platforms, template_id')
    .eq('id', jobId)
    .maybeSingle();

  if (jobFetchError || !job) {
    logger.error('jobs/callback: job not found', { jobId });
    return NextResponse.json({ error: 'Job not found' }, { status: 500 });
  }

  const jobRow = job as { platforms: string[]; template_id: string | null };

  // Mark item as processing
  await db
    .from('batch_job_items')
    .update({ status: 'processing' })
    .eq('id', itemId);

  try {
    const result = await generateAll(
      row.input_content,
      jobRow.platforms as PlatformCode[],
    );

    const hasResults = Object.keys(result.results).length > 0;

    if (hasResults) {
      await db
        .from('batch_job_items')
        .update({ status: 'completed', results: result.results })
        .eq('id', itemId);
    } else {
      throw new Error('All platforms failed: ' + JSON.stringify(result.errors));
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const newRetryCount = retryCount + 1;

    if (newRetryCount >= MAX_RETRIES) {
      await db
        .from('batch_job_items')
        .update({ status: 'failed', error_message: errMsg, retry_count: newRetryCount })
        .eq('id', itemId);
    } else {
      await db
        .from('batch_job_items')
        .update({ status: 'pending', retry_count: newRetryCount })
        .eq('id', itemId);

      logger.warn('jobs/callback: generation failed, will retry', { jobId, itemId, retryCount: newRetryCount, error: errMsg });
      // Return 500 so QStash retries
      return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
    }
  }

  // Aggregate parent job status
  await aggregateBatchJobStatus(jobId);

  return NextResponse.json({ ok: true });
}
