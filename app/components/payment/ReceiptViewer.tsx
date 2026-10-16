"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Expand, Loader2, RefreshCw, X } from "lucide-react";

type MetaRow = { label: string; value?: string | null };

type Props = {
  /** Short-lived signed URL from the backend — never a permanent public URL. */
  src?: string | null;
  alt?: string;
  meta?: MetaRow[];
  label?: string;
  className?: string;
};

/**
 * Receipt thumbnail + lightbox. Uses the backend signed URL as-is and never
 * builds a public storage URL.
 */
export function ReceiptViewer({ src, alt = "Transfer receipt", meta, label, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const effectiveSrc = src ? `${src}${src.includes("?") ? "&" : "?"}v=${reloadKey}` : null;

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    closeRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!effectiveSrc) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group relative block overflow-hidden rounded-xl border border-white/10 bg-black/40 hover:border-white/30 transition-colors ${className}`}
        aria-label={label ?? `View ${alt}`}
      >
        <Image
          src={effectiveSrc}
          alt={alt}
          width={320}
          height={200}
          unoptimized
          className="w-full h-28 object-cover group-hover:scale-105 transition-transform"
        />
        <span className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white">
            <Expand className="h-4 w-4" aria-hidden="true" />
            {label ?? "View receipt"}
          </span>
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-3xl max-h-[90vh] overflow-auto glass-strong rounded-3xl p-4 sm:p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="font-extrabold">{alt}</p>
                <p className="text-xs text-muted-foreground">
                  Private document — link expires automatically.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReloadKey((key) => key + 1)}
                  className="h-9 px-3 rounded-lg glass text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-white/5"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Reload
                </button>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-9 w-9 rounded-lg glass grid place-items-center hover:bg-white/5"
                  aria-label="Close receipt viewer"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <ReceiptImage key={effectiveSrc} src={effectiveSrc} alt={alt} onRetry={() => setReloadKey((key) => key + 1)} />

            {meta && meta.length > 0 && (
              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mt-4 text-sm">
                {meta
                  .filter((row) => row.value)
                  .map((row) => (
                    <div key={row.label} className="flex justify-between gap-3 border-b border-white/5 pb-1.5">
                      <dt className="text-muted-foreground">{row.label}</dt>
                      <dd className="font-semibold text-right break-all">{row.value}</dd>
                    </div>
                  ))}
              </dl>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function ReceiptImage({
  src,
  alt,
  onRetry,
}: {
  src: string;
  alt: string;
  onRetry: () => void;
}) {
  // Remounting via `key={src}` in the parent resets this to "loading".
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  if (status === "error") {
    return (
      <div className="rounded-xl border border-white/10 bg-black/40 p-8 text-center" role="alert">
        <p className="text-sm text-muted-foreground mb-3">Receipt image could not be loaded.</p>
        <button
          type="button"
          onClick={onRetry}
          className="h-9 px-4 rounded-lg glass text-xs font-semibold inline-flex items-center gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black/40 grid place-items-center min-h-48">
      {status === "loading" && (
        <span className="absolute inset-0 grid place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </span>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
      <img
        src={src}
        alt={alt}
        onLoad={() => setStatus("ready")}
        onError={() => setStatus("error")}
        className={`w-full max-h-[65vh] object-contain transition-opacity ${
          status === "ready" ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
