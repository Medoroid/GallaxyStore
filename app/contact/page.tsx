"use client";

import { useState } from "react";
import { Mail, Phone, MapPin, Send, Loader2, CheckCircle2 } from "lucide-react";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1500));
    setLoading(false);
    setSent(true);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pt-28 pb-20">
      <header className="text-center max-w-3xl mx-auto mb-12">
        <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold">Contact</p>
        <h1 className="text-3xl md:text-5xl font-extrabold mt-2">
          Get in <span className="text-gradient-neon">Touch</span>
        </h1>
        <p className="text-muted-foreground mt-3">
          Have a question or need help? We&apos;d love to hear from you.
        </p>
      </header>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Contact Info */}
        <div className="space-y-4">
          {[
            { icon: Mail, label: "Email", value: "support@galaxystore.com", href: "mailto:support@galaxystore.com" },
            { icon: Phone, label: "Phone", value: "+1 (555) 123-4567", href: "tel:+15551234567" },
            { icon: MapPin, label: "Address", value: "123 Galaxy Street, Cairo, Egypt", href: null },
          ].map((item) => (
            <div key={item.label} className="glass-strong rounded-2xl p-5 hover:pink-glow transition-all">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-xl bg-gradient-neon grid place-items-center shrink-0">
                  <item.icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  {item.href ? (
                    <a href={item.href} className="font-semibold hover:text-secondary transition-colors">
                      {item.value}
                    </a>
                  ) : (
                    <p className="font-semibold">{item.value}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Contact Form */}
        <div className="md:col-span-2">
          {sent ? (
            <div className="glass-strong rounded-3xl p-12 text-center">
              <div className="h-20 w-20 rounded-full bg-green-500/20 grid place-items-center mx-auto mb-4">
                <CheckCircle2 className="h-10 w-10 text-green-400" />
              </div>
              <h2 className="text-2xl font-extrabold mb-2">Message Sent!</h2>
              <p className="text-muted-foreground">
                Thank you for reaching out. We&apos;ll get back to you within 24 hours.
              </p>
              <button
                onClick={() => { setSent(false); setForm({ name: "", email: "", subject: "", message: "" }); }}
                className="mt-6 px-6 py-3 rounded-xl glass font-semibold hover:pink-glow transition-all"
              >
                Send Another Message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="glass-strong rounded-3xl p-6 space-y-4">
              <h2 className="text-xl font-extrabold mb-4">Send us a Message</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold mb-1 block">Your Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full h-11 px-4 rounded-xl glass outline-none focus:pink-glow text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold mb-1 block">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full h-11 px-4 rounded-xl glass outline-none focus:pink-glow text-sm"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold mb-1 block">Subject</label>
                <input
                  type="text"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className="w-full h-11 px-4 rounded-xl glass outline-none focus:pink-glow text-sm"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1 block">Message</label>
                <textarea
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  rows={5}
                  className="w-full glass rounded-xl p-4 outline-none focus:pink-glow resize-none text-sm"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="h-12 px-6 rounded-xl bg-gradient-neon text-white font-bold flex items-center gap-2 hover:scale-[1.02] transition-transform disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Send className="h-5 w-5" />
                    Send Message
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
