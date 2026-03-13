'use client';

import { track as vercelTrack } from '@vercel/analytics';

type EventProperties = Record<string, string | number | boolean>;

function getPostHog() {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).posthog ?? null;
}

function track(event: string, properties?: EventProperties) {
  try { vercelTrack(event, properties); } catch { /* non-Vercel env */ }
  try { getPostHog()?.capture(event, properties); } catch { /* PostHog not ready */ }
}

export function trackPageView() {
  track('page_view');
}

export function trackGenerateClick(platforms: string[]) {
  track('generate_click', { platforms: platforms.join(','), platform_count: platforms.length });
}

export function trackGenerateSuccess(platforms: string[], durationMs: number, model: string) {
  track('generate_success', {
    platforms: platforms.join(','),
    platform_count: platforms.length,
    duration_ms: durationMs,
    model,
  });
}

export function trackGenerateFail(errorMessage: string, platforms: string[]) {
  track('generate_fail', {
    error: errorMessage,
    platforms: platforms.join(','),
    platform_count: platforms.length,
  });
}

export function trackCopyClick(platform: string) {
  track('copy_click', { platform });
}
