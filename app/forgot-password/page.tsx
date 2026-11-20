"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { safeNext } from "@/lib/redirect";
import { Mail, ArrowLeft, Send, CheckCircle } from "lucide-react";
// One shared client (PKCE + cookies) for the whole app. Creating a second
// `createClient` here silently switched this page to a different auth flow and
// a different storage, which is what broke the reset-link hand-off.
import { supabase } from "@/lib/supabaseClient";

function friendlyError(message: string) {
  const m = String(message || "");
  if (/email address .* is invalid|invalid email/i.test(m)) {
    return "That email address doesn't look valid. Check it and try again.";
  }
  if (/rate limit|too many requests|security purposes/i.test(m)) {
    return "Too many attempts. Wait a moment, then try again.";
  }
  if (/failed to fetch|network/i.test(m)) {
    return "Network error — check your connection and try again.";
  }
  return m;
}

export default function ForgotPasswordPage() {
  const searchParams = useSearchParams();
  const nextPath = safeNext(searchParams.get("next"));
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = email.trim();
    if (!target) {
      setError("Enter your email address.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        target,
        {
          // Must be one of the Redirect URLs configured in Supabase
          // (Authentication → URL Configuration), or GoTrue silently falls
          // back to the Site URL and the link lands on the wrong page.
          redirectTo: `${window.location.origin}/reset-password?next=${encodeURIComponent(nextPath)}`,
        }
      );

      if (resetError) {
        setError(friendlyError(resetError.message));
        return;
      }

      setEmail(target);
      setSent(true);
    } catch {
      setError("Could not send the reset link. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-20">
        <div className="w-full max-w-md animate-fade-in">
          <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] rounded-3xl p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-4">Check Your Email</h1>
            <p className="text-gray-400 mb-6">
              We&apos;ve sent a password reset link to<br />
              <span className="text-[var(--brand)] font-medium">{email}</span>
            </p>
            <p className="text-gray-500 text-sm mb-8">
              Didn&apos;t receive the email? Check your spam folder or try again.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-[var(--brand)] hover:text-[var(--brand-hover)] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-20">
      <div className="w-full max-w-md animate-fade-in">
        <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] rounded-3xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] bg-clip-text text-transparent mb-3">
              Forgot Password?
            </h1>
            <p className="text-gray-400">
              Enter your email and we&apos;ll send you a reset link
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="w-full pl-12 pr-4 py-4 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-[var(--brand)]/50 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] rounded-xl text-white font-bold hover:shadow-cta transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Send Reset Link
                </>
              )}
            </button>
          </form>

          <div className="mt-8 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
