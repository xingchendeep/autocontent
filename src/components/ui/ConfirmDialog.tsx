'use client';

import { useCallback, useEffect, useRef } from 'react';

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  onConfirm,
  onCancel,
  destructive = false,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      cancelBtnRef.current?.focus();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    },
    [onCancel],
  );

  // Prevent native dialog close (Escape) from bypassing our handler
  const handleCancel = useCallback(
    (e: React.SyntheticEvent) => {
      e.preventDefault();
      onCancel();
    },
    [onCancel],
  );

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      onKeyDown={handleKeyDown}
      onCancel={handleCancel}
      className="fixed inset-0 z-50 m-auto max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-lg backdrop:bg-black/40"
    >
      <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
      <p className="mt-2 text-sm text-zinc-600">{message}</p>
      <div className="mt-6 flex justify-end gap-3">
        <button
          ref={cancelBtnRef}
          type="button"
          onClick={onCancel}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`rounded-md px-4 py-2 text-sm text-white ${
            destructive
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-zinc-900 hover:bg-zinc-800'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
