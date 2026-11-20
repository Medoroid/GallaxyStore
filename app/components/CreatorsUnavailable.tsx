"use client";

import { Construction } from "lucide-react";
import { useLanguage } from "@/app/lib/language-context";

/**
 * Honest fallback for /creators while the creator-studio migrations are
 * still pending: the feature is not enabled yet — this is NOT a claim that
 * zero creators exist (that would be an empty state, and it would lie).
 */
export function CreatorsUnavailable() {
  const { t } = useLanguage();

  return (
    <div className="mx-auto max-w-7xl px-4 pt-24 pb-20">
      <div className="glass-strong rounded-3xl p-12 text-center">
        <Construction className="h-12 w-12 mx-auto text-gray-500" />
        <h1 className="mt-4 text-xl font-bold">
          {t("creators_unavailable_title")}
        </h1>
        <p className="text-muted-foreground mt-2 max-w-md mx-auto">
          {t("creators_unavailable")}
        </p>
      </div>
    </div>
  );
}
