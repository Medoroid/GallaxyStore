"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { Image as ImageIcon, Loader2 } from "lucide-react";
import {
  angleAt,
  clampZoom,
  moveBy,
  normalizeRotation,
  resizeFromHandle,
  snapRotation,
} from "@/lib/design-studio/placement";
import type {
  PrintableArea,
  ResizeHandle,
  Transform,
} from "@/lib/design-studio/types";

type GestureBase = {
  startClientX: number;
  startClientY: number;
  moved: boolean;
};

type GesturePayload =
  | { kind: "pan"; startPan: { x: number; y: number } }
  | { kind: "move"; start: { x: number; y: number }; startT: Transform }
  | {
      kind: "resize";
      handle: ResizeHandle;
      start: { x: number; y: number };
      startT: Transform;
    }
  | { kind: "rotate"; offset: number; startT: Transform };

type Gesture = GesturePayload & GestureBase;

type Props = {
  artworkUrl: string | null;
  artworkStatus: "loading" | "ready" | "error" | "none";
  alt: string;
  area: PrintableArea;
  transform: Transform;
  zoom: number;
  aspectLocked: boolean;
  overflow: boolean;
  /** Increment to reset the view (zoom → 1, pan → 0). */
  fitSignal: number;
  /** Live transform during a gesture (no history). */
  onTransformChange: (t: Transform) => void;
  /** Gesture finished — commit the current state to undo history. */
  onGestureEnd: () => void;
  /** Persisted zoom change (wheel / external). */
  onZoomChange: (zoom: number) => void;
  disabled?: boolean;
};

const PAD = 64; // breathing room around the printable area at fit view
const MOVE_THRESHOLD_PX = 3;

const HANDLES: Array<{
  id: ResizeHandle;
  style: CSSProperties;
  cursor: string;
}> = [
  { id: "nw", style: { left: 0, top: 0 }, cursor: "nwse-resize" },
  { id: "n", style: { left: "50%", top: 0 }, cursor: "ns-resize" },
  { id: "ne", style: { left: "100%", top: 0 }, cursor: "nesw-resize" },
  { id: "e", style: { left: "100%", top: "50%" }, cursor: "ew-resize" },
  { id: "se", style: { left: "100%", top: "100%" }, cursor: "nwse-resize" },
  { id: "s", style: { left: "50%", top: "100%" }, cursor: "ns-resize" },
  { id: "sw", style: { left: 0, top: "100%" }, cursor: "nesw-resize" },
  { id: "w", style: { left: 0, top: "50%" }, cursor: "ew-resize" },
];

const CHECKER: CSSProperties = {
  backgroundImage:
    "conic-gradient(rgba(255,255,255,0.055) 0 25%, transparent 0 50%, rgba(255,255,255,0.055) 0 75%, transparent 0)",
  backgroundSize: "18px 18px",
};

/**
 * The editor artboard: printable area + artwork with move / resize / rotate
 * handles, wheel zoom (cursor-anchored) and background panning.
 *
 * All geometry goes through `lib/design-studio/placement` — this component
 * only converts pointer pixels ↔ inches and back.
 */
export default function ArtworkCanvas({
  artworkUrl,
  artworkStatus,
  alt,
  area,
  transform,
  zoom,
  aspectLocked,
  overflow,
  fitSignal,
  onTransformChange,
  onGestureEnd,
  onZoomChange,
  disabled = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const fitPpiRef = useRef(1);
  const sizeRef = useRef(size);
  const gestureRef = useRef<Gesture | null>(null);
  const disabledRef = useRef(disabled);
  const onZoomChangeRef = useRef(onZoomChange);
  const onTransformChangeRef = useRef(onTransformChange);
  const onGestureEndRef = useRef(onGestureEnd);

  // Keep refs fresh for native listeners / gesture handlers. A layout effect
  // runs after every commit, before the browser can dispatch input events —
  // and keeps ref writes out of render (react-hooks/refs).

  // --- measurement ---------------------------------------------------------
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () =>
      setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fitPpi =
    size.w > 0 && size.h > 0
      ? Math.max(
          0.25,
          Math.min((size.w - PAD) / area.widthIn, (size.h - PAD) / area.heightIn)
        )
      : 1;

  // Keep refs fresh for native listeners / gesture handlers: a layout effect
  // runs after every commit, before the browser can dispatch input events,
  // and keeps ref writes out of render (react-hooks/refs).
  useLayoutEffect(() => {
    panRef.current = pan;
    zoomRef.current = zoom;
    sizeRef.current = size;
    disabledRef.current = disabled;
    fitPpiRef.current = fitPpi;
    onZoomChangeRef.current = onZoomChange;
    onTransformChangeRef.current = onTransformChange;
    onGestureEndRef.current = onGestureEnd;
  });

  const ppi = fitPpi * zoom;
  const center = { x: size.w / 2 + pan.x, y: size.h / 2 + pan.y };
  const areaPx = { w: area.widthIn * ppi, h: area.heightIn * ppi };

  // --- coordinate helpers (read refs so native listeners stay fresh) -------
  const screenPoint = useCallback((event: { clientX: number; clientY: number }) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  const screenCenter = useCallback(() => {
    const s = sizeRef.current;
    const p = panRef.current;
    return { x: s.w / 2 + p.x, y: s.h / 2 + p.y };
  }, []);

  const pointerInches = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const sp = screenPoint(event);
      const c = screenCenter();
      const currentPpi = fitPpiRef.current * zoomRef.current;
      return { x: (sp.x - c.x) / currentPpi, y: (sp.y - c.y) / currentPpi };
    },
    [screenPoint, screenCenter]
  );

  // --- fit view ------------------------------------------------------------
  useEffect(() => {
    if (fitSignal <= 0) return;
    panRef.current = { x: 0, y: 0 };
    setPan({ x: 0, y: 0 });
    onZoomChangeRef.current(1);
  }, [fitSignal]);

  // --- wheel zoom (native, non-passive so preventDefault works) -----------
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (event: WheelEvent) => {
      event.preventDefault();
      if (disabledRef.current) return;
      const zoomNow = zoomRef.current;
      const next = clampZoom(zoomNow * Math.exp(-event.deltaY * 0.0018));
      if (Math.abs(next - zoomNow) < 1e-6) return;

      const rect = el.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const ppiNow = fitPpiRef.current * zoomNow;
      const ppiNext = fitPpiRef.current * next;
      const p = panRef.current;
      const cx = rect.width / 2 + p.x;
      const cy = rect.height / 2 + p.y;
      const wx = (sx - cx) / ppiNow;
      const wy = (sy - cy) / ppiNow;
      const panNext = {
        x: sx - rect.width / 2 - wx * ppiNext,
        y: sy - rect.height / 2 - wy * ppiNext,
      };
      panRef.current = panNext;
      zoomRef.current = next; // keep the next event anchored to the new zoom
      setPan(panNext);
      onZoomChangeRef.current(next);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // --- gestures ------------------------------------------------------------
  const begin = (
    event: ReactPointerEvent<HTMLElement>,
    payload: GesturePayload
  ) => {
    if (disabledRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    gestureRef.current = {
      ...payload,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const g = gestureRef.current;
    if (!g || disabledRef.current) return;
    if (!g.moved) {
      const dx = event.clientX - g.startClientX;
      const dy = event.clientY - g.startClientY;
      if (Math.hypot(dx, dy) < MOVE_THRESHOLD_PX) return;
      g.moved = true;
    }

    if (g.kind === "pan") {
      const next = {
        x: g.startPan.x + (event.clientX - g.startClientX),
        y: g.startPan.y + (event.clientY - g.startClientY),
      };
      panRef.current = next;
      setPan(next);
      return;
    }

    if (g.kind === "move") {
      const p = pointerInches(event);
      onTransformChangeRef.current(
        moveBy(g.startT, p.x - g.start.x, p.y - g.start.y)
      );
      return;
    }

    if (g.kind === "resize") {
      const p = pointerInches(event);
      onTransformChangeRef.current(
        resizeFromHandle(g.startT, g.handle, p, { aspectLocked, area })
      );
      return;
    }

    // rotate
    const sp = screenPoint(event);
    const c = screenCenter();
    let deg = angleAt(c, sp) + 90 - g.offset;
    deg = event.shiftKey ? snapRotation(deg) : normalizeRotation(deg);
    onTransformChangeRef.current({ ...g.startT, rotation: deg });
  };

  const onPointerUp = () => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (g && g.moved && g.kind !== "pan") onGestureEndRef.current();
  };

  const startMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    begin(event, {
      kind: "move",
      start: pointerInches(event),
      startT: transform,
    });
  };

  const startResize = (handle: ResizeHandle) => (event: ReactPointerEvent<HTMLElement>) => {
    begin(event, {
      kind: "resize",
      handle,
      start: pointerInches(event),
      startT: transform,
    });
  };

  const startRotate = (event: ReactPointerEvent<HTMLElement>) => {
    const sp = screenPoint(event);
    const c = screenCenter();
    const offset = angleAt(c, sp) + 90 - transform.rotation;
    begin(event, { kind: "rotate", offset, startT: transform });
  };

  const startPan = (event: ReactPointerEvent<HTMLElement>) => {
    begin(event, { kind: "pan", startPan: panRef.current });
  };

  const outline = overflow ? "border-rose-400" : "border-pink-400/80";

  return (
    <div
      ref={containerRef}
      dir="ltr"
      aria-label={alt}
      className="relative w-full h-full overflow-hidden rounded-2xl border border-white/10 bg-[#07070d] select-none"
      style={{ touchAction: "none" }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* printable area (panned/zoomed) */}
      <div
        className="absolute"
        style={{
          left: center.x - areaPx.w / 2,
          top: center.y - areaPx.h / 2,
          width: areaPx.w,
          height: areaPx.h,
        }}
        onPointerDown={startPan}
      >
        <div
          className={`absolute inset-0 rounded-sm border border-dashed ${
            overflow ? "border-rose-400/70" : "border-white/25"
          }`}
          style={CHECKER}
        />

        {artworkStatus === "ready" && artworkUrl ? (
          <div
            className={`absolute border-2 ${outline} ${disabled ? "" : "cursor-grab active:cursor-grabbing"}`}
            style={{
              left: `calc(50% + ${transform.cx * ppi}px)`,
              top: `calc(50% + ${transform.cy * ppi}px)`,
              width: transform.width * ppi,
              height: transform.height * ppi,
              transform: `translate(-50%, -50%) rotate(${transform.rotation}deg)`,
              boxShadow: overflow
                ? "0 0 0 1px rgba(244,63,94,0.35), 0 0 24px rgba(244,63,94,0.25)"
                : "0 0 0 1px rgba(236,72,153,0.25)",
            }}
            onPointerDown={startMove}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={artworkUrl ?? undefined}
              alt=""
              draggable={false}
              className="w-full h-full object-fill pointer-events-none"
              onDragStart={(event) => event.preventDefault()}
            />
            {!disabled && (
              <>
                {HANDLES.map(({ id, style, cursor }) => (
                  <span
                    key={id}
                    role="presentation"
                    onPointerDown={startResize(id)}
                    className="absolute w-3 h-3 rounded-full bg-pink-400 border-2 border-[#07070d] hover:bg-pink-300"
                    style={{
                      ...style,
                      transform: "translate(-50%, -50%)",
                      cursor,
                      touchAction: "none",
                    }}
                  />
                ))}
                <span
                  role="presentation"
                  onPointerDown={startRotate}
                  title="Rotate (Shift snaps to 15°)"
                  className="absolute w-3.5 h-3.5 rounded-full bg-white border-2 border-pink-400 hover:bg-pink-100"
                  style={{
                    left: "50%",
                    top: 0,
                    transform: "translate(-50%, calc(-100% - 20px))",
                    cursor: "grab",
                    touchAction: "none",
                  }}
                />
                <span
                  aria-hidden
                  className="absolute left-1/2 w-px bg-pink-400/60"
                  style={{
                    top: 0,
                    height: 20,
                    transform: "translateX(-50%) translateY(-100%)",
                  }}
                />
              </>
            )}
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            {artworkStatus === "loading" ? (
              <Loader2 className="h-7 w-7 animate-spin text-secondary" />
            ) : artworkStatus === "error" ? (
              <ImageIcon className="h-8 w-8 text-rose-400/70" />
            ) : (
              <ImageIcon className="h-8 w-8 opacity-50" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
