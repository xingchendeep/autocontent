import { logger } from '@/lib/logger';

export interface BatchJobPayload {
  jobId: string;
  itemId: string;
  retryCount: number;
}

const QSTASH_API_URL = 'https://qstash.upstash.io/v2/publish';
const MAX_RETRIES = 3;

/**
 * Enqueues a single batch job item to QStash.
 * Failures are logged but never thrown — callers always receive HTTP 202.
 */
export async function enqueueJob(
  _jobId: string,
  payload: BatchJobPayload,
): Promise<void> {
  const token = process.env.QSTASH_TOKEN;
  if (!token) {
    logger.error('enqueueJob: QSTASH_TOKEN is not set', { jobId: payload.jobId, itemId: payload.itemId });
    return;
  }

  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/jobs/callback`;

  try {
    const res = await fetch(`${QSTASH_API_URL}/${encodeURIComponent(callbackUrl)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Upstash-Retries': String(MAX_RETRIES),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error('enqueueJob: QStash returned non-OK status', {
        jobId: payload.jobId,
        itemId: payload.itemId,
        status: res.status,
        body: text,
      });
    } else {
      logger.info('enqueueJob: item enqueued', { jobId: payload.jobId, itemId: payload.itemId });
    }
  } catch (err) {
    logger.error('enqueueJob: failed to reach QStash', {
      jobId: payload.jobId,
      itemId: payload.itemId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
