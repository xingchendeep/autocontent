import { logger } from '@/lib/logger';
import type { ExtractionResult } from './types';

/**
 * 阿里云 DashScope Paraformer ASR 服务
 * 使用 DASHSCOPE_API_KEY 调用语音识别
 *
 * 流程：提交异步转写任务 → 轮询结果
 * 文档：https://www.alibabacloud.com/help/en/model-studio/paraformer-recorded-speech-recognition-restful-api
 */

const SUBMIT_URL = 'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription';
const TASK_URL = 'https://dashscope.aliyuncs.com/api/v1/tasks';
const MAX_POLL_ATTEMPTS = 60;
const POLL_INTERVAL_MS = 3000;

interface TaskSubmitResponse {
  output?: { task_id: string; task_status: string };
  request_id?: string;
}

interface TaskQueryResponse {
  output?: {
    task_id: string;
    task_status: 'SUCCEEDED' | 'FAILED' | 'PENDING' | 'RUNNING';
    results?: Array<{
      file_url: string;
      transcription_url?: string;
      subtask_status: string;
      code?: string;
      message?: string;
    }>;
  };
}

interface TranscriptionOutput {
  transcripts?: Array<{
    text: string;
    content_duration_in_milliseconds?: number;
    sentences?: Array<{
      text: string;
      begin_time: number;
      end_time: number;
    }>;
  }>;
}

function getApiKey(): string {
  const key = process.env.DASHSCOPE_API_KEY;
  if (!key) throw new Error('DASHSCOPE_API_KEY is not configured');
  return key;
}

/** 提交异步转写任务 */
export async function submitTranscriptionTask(
  audioUrl: string,
  options?: { isOssPrefix?: boolean },
): Promise<string> {
  const apiKey = getApiKey();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'X-DashScope-Async': 'enable',
  };

  // oss:// 前缀的临时 URL 需要加这个 header，DashScope 才能解析
  if (options?.isOssPrefix) {
    headers['X-DashScope-OssResourceResolve'] = 'enable';
  }

  const res = await fetch(SUBMIT_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'paraformer-v2',
      input: {
        file_urls: [audioUrl],
      },
      parameters: {
        language_hints: ['zh', 'en'],
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error('asr-service: submit task failed', { status: res.status, body: text });
    throw new Error(`ASR task submission failed: ${res.status}`);
  }

  const json = (await res.json()) as TaskSubmitResponse;
  const taskId = json.output?.task_id;
  if (!taskId) {
    throw new Error('ASR task submission returned no task_id');
  }

  logger.info('asr-service: task submitted', { taskId, audioUrl });
  return taskId;
}

/** 轮询转写任务结果 */
export async function pollTranscriptionResult(taskId: string): Promise<ExtractionResult> {
  const apiKey = getApiKey();

  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const res = await fetch(`${TASK_URL}/${taskId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      logger.warn('asr-service: poll failed', { taskId, status: res.status });
      continue;
    }

    const json = (await res.json()) as TaskQueryResponse;
    const status = json.output?.task_status;

    if (status === 'SUCCEEDED') {
      const results = json.output?.results;
      if (!results?.length) {
        throw new Error('ASR succeeded but no results returned');
      }

      // 检查子任务状态
      const subtask = results[0];
      if (subtask.subtask_status === 'FAILED') {
        throw new Error(`ASR subtask failed: ${subtask.message ?? subtask.code ?? 'unknown'}`);
      }

      const transcriptionUrl = subtask.transcription_url;
      if (!transcriptionUrl) {
        throw new Error('ASR succeeded but no transcription_url');
      }

      // 下载转写结果
      const transRes = await fetch(transcriptionUrl);
      if (!transRes.ok) {
        throw new Error(`Failed to fetch transcription result: ${transRes.status}`);
      }

      const transJson = (await transRes.json()) as TranscriptionOutput;
      const text = transJson.transcripts
        ?.map((t) => t.text)
        .filter(Boolean)
        .join('\n') ?? '';

      if (!text) {
        throw new Error('ASR returned empty transcription');
      }

      // 时长
      const durationMs = transJson.transcripts?.[0]?.content_duration_in_milliseconds;
      const durationSeconds = durationMs ? Math.ceil(durationMs / 1000) : undefined;

      logger.info('asr-service: transcription completed', { taskId, textLength: text.length });

      return {
        text,
        method: 'asr',
        durationSeconds,
        language: 'zh',
      };
    }

    if (status === 'FAILED') {
      const results = json.output?.results;
      const failMsg = results?.[0]?.message ?? results?.[0]?.code ?? 'unknown reason';
      logger.error('asr-service: transcription failed', { taskId, failMsg, results });
      throw new Error(`ASR transcription failed: ${failMsg}`);
    }

    // PENDING or RUNNING — continue polling
  }

  throw new Error('ASR transcription timed out');
}

/** 一步完成：提交 + 轮询 */
export async function transcribeAudio(
  audioUrl: string,
  options?: { isOssPrefix?: boolean },
): Promise<ExtractionResult> {
  const taskId = await submitTranscriptionTask(audioUrl, options);
  return pollTranscriptionResult(taskId);
}
