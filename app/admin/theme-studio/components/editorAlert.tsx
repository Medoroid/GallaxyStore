"use client";

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

/** Amber warning strip used for validation summaries in the editor. */
export function Alert({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-2 px-4 py-2.5 rounded-xl text-sm border bg-amber-500/10 border-amber-500/30 text-amber-200">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}
