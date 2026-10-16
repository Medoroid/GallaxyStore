"use client";

import { AlertTriangle, Copy, Hash, Smartphone, Wallet } from "lucide-react";
import { useState } from "react";

type Props = {
  /** Already validated with `resolveWalletNumber` — null means unconfigured. */
  number: string | null;
  amountLabel?: string | null;
  orderNumber?: string | null;
  showFileSpecs?: boolean;
  className?: string;
};

/**
 * The transfer instructions shown before the receipt form.
 * The wallet number is read from `NEXT_PUBLIC_VODAFONE_CASH_NUMBER` only —
 * it is never hard-coded in a component.
 */
export function VodafoneInstructions({
  number,
  amountLabel,
  orderNumber,
  showFileSpecs = false,
  className = "",
}: Props) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!number) return;
    try {
      await navigator.clipboard.writeText(number);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the number is selectable anyway */
    }
  };

  return (
    <div className={`glass rounded-2xl p-4 ${className}`}>
      {amountLabel || orderNumber ? (
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-white/10 text-sm">
          {amountLabel && (
            <div>
              <p className="text-xs text-muted-foreground">Amount due</p>
              <p className="font-extrabold text-lg text-gradient-gold">{amountLabel}</p>
            </div>
          )}
          {orderNumber && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Order</p>
              <p className="font-mono font-semibold">{orderNumber}</p>
            </div>
          )}
        </div>
      ) : null}

      {number ? (
        <div className="mb-3">
          <p className="text-xs text-muted-foreground mb-1">1. Transfer the exact amount to:</p>
          <div className="flex items-center gap-2">
            <span
              className="flex-1 font-mono font-bold text-lg sm:text-xl text-secondary select-all break-all"
              data-testid="vodafone-number"
            >
              {number}
            </span>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 h-9 px-3 rounded-lg glass text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-white/5 transition-colors"
              aria-label="Copy Vodafone Cash number"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : (
        <div
          role="alert"
          className="mb-3 p-3 rounded-xl border border-amber-500/40 bg-amber-950/40 text-sm text-amber-200"
        >
          <p className="font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Vodafone Cash number is not configured.
          </p>
          <p className="text-amber-300/90 mt-1">
            Please contact support before transferring. Do not send money to any number shown
            elsewhere.
          </p>
        </div>
      )}

      <ol className="space-y-2 text-sm">
        {number ? (
          <li>
            <span className="font-semibold">1.</span> Transfer the exact amount shown above to
            the Vodafone Cash number above.
          </li>
        ) : null}
        <li>
          <span className="font-semibold">{number ? 2 : 1}.</span> After completing the transfer,
          upload your receipt.
        </li>
        <li>
          <span className="font-semibold">{number ? 3 : 2}.</span> Submit the receipt for
          verification.
        </li>
      </ol>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
          Vodafone Cash wallet transfer
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
          Verification usually takes a few hours
        </span>
        {orderNumber && (
          <span className="inline-flex items-center gap-1.5">
            <Hash className="h-3.5 w-3.5" aria-hidden="true" />
            Put {orderNumber} in the transfer note if you can
          </span>
        )}
      </div>

      {showFileSpecs && (
        <p className="text-xs text-muted-foreground mt-2">
          Accepted images: JPG, PNG, WEBP or HEIC · max 5 MB.
        </p>
      )}
    </div>
  );
}
