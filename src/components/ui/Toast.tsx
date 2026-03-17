'use client';

import { useCallback, useEffect } from 'react';
import { type ToastItem, useToastContext } from '@/contexts/ToastContext';

const TYPE_STYLES: Record<ToastItem['type'], string> = {
  success: 'bg-green-50 border-green-200 text-green-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
};

function ToastItemView({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss(item.id);
    },
    [item.id, onDismiss],
  );

  return (
    <div
      role="alert"
      aria-live="polite"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={`rounded-md border px-4 py-3 text-sm shadow-sm transition-opacity ${TYPE_STYLES[item.type]}`}
    >
      {item.message}
    </div>
  );
}

export function ToastContainer() {
  const { toasts, dismiss } = useToastContext();

  // Global Escape key handler to dismiss the latest toast
  useEffect(() => {
    if (toasts.length === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dismiss(toasts[toasts.length - 1].id);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [toasts, dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItemView key={t.id} item={t} onDismiss={dismiss} />
      ))}
    </div>
  );
}
