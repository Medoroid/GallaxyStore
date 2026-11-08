"use client";

import { useState } from "react";
import { Send, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

type SendState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent" }
  | { status: "error"; message: string };

/**
 * B4 — the contact form actually delivers through /api/contact.
 * Success is only shown after the server confirms the message was accepted;
 * configuration problems (no support email / no email provider) are surfaced
 * honestly instead of pretending the message went through.
 */
export function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [state, setState] = useState<SendState>({ status: "idle" });

  const update = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ status: "sending" });
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setState({
          status: "error",
          message: data?.message || "Your message could not be sent. Please try again.",
        });
        return;
      }
      setState({ status: "sent" });
      setForm({ name: "", email: "", subject: "", message: "" });
    } catch {
      setState({
        status: "error",
        message: "Network error — your message was not sent. Please try again.",
      });
    }
  };

  if (state.status === "sent") {
    return (
      <div className="glass rounded-2xl p-8 text-center space-y-4">
        <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto" />
        <h3 className="text-xl font-bold">Message sent</h3>
        <p className="text-sm text-muted-foreground">
          Thanks for reaching out — we&apos;ll get back to you as soon as we can.
        </p>
        <button
          onClick={() => setState({ status: "idle" })}
          className="px-5 py-2.5 rounded-xl glass font-semibold text-sm hover:pink-glow transition-all"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 md:p-8 space-y-4">
      {state.status === "error" && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{state.message}</span>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="text-muted-foreground">Name</span>
          <input
            type="text"
            required
            maxLength={100}
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            className="mt-1.5 w-full px-4 py-3 rounded-xl glass border border-white/10 bg-transparent text-sm focus:outline-none focus:border-secondary"
            placeholder="Your name"
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Email</span>
          <input
            type="email"
            required
            maxLength={254}
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            className="mt-1.5 w-full px-4 py-3 rounded-xl glass border border-white/10 bg-transparent text-sm focus:outline-none focus:border-secondary"
            placeholder="you@example.com"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-muted-foreground">Subject</span>
        <input
          type="text"
          required
          maxLength={200}
          value={form.subject}
          onChange={(e) => update("subject", e.target.value)}
          className="mt-1.5 w-full px-4 py-3 rounded-xl glass border border-white/10 bg-transparent text-sm focus:outline-none focus:border-secondary"
          placeholder="How can we help?"
        />
      </label>

      <label className="block text-sm">
        <span className="text-muted-foreground">Message</span>
        <textarea
          required
          maxLength={5000}
          rows={6}
          value={form.message}
          onChange={(e) => update("message", e.target.value)}
          className="mt-1.5 w-full px-4 py-3 rounded-xl glass border border-white/10 bg-transparent text-sm focus:outline-none focus:border-secondary resize-y"
          placeholder="Tell us more…"
        />
      </label>

      <button
        type="submit"
        disabled={state.status === "sending"}
        className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-neon text-white font-semibold text-sm hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100"
      >
        {state.status === "sending" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Sending…
          </>
        ) : (
          <>
            <Send className="h-4 w-4" /> Send Message
          </>
        )}
      </button>
    </form>
  );
}
