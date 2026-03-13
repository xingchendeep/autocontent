import type { HistoryRecord } from '@/types';

const STORAGE_KEY = 'acp_history';
const MAX_RECORDS = 10;

export function readHistory(): HistoryRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryRecord[];
  } catch {
    return [];
  }
}

export function prependHistory(record: HistoryRecord): void {
  try {
    const existing = readHistory();
    const updated = [record, ...existing].slice(0, MAX_RECORDS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // fail silently
  }
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // fail silently
  }
}
