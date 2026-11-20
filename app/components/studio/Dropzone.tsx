"use client";

import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { Upload } from "lucide-react";

type Props = {
  /** Called with the picked file (already user-chosen; validation happens above). */
  onFile: (file: File) => void;
  hint: string;
  formats: string;
  disabled?: boolean;
  compact?: boolean;
};

/**
 * Drag & drop + click-to-pick area. Accept/reject of the CONTENT is done by
 * the shared `validateArtwork` in the caller — this component only collects
 * the first file and gives immediate drag feedback.
 */
export default function Dropzone({
  onFile,
  hint,
  formats,
  disabled = false,
  compact = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file && !disabled) onFile(file);
  };

  const onDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;
    dragDepth.current += 1;
    setDragging(true);
  };

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (disabled) return;
    pick(event.dataTransfer.files);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={hint}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && !disabled) {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragEnter={onDragEnter}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`relative rounded-2xl border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center text-center px-6 ${
        compact ? "py-6" : "py-12"
      } ${
        disabled
          ? "opacity-50 cursor-not-allowed border-white/10"
          : dragging
            ? "border-pink-400/70 bg-pink-500/10"
            : "border-white/15 bg-white/[0.02] hover:border-pink-400/40 hover:bg-white/[0.04]"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(event) => {
          pick(event.target.files);
          event.target.value = ""; // allow re-picking the same file
        }}
      />
      <Upload
        className={`h-8 w-8 mb-3 ${dragging ? "text-pink-300" : "text-secondary"}`}
      />
      <p className="text-sm font-semibold">{hint}</p>
      <p className="text-xs text-muted-foreground mt-1">{formats}</p>
    </div>
  );
}
