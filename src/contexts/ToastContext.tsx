'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastContextValue {
  toasts: ToastItem[];
  toast: (params: { type: 'success' | 'error' | 'info'; message: string }) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (params: { type: 'success' | 'error' | 'info'; message: string }) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const item: ToastItem = { id, ...params };
      setToasts((prev) => [...prev, item]);

      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3000);
      timersRef.current.set(id, timer);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Defensive: return no-op if provider not mounted
    return { toast: () => {} };
  }
  return { toast: ctx.toast };
}

export function useToastContext() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToastContext must be used within ToastProvider');
  }
  return ctx;
}
