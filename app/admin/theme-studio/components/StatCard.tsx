import type { LucideIcon } from "lucide-react";

/**
 * Small stat tile used by the Theme Studio dashboard header.
 * Purely presentational — numbers come from the list API so the dashboard
 * never disagrees with what resolution would actually do.
 */
type StatCardProps = {
  label: string;
  value: number | string;
  icon: LucideIcon;
  accent?: string;
  hint?: string;
};

export default function StatCard({ label, value, icon: Icon, accent, hint }: StatCardProps) {
  return (
    <div className="glass-strong rounded-2xl p-4 flex items-start gap-3">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{
          background: accent
            ? `color-mix(in srgb, ${accent} 18%, transparent)`
            : "rgba(255,255,255,0.05)",
          color: accent ?? "var(--muted-foreground, #9ca3af)",
        }}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-extrabold text-white leading-tight">{value}</p>
        <p className="text-xs text-gray-400 mt-0.5">{label}</p>
        {hint ? <p className="text-[11px] text-gray-500 mt-0.5 truncate">{hint}</p> : null}
      </div>
    </div>
  );
}
