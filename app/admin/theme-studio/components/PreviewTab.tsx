"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Monitor, Smartphone, Tablet } from "lucide-react";
import type { ThemeConfig } from "@/lib/themes/types";
import { validateThemeConfig } from "@/lib/themes/validate";
import { useAdminT } from "@/lib/admin-i18n";

/**
 * Preview tab — a live iframe of the real storefront with the DRAFT config.
 *
 * Transport (same-origin, cookie-free):
 *   localStorage write (durable, also feeds `/?preview=1` opened in a new
 *   tab and survives reloads) + postMessage (instant, every keystroke).
 * The bridge inside the iframe validates with the same validator the server
 * uses, so what the admin sees is exactly what Save would ship.
 */

type PreviewTabProps = {
  config: ThemeConfig;
  themeName: string;
};

const PREVIEW_SOURCE = "galaxy-theme-preview";
const STORAGE_KEY = "galaxy-store:theme-preview";
const PREVIEW_PATH = "/?preview=1";

type Device = "desktop" | "tablet" | "mobile";

const DEVICE_LABEL_KEYS: Record<Device, string> = {
  desktop: "preview.device.desktop",
  tablet: "preview.device.tablet",
  mobile: "preview.device.mobile",
};

export default function PreviewTab({ config, themeName }: PreviewTabProps) {
  const { t } = useAdminT();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [loaded, setLoaded] = useState(false);

  // Keep the persisted draft in sync (new-tab previews pick it up live via
  // the bridge's `storage` listener). Invalid intermediate states are
  // skipped so the last valid draft is always what a fresh tab loads.
  useEffect(() => {
    const validated = validateThemeConfig(config);
    if (!validated.ok) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(validated.config));
    } catch {
      /* storage full/blocked — postMessage still carries the changes */
    }
  }, [config]);

  // Push every change into the already-loaded iframe (debounced so typing
  // does not message on each keystroke).
  useEffect(() => {
    if (!loaded) return;
    const handle = window.setTimeout(() => {
      const validated = validateThemeConfig(config);
      if (!validated.ok) return;
      iframeRef.current?.contentWindow?.postMessage(
        { source: PREVIEW_SOURCE, config: validated.config },
        window.location.origin
      );
    }, 150);
    return () => window.clearTimeout(handle);
  }, [config, loaded]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {(
            [
              ["desktop", Monitor],
              ["tablet", Tablet],
              ["mobile", Smartphone],
            ] as const
          ).map(([value, Icon]) => (
            <button
              key={value}
              onClick={() => setDevice(value)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                device === value
                  ? "bg-[var(--brand)]/20 text-[var(--brand)] border border-[var(--brand)]/40"
                  : "bg-white/[0.04] text-gray-400 border border-white/[0.06] hover:text-white"
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {t(DEVICE_LABEL_KEYS[value])}
            </button>
          ))}
        </div>
        <a
          href={PREVIEW_PATH}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.04] text-gray-400 border border-white/[0.06] hover:text-white transition-colors text-xs font-semibold"
          title={t("preview.openTitle")}
        >
          <ExternalLink className="w-3.5 h-3.5" /> {t("preview.openNewTab")}
        </a>
      </div>

      <div
        className={`mx-auto transition-all ${
          device === "mobile"
            ? "max-w-[400px]"
            : device === "tablet"
              ? "max-w-[768px]"
              : "max-w-none"
        }`}
      >
        <iframe
          ref={iframeRef}
          src={PREVIEW_PATH}
          title={t("preview.iframeTitle").replace("{name}", themeName)}
          onLoad={() => setLoaded(true)}
          className={`w-full rounded-2xl border border-white/10 bg-background ${
            device === "mobile" ? "h-[720px]" : device === "tablet" ? "h-[700px]" : "h-[620px]"
          }`}
        />
      </div>

      <p className="text-[11px] text-gray-600">{t("preview.note")}</p>
    </div>
  );
}
