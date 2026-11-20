"use client";

/**
 * Customer Custom Print Studio — the complete self-service journey:
 * product → colour/variant → upload → placement editor → layered mockups →
 * print-quality warnings → save → add to the EXISTING cart → optional share.
 *
 * No creator concept appears here. Sharing is an unchecked-by-default checkbox
 * and never gates the order. All artwork previews are composed locally from
 * the layered mockup library; originals are uploaded only on explicit Save.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, ImagePlus, Loader2, RotateCcw,
  RotateCw, Save, ShoppingCart, Sparkles, Trash2, Undo2, Redo2,
} from "lucide-react";
import { useAuth } from "@/app/lib/auth-context";
import { useLanguage } from "@/app/lib/language-context";
import {
  MOCKUP_TEMPLATES, getMockupTemplate, composeMockup,
  getPhotoAsset, getPhotoAssetsForTemplate, photoPrintArea, photoMaskPath,
  type MockupTemplate, type PhotoMockupAsset,
} from "@/lib/mockup-library";
import {
  validateArtwork,
  type ArtworkValidation,
} from "@/lib/design-studio/validate";
import { sanitizeSvg } from "@/lib/design-studio/svg-sanitize";
import {
  DEFAULT_PRINTABLE_AREA, type Transform,
} from "@/lib/design-studio/types";
import {
  alignTransform, clampTransform, detectOverflow,
  fitTransform, moveBy, rotateBy,
} from "@/lib/design-studio/placement";

type Preview = {
  validation: ArtworkValidation;
  dataUrl: string;
  name: string;
};

type Notice = { kind: "error" | "success"; text: string } | null;
type LoadedPhoto = { asset: PhotoMockupAsset; dataUrl: string };

/** Translate a message with {placeholder} interpolation (the t() helper has none). */
function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

const MAX_BYTES = 50 * 1024 * 1024;

export default function CustomPrintStudio() {
  const router = useRouter();
  const { user, getToken } = useAuth();
  const { t, locale } = useLanguage();

  const [templateKey, setTemplateKey] = useState(MOCKUP_TEMPLATES[0].key);
  const [viewKey, setViewKey] = useState("front");
  const [colorKey, setColorKey] = useState(MOCKUP_TEMPLATES[0].colors[0].key);
  const [sizeKey, setSizeKey] = useState(MOCKUP_TEMPLATES[0].sizes[0]?.key ?? "");
  const [quantity, setQuantity] = useState(1);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [transform, setTransform] = useState<Transform>(() =>
    fitTransform(DEFAULT_PRINTABLE_AREA, 1)
  );
  const [history, setHistory] = useState<Transform[]>([]);
  const [future, setFuture] = useState<Transform[]>([]);
  const [shareOptIn, setShareOptIn] = useState(false);
  const [designTitle, setDesignTitle] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<"save" | "cart" | null>(null);
  const [progress, setProgress] = useState(0);
  const [savedDesignId, setSavedDesignId] = useState<string | null>(null);
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
  const [photoError, setPhotoError] = useState("");
  const dragRef = useRef<{ x: number; y: number; start: Transform } | null>(null);

  const template: MockupTemplate = useMemo(
    () => getMockupTemplate(templateKey) ?? MOCKUP_TEMPLATES[0],
    [templateKey]
  );

  // Only colours and views that have a REAL photograph are offered — never
  // claim a colour/view exists when we have no reliable image for it.
  const photoOptions = useMemo(
    () => getPhotoAssetsForTemplate(template.key),
    [template.key]
  );
  const availableColors = useMemo(
    () => template.colors.filter((color) => photoOptions.some((a) => a.colorKey === color.key)),
    [template.colors, photoOptions]
  );
  const availableViews = useMemo(
    () => template.views.filter((view) => photoOptions.some((a) => a.viewKey === view.key)),
    [template.views, photoOptions]
  );

  // Keep view/colour/size valid when the product changes.
  useEffect(() => {
    void (async () => {
      setViewKey(photoOptions[0]?.viewKey ?? template.views[0]?.key ?? "front");
      setColorKey(photoOptions[0]?.colorKey ?? template.colors[0]?.key ?? "");
      setSizeKey(template.sizes[0]?.key ?? "");
      setTransform(fitTransform(DEFAULT_PRINTABLE_AREA, 1));
      setHistory([]);
      setFuture([]);
    })();
  }, [template, photoOptions]);

  // Load the local photograph and inline it as a data URL so the SVG compositor
  // can render it as a base layer (browsers block external refs in SVG <img>).
  useEffect(() => {
    const asset = getPhotoAsset(templateKey, colorKey, viewKey);
    if (!asset) {
      void (async () => {
        setPhoto(null);
        setPhotoError(t("cp_photo_error"));
      })();
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(asset.src);
        if (!response.ok) throw new Error("asset unavailable");
        const blob = await response.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("read failed"));
          reader.readAsDataURL(blob);
        });
        if (!cancelled) {
          setPhoto({ asset, dataUrl });
          setPhotoError("");
        }
      } catch {
        if (!cancelled) {
          setPhoto(null);
          setPhotoError(t("cp_photo_error"));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [templateKey, colorKey, viewKey]);

  const pushTransform = useCallback((next: Transform) => {
    setTransform((current) => {
      setHistory((h) => [...h.slice(-40), current]);
      setFuture([]);
      return clampTransform(next, DEFAULT_PRINTABLE_AREA);
    });
  }, []);

  const onFile = useCallback(async (file: File | null) => {
    setNotice(null);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setNotice({ kind: "error", text: "The artwork file must be 50 MB or smaller." });
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const validation = validateArtwork(new Uint8Array(buffer), {
        filename: file.name,
        mimeType: file.type,
      });
      if (!validation.ok) {
        setNotice({ kind: "error", text: validation.message ?? "Unsupported artwork file." });
        return;
      }
      let dataUrl = "";
      if (validation.format === "svg") {
        const text = new TextDecoder().decode(buffer);
        const sanitized = sanitizeSvg(text);
        if (!sanitized.ok || !sanitized.svg) {
          setNotice({ kind: "error", text: "This SVG contains unsupported markup and was rejected." });
          return;
        }
        dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(sanitized.svg)))}`;
      } else {
        dataUrl = `data:${file.type || "image/png"};base64,${arrayToBase64(buffer)}`;
      }
      setPreview({ validation, dataUrl, name: file.name });
      setSavedDesignId(null);
      const ratio = validation.ratio ?? 1;
      setTransform(fitTransform(DEFAULT_PRINTABLE_AREA, ratio));
      setHistory([]);
      setFuture([]);
      if (!designTitle) setDesignTitle(file.name.replace(/\.[^.]+$/, "").slice(0, 80));
    } catch {
      setNotice({ kind: "error", text: "Could not read this file. Please try another." });
    }
  }, [designTitle]);

  const mockup = useMemo(
    () =>
      composeMockup({
        template,
        viewKey,
        colorKey,
        artworkHref: preview?.dataUrl ?? null,
        transform,
        printableArea: DEFAULT_PRINTABLE_AREA,
        photo: photo
          ? {
              href: photo.dataUrl,
              canvas: { w: photo.asset.width, h: photo.asset.height },
              printArea: photoPrintArea(photo.asset),
              maskPath: photoMaskPath(photo.asset),
              blend: photo.asset.blend,
              opacity: photo.asset.opacity,
              texture: photo.asset.texture,
            }
          : undefined,
      }),
    [template, viewKey, colorKey, preview, transform, photo]
  );

  const mockupSrc = useMemo(
    () =>
      mockup
        ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(mockup.svg)}`
        : "",
    [mockup]
  );

  const overflow = detectOverflow(transform, DEFAULT_PRINTABLE_AREA);
  const dpi = preview?.validation.dpi ?? null;
  const printWidthIn = template.dimensionsMm.w / 25.4;
  const effective = dpi !== null && transform.width > 0
    ? Math.round((preview!.validation.widthPx ?? 0) / (transform.width / printWidthIn * printWidthIn))
    : null;
  const warnings: string[] = [];
  if (overflow.overflows) warnings.push(t("cp_warn_overflow"));
  if (dpi !== null && dpi < 150) warnings.push(fmt(t("cp_warn_lowres"), { dpi }));
  if (effective !== null && effective < 150) warnings.push(fmt(t("cp_warn_dpi"), { dpi: effective }));
  if (preview?.validation.hasTransparency === true) warnings.push(t("cp_warn_transparency"));

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!preview) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, start: transform };
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = ((event.clientX - drag.x) / rect.width) * DEFAULT_PRINTABLE_AREA.widthIn;
    const dy = ((event.clientY - drag.y) / rect.height) * DEFAULT_PRINTABLE_AREA.heightIn;
    setTransform(clampTransform(moveBy(drag.start, dx, dy), DEFAULT_PRINTABLE_AREA));
  };
  const onPointerUp = () => {
    const drag = dragRef.current;
    if (!drag) return;
    setHistory((h) => [...h.slice(-40), drag.start]);
    setFuture([]);
    dragRef.current = null;
  };

  const undo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      setFuture((f) => [transform, ...f]);
      setTransform(h[h.length - 1]);
      return h.slice(0, -1);
    });
  };
  const redo = () => {
    setFuture((f) => {
      if (f.length === 0) return f;
      setHistory((h) => [...h, transform]);
      setTransform(f[0]);
      return f.slice(1);
    });
  };

  async function authenticatedFetch(url: string, body: BodyInit, method = "POST") {
    const token = await getToken().catch(() => null);
    if (!token) throw new Error("Please sign in to continue.");
    const response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.success) {
      throw new Error(data?.message ?? "The request could not be completed.");
    }
    return data;
  }

  async function saveDesign() {
    if (!preview) {
      setNotice({ kind: "error", text: "Upload your artwork first." });
      return;
    }
    setBusy("save");
    setNotice(null);
    setProgress(5);
    try {
      const blob = await fetch(preview.dataUrl).then((r) => r.blob());
      const form = new FormData();
      form.append("file", blob, preview.name);
      form.append("title", designTitle.trim() || "My design");
      form.append("template_key", template.key);
      form.append("config", JSON.stringify({
        viewKey, colorKey, sizeKey, transform,
        dpi: dpi, validation: preview.validation,
      }));
      const data = await authenticatedFetch("/api/designs", form);
      setSavedDesignId(data?.design?.id ?? null);
      setProgress(100);
      setNotice({ kind: "success", text: "Design saved privately to your account." });
    } catch (error) {
      setNotice({ kind: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function addToCart() {
    if (!preview) {
      setNotice({ kind: "error", text: "Upload your artwork first." });
      return;
    }
    setBusy("cart");
    setNotice(null);
    try {
      let designId = savedDesignId;
      if (!designId) {
        const blob = await fetch(preview.dataUrl).then((r) => r.blob());
        const form = new FormData();
        form.append("file", blob, preview.name);
        form.append("title", designTitle.trim() || "My design");
        form.append("template_key", template.key);
        form.append("config", JSON.stringify({
          viewKey, colorKey, sizeKey, transform, dpi, validation: preview.validation,
        }));
        const saved = await authenticatedFetch("/api/designs", form);
        designId = saved?.design?.id ?? null;
        if (!designId) {
          throw new Error("The design could not be saved. Please try again.");
        }
        setSavedDesignId(designId);
      }
      await authenticatedFetch("/api/custom-print/cart", JSON.stringify({
        design_id: designId,
        template_key: template.key,
        view_key: viewKey,
        color_key: colorKey,
        size_key: sizeKey,
        quantity,
        transform,
        share_opt_in: shareOptIn,
      }));
      setNotice({
        kind: "success",
        text: t(shareOptIn ? "cp_notice_shared" : "cp_notice_private"),
      });
      router.push("/cart");
    } catch (error) {
      setNotice({ kind: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const selectedColor = template.colors.find((c) => c.key === colorKey) ?? template.colors[0];

  return (
    <div className="mx-auto max-w-7xl px-4 pt-24 pb-20">
      <header className="text-center max-w-3xl mx-auto">
        <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold">{t("cp_eyebrow")}</p>
        <h1 className="text-3xl md:text-5xl font-extrabold mt-2">
          {t("cp_title_a")} <span className="text-gradient-neon">{t("cp_title_b")}</span> {t("cp_title_c")}
        </h1>
        <p className="text-muted-foreground mt-3">{t("cp_subtitle")}</p>
      </header>

      {!user && (
        <div className="mt-8 mx-auto max-w-3xl glass rounded-2xl p-4 text-sm text-amber-400">
          {t("cp_signin")}
        </div>
      )}

      <div className="mt-10 grid lg:grid-cols-5 gap-6">
        {/* Preview workspace */}
        <div className="lg:col-span-3 order-1">
          <div className="glass-strong rounded-3xl p-4 lg:p-6 lg:sticky lg:top-28">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-muted-foreground">{t("cp_live_mockup")}</p>
                <p className="font-semibold">
                  {locale === "ar" ? template.nameAr : template.name} · {locale === "ar" && selectedColor?.nameAr ? selectedColor.nameAr : selectedColor?.name} · {viewKey}
                </p>
              </div>
              <span className="glass px-3 py-1 rounded-full text-xs flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-accent" />
                {t(photo ? "cp_photo_ready" : "cp_photo_loading")}
              </span>
            </div>

            {photoError && (
              <div className="mb-3 text-xs text-amber-400 glass rounded-xl p-3">{photoError}</div>
            )}

            <div
              className="relative rounded-2xl overflow-hidden bg-background/40 touch-none select-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {mockupSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mockupSrc} alt="Your artwork on the selected product" className="w-full h-auto" />
              ) : (
                <div className="aspect-square grid place-items-center text-muted-foreground text-sm">
                  {t("cp_preview_empty")}
                </div>
              )}
              {preview && (
                <div className="absolute bottom-3 left-3 glass px-3 py-1 rounded-full text-xs">
                  {t("cp_drag_hint")}
                </div>
              )}
            </div>

            {preview && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Action icon={Undo2} label={t("cp_undo")} onClick={undo} disabled={history.length === 0} />
                <Action icon={Redo2} label={t("cp_redo")} onClick={redo} disabled={future.length === 0} />
                <Action icon={Trash2} label={t("cp_center")} onClick={() => pushTransform(alignTransform(transform, DEFAULT_PRINTABLE_AREA, "centerX"))} />
                <Action icon={RotateCcw} label={t("cp_reset")} onClick={() => { setTransform(fitTransform(DEFAULT_PRINTABLE_AREA, preview.validation.ratio ?? 1)); setHistory([]); setFuture([]); }} />
                <Action icon={RotateCw} label={t("cp_rotate15")} onClick={() => pushTransform(rotateBy(transform, 15))} />
              </div>
            )}

            {warnings.length > 0 && (
              <div className="mt-4 glass rounded-2xl p-4 border border-amber-400/40">
                <p className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> {t("cp_print_check")}
                </p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground list-disc pl-5">
                  {warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="lg:col-span-2 order-2 space-y-5">
          <Panel title={t("cp_panel_product")}>
            <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
              {MOCKUP_TEMPLATES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTemplateKey(item.key)}
                  className={`glass rounded-xl p-3 text-left text-sm transition-all ${
                    templateKey === item.key ? "ring-1 ring-secondary pink-glow" : "hover:pink-glow"
                  }`}
                >
                  {locale === "ar" ? item.nameAr : item.name}
                </button>
              ))}
            </div>
            <label className="block mt-3 text-xs text-muted-foreground">
              {t("cp_design_title")}
              <input
                value={designTitle}
                onChange={(e) => setDesignTitle(e.target.value)}
                maxLength={80}
                className="w-full mt-1 h-11 glass rounded-xl px-3 outline-none text-sm"
                placeholder={t("cp_design_title_ph")}
              />
            </label>
          </Panel>

          <Panel title={t("cp_panel_options")}>
            <div className="flex flex-wrap gap-2">
              {availableColors.map((color) => (
                <button
                  key={color.key}
                  type="button"
                  title={locale === "ar" && color.nameAr ? color.nameAr : color.name}
                  onClick={() => setColorKey(color.key)}
                  className={`h-9 w-9 rounded-full border-2 transition-all ${
                    colorKey === color.key ? "border-secondary scale-110" : "border-white/20"
                  }`}
                  style={{ background: color.hex }}
                />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {template.sizes.map((size) => (
                <button
                  key={size.key}
                  type="button"
                  onClick={() => setSizeKey(size.key)}
                  className={`h-9 px-3 rounded-lg text-xs font-semibold ${
                    sizeKey === size.key ? "bg-gradient-neon text-white" : "glass"
                  }`}
                >
                  {size.label}
                </button>
              ))}
            </div>
            {availableViews.length > 1 && (
              <div className="mt-4 flex gap-2">
                {availableViews.map((view) => (
                  <button
                    key={view.key}
                    type="button"
                    onClick={() => setViewKey(view.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs ${viewKey === view.key ? "bg-gradient-neon text-white" : "glass"}`}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
            )}
            <label className="block mt-4 text-xs text-muted-foreground">
              {t("cp_quantity")}
              <input
                type="number"
                min={1}
                max={99}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
                className="w-24 mt-1 h-10 glass rounded-xl px-3 outline-none"
              />
            </label>
          </Panel>

          <Panel title={t("cp_panel_upload")}>
            <label className="block glass rounded-2xl border border-dashed border-secondary/40 p-5 text-center cursor-pointer hover:pink-glow transition-all">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => { void onFile(e.target.files?.[0] ?? null); e.target.value = ""; }}
              />
              <ImagePlus className="h-6 w-6 mx-auto mb-2 text-secondary" />
              <p className="text-sm font-medium">{preview ? preview.name : t("cp_upload_hint")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("cp_upload_formats")}</p>
            </label>
            {preview && (
              <div className="mt-3 text-xs text-muted-foreground space-y-1">
                <p>{preview.validation.widthPx} × {preview.validation.heightPx} px · {preview.validation.format?.toUpperCase()}</p>
                {preview.validation.dpi !== null && <p>{preview.validation.dpi} {t("cp_dpi_source")}</p>}
                {preview.validation.hasTransparency !== null && (
                  <p>{t("cp_transparency")}: {preview.validation.hasTransparency ? t("cp_yes") : t("cp_no")}</p>
                )}
              </div>
            )}
          </Panel>

          <Panel title={t("cp_panel_placement")}>
            <div className="space-y-3 text-xs">
              <Slider label={t("cp_size")} min={0.5} max={Math.max(2, DEFAULT_PRINTABLE_AREA.widthIn)} step={0.05}
                value={transform.width} onChange={(width) => pushTransform({ ...transform, width, height: width / (preview?.validation.ratio ?? 1) })} />
              <Slider label={t("cp_rotation")} min={-180} max={180} step={1}
                value={transform.rotation} onChange={(rotation) => pushTransform({ ...transform, rotation })} />
              <Slider label={t("cp_horizontal")} min={-6} max={6} step={0.05}
                value={transform.cx} onChange={(cx) => pushTransform({ ...transform, cx })} />
              <Slider label={t("cp_vertical")} min={-6} max={6} step={0.05}
                value={transform.cy} onChange={(cy) => pushTransform({ ...transform, cy })} />
            </div>
          </Panel>

          <Panel title={t("cp_panel_order")}>
            <label className="flex items-start gap-3 glass rounded-xl p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={shareOptIn}
                onChange={(e) => setShareOptIn(e.target.checked)}
                className="mt-1 h-4 w-4 accent-[var(--brand-secondary)]"
              />
              <span className="text-xs">
                <span className="font-semibold block">{t("cp_share_title")}</span>
                <span className="text-muted-foreground">{t("cp_share_hint")}</span>
              </span>
            </label>
            {notice && (
              <p className={`mt-3 text-xs rounded-xl p-3 ${notice.kind === "error" ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
                {notice.text}
              </p>
            )}
            <button
              type="button"
              onClick={() => void saveDesign()}
              disabled={busy !== null}
              className="mt-4 w-full h-12 glass font-semibold rounded-xl flex items-center justify-center gap-2"
            >
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("cp_save_private")}
            </button>
            <button
              type="button"
              onClick={() => void addToCart()}
              disabled={busy !== null}
              className="mt-3 w-full h-12 rounded-xl bg-gradient-neon text-white font-bold flex items-center justify-center gap-2"
            >
              {busy === "cart" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
              {t("cp_add_cart")}
            </button>
            {progress > 0 && progress < 100 && (
              <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-secondary transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass rounded-2xl p-5">
      <h2 className="font-semibold mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Action({ icon: Icon, label, onClick, disabled }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="glass px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-40">
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function Slider({ label, min, max, step, value, onChange }: {
  label: string; min: number; max: number; step: number; value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex justify-between">
        <span>{label}</span><span className="text-muted-foreground">{Number(value).toFixed(2)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--brand-secondary)]" />
    </label>
  );
}

function arrayToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
