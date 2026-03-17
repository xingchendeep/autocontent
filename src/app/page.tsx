'use client';

import { useReducer, useState, useEffect } from 'react';
import Hero from '@/components/layout/Hero';
import ContentInput from '@/components/generate/ContentInput';
import PlatformSelector from '@/components/generate/PlatformSelector';
import GenerateButton from '@/components/generate/GenerateButton';
import ResultCard from '@/components/generate/ResultCard';
import { readHistory, prependHistory } from '@/lib/localHistory';
import { useAuth } from '@/hooks/useAuth';
import { useCloudHistory } from '@/hooks/useCloudHistory';
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
  selectedPlatforms: PlatformCode[];
  response: GenerateResponse | null;
  errorMessage: string | null;
}

type Action =
  | { type: 'SET_CONTENT'; payload: string }
  | { type: 'SET_PLATFORMS'; payload: PlatformCode[] }
  | { type: 'GENERATE_START' }
  | { type: 'GENERATE_SUCCESS'; payload: GenerateResponse }
  | { type: 'GENERATE_ERROR'; payload: string }
  | { type: 'CLEAR' }
  | { type: 'RESTORE'; payload: GenerateResponse };

const initialState: PageState = {
  uiState: 'idle',
  content: '',
  selectedPlatforms: [],
  response: null,
  errorMessage: null,
};

function reducer(state: PageState, action: Action): PageState {
  switch (action.type) {
    case 'SET_CONTENT':
      return { ...state, content: action.payload };
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

  // Task 7.1: Auth and cloud history hooks
  const { user, loading: authLoading } = useAuth();
  const cloudHistory = useCloudHistory(!!user);

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
        payload: '获取历史记录详情失败，请稍后重试',
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
        {/* Content input */}
        <ContentInput
          value={state.content}
          onChange={(v) => dispatch({ type: 'SET_CONTENT', payload: v })}
          disabled={isLoading}
        />

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
                <h2 className="text-sm font-semibold text-zinc-500">历史记录</h2>
                <ul className="flex flex-col gap-2">
                  {cloudHistory.items.map((item) => (
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
              </section>
            )}

            {/* Local history for anonymous users or cloud API failure fallback */}
            {!shouldUseCloudHistory && history.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-zinc-500">历史记录</h2>
                <ul className="flex flex-col gap-2">
                  {history.map((record) => (
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
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
