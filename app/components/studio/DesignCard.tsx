"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import StatusBadge from "./StatusBadge";
import type { DesignStatus } from "./StatusBadge";

export type DesignCardData = {
  id: string;
  title: string;
  status: DesignStatus;
  updated_at: string;
  file: {
    storage_path: string;
    file_format: string;
    width_px: number | null;
    height_px: number | null;
  } | null;
};

type Props = {
  design: DesignCardData;
  badgeLabel: string;
  deleteLabel: string;
  onDelete: (design: DesignCardData) => void;
};

/**
 * One design in the studio grid. The thumbnail is a short-lived signed URL
 * minted client-side (private bucket, owner-scoped SELECT policy) so no
 * permanent public link to the original ever exists.
 */
export default function DesignCard({
  design,
  badgeLabel,
  deleteLabel,
  onDelete,
}: Props) {
  const [thumb, setThumb] = useState<string | null>(null);
  const path = design.file?.storage_path ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setThumb(null);
      return;
    }
    supabase.storage
      .from("design-uploads")
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (!cancelled) setThumb(data?.signedUrl ?? null);
      })
      .catch(() => {
        if (!cancelled) setThumb(null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const dims =
    design.file?.width_px && design.file?.height_px
      ? `${design.file.width_px}×${design.file.height_px}`
      : design.file?.file_format?.toUpperCase() ?? "";

  return (
    <div className="group relative glass-strong rounded-2xl overflow-hidden flex flex-col">
      <Link
        href={`/studio/${design.id}`}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500/60 rounded-t-2xl"
        aria-label={design.title}
      >
        <div className="aspect-square bg-[#0b0b12] flex items-center justify-center overflow-hidden">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumb}
              alt=""
              loading="lazy"
              className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <FileText className="h-10 w-10 text-muted-foreground/50" />
          )}
        </div>
      </Link>

      <div className="p-3.5 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/studio/${design.id}`}
            className="font-semibold text-sm leading-snug min-w-0 line-clamp-2 hover:text-pink-300 transition-colors"
          >
            {design.title}
          </Link>
          <button
            type="button"
            onClick={() => onDelete(design)}
            aria-label={deleteLabel}
            title={deleteLabel}
            className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center justify-between gap-2 mt-auto">
          <StatusBadge status={design.status} label={badgeLabel} />
          <span className="text-[11px] text-muted-foreground truncate">
            {dims}
          </span>
        </div>
      </div>
    </div>
  );
}
