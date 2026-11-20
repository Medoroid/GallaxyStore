"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/app/lib/auth-context";
import { useLanguage } from "@/app/lib/language-context";
import { supabase } from "@/lib/supabaseClient";
import { isMappedErrorCode } from "@/lib/design-studio/error-codes";
import { buildMockupSvg } from "@/lib/design-studio/mockup";
import {
  MOCKUP_RENDERER_VERSION,
  mockupConfigHash,
  type MockupConfig,
} from "@/lib/design-studio/mockup-hash";
import { blobToDataUrl, rasterizeSvgToPng } from "@/lib/design-studio/render";
import { useTemplateCatalog } from "./useTemplateCatalog";
import type { MockupRecord, PrintableArea, Transform } from "@/lib/design-studio/types";

type Props = {
  designId: string;
  /** Current design file id — part of the hash; null = no artwork yet. */
  fileId: string | null;
  templateKey: string;
  viewKey: string;
  colorKey: string;
  /** EFFECTIVE transform for this product+view (base ⊕ per-product view state). */
  transform: Transform;
  area: PrintableArea;
  /** Signed URL of the current artwork, used to rasterize a new preview. */
  artworkUrl: string | null;
  artworkReady: boolean;
  /** Stored record for this exact config — a hash match renders with zero network. */
  existing: MockupRecord | null;
  caption: string;
  /** Called once per successful POST so the parent can persist the record. */
  onGenerated: (record: MockupRecord) => void;
};

type Phase = "waiting" | "working" | "ready" | "error";

/** Public URL of a stored preview in the read-only `design-previews` bucket. */
function previewUrl(path: string): string {
  return supabase.storage.from("design-previews").getPublicUrl(path).data.publicUrl;
}

/**
 * One mockup cell for one (template × view × color) combo.
 *
 * Zero-regeneration protocol: the config hash is computed locally and compared
 * against the row's stored record — an exact match renders straight from the
 * public URL with no network work. Only a miss triggers the pipeline:
 * fetch artwork → compose SVG (`buildMockupSvg`) → canvas PNG → POST
 * /api/designs/[id]/mockups (server recomputes the hash and dedupes again).
 * A stale response (props changed mid-flight) is discarded by generation
 * counter, so the cell can never display a mockup of an older config.
 */
export default function MockupPreview({
  designId,
  fileId,
  templateKey,
  viewKey,
  colorKey,
  transform,
  area,
  artworkUrl,
  artworkReady,
  existing,
  caption,
  onGenerated,
}: Props) {
  const { t } = useLanguage();
  const { getToken } = useAuth();
  const { byKey: getTemplate } = useTemplateCatalog();

  const config = useMemo<MockupConfig | null>(
    () =>
      fileId
        ? {
            renderer: MOCKUP_RENDERER_VERSION,
            template: templateKey,
            view: viewKey,
            color: colorKey,
            fileId,
            transform,
            area,
          }
        : null,
    [fileId, templateKey, viewKey, colorKey, transform, area]
  );
  // Content identity of the config: the effect below re-runs only when the
  // hash changes, not when the parent merely re-renders with a fresh
  // (structurally identical) transform object — that would restart uploads.
  const hash = useMemo(() => (config ? mockupConfigHash(config) : null), [config]);
  const matched =
    existing && hash && existing.config_hash === hash ? existing : null;

  const [src, setSrc] = useState<string | null>(matched ? previewUrl(matched.path) : null);
  const [phase, setPhase] = useState<Phase>(matched ? "ready" : "waiting");
  const [error, setError] = useState<{ code: string | null; message: string | null } | null>(
    null
  );
  const [attempt, setAttempt] = useState(0);

  // Latest-value refs so the generation effect can depend only on `hash`
  // (stable deps) while still reading current props/callbacks.
  const genRef = useRef(0);
  const renderRef = useRef({ config, templateKey, viewKey, colorKey, transform, area, designId });
  const onGeneratedRef = useRef(onGenerated);
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    // Runs after every render — and, same-component effects running in
    // declaration order, BEFORE the generation effect below reads them.
    renderRef.current = { config, templateKey, viewKey, colorKey, transform, area, designId };
    onGeneratedRef.current = onGenerated;
    getTokenRef.current = getToken;
  });

  useEffect(() => {
    const gen = ++genRef.current;

    if (matched) {
      // Cached: same config → same path → zero network, zero reprocessing.
      setSrc(previewUrl(matched.path));
      setPhase("ready");
      setError(null);
      return;
    }
    if (!config || !artworkReady || !artworkUrl) {
      // Honest waiting state — never a fabricated "preview".
      setSrc(null);
      setPhase("waiting");
      setError(null);
      return;
    }

    let cancelled = false;
    setSrc(null);
    setPhase("working");
    setError(null);

    void (async () => {
      try {
        const token = await getTokenRef.current();

        const artworkResponse = await fetch(artworkUrl);
        if (!artworkResponse.ok) throw new Error("artwork_fetch_failed");
        const artworkHref = await blobToDataUrl(await artworkResponse.blob());

        const current = renderRef.current;
        const template = current.templateKey ? getTemplate(current.templateKey) : null;
        const svg = template
          ? buildMockupSvg({
              template,
              viewKey: current.viewKey,
              colorKey: current.colorKey,
              artworkHref,
              transform: current.transform,
              designArea: current.area,
            })
          : null;
        if (!svg) throw new Error("render_failed");

        const png = await rasterizeSvgToPng(svg);
        const form = new FormData();
        form.append("file", new File([png], "mockup.png", { type: "image/png" }));
        form.append("config", JSON.stringify(current.config));

        const response = await fetch(`/api/designs/${current.designId}/mockups`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: form,
        });
        const payload = (await response.json().catch(() => null)) as {
          success?: boolean;
          code?: string;
          message?: string;
          mockup?: MockupRecord;
        } | null;

        if (cancelled || gen !== genRef.current) return; // stale — drop it
        if (!response.ok || payload?.success !== true || !payload.mockup) {
          setError({
            code: typeof payload?.code === "string" ? payload.code : null,
            message: typeof payload?.message === "string" ? payload.message : null,
          });
          setPhase("error");
          return;
        }
        setSrc(previewUrl(payload.mockup.path));
        setPhase("ready");
        onGeneratedRef.current(payload.mockup);
      } catch {
        if (cancelled || gen !== genRef.current) return;
        setError({ code: null, message: null });
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
    };
    // `hash` is the content identity of config — see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, matched, artworkReady, artworkUrl, attempt]);

  const errorText = error
    ? error.code && isMappedErrorCode(error.code)
      ? t(`studio_err_${error.code}`)
      : error.message || t("product_mockup_failed")
    : t("product_mockup_failed");

  return (
    <figure className="overflow-hidden rounded-xl border border-white/10 bg-[#0b0b12]">
      <div className="relative aspect-[4/5]">
        {phase === "ready" && src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={caption}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : null}

        {phase === "working" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-secondary" />
            <span className="text-[10px] text-muted-foreground">
              {t("product_mockup_generating")}
            </span>
          </div>
        ) : null}

        {phase === "waiting" ? (
          <div className="absolute inset-0 flex items-center justify-center px-2 text-center text-[10px] leading-relaxed text-muted-foreground/70">
            {t("product_mockup_pending")}
          </div>
        ) : null}

        {phase === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-2 text-center">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <span className="text-[10px] leading-snug text-amber-200/90">{errorText}</span>
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="mt-1 inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold hover:border-pink-500/40 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              {t("product_mockup_retry")}
            </button>
          </div>
        ) : null}
      </div>
      <figcaption className="truncate border-t border-white/[0.06] px-2 py-1.5 text-[10px] text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}
