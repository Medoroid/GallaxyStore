"use client";

export type DesignStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "published"
  | "rejected"
  | "archived";

const STATUS_STYLES: Record<DesignStatus, string> = {
  draft: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  pending_review: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  published: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  rejected: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  archived: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
};

/** Small pill showing the review state of a design/version. */
export default function StatusBadge({
  status,
  label,
}: {
  status: string;
  label: string;
}) {
  const style =
    STATUS_STYLES[status as DesignStatus] ?? STATUS_STYLES.draft;
  return (
    <span
      className={`inline-flex shrink-0 items-center px-2.5 py-0.5 rounded-full border text-xs font-semibold ${style}`}
    >
      {label}
    </span>
  );
}
