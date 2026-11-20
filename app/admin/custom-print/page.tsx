"use client";

/**
 * Admin management for the customer Custom Print Studio.
 * Includes a full, JSON-backed mockup editor with preview-before-publish:
 * views, printable areas/masks, colours, sizes, SVG layers, perspective and
 * store-product linking. No creator concepts appear anywhere here.
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/lib/auth-context";

type Template = {
  id?: string;
  template_key: string;
  name: string;
  nameAr?: string;
  category: string;
  description?: string;
  dimensionsMm: { w: number; h: number; depth?: number };
  colors: Array<{ key: string; name: string; hex: string; shadeHex: string }>;
  sizes: Array<{ key: string; name: string; label: string }>;
  views: Array<{
    key: string;
    label: string;
    canvas: { w: number; h: number };
    printArea: { x: number; y: number; w: number; h: number };
    maskPath: string;
    perspective?: string;
  }>;
  bodySvg: string;
  overlaySvg?: string;
  textureId?: string;
  texturePatterns?: string[];
  provenance: { source: string; author: string; license: string; url?: string };
  isActive: boolean;
  store_product_id?: string | null;
  store_variant_id?: string | null;
};

type Submission = {
  id: string;
  title: string;
  author_display_name: string;
  status: string;
  submitted_at: string | null;
  rejection_reason: string | null;
};

const BLANK_TEMPLATE: Template = {
  template_key: "",
  name: "",
  category: "custom",
  dimensionsMm: { w: 100, h: 100 },
  colors: [],
  sizes: [],
  views: [{
    key: "front",
    label: "Front",
    canvas: { w: 800, h: 800 },
    printArea: { x: 200, y: 200, w: 400, h: 400 },
    maskPath: "M 200 200 H 600 V 600 H 200 Z",
  }],
  bodySvg: '<rect x="180" y="180" width="440" height="440" rx="20" fill="{{hex}}" stroke="{{shade}}" stroke-width="6"/>',
  provenance: { source: "original-vector", author: "Galaxy Store", license: "CC0-1.0" },
  isActive: true,
};

export default function AdminCustomPrintPage() {
  const { getToken } = useAuth();
  const [tab, setTab] = useState<"submissions" | "templates">("submissions");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);
  const [json, setJson] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const token = await getToken();
      const [overview, catalog] = await Promise.all([
        fetch("/api/admin/custom-print", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),
        fetch("/api/admin/custom-print/templates", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),
      ]);
      const [a, b] = await Promise.all([
        overview.json().catch(() => null),
        catalog.json().catch(() => null),
      ]);
      if (!overview.ok || !a?.success) {
        setError(a?.message ?? "Could not load custom print data.");
        return;
      }
      setSubmissions(a.submissions ?? []);
      setTemplates(b?.success ? (b.templates ?? []) : (a.templates ?? []));
    } catch {
      setError("Network error.");
    }
  }, [getToken]);

  useEffect(() => {
    void (async () => { await load(); })();
  }, [load]);

  function openEditor(template: Template | null) {
    const next = template ? { ...template } : { ...BLANK_TEMPLATE };
    setEditing(next);
    setJson(JSON.stringify(next, null, 2));
    setPreview(null);
    setError("");
  }

  async function moderate(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const token = await getToken();
      const response = await fetch("/api/admin/custom-print", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        setError(data?.message ?? "The action failed.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveTemplate() {
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(json) as Record<string, unknown>;
      } catch {
        setError("The JSON is not valid.");
        return;
      }
      const token = await getToken();
      const response = await fetch("/api/admin/custom-print/templates", {
        method: editing.id ? "PATCH" : "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(editing.id ? { id: editing.id, template: payload } : payload),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        setError(data?.message ?? "Save failed.");
        return;
      }
      setEditing(null);
      setPreview(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function renderPreview() {
    setError("");
    try {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(json) as Record<string, unknown>;
      } catch {
        setError("The JSON is not valid.");
        return;
      }
      const token = await getToken();
      const response = await fetch("/api/admin/custom-print/templates/preview", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ template: payload }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        setError(data?.message ?? "Preview failed.");
        setPreview(null);
        return;
      }
      setPreview(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(String(data.svg))}`);
    } catch {
      setError("Network error.");
    }
  }

  async function uploadAsset(file: File) {
    setBusy(true);
    setError("");
    try {
      const token = await getToken();
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/admin/custom-print/assets", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        setError(data?.message ?? "Upload failed.");
        return;
      }
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(json) as Record<string, unknown>;
      } catch {
        setError("The template JSON is not valid. Fix it before uploading an image.");
        return;
      }
      const dims = await new Promise<{ w: number; h: number }>((resolve) => {
        const image = new Image();
        image.onload = () => resolve({ w: image.naturalWidth, h: image.naturalHeight });
        image.onerror = () => resolve({ w: 1600, h: 1067 });
        image.src = String(data.data_url);
      });
      const assets = Array.isArray(payload.photoAssets)
        ? payload.photoAssets as unknown[]
        : [];
      const firstColor = (payload.colors as Array<{ key: string }> | undefined)?.[0]?.key ?? "white";
      const firstView = (payload.views as Array<{ key: string }> | undefined)?.[0]?.key ?? "front";
      assets.push({
        colorKey: firstColor,
        viewKey: firstView,
        src: data.data_url,
        width: dims.w,
        height: dims.h,
        printArea: { x: 0.3, y: 0.25, w: 0.4, h: 0.5 },
        blend: "multiply",
        opacity: 0.92,
        texture: null,
        author: "Galaxy Store admin",
        sourcePage: String(data.path),
        description: "Admin-uploaded photorealistic mockup",
        isActive: true,
        sortOrder: assets.length,
      });
      payload.photoAssets = assets;
      payload.provenance = { source: "admin-upload", author: "Galaxy Store admin", license: data.path };
      setJson(JSON.stringify(payload, null, 2));
    } finally {
      setBusy(false);
    }
  }

  async function toggleTemplate(item: Template) {
    setBusy(true);
    try {
      const token = await getToken();
      const response = await fetch("/api/admin/custom-print/templates", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, template: { ...item, isActive: !item.isActive } }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) setError(data?.message ?? "Update failed.");
      else await load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteTemplate(item: Template) {
    if (!window.confirm(`Delete template "${item.name}"? Existing orders keep their artwork.`)) return;
    setBusy(true);
    try {
      const token = await getToken();
      const response = await fetch(`/api/admin/custom-print/templates?id=${encodeURIComponent(item.id ?? "")}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) setError(data?.message ?? "Delete failed.");
      else await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">Custom Print</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review shared customer designs and manage product mockup templates.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setTab("submissions")}
          className={`px-4 py-2 rounded-xl text-sm ${tab === "submissions" ? "bg-gradient-neon text-white" : "glass"}`}>
          Design submissions
        </button>
        <button type="button" onClick={() => setTab("templates")}
          className={`px-4 py-2 rounded-xl text-sm ${tab === "templates" ? "bg-gradient-neon text-white" : "glass"}`}>
          Mockup templates
        </button>
      </div>

      {error && <p className="text-sm text-red-400 glass p-3 rounded-xl">{error}</p>}

      {tab === "submissions" ? (
        <div className="glass rounded-2xl divide-y divide-white/5">
          {submissions.length === 0 && <p className="p-5 text-sm text-muted-foreground">No submissions.</p>}
          {submissions.map((item) => (
            <div key={item.id} className="p-4 flex flex-wrap items-center gap-3 justify-between">
              <div>
                <p className="font-semibold">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {item.author_display_name} · {item.status} · {item.submitted_at ? new Date(item.submitted_at).toLocaleString() : ""}
                </p>
                {item.rejection_reason && <p className="text-xs text-amber-400">{item.rejection_reason}</p>}
              </div>
              {item.status === "pending_review" && (
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={() => void moderate({ id: item.id, action: "approve" })}
                    className="px-3 py-2 rounded-lg text-xs bg-green-500/20 text-green-400">Approve</button>
                  <button type="button" disabled={busy} onClick={() => {
                    const reason = window.prompt("Reason for rejection");
                    if (reason) void moderate({ id: item.id, action: "reject", reason });
                  }} className="px-3 py-2 rounded-lg text-xs bg-red-500/20 text-red-400">Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : editing ? (
        <div className="grid lg:grid-cols-2 gap-5">
          <section className="glass rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{editing.id ? "Edit" : "New"} mockup template</h2>
              <button type="button" onClick={() => setEditing(null)} className="text-xs glass px-3 py-2 rounded-lg">Close</button>
            </div>
            <label className="block text-xs text-muted-foreground">
              Template JSON (views, print areas/masks, colours, sizes, SVG layers, store product link)
              <textarea
                value={json}
                onChange={(event) => setJson(event.target.value)}
                spellCheck={false}
                className="mt-1 w-full h-[28rem] rounded-xl bg-black/30 p-3 font-mono text-[11px] outline-none"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => void renderPreview()}
                className="px-3 py-2 rounded-lg text-xs glass">Preview (unsaved)</button>
              <button type="button" disabled={busy} onClick={() => void saveTemplate()}
                className="px-3 py-2 rounded-lg text-xs bg-gradient-neon text-white">Save template</button>
              <label className="px-3 py-2 rounded-lg text-xs glass cursor-pointer">
                Upload replacement image
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadAsset(file);
                    event.target.value = "";
                  }} />
              </label>
            </div>
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Mockup preview" className="w-full rounded-xl border border-white/10" />
            )}
          </section>

          <section className="glass rounded-2xl p-4 text-xs text-muted-foreground space-y-2">
            <h2 className="font-semibold text-foreground">Template contract</h2>
            <p>views[].printArea and views[].maskPath define the printable area; artwork is clipped to the mask.</p>
            <p>views[].perspective accepts only numeric matrix/skew/scale/rotate transforms.</p>
            <p>Colours use <code>{"{{hex}}"}</code>, <code>{"{{shade}}"}</code> and <code>{"{{highlight}}"}</code> tokens in SVG layers.</p>
            <p>store_product_id / store_variant_id link the template to a real, stocked catalog product.</p>
            <p>SVG layers are sanitised server-side; scripts, event handlers and external URLs are removed.</p>
          </section>
        </div>
      ) : (
        <div className="glass rounded-2xl divide-y divide-white/5">
          <div className="p-4 flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{templates.length} template(s)</p>
            <button type="button" onClick={() => openEditor(null)}
              className="px-3 py-2 rounded-lg text-xs bg-gradient-neon text-white">New template</button>
          </div>
          {templates.length === 0 && <p className="p-5 text-sm text-muted-foreground">No templates configured.</p>}
          {templates.map((item) => (
            <div key={item.id ?? item.template_key} className="p-4 flex flex-wrap items-center gap-3 justify-between">
              <div>
                <p className="font-semibold">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {item.template_key} · {item.isActive ? "active" : "disabled"} · {item.views.length} view(s) ·{" "}
                  {item.store_variant_id ? "linked to catalog variant" : "not linked to a sellable product"}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => openEditor(item)}
                  className="px-3 py-2 rounded-lg text-xs glass">Edit</button>
                <button type="button" disabled={busy} onClick={() => void toggleTemplate(item)}
                  className="px-3 py-2 rounded-lg text-xs glass">
                  {item.isActive ? "Disable" : "Enable"}
                </button>
                <button type="button" disabled={busy} onClick={() => void deleteTemplate(item)}
                  className="px-3 py-2 rounded-lg text-xs bg-red-500/15 text-red-400">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
