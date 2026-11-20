"use client";

import { AlertTriangle, Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Blocking confirmation used for destructive studio actions (delete design,
 * replace artwork). Rendered only while `open` so no state leaks between runs.
 */
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  busy = false,
  danger = true,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="glass-strong rounded-3xl p-6 w-full max-w-md"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div
            className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
              danger
                ? "bg-rose-500/15 border border-rose-500/30 text-rose-300"
                : "bg-amber-500/15 border border-amber-500/30 text-amber-300"
            }`}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold">{title}</h2>
            <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">
              {body}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-5 py-2.5 rounded-xl border border-white/10 bg-white/[0.03] text-sm font-semibold hover:border-white/25 transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-transform hover:scale-[1.03] disabled:opacity-60 disabled:hover:scale-100 ${
              danger ? "bg-gradient-to-r from-rose-500 to-pink-600" : "bg-gradient-neon"
            }`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
