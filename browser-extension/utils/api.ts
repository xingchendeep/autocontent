import { getApiKey } from './storage';

export type PlatformCode =
  | 'douyin' | 'xiaohongshu' | 'bilibili' | 'weibo' | 'wechat'
  | 'twitter' | 'linkedin' | 'kuaishou' | 'zhihu' | 'toutiao';

export interface GenerateRequest {
  content: string;
  platforms: PlatformCode[];
}

export interface PlatformOutput {
  title?: string;
  content: string;
  model?: string;
  tokensInput?: number;
  tokensOutput?: number;
}

export interface GenerateResult {
  generationId: string;
  results: Record<string, PlatformOutput>;
  errors?: Record<string, string>;
  durationMs?: number;
  model?: string;
  partialFailure?: boolean;
}

export interface ApiError {
  message: string;
  code?: string;
}

const APP_URL = 'https://www.help-online.cn';

/** 提取任务状态 */
export interface ExtractJob {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  platform: string;
  result?: {
    text: string;
    method: string;
    durationSeconds?: number;
  };
  error?: string;
}

/**
 * POST /api/extract - 提交视频脚本提取任务
 */
export async function extractVideoScript(videoUrl: string, audioUrl?: string, awemeId?: string): Promise<ExtractJob> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('请先在插件设置中配置 API Key');

  let res: Response;
  try {
    const body: Record<string, string> = { videoUrl };
    if (audioUrl) body.audioUrl = audioUrl;
    if (awemeId) body.awemeId = awemeId;

    res = await fetch(`${APP_URL}/api/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('网络连接失败，请检查网络后重试');
  }

  if (res.status === 401) throw new Error('API Key 无效或已过期');
  if (res.status === 429) throw new Error('今日提取次数已用完，请明天再试或升级套餐');
  if (!res.ok) throw new Error(`提取失败（${res.status}）`);

  const json = (await res.json()) as { data: ExtractJob };
  return json.data;
}

/**
 * GET /api/extract/:id - 查询提取任务状态
 */
export async function getExtractJobStatus(jobId: string): Promise<ExtractJob> {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('请先配置 API Key');

  const res = await fetch(`${APP_URL}/api/extract/${jobId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) throw new Error(`查询失败（${res.status}）`);

  const json = (await res.json()) as { data: ExtractJob };
  return json.data;
}

/**
 * 轮询提取任务直到完成或失败
 */
export async function waitForExtraction(jobId: string, maxAttempts = 40): Promise<ExtractJob> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const job = await getExtractJobStatus(jobId);
    if (job.status === 'completed' || job.status === 'failed') return job;
  }
  throw new Error('提取超时，请稍后重试');
}

/**
 * 调用 POST /api/v1/generate，使用 Authorization: Bearer <api_key>
 * 返回用户友好的错误信息，不暴露内部错误码
 */
export async function generate(req: GenerateRequest): Promise<GenerateResult> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('请先在插件设置中配置 API Key');
  }

  let res: Response;
  try {
    res = await fetch(`${APP_URL}/api/v1/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(req),
    });
  } catch {
    throw new Error('网络连接失败，请检查网络后重试');
  }

  if (res.status === 401) {
    throw new Error('API Key 无效或已过期，请重新配置');
  }
  if (res.status === 429) {
    throw new Error('请求过于频繁，请稍后再试');
  }
  if (res.status === 402) {
    throw new Error('当前套餐不支持此操作，请升级套餐');
  }
  if (!res.ok) {
    throw new Error(`生成失败（${res.status}），请稍后重试`);
  }

  const json = (await res.json()) as { data: GenerateResult };
  return json.data;
}
