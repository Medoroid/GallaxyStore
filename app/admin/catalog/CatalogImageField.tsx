"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { SafeImage } from "@/app/components/SafeImage";
import { useAuth } from "@/app/lib/auth-context";

/**
 * URL-or-upload image picker for catalog forms.
 * The text input keeps arbitrary external links working; the file input
 * uploads through the guarded admin endpoint and stores the returned URL.
 */
export function CatalogImageField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { getToken } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setUploading(true);
    setError("");
    try {
      const token = await getToken();
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/catalog/images", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || !data?.url) {
        setError(data?.message ?? "Could not upload the image.");
        return;
      }
      onChange(data.url);
    } catch {
      setError("Network error while uploading the image.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <span className="text-xs text-gray-400">{label}</span>
      <div className="flex gap-2">
        <input
          className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-gray-600 focus:border-[var(--brand)] focus:outline-none"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://… or upload below"
          aria-label={`${label} URL`}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-label={`Upload ${label}`}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-gray-200 hover:border-pink-500/40 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          Upload
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>
      {value && (
        <div className="relative h-20 w-32 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
          <SafeImage src={value} alt={`${label} preview`} fill sizes="128px" className="object-contain" />
        </div>
      )}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}
