import type { PlatformCode, GeneratePlatformOutput } from '@/types';
import { DashScopeProvider, type AIProvider } from '@/lib/ai/provider';

export interface GenerateAllResult {
  results: Partial<Record<PlatformCode, GeneratePlatformOutput>>;
  errors: Partial<Record<PlatformCode, string>>;
  durationMs: number;
  model: string;
  partialFailure: boolean;
}

export async function generateAll(
  content: string,
  platforms: PlatformCode[],
  options?: { tone?: string; length?: string },
  provider: AIProvider = new DashScopeProvider(),
): Promise<GenerateAllResult> {
  const uniquePlatforms = [...new Set(platforms)];
  const start = Date.now();

  const settled = await Promise.allSettled(
    uniquePlatforms.map((platform) =>
      provider.generate({
        content,
        platform,
        tone: options?.tone as 'professional' | 'casual' | 'humorous' | undefined,
        length: options?.length as 'short' | 'medium' | 'long' | undefined,
      }),
    ),
  );

  const durationMs = Date.now() - start;

  const results: Partial<Record<PlatformCode, GeneratePlatformOutput>> = {};
  const errors: Partial<Record<PlatformCode, string>> = {};
  let model = '';

  for (let i = 0; i < uniquePlatforms.length; i++) {
    const platform = uniquePlatforms[i];
    const outcome = settled[i];
    if (outcome.status === 'fulfilled') {
      results[platform] = outcome.value;
      if (!model) model = outcome.value.model;
    } else {
      const reason = outcome.reason as { message?: string } | undefined;
      errors[platform] = reason?.message ?? 'Unknown error';
    }
  }

  return {
    results,
    errors,
    durationMs,
    model,
    partialFailure: Object.keys(errors).length > 0,
  };
}
