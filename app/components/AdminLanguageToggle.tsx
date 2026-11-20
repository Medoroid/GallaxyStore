"use client";

import { Globe } from "lucide-react";
import { useAdminT } from "@/lib/admin-i18n";

/**
 * EN/AR switch for the admin pages that are fully translated (Content
 * Manager + Theme Studio). It reuses the storefront's LanguageProvider, so
 * the chosen locale persists and flips `dir` document-wide — RTL for the
 * Arabic admin, LTR back for English.
 */
export default function AdminLanguageToggle() {
  const { t, locale, setLocale } = useAdminT();
  return (
    <button
      type="button"
      onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
      title={locale === "ar" ? "Switch to English" : "التبديل إلى العربية"}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm font-medium text-gray-300 hover:text-white hover:bg-white/[0.1] transition-colors"
    >
      <Globe className="w-4 h-4" />
      {t("admin.lang.toggle")}
    </button>
  );
}
