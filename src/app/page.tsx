'use client';

import { useReducer, useState, useEffect } from 'react';
import Link from 'next/link';
import Hero from '@/components/layout/Hero';
import ContentInput from '@/components/generate/ContentInput';
import VideoUrlInput from '@/components/generate/VideoUrlInput';
import FileUploadInput from '@/components/generate/FileUploadInput';
import PlatformSelector from '@/components/generate/PlatformSelector';
import GenerateButton from '@/components/generate/GenerateButton';
import ResultCard from '@/components/generate/ResultCard';
import { TemplateSelector } from '@/components/generate/TemplateSelector';
import { readHistory, prependHistory } from '@/lib/localHistory';
import { useAuth } from '@/hooks/useAuth';
import { useCloudHistory } from '@/hooks/useCloudHistory';
import { useSavedScripts } from '@/hooks/useSavedScripts';
import {
  trackPageView,
  trackGenerateClick,
  trackGenerateSuccess,
  trackGenerateFail,
} from '@/lib/analytics';
import type {
  PlatformCode,
  GenerateResponse,
  GeneratePlatformOutput,
  ApiSuccess,
  ApiError,
  HistoryRecord,
  HistorySummaryItem,
  HistoryDetailResponse,
} from '@/types';

// --- State machine ---

type UIState = 'idle' | 'loading' | 'success' | 'error';

interface PageState {
  uiState: UIState;
  content: string;
  inputSource: 'manual' | 'extract';
  extractedUrl: string | null;
  selectedPlatforms: PlatformCode[];
  response: GenerateResponse | null;
  errorMessage: string | null;
}

type Action =
  | { type: 'SET_CONTENT'; payload: string }
  | { type: 'SET_EXTRACTED'; payload: { content: string; url?: string } }
  | { type: 'SET_PLATFORMS'; payload: PlatformCode[] }
  | { type: 'GENERATE_START' }
  | { type: 'GENERATE_SUCCESS'; payload: GenerateResponse }
  | { type: 'GENERATE_ERROR'; payload: string }
  | { type: 'CLEAR' }
  | { type: 'RESTORE'; payload: GenerateResponse };

const initialState: PageState = {
  uiState: 'idle',
  content: '',
  inputSource: 'manual',
  extractedUrl: null,
  selectedPlatforms: [],
  response: null,
  errorMessage: null,
};

function reducer(state: PageState, action: Action): PageState {
  switch (action.type) {
    case 'SET_CONTENT':
      return { ...state, content: action.payload, inputSource: 'manual', extractedUrl: null };
    case 'SET_EXTRACTED':
      return { ...state, content: action.payload.content, inputSource: 'extract', extractedUrl: action.payload.url ?? null };
    case 'SET_PLATFORMS':
      return { ...state, selectedPlatforms: action.payload };
    case 'GENERATE_START':
      return { ...state, uiState: 'loading', errorMessage: null };
    case 'GENERATE_SUCCESS':
      return { ...state, uiState: 'success', response: action.payload };
    case 'GENERATE_ERROR':
      return { ...state, uiState: 'error', errorMessage: action.payload };
    case 'CLEAR':
      return { ...initialState };
    case 'RESTORE':
      return { ...state, uiState: 'success', response: action.payload };
    default:
      return state;
  }
}

// --- Page component ---

export default function HomePage() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [history, setHistory] = useState<HistoryRecord[]>(() => readHistory());
  const [inputMode, setInputMode] = useState<'text' | 'url' | 'upload'>('text');
  const [templateId, setTemplateId] = useState<string | null>(null);

  // Task 7.1: Auth and cloud history hooks
  const { user, loading: authLoading } = useAuth();
  const cloudHistory = useCloudHistory(!!user);
  const savedScripts = useSavedScripts(!!user);

  useEffect(() => { trackPageView(); }, []);

  const isLoading = state.uiState === 'loading';
  const contentOverLimit = state.content.length > 100000;
  const canGenerate =
    state.content.trim().length > 0 &&
    !contentOverLimit &&
    state.selectedPlatforms.length > 0;

  // Task 7.3: Fall back to local history when cloud API fails
  const shouldUseCloudHistory = !!user && !cloudHistory.error;

  // Task 7.4: Fetch full record from cloud history detail API
  async function handleCloudHistoryClick(item: HistorySummaryItem) {
    try {
      const res = await fetch(`/api/history/${item.id}`);
      const json = (await res.json()) as ApiSuccess<HistoryDetailResponse> | ApiError;

      if (!json.success) {
        dispatch({
          type: 'GENERATE_ERROR',
          payload: (json as ApiError).error.message,
        });
        return;
      }

      const detail = (json as ApiSuccess<HistoryDetailResponse>).data;
      const results = detail.resultJson as Partial<Record<PlatformCode, GeneratePlatformOutput>>;

      dispatch({
        type: 'RESTORE',
        payload: {
          generationId: detail.id,
          results,
          errors: {},
          durationMs: detail.durationMs,
          model: detail.modelName ?? '',
          partialFailure: false,
        },
      });
    } catch {
      dispatch({
        type: 'GENERATE_ERROR',
        payload: '获取生成记录详情失败，请稍后重试',
      });
    }
  }

  async function handleGenerate() {
    if (!canGenerate) return;
    trackGenerateClick(state.selectedPlatforms);
    dispatch({ type: 'GENERATE_START' });

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: state.content,
          platforms: state.selectedPlatforms,
          ...(templateId ? { templateId } : {}),
        }),
      });

      const json = (await res.json()) as ApiSuccess<GenerateResponse> | ApiError;

      if (!json.success) {
        const msg = (json as ApiError).error.message;
        trackGenerateFail(msg, state.selectedPlatforms);
        dispatch({ type: 'GENERATE_ERROR', payload: msg });
        return;
      }

      const data = (json as ApiSuccess<GenerateResponse>).data;
      trackGenerateSuccess(state.selectedPlatforms, data.durationMs, data.model);
      dispatch({ type: 'GENERATE_SUCCESS', payload: data });

      // Always update local history (for anonymous users)
      const record: HistoryRecord = {
        id: data.generationId,
        platforms: state.selectedPlatforms,
        inputSnippet: state.content.slice(0, 100),
        createdAt: new Date().toISOString(),
        results: data.results,
      };
      prependHistory(record);
      setHistory(readHistory());

      // Task 7.5: Refresh cloud history for logged-in users
      if (user) {
        cloudHistory.refresh();
        savedScripts.refresh();
      }
    } catch {
      const msg = '网络错误，请稍后重试';
      trackGenerateFail(msg, state.selectedPlatforms);
      dispatch({ type: 'GENERATE_ERROR', payload: msg });
    }
  }

  const resultPlatforms = state.response
    ? (Object.keys(state.response.results) as PlatformCode[])
    : [];
  const errorPlatforms = state.response
    ? (Object.keys(state.response.errors) as PlatformCode[])
    : [];

  return (
    <main className="mx-auto w-full max-w-[800px] px-4 py-6">
      <Hero />

      <div className="flex flex-col gap-6">
        {/* Input mode tabs + content */}
        <div className="flex flex-col gap-3">
          <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 w-fit">
            <button
              type="button"
              onClick={() => setInputMode('text')}
              className={[
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                inputMode === 'text'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700',
              ].join(' ')}
            >
              📝 粘贴文本
            </button>
            <button
              type="button"
              onClick={() => setInputMode('url')}
              className={[
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                inputMode === 'url'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700',
              ].join(' ')}
            >
              🔗 视频链接
            </button>
            <button
              type="button"
              onClick={() => setInputMode('upload')}
              className={[
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                inputMode === 'upload'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700',
              ].join(' ')}
            >
              📁 上传文件
            </button>
          </div>

          {inputMode === 'text' && (
            <ContentInput
              value={state.content}
              onChange={(v) => dispatch({ type: 'SET_CONTENT', payload: v })}
              disabled={isLoading}
            />
          )}

          {inputMode === 'url' && (
            <>
              <VideoUrlInput
                onExtracted={(text) => {
                  dispatch({ type: 'SET_EXTRACTED', payload: { content: text } });
                  setInputMode('text');
                }}
                disabled={isLoading || (!user && !authLoading)}
              />
              {!user && !authLoading && (
                <p className="text-xs text-amber-600 px-1">
                  ⚠️ 视频链接提取需要登录后使用
                </p>
              )}
            </>
          )}

          {inputMode === 'upload' && (
            <>
              <FileUploadInput
                onExtracted={(text) => {
                  dispatch({ type: 'SET_EXTRACTED', payload: { content: text } });
                  setInputMode('text');
                }}
                disabled={isLoading || (!user && !authLoading)}
              />
              {!user && !authLoading && (
                <p className="text-xs text-amber-600 px-1">
                  ⚠️ 文件上传提取需要登录后使用
                </p>
              )}
            </>
          )}

          {/* Show extracted content preview when in URL/upload mode and content exists */}
          {inputMode !== 'text' && state.content.trim().length > 0 && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2">
              <p className="text-xs text-green-700 mb-1">已提取的内容：</p>
              <p className="text-sm text-zinc-700 line-clamp-3">{state.content}</p>
            </div>
          )}
        </div>

        {/* Template selector — only for logged-in users */}
        {user && (
          <TemplateSelector selectedId={templateId} onSelect={setTemplateId} />
        )}

        {/* Platform selector */}
        <PlatformSelector
          selected={state.selectedPlatforms}
          onChange={(p) => dispatch({ type: 'SET_PLATFORMS', payload: p })}
          disabled={isLoading}
        />

        {/* Generate button */}
        <div className="flex items-center gap-4">
          <GenerateButton
            onClick={handleGenerate}
            loading={isLoading}
            disabled={!canGenerate}
          />
          {(state.uiState === 'success' || state.uiState === 'error') && (
            <button
              type="button"
              onClick={() => dispatch({ type: 'CLEAR' })}
              className="text-sm text-zinc-500 hover:underline"
            >
              清空重来
            </button>
          )}
        </div>

        {/* Error state */}
        {state.uiState === 'error' && state.errorMessage && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600" role="alert">
            {state.errorMessage}
          </p>
        )}

        {/* Results */}
        {state.uiState === 'success' && state.response && (
          <div className="flex flex-col gap-3">
            {resultPlatforms.map((platform) => (
              <ResultCard
                key={platform}
                platform={platform}
                result={state.response!.results[platform] ?? null}
              />
            ))}
            {errorPlatforms.map((platform) => (
              <ResultCard
                key={platform}
                platform={platform}
                result={null}
                error={state.response!.errors[platform]}
              />
            ))}
          </div>
        )}

        {/* History — Task 7.1: Don't render while auth is loading */}
        {!authLoading && (
          <>
            {/* Task 7.2: Cloud history loading indicator */}
            {shouldUseCloudHistory && cloudHistory.loading && (
              <p className="text-sm text-zinc-400">加载中...</p>
            )}

            {/* Cloud history for logged-in users */}
            {shouldUseCloudHistory && !cloudHistory.loading && cloudHistory.items.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-zinc-500">生成记录</h2>
                <ul className="flex flex-col gap-2">
                  {cloudHistory.items.slice(0, 3).map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleCloudHistoryClick(item)}
                        className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left text-sm hover:border-zinc-400"
                      >
                        {/* Task 7.6: Display inputSnippet with ellipsis */}
                        <span className="block truncate text-zinc-700">
                          {item.inputSnippet.length === 100
                            ? `${item.inputSnippet}…`
                            : item.inputSnippet || '无内容预览'}
                        </span>
                        <span className="text-xs text-zinc-400">
                          {item.platforms.join(', ')} · {new Date(item.createdAt).toLocaleString('zh-CN')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <Link href="/dashboard/history" className="text-sm text-zinc-500 hover:text-zinc-900 hover:underline text-center">
                  查看更多 →
                </Link>
              </section>
            )}

            {/* Local history for anonymous users or cloud API failure fallback */}
            {!shouldUseCloudHistory && history.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-zinc-500">生成记录</h2>
                <ul className="flex flex-col gap-2">
                  {history.slice(0, 3).map((record) => (
                    <li key={record.id}>
                      <button
                        type="button"
                        onClick={() =>
                          dispatch({
                            type: 'RESTORE',
                            payload: {
                              generationId: record.id,
                              results: record.results,
                              errors: {},
                              durationMs: 0,
                              model: '',
                              partialFailure: false,
                            },
                          })
                        }
                        className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left text-sm hover:border-zinc-400"
                      >
                        <span className="block truncate text-zinc-700">{record.inputSnippet}</span>
                        <span className="text-xs text-zinc-400">
                          {record.platforms.join(', ')} · {new Date(record.createdAt).toLocaleString('zh-CN')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <Link href="/dashboard/history" className="text-sm text-zinc-500 hover:text-zinc-900 hover:underline text-center">
                  查看更多 →
                </Link>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
