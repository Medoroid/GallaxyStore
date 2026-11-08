"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Upload,
  Trash2,
  ArrowUp,
  ArrowDown,
  Star,
  ImagePlus,
} from "lucide-react";
import { useAuth } from "@/app/lib/auth-context";

type GalleryImage = {
  id: string;
  title: string;
  description: string | null;
  image_url: string;
  category: string;
  is_featured: boolean;
  sort_order: number;
};

const CATEGORIES = [
  "custom-prints",
  "apparel",
  "mugs",
  "posters",
  "phone-cases",
  "stickers",
  "frames",
  "gift-boxes",
  "photo-prints",
  "illustrations",
];

export default function AdminGallery() {
  const { user, getToken } = useAuth();
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("custom-prints");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/gallery", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setMessage({ type: "error", text: data?.message || "Could not load gallery." });
        return;
      }
      setImages(data.images || []);
    } catch {
      setMessage({ type: "error", text: "Network error while loading gallery." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="glass-strong rounded-3xl p-8 text-center">
          <h1 className="text-2xl font-extrabold mb-2">Admin Access Required</h1>
          <p className="text-muted-foreground">Please log in to access the admin panel.</p>
        </div>
      </div>
    );
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(selected ? URL.createObjectURL(selected) : "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !file) {
      setMessage({ type: "error", text: "A title and an image file are required." });
      return;
    }

    setUploading(true);
    setMessage(null);
    try {
      const token = await getToken();
      const form = new FormData();
      form.append("title", title.trim());
      form.append("description", description.trim());
      form.append("category", category);
      form.append("file", file);

      const res = await fetch("/api/gallery", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setMessage({ type: "error", text: data?.message || "Failed to add image." });
        return;
      }

      setMessage({ type: "success", text: "Image added to the gallery." });
      setTitle("");
      setDescription("");
      setFile(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview("");
      await load();
    } catch {
      setMessage({ type: "error", text: "Network error while uploading." });
    } finally {
      setUploading(false);
    }
  };

  const patchImage = async (id: string, payload: Record<string, unknown>) => {
    setActingId(id);
    setMessage(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/gallery", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, ...payload }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setMessage({ type: "error", text: data?.message || "Could not update the image." });
        return false;
      }
      setImages((prev) =>
        prev.map((image) => (image.id === id ? { ...image, ...data.image } : image))
      );
      return true;
    } catch {
      setMessage({ type: "error", text: "Network error while updating." });
      return false;
    } finally {
      setActingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this gallery image?")) return;
    setActingId(id);
    setMessage(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/gallery?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setMessage({ type: "error", text: data?.message || "Could not delete the image." });
        return;
      }
      setImages((prev) => prev.filter((image) => image.id !== id));
    } catch {
      setMessage({ type: "error", text: "Network error while deleting." });
    } finally {
      setActingId(null);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    setImages(next);

    try {
      const token = await getToken();
      const res = await fetch("/api/gallery", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ order: next.map((image) => ({ id: image.id })) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setMessage({ type: "error", text: data?.message || "Could not reorder gallery." });
        await load();
      }
    } catch {
      setMessage({ type: "error", text: "Network error while reordering." });
      await load();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Gallery Manager</h1>
        <p className="text-gray-400 mt-1">Upload, edit, reorder and delete gallery images</p>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl text-sm ${
            message.type === "success"
              ? "bg-green-500/10 border border-green-500/20 text-green-400"
              : "bg-red-500/10 border border-red-500/20 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <ImagePlus className="w-5 h-5 text-[#FF4FD8]" /> Add new image
        </h2>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              className={INPUT_CLASS}
              placeholder="Galaxy Neon Tee"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={INPUT_CLASS}
            >
              {CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Description (optional)</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={INPUT_CLASS}
            placeholder="Short description"
          />
        </div>

        <label className="block glass rounded-xl border border-dashed border-white/20 p-6 text-center cursor-pointer hover:border-[#FF4FD8]/50 transition-colors">
          <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          <Upload className="h-6 w-6 mx-auto mb-2 text-[#FF4FD8]" />
          <p className="text-sm text-gray-300">{file ? file.name : "Click to choose an image"}</p>
          <p className="text-xs text-gray-500 mt-1">JPG, PNG, WebP, GIF or AVIF up to 8MB</p>
        </label>

        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Preview" className="max-h-64 rounded-xl object-contain mx-auto" />
        )}

        <button
          type="submit"
          disabled={uploading}
          className="w-full h-12 rounded-xl bg-gradient-to-r from-[#FF4FD8] to-[#A855F7] text-white font-bold flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(255,79,216,0.3)] transition-all disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          Add to Gallery
        </button>
      </form>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass rounded-2xl p-4 animate-pulse">
              <div className="h-40 bg-white/[0.05] rounded-xl mb-3" />
              <div className="h-4 bg-white/[0.05] rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : images.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center text-gray-400">
          No gallery images yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {images.map((image, index) => {
            const busy = actingId === image.id;
            return (
              <div key={image.id} className="glass rounded-2xl p-4 space-y-3">
                <div className="relative h-44 rounded-xl overflow-hidden bg-white/[0.03]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.image_url} alt={image.title} className="w-full h-full object-cover" />
                  {image.is_featured && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-[#FF4FD8] text-[10px] font-bold text-white">
                      Featured
                    </span>
                  )}
                </div>

                <input
                  defaultValue={image.title}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (value && value !== image.title) patchImage(image.id, { title: value });
                  }}
                  className={INPUT_CLASS}
                  maxLength={160}
                />

                <div className="flex gap-2">
                  <select
                    value={image.category || "custom-prints"}
                    onChange={(e) => patchImage(image.id, { category: e.target.value })}
                    className={INPUT_CLASS}
                  >
                    {[...new Set([image.category || "custom-prints", ...CATEGORIES])].map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => patchImage(image.id, { is_featured: !image.is_featured })}
                    className={`px-3 rounded-xl text-xs font-medium ${
                      image.is_featured
                        ? "bg-[#FF4FD8]/15 text-[#FF4FD8]"
                        : "bg-white/[0.05] text-gray-400"
                    }`}
                    title="Toggle featured"
                  >
                    <Star className={`w-4 h-4 ${image.is_featured ? "fill-current" : ""}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      className="p-2 rounded-lg bg-white/[0.05] text-gray-400 disabled:opacity-40"
                      title="Move up"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={index === images.length - 1}
                      onClick={() => move(index, 1)}
                      className="p-2 rounded-lg bg-white/[0.05] text-gray-400 disabled:opacity-40"
                      title="Move down"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleDelete(image.id)}
                    className="p-2 rounded-lg bg-red-500/10 text-red-400 disabled:opacity-50"
                    title="Delete"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const INPUT_CLASS =
  "w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-[#FF4FD8]/50 transition-colors text-sm";
