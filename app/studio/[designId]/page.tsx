"use client";

import { useCallback, use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  Package,
  PanelLeft,
  Redo2,
  Save,
  Send,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { useAuth } from "@/app/lib/auth-context";
import { useLanguage } from "@/app/lib/language-context";
import { supabase } from "@/lib/supabaseClient";
import {
  DEFAULT_PRINTABLE_AREA,
  ARTWORK_LIMITS,
  type EditorState,
  type Transform,
} from "@/lib/design-studio/types";
import {
  alignTransform,
  artworkRatio,
  clampZoom,
  detectOverflow,
  effectiveDpi,
  fitTransform,
  normalizeRotation,
} from "@/lib/design-studio/placement";
import {
  createInitialEditorState,
  normalizeEditorState,
} from "@/lib/design-studio/editor-state";
import { createUndoRedo, type UndoRedo } from "@/lib/design-studio/history";
import { validateArtwork } from "@/lib/design-studio/validate";
import { isMappedErrorCode } from "@/lib/design-studio/error-codes";
import ArtworkCanvas from "@/app/components/studio/ArtworkCanvas";
import TransformControls from "@/app/components/studio/TransformControls";
import type { ControlWarning } from "@/app/components/studio/TransformControls";
import ConfirmDialog from "@/app/components/studio/ConfirmDialog";
import ProductCatalog from "@/app/components/studio/ProductCatalog";
import PublishDialog from "@/app/components/studio/PublishDialog";
import StatusBadge from "@/app/components/studio/StatusBadge";
import type { DesignStatus } from "@/app/components/studio/StatusBadge";

const AREA = DEFAULT_PRINTABLE_AREA;
const AUTOSAVE_MS = 1200;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DesignFile = {
  id: string;
  storage_path: string;
  original_filename: string | null;
  file_format: string;
  mime_type: string;
  file_size_bytes: number | null;
  width_px: number | null;
  height_px: number | null;
  dpi: number | null;
  color_mode: string | null;
  has_transparent_background: boolean | null;
  is_primary: boolean;
  scan_status: string | null;
};

type DesignVersion = {
  id: string;
  version_number: number;
  status: string;
  is_current: boolean;
  editor_state: unknown;
  created_at: string;
  updated_at: string;
  file: DesignFile | null;
};

type Design = {
  id: string;
  title: string | null;
  slug: string | null;
  description: string | null;
  status: DesignStatus;
  is_public: boolean;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  version: DesignVersion | null;
};

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

/** Map a server payload to a displayable message (translated when possible). */
function makeMessageMapper(t: (key: string) => string) {
  return (payload: { code?: string; message?: string } | null | undefined, fallback: string) => {
    const code = payload?.code;
    if (code === "invalid_title") return t("studio_err_title_required");
    if (isMappedErrorCode(code)) return t(`studio_err_${code}`);
    // MIGRATION_REQUIRED and unknown codes: the server message is the honest
    // source (ops-facing English by design — never invent a friendly lie).
    return payload?.message || fallback;
  };
}

function fileExt(name: string | null | undefined): string | null {
  if (!name) return null;
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match ? match[1].toLowerCase() : null;
}

function mimeMismatch(file: DesignFile): boolean {
  const ext = fileExt(file.original_filename);
  if (!ext) return false;
  const normalized = ext === "jpeg" ? "jpg" : ext;
  return normalized !== file.file_format;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-white/5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold tabular-nums truncate">{value}</span>
    </div>
  );
}

export default function StudioEditorPage({
  params,
}: {
  params: Promise<{ designId: string }>;
}) {
  const { designId } = use(params);
  const { user, loading: authLoading, getToken } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  // --- design + editing state ---------------------------------------------
  const [design, setDesign] = useState<Design | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [histFlags, setHistFlags] = useState({ canUndo: false, canRedo: false });
  const [dirtyDetails, setDirtyDetails] = useState(false);
  const [dirtyState, setDirtyState] = useState(false);
  const [mobileTab, setMobileTab] = useState<"artwork" | "controls">("controls");
  const [fitSignal, setFitSignal] = useState(0);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishRefresh, setPublishRefresh] = useState(0);

  // --- replace / delete ----------------------------------------------------
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [pendingReplace, setPendingReplace] = useState<File | null>(null);
  const [replaceConfirm, setReplaceConfirm] = useState(false);
  const [replaceBusy, setReplaceBusy] = useState(false);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // --- signed artwork url --------------------------------------------------
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [urlFailed, setUrlFailed] = useState(false);

  // --- refs kept fresh for async paths ------------------------------------
  const messageFor = useMemo(() => makeMessageMapper(t), [t]);
  const stateRef = useRef<EditorState | null>(null);
  const titleRef = useRef("");
  const descRef = useRef("");
  const detailsGenRef = useRef(0);
  const stateGenRef = useRef(0);
  const dirtyDetailsRef = useRef(false);
  const dirtyStateRef = useRef(false);
  const inflightRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRef = useRef<UndoRedo<EditorState>>(
    createUndoRedo(createInitialEditorState(AREA))
  );

  const isDirty = dirtyDetails || dirtyState;

  /** Recompute undo/redo availability (call after any history mutation). */
  const syncHistory = useCallback(() => {
    setHistFlags({
      canUndo: historyRef.current.canUndo(),
      canRedo: historyRef.current.canRedo(),
    });
  }, []);

  // --- save machinery ------------------------------------------------------
  const doSave = useCallback(async (): Promise<boolean> => {
    if (inflightRef.current) {
      pendingSaveRef.current = true;
      return false;
    }
    const payload: Record<string, unknown> = {};
    if (dirtyDetailsRef.current) {
      const trimmed = titleRef.current.trim();
      if (!trimmed) {
        setSaveState("error");
        setSaveError(t("studio_err_title_required"));
        return false;
      }
      payload.title = trimmed;
      payload.description = descRef.current;
    }
    if (dirtyStateRef.current && stateRef.current) {
      payload.editor_state = stateRef.current;
    }
    if (Object.keys(payload).length === 0) return true;

    const detailsGen = detailsGenRef.current;
    const stateGen = stateGenRef.current;
    inflightRef.current = true;
    setSaveState("saving");
    setSaveError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/designs/${designId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!body?.success) {
        throw new Error(messageFor(body, t("studio_err_generic")));
      }
      // Clear only what was actually saved — edits made while the request was
      // in flight bumped their generation counter and stay dirty.
      if (payload.title !== undefined && detailsGenRef.current === detailsGen) {
        dirtyDetailsRef.current = false;
        setDirtyDetails(false);
      }
      if (payload.editor_state !== undefined && stateGenRef.current === stateGen) {
        dirtyStateRef.current = false;
        setDirtyState(false);
      }
      const stillDirty = dirtyDetailsRef.current || dirtyStateRef.current;
      setSaveState(stillDirty ? "dirty" : "saved");
      return !stillDirty;
    } catch (err) {
      setSaveState("error");
      setSaveError(err instanceof Error ? err.message : t("studio_err_generic"));
      return false;
    } finally {
      inflightRef.current = false;
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        // Re-enter through the ref: self-recursion would defeat the compiler's
        // memoization of this callback (react-hooks/preserve-manual-memoization).
        void doSaveRef.current();
      }
    }
  }, [designId, getToken, messageFor, t]);

  const doSaveRef = useRef(doSave);
  useEffect(() => {
    // Keep the latest doSave reachable from timers/handlers without writing
    // refs during render (react-hooks/refs).
    doSaveRef.current = doSave;
  });

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void doSaveRef.current();
    }, AUTOSAVE_MS);
  }, []);

  const markDirty = useCallback(
    (kind: "details" | "state") => {
      if (kind === "details") {
        detailsGenRef.current += 1;
        dirtyDetailsRef.current = true;
        setDirtyDetails(true);
      } else {
        stateGenRef.current += 1;
        dirtyStateRef.current = true;
        setDirtyState(true);
      }
      setSaveState((current) => (current === "saving" ? current : "dirty"));
      scheduleSave();
    },
    [scheduleSave]
  );

  // Unsaved-changes guard (browser-native prompt).
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // --- load ----------------------------------------------------------------
  useEffect(() => {
    if (authLoading || !user) return;
    if (!UUID_RE.test(designId)) {
      setLoadError(t("studio_err_not_found"));
      setLoading(false);
      return;
    }
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const token = await getToken();
        const res = await fetch(`/api/designs/${designId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await res.json();
        if (!payload?.success) {
          throw new Error(messageFor(payload, t("studio_load_error")));
        }
        if (cancelled) return;
        const loaded: Design = payload.design;
        setDesign(loaded);

        const file = loaded.version?.file ?? null;
        const ratio = artworkRatio(file?.width_px, file?.height_px, 1);
        const fromServer = normalizeEditorState(loaded.version?.editor_state, AREA);
        const initial = fromServer ?? createInitialEditorState(AREA, ratio);
        historyRef.current = createUndoRedo(initial);
        stateRef.current = initial;
        setEditorState(initial);
        syncHistory();

        const nextTitle = loaded.title ?? "";
        const nextDescription = loaded.description ?? "";
        titleRef.current = nextTitle;
        descRef.current = nextDescription;
        setTitle(nextTitle);
        setDescription(nextDescription);
        dirtyDetailsRef.current = false;
        dirtyStateRef.current = false;
        setDirtyDetails(false);
        setDirtyState(false);
        detailsGenRef.current += 1;
        stateGenRef.current += 1;
        setSaveState("idle");
        setSaveError(null);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : t("studio_load_error"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, getToken, designId, reload, messageFor, t, syncHistory]);

  // --- signed url ----------------------------------------------------------
  const storagePath = design?.version?.file?.storage_path ?? null;
  useEffect(() => {
    let cancelled = false;
    if (!storagePath) {
      setArtworkUrl(null);
      setUrlFailed(false);
      return;
    }
    setArtworkUrl(null);
    setUrlFailed(false);
    supabase.storage
      .from("design-uploads")
      .createSignedUrl(storagePath, 3600)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.signedUrl) setUrlFailed(true);
        else setArtworkUrl(data.signedUrl);
      })
      .catch(() => {
        if (!cancelled) setUrlFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [storagePath]);

  // --- editor mutations ----------------------------------------------------
  const setLiveTransform = useCallback(
    (transform: Transform) => {
      const prev = stateRef.current;
      if (!prev) return;
      const next: EditorState = { ...prev, transform };
      stateRef.current = next;
      setEditorState(next);
      markDirty("state");
    },
    [markDirty]
  );

  const commitState = useCallback(
    (next: EditorState) => {
      const normalized = normalizeEditorState(next, AREA) ?? next;
      stateRef.current = normalized;
      setEditorState(normalized);
      historyRef.current.push(normalized);
      syncHistory();
      markDirty("state");
    },
    [markDirty, syncHistory]
  );

  const onGestureEnd = useCallback(() => {
    const current = stateRef.current;
    if (!current) return;
    const normalized = normalizeEditorState(current, AREA) ?? current;
    if (normalized !== current) {
      stateRef.current = normalized;
      setEditorState(normalized);
    }
    historyRef.current.push(normalized);
    syncHistory();
  }, [syncHistory]);

  const undo = useCallback(() => {
    const previous = historyRef.current.undo();
    if (!previous) return;
    const next: EditorState = { ...previous, zoom: stateRef.current?.zoom ?? previous.zoom };
    stateRef.current = next;
    setEditorState(next);
    syncHistory();
    markDirty("state");
  }, [markDirty, syncHistory]);

  const redo = useCallback(() => {
    const next2 = historyRef.current.redo();
    if (!next2) return;
    const next: EditorState = { ...next2, zoom: stateRef.current?.zoom ?? next2.zoom };
    stateRef.current = next;
    setEditorState(next);
    syncHistory();
    markDirty("state");
  }, [markDirty, syncHistory]);

  const onZoomChange = useCallback(
    (zoom: number) => {
      const prev = stateRef.current;
      if (!prev || prev.zoom === zoom) return;
      const next: EditorState = { ...prev, zoom: clampZoom(zoom) };
      stateRef.current = next;
      setEditorState(next);
      markDirty("state");
    },
    [markDirty]
  );

  const file = design?.version?.file ?? null;
  const fileRatio = artworkRatio(file?.width_px, file?.height_px, 0);

  const onFitArea = useCallback(() => {
    const prev = stateRef.current;
    if (!prev) return;
    commitState({
      ...prev,
      transform: fitTransform(AREA, fileRatio > 0 ? fileRatio : 1),
    });
  }, [commitState, fileRatio]);

  const onAlign = useCallback(
    (dir: Parameters<typeof alignTransform>[2]) => {
      const prev = stateRef.current;
      if (!prev) return;
      commitState({
        ...prev,
        transform: alignTransform(prev.transform, AREA, dir),
      });
    },
    [commitState]
  );

  const onAspectToggle = useCallback(() => {
    const prev = stateRef.current;
    if (!prev) return;
    const locking = !prev.aspectLocked;
    let transform = prev.transform;
    if (locking && fileRatio > 0) {
      // Restore the artwork's true aspect from the current width.
      transform = {
        ...transform,
        height: transform.width / fileRatio,
      };
    }
    commitState({ ...prev, aspectLocked: locking, transform });
  }, [commitState, fileRatio]);

  const onNumericCommit = useCallback(
    (next: Transform) => {
      const prev = stateRef.current;
      if (!prev) return;
      const transform: Transform = {
        ...next,
        rotation: normalizeRotation(next.rotation),
      };
      // With the lock on, the box must keep the ARTWORK's true aspect — the
      // controls derive proportionally from the current box, so re-anchor to
      // the file ratio to keep the invariant exact.
      if (prev.aspectLocked && fileRatio > 0) {
        transform.height = transform.width / fileRatio;
      }
      commitState({ ...prev, transform });
    },
    [commitState, fileRatio]
  );

  // --- warnings ------------------------------------------------------------
  const warnings = useMemo<ControlWarning[]>(() => {
    if (!editorState) return [];
    const list: ControlWarning[] = [];
    const overflow = detectOverflow(editorState.transform, AREA);
    if (overflow.overflows) {
      list.push({ id: "overflow", tone: "error", text: t("studio_warn_overflow") });
    }
    if (file) {
      const dpi = effectiveDpi(editorState.transform, {
        widthPx: file.width_px,
        heightPx: file.height_px,
      });
      if (dpi.low) list.push({ id: "dpi", tone: "warn", text: t("studio_warn_dpi") });

      const longest = Math.max(file.width_px ?? 0, file.height_px ?? 0);
      if (
        file.file_format !== "svg" &&
        longest > 0 &&
        longest < ARTWORK_LIMITS.lowResolutionPx
      ) {
        list.push({
          id: "low-res",
          tone: "warn",
          text: t("studio_warn_low_resolution"),
        });
      }
      if (mimeMismatch(file)) {
        list.push({
          id: "mime",
          tone: "warn",
          text: t("studio_warn_mime_mismatch"),
        });
      }
    }
    return list;
  }, [editorState, file, t]);

  const effective = useMemo(() => {
    if (!editorState || !file) return null;
    return effectiveDpi(editorState.transform, {
      widthPx: file.width_px,
      heightPx: file.height_px,
    }).dpi;
  }, [editorState, file]);

  // --- details edits -------------------------------------------------------
  const editTitle = useCallback(
    (value: string) => {
      setTitle(value);
      titleRef.current = value;
      markDirty("details");
    },
    [markDirty]
  );

  const editDescription = useCallback(
    (value: string) => {
      setDescription(value);
      descRef.current = value;
      markDirty("details");
    },
    [markDirty]
  );

  // --- replace artwork -----------------------------------------------------
  const handleReplacePick = useCallback(
    async (picked: File) => {
      setReplaceError(null);
      try {
        const bytes = new Uint8Array(await picked.arrayBuffer());
        const validation = validateArtwork(bytes, {
          filename: picked.name,
          mimeType: picked.type,
        });
        if (!validation.ok) {
          const code = validation.code;
          setReplaceError(
            isMappedErrorCode(code)
              ? t(`studio_err_${code}`)
              : t("studio_err_invalid_file")
          );
          return;
        }
        setPendingReplace(picked);
        setReplaceConfirm(true);
      } catch {
        setReplaceError(t("studio_err_invalid_file"));
      }
    },
    [t]
  );

  const confirmReplace = useCallback(async () => {
    if (!pendingReplace || replaceBusy) return;
    setReplaceBusy(true);
    setReplaceError(null);
    try {
      // Flush pending edits first so the replace never races older content.
      if (dirtyDetailsRef.current || dirtyStateRef.current) {
        const saved = await doSaveRef.current();
        if (!saved) {
          setReplaceError(t("studio_unsaved"));
          setReplaceBusy(false);
          return;
        }
      }
      const token = await getToken();
      const form = new FormData();
      form.append("file", pendingReplace);
      const res = await fetch(`/api/designs/${designId}/artwork`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const body = await res.json();
      if (!body?.success) {
        throw new Error(messageFor(body, t("studio_err_generic")));
      }
      setReplaceConfirm(false);
      setPendingReplace(null);
      // Full refetch: new file, server-computed placement carry-over, and any
      // automatic status demotion (artwork change resets review state).
      setReload((current) => current + 1);
    } catch (err) {
      setReplaceError(err instanceof Error ? err.message : t("studio_err_generic"));
      setReplaceConfirm(false);
    } finally {
      setReplaceBusy(false);
    }
  }, [pendingReplace, replaceBusy, getToken, designId, messageFor, t]);

  // --- delete --------------------------------------------------------------
  const confirmDelete = useCallback(async () => {
    if (deleteBusy) return;
    setDeleteBusy(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/designs/${designId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (!body?.success) {
        throw new Error(messageFor(body, t("studio_err_generic")));
      }
      router.push("/studio");
    } catch (err) {
      setDeleteConfirm(false);
      setLoadError(err instanceof Error ? err.message : t("studio_err_generic"));
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteBusy, getToken, designId, messageFor, t, router]);

  // --- navigation with unsaved guard --------------------------------------
  const leaveTo = useCallback(
    async (href: string) => {
      if (dirtyDetailsRef.current || dirtyStateRef.current) {
        const saved = await doSaveRef.current();
        if (!saved && !window.confirm(t("studio_unsaved"))) return;
      }
      router.push(href);
    },
    [router, t]
  );

  const manualSave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    void doSaveRef.current();
  }, []);

  // --- gates ---------------------------------------------------------------
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-secondary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-strong rounded-3xl p-8 text-center max-w-md">
          <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-extrabold mb-2">{t("nav_login")}</h1>
          <p className="text-muted-foreground mb-4">{t("creator_login_required")}</p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform"
          >
            {t("nav_login")}
          </Link>
        </div>
      </div>
    );
  }

  if (loading && !design) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-secondary" />
        <p className="text-sm text-muted-foreground">{t("studio_loading_editor")}</p>
      </div>
    );
  }

  if (loadError && !design) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-strong rounded-3xl p-8 text-center max-w-md">
          <AlertTriangle className="h-14 w-14 mx-auto text-amber-400 mb-3" />
          <p className="text-muted-foreground text-sm mb-5 break-words">{loadError}</p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setLoadError(null);
                setLoading(true);
                setReload((current) => current + 1);
              }}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold hover:scale-105 transition-transform"
            >
              {t("common_retry")}
            </button>
            <button
              type="button"
              onClick={() => void leaveTo("/studio")}
              className="px-6 py-3 rounded-2xl border border-white/10 bg-white/[0.03] font-semibold hover:border-white/25 transition-colors"
            >
              {t("studio_back_to_designs")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!design || !editorState) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-secondary" />
      </div>
    );
  }

  const canUndo = histFlags.canUndo;
  const canRedo = histFlags.canRedo;

  const artworkStatus: "loading" | "ready" | "error" | "none" = !storagePath
    ? "none"
    : artworkUrl
      ? "ready"
      : urlFailed
        ? "error"
        : "loading";

  const transparencyValue =
    file?.has_transparent_background === null || file?.has_transparent_background === undefined
      ? t("studio_transparency_unknown")
      : file.has_transparent_background
        ? t("studio_transparency_yes")
        : t("studio_transparency_no");

  const saveIndicator = (
    <div className="flex items-center gap-3">
      {saveState === "saving" && (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("studio_saving")}
        </span>
      )}
      {saveState === "saved" && (
        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {t("studio_saved")}
        </span>
      )}
      {saveState === "dirty" && (
        <span className="inline-flex items-center gap-1.5 text-xs text-amber-300">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          {t("studio_unsaved")}
        </span>
      )}
      {saveState === "error" && (
        <span
          className="inline-flex items-center gap-1.5 text-xs text-rose-300 max-w-[16rem]"
          title={saveError ?? undefined}
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{saveError ?? t("studio_save_failed")}</span>
        </span>
      )}
      <button
        type="button"
        onClick={manualSave}
        disabled={saveState === "saving" || !isDirty}
        className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] text-xs font-semibold hover:border-pink-500/40 transition-colors disabled:opacity-40"
      >
        <Save className="h-3.5 w-3.5" />
        {t("studio_save_now")}
      </button>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1700px] px-3 md:px-4 pt-24 pb-24 lg:pb-6">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void leaveTo("/studio")}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 bg-white/[0.03] text-xs font-semibold hover:border-pink-500/40 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          <span className="hidden sm:inline">{t("studio_back_to_designs")}</span>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg md:text-xl font-extrabold truncate" title={title}>
            {title || t("studio_design_title")}
          </h1>
        </div>
        <StatusBadge status={design.status} label={t(`status_${design.status}`)} />
        {design.status !== "archived" ? (
          <button
            type="button"
            onClick={() => setPublishOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-pink-500/40 bg-pink-500/10 text-xs font-semibold text-white hover:border-pink-400 transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
            {t("publish_button")}
          </button>
        ) : null}
        {saveIndicator}
      </div>

      {design.status === "rejected" && design.rejection_reason && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            <strong>{t("creator_rejection_feedback")}:</strong>{" "}
            {design.rejection_reason}
          </span>
        </div>
      )}

      {/* 3-pane layout (mobile: canvas + one panel + bottom bar) */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[300px_minmax(0,1fr)_340px] lg:gap-4 lg:h-[calc(100vh-11rem)]">
        {/* Left: artwork + design details */}
        <aside
          className={`order-2 lg:order-none min-h-0 overflow-y-auto glass-strong rounded-2xl p-4 ${
            mobileTab === "artwork" ? "max-h-[40vh]" : "hidden"
          } lg:block lg:max-h-none`}
        >
          <div className="space-y-5">
            <section>
              <h3 className="text-[11px] uppercase tracking-[0.18em] text-secondary font-bold mb-3">
                {t("studio_artwork_props")}
              </h3>
              <div className="h-28 rounded-xl border border-white/10 bg-[#0b0b12] flex items-center justify-center overflow-hidden mb-3">
                {artworkStatus === "ready" && artworkUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={artworkUrl}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <ImageIcon className="h-7 w-7 text-muted-foreground/50" />
                )}
              </div>
              {file ? (
                <div>
                  <Fact label={t("studio_format")} value={file.file_format.toUpperCase()} />
                  <Fact
                    label={t("studio_dimensions_px")}
                    value={
                      file.width_px && file.height_px
                        ? `${file.width_px} × ${file.height_px}`
                        : "—"
                    }
                  />
                  <Fact label={t("studio_transparency")} value={transparencyValue} />
                  <Fact
                    label={t("studio_file_dpi")}
                    value={file.dpi ? String(file.dpi) : "—"}
                  />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t("studio_no_artwork")}</p>
              )}
            </section>

            <section>
              <h3 className="text-[11px] uppercase tracking-[0.18em] text-secondary font-bold mb-3">
                {t("studio_design_details")}
              </h3>
              <label className="block mb-3">
                <span className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  {t("studio_design_title")}
                </span>
                <input
                  type="text"
                  value={title}
                  maxLength={ARTWORK_LIMITS.maxTitleLength}
                  onChange={(event) => editTitle(event.target.value)}
                  className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-pink-500/50 transition-colors"
                  placeholder={t("studio_design_title_ph")}
                />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  {t("studio_description")}
                </span>
                <textarea
                  value={description}
                  rows={4}
                  maxLength={ARTWORK_LIMITS.maxDescriptionLength}
                  onChange={(event) => editDescription(event.target.value)}
                  className="w-full px-3 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-pink-500/50 transition-colors resize-y"
                  placeholder={t("studio_description_ph")}
                />
              </label>
            </section>

            <ProductCatalog
              designId={designId}
              fileId={file?.id ?? null}
              transform={editorState.transform}
              area={AREA}
              artworkUrl={artworkUrl}
              artworkReady={artworkStatus === "ready" && Boolean(artworkUrl)}
              refreshSignal={publishRefresh}
            />

            <section className="space-y-2.5">
              <input
                ref={replaceInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(event) => {
                  const picked = event.target.files?.[0];
                  if (picked) void handleReplacePick(picked);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => replaceInputRef.current?.click()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.03] text-sm font-semibold hover:border-pink-500/40 transition-colors"
              >
                <Upload className="h-4 w-4" />
                {t("studio_replace_artwork")}
              </button>
              {replaceError && (
                <p className="text-xs text-rose-300 flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  {replaceError}
                </p>
              )}
              <button
                type="button"
                onClick={() => setDeleteConfirm(true)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-sm font-semibold text-rose-200 hover:bg-rose-500/20 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                {t("common_delete")}
              </button>
            </section>
          </div>
        </aside>

        {/* Center: canvas */}
        <main className="order-1 lg:order-none h-[44vh] lg:h-auto min-h-0">
          <ArtworkCanvas
            artworkUrl={artworkUrl}
            artworkStatus={artworkStatus}
            alt={title}
            area={AREA}
            transform={editorState.transform}
            zoom={editorState.zoom}
            aspectLocked={editorState.aspectLocked}
            overflow={warnings.some((warning) => warning.id === "overflow")}
            fitSignal={fitSignal}
            onTransformChange={setLiveTransform}
            onGestureEnd={onGestureEnd}
            onZoomChange={onZoomChange}
            disabled={loading}
          />
        </main>

        {/* Right: controls */}
        <aside
          className={`order-3 lg:order-none min-h-0 overflow-y-auto glass-strong rounded-2xl p-4 ${
            mobileTab === "controls" ? "max-h-[40vh]" : "hidden"
          } lg:block lg:max-h-none`}
        >
          <TransformControls
            transform={editorState.transform}
            area={AREA}
            aspectLocked={editorState.aspectLocked}
            zoom={editorState.zoom}
            effectiveDpi={effective}
            warnings={warnings}
            canUndo={canUndo}
            canRedo={canRedo}
            t={t}
            onTransformCommit={onNumericCommit}
            onAspectToggle={onAspectToggle}
            onFitArea={onFitArea}
            onAlign={onAlign}
            onUndo={undo}
            onRedo={redo}
            onZoomBy={(factor) =>
              onZoomChange(clampZoom(editorState.zoom * factor))
            }
            onFitView={() => setFitSignal((current) => current + 1)}
          />
        </aside>
      </div>

      {/* Mobile bottom bar */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 glass-strong border-t border-white/10 px-3 py-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMobileTab("artwork")}
          aria-pressed={mobileTab === "artwork"}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
            mobileTab === "artwork"
              ? "bg-gradient-neon text-white"
              : "border border-white/10 bg-white/[0.03] text-muted-foreground"
          }`}
        >
          <PanelLeft className="h-3.5 w-3.5" />
          {t("studio_panel_artwork")}
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("controls")}
          aria-pressed={mobileTab === "controls"}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
            mobileTab === "controls"
              ? "bg-gradient-neon text-white"
              : "border border-white/10 bg-white/[0.03] text-muted-foreground"
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {t("studio_panel_controls")}
        </button>
        <div className="flex-1" />
        {warnings.length > 0 && (
          <span
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[11px] font-bold text-amber-300"
            title={warnings.map((warning) => warning.text).join("\n")}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {warnings.length}
          </span>
        )}
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo}
          aria-label={t("studio_undo")}
          className="h-9 w-9 flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-muted-foreground disabled:opacity-35"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!canRedo}
          aria-label={t("studio_redo")}
          className="h-9 w-9 flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-muted-foreground disabled:opacity-35"
        >
          <Redo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={manualSave}
          disabled={saveState === "saving" || !isDirty}
          aria-label={t("studio_save_now")}
          className={`h-9 w-9 flex items-center justify-center rounded-lg text-white disabled:opacity-40 ${
            saveState === "error" ? "bg-rose-500/80" : "bg-gradient-neon"
          }`}
        >
          <Save className="h-4 w-4" />
        </button>
      </div>

      {/* Replace confirmation */}
      <ConfirmDialog
        open={replaceConfirm}
        title={t("studio_replace_artwork")}
        body={t("studio_replace_hint")}
        confirmLabel={t("studio_replace_artwork")}
        cancelLabel={t("common_cancel")}
        busy={replaceBusy}
        danger={false}
        onConfirm={() => void confirmReplace()}
        onCancel={() => !replaceBusy && (setReplaceConfirm(false), setPendingReplace(null))}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteConfirm}
        title={t("studio_delete_title")}
        body={t("studio_delete_body")}
        confirmLabel={t("common_delete")}
        cancelLabel={t("common_cancel")}
        busy={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => !deleteBusy && setDeleteConfirm(false)}
      />

      {/* Publish dialog (Phase 7) */}
      <PublishDialog
        open={publishOpen}
        designId={designId}
        designTitle={title}
        designDescription={description}
        onClose={() => setPublishOpen(false)}
        onPublished={() => setPublishRefresh((value) => value + 1)}
      />
    </div>
  );
}
