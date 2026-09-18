"use client";

import { useState } from "react";
import Image from "next/image";
import { Loader2, Plus, Upload, ImagePlus } from "lucide-react";
import { useAuth } from "@/app/lib/auth-context";

export default function AdminGallery() {
  const { user, getToken } = useAuth();
  const [title, setTitle] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [category, setCategory] = useState("custom-prints");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass-strong rounded-3xl p-8 text-center">
          <h1 className="text-2xl font-extrabold mb-2">Admin Access Required</h1>
          <p className="text-muted-foreground">Please log in to access the admin panel.</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !imageUrl.trim()) return;

    setUploading(true);
    setMessage(null);

    try {
      const token = await getToken();
      const res = await fetch("/api/gallery", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          image_url: imageUrl.trim(),
          category,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setMessage({ type: "success", text: "Image added successfully!" });
        setTitle("");
        setImageUrl("");
        setCategory("custom-prints");
      } else {
        setMessage({ type: "error", text: data.message || "Failed to add image" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage(null);

    try {
      // For demo: convert to base64 data URL
      // In production: upload to Supabase Storage
      const reader = new FileReader();
      reader.onload = (event) => {
        setImageUrl(event.target?.result as string);
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setMessage({ type: "error", text: "Failed to process image" });
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 pt-28 pb-20">
      <div className="mb-10">
        <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold mb-3">
          Admin Panel
        </p>
        <h1 className="text-3xl md:text-5xl font-extrabold">
          Gallery <span className="text-gradient-neon">Manager</span>
        </h1>
        <p className="text-muted-foreground mt-2">
          Add and manage gallery images displayed on the Gallery page.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Add Image Form */}
        <div className="glass-strong rounded-3xl p-6">
          <h2 className="text-xl font-extrabold mb-4 flex items-center gap-2">
            <Plus className="h-5 w-5 text-accent" />
            Add New Image
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-semibold mb-1 block">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Galaxy Neon Tee"
                className="w-full h-11 px-4 rounded-xl glass outline-none focus:pink-glow text-sm"
                required
              />
            </div>

            <div>
              <label className="text-sm font-semibold mb-1 block">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-11 px-4 rounded-xl glass outline-none focus:pink-glow text-sm bg-transparent"
              >
                <option value="custom-prints">Custom Prints</option>
                <option value="apparel">Apparel</option>
                <option value="mugs">Mugs</option>
                <option value="posters">Posters</option>
                <option value="phone-cases">Phone Cases</option>
                <option value="stickers">Stickers</option>
                <option value="frames">Frames</option>
                <option value="gift-boxes">Gift Boxes</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold mb-1 block">Image URL</label>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="w-full h-11 px-4 rounded-xl glass outline-none focus:pink-glow text-sm"
                required
              />
            </div>

            <div>
              <label className="text-sm font-semibold mb-1 block">Or Upload Image</label>
              <label className="block glass rounded-xl border border-dashed border-secondary/40 p-4 text-center cursor-pointer hover:pink-glow transition-all">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <ImagePlus className="h-6 w-6 mx-auto mb-2 text-secondary" />
                <p className="text-sm font-medium">
                  {uploading ? "Processing..." : "Click to upload"}
                </p>
              </label>
            </div>

            {imageUrl && (
              <div className="relative aspect-video rounded-xl overflow-hidden">
                <Image
                  src={imageUrl}
                  alt="Preview"
                  fill
                  sizes="100%"
                  className="object-cover"
                />
              </div>
            )}

            {message && (
              <div
                className={`p-3 text-sm rounded-xl text-center ${
                  message.type === "success"
                    ? "text-green-400 bg-green-950/40 border border-green-500/30"
                    : "text-red-400 bg-red-950/40 border border-red-500/30"
                }`}
              >
                {message.text}
              </div>
            )}

            <button
              type="submit"
              disabled={uploading || !title.trim() || !imageUrl.trim()}
              className="w-full h-12 rounded-xl bg-gradient-neon text-white font-bold flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  Add to Gallery
                </>
              )}
            </button>
          </form>
        </div>

        {/* Info Panel */}
        <div className="glass-strong rounded-3xl p-6">
          <h2 className="text-xl font-extrabold mb-4">Instructions</h2>
          <div className="space-y-4 text-sm text-muted-foreground">
            <div className="glass rounded-xl p-4">
              <h3 className="font-semibold text-foreground mb-1">1. Add Image URL</h3>
              <p>Paste a direct link to an image (JPG, PNG, WebP).</p>
            </div>
            <div className="glass rounded-xl p-4">
              <h3 className="font-semibold text-foreground mb-1">2. Or Upload</h3>
              <p>Click the upload area to select a file from your device.</p>
            </div>
            <div className="glass rounded-xl p-4">
              <h3 className="font-semibold text-foreground mb-1">3. Choose Category</h3>
              <p>Select the appropriate category for filtering.</p>
            </div>
            <div className="glass rounded-xl p-4">
              <h3 className="font-semibold text-foreground mb-1">4. Save</h3>
              <p>Click &quot;Add to Gallery&quot; to save the image to Supabase.</p>
            </div>
          </div>

          <div className="mt-6 p-4 rounded-xl bg-accent/10 border border-accent/20">
            <p className="text-xs text-accent font-semibold">
              Note: In production, upload images to Supabase Storage for better
              performance and CDN delivery.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
