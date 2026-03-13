import type { GeneratePlatformInput, GeneratePlatformOutput } from '@/types';
import { PLATFORM_TEMPLATES } from '@/lib/ai/templates';
import { ERROR_CODES } from '@/lib/errors';

// --- AIProvider interface ---

export interface AIProvider {
  generate(input: GeneratePlatformInput): Promise<GeneratePlatformOutput>;
}

// --- Prompt builder ---

function buildPrompt(input: GeneratePlatformInput): string {
  const template = PLATFORM_TEMPLATES[input.platform];
  const toneNote = input.tone ? `语气风格：${input.tone}。` : '';
  const lengthNote = input.length ? `长度要求：${input.length}。` : '';

  return [
    `你是一位专业的社交媒体文案创作者。`,
    `目标平台：${template.displayName}`,
    `平台规则：${template.promptInstructions}`,
    toneNote,
    lengthNote,
    `请根据以下内容生成适合该平台的文案，以 JSON 格式返回，包含字段：`,
    `- title（可选，字符串）：标题，不超过 ${template.maxTitleLength} 字`,
    `- content（必填，字符串）：正文，不超过 ${template.maxContentLength} 字`,
    `- hashtags（可选，字符串数组）：话题标签`,
    ``,
    `原始内容：`,
    input.content,
  ]
    .filter(Boolean)
    .join('\n');
}

// --- DashScope provider ---

interface DashScopeMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DashScopeChoice {
  message: { content: string };
}

interface DashScopeUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

interface DashScopeResponse {
  model: string;
  choices: DashScopeChoice[];
  usage: DashScopeUsage;
}

export class DashScopeProvider implements AIProvider {
  private readonly apiKey: string;
  private readonly model = 'qwen-plus';
  private readonly timeoutMs = 20_000;
  private readonly endpoint =
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

  constructor() {
    const key = process.env.DASHSCOPE_API_KEY;
    if (!key) throw new Error('DASHSCOPE_API_KEY is not set');
    this.apiKey = key;
  }

  async generate(input: GeneratePlatformInput): Promise<GeneratePlatformOutput> {
    const prompt = buildPrompt(input);

    const messages: DashScopeMessage[] = [
      { role: 'user', content: prompt },
    ];

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      // AbortError = timeout; any fetch-level failure maps to AI_PROVIDER_ERROR
      const message =
        err instanceof Error ? err.message : 'AI provider request failed';
      throw Object.assign(new Error(message), {
        code: ERROR_CODES.AI_PROVIDER_ERROR,
      });
    }

    if (!response.ok) {
      let detail = '';
      try {
        const body = await response.json();
        detail = JSON.stringify(body);
      } catch {
        // ignore parse failure
      }
      throw Object.assign(
        new Error(`DashScope returned ${response.status}: ${detail}`),
        { code: ERROR_CODES.AI_PROVIDER_ERROR },
      );
    }

    const data = (await response.json()) as DashScopeResponse;
    const raw = data.choices?.[0]?.message?.content ?? '{}';

    let parsed: { title?: string; content?: string; hashtags?: string[] };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      throw Object.assign(new Error('Failed to parse AI response JSON'), {
        code: ERROR_CODES.AI_PROVIDER_ERROR,
      });
    }

    if (!parsed.content) {
      throw Object.assign(new Error('AI response missing content field'), {
        code: ERROR_CODES.AI_PROVIDER_ERROR,
      });
    }

    return {
      title: parsed.title,
      content: parsed.content,
      hashtags: parsed.hashtags,
      tokensInput: data.usage?.prompt_tokens ?? 0,
      tokensOutput: data.usage?.completion_tokens ?? 0,
      model: data.model ?? this.model,
    };
  }
}
