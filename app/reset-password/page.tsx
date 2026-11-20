"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, Eye, EyeOff, CheckCircle, ArrowLeft } from "lucide-react";
// One shared client (PKCE + cookie storage) for the whole app. A second
// `createClient` here ran on a different flow/storage, so the session it built
// from the reset link never reached the rest of the app — that mismatch is
// what made password recovery feel broken.
import { supabase } from "@/lib/supabaseClient";

// A recovery link always leaves a marker in the URL: PKCE flow sends
// ?code=..., the implicit flow sends #access_token=... and a failed/expired
// link sends #error=... / ?error=....
function urlHasResetToken(): boolean {
  const { search, hash } = window.location;
  return (
    /[?&]code=/.test(search) ||
    /[?&]error=/.test(search) ||
    /access_token=/.test(hash) ||
    /error=/.test(hash)
  );
}

/** Surface the reason GoTrue attached to a failed/expired link, if any. */
function urlResetErrorMessage(): string {
  const { search, hash } = window.location;
  const params = new URLSearchParams(`${search}${hash.replace(/^#/, "&")}`);
  const raw =
    params.get("error_description") ||
    params.get("error_code") ||
    params.get("error") ||
    "";
  const decoded = decodeURIComponent(raw).replace(/\+/g, " ").toLowerCase();
  if (!decoded) return "";
  // Keep the "Invalid or expired reset link" wording the panels/tests rely on,
  // only adding the reason Supabase reported.
  if (/otp_expired|expired/.test(decoded)) {
    return "Invalid or expired reset link — this link has expired. Please request a new one.";
  }
  return "";
}

/**
 * This client runs the PKCE flow, so supabase-js *refuses* an implicit link
 * (`#access_token=...`) with "Not a valid PKCE flow url" — which used to leave
 * the visitor staring at "Invalid or expired reset link".
 *
 * Implicit links still arrive in two cases: emails sent before the app moved
 * to PKCE, and links produced by an admin/non-PKCE client. Hand those tokens
 * to the client directly so they work too.
 */
async function consumeImplicitRecoveryLink() {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  if (params.get("type") !== "recovery") return null;
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return null;

  const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error || !data.session) return null;

  // Drop the tokens from the address bar (they are now in the session).
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return data.session;
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  // C1 — distinguish three situations instead of blaming every visitor:
  //   checking  → the session/token check is still running
  //   ready     → a recovery session exists (real reset link) → show the form
  //   missing   → visitor opened the URL with NO token → friendly panel that
  //               explains how to request a link (never "invalid link")
  //   invalid   → a token WAS in the URL but the session is gone (expired or
  //               already used) → the "Invalid or expired" message
  const [linkState, setLinkState] = useState<"checking" | "ready" | "missing" | "invalid">(
    "checking"
  );
  const [invalidReason, setInvalidReason] = useState("");

  useEffect(() => {
    const checkSession = async () => {
      try {
        // getSession() also consumes a ?code= marker in the URL (PKCE
        // exchange), so a fresh recovery link lands in `ready`.
        const { data: { session: existing } } = await supabase.auth.getSession();
        const session = existing ?? (await consumeImplicitRecoveryLink());
        if (session) {
          setLinkState("ready");
        } else {
          setInvalidReason(urlResetErrorMessage());
          setLinkState(urlHasResetToken() ? "invalid" : "missing");
        }
      } catch {
        setInvalidReason(urlResetErrorMessage());
        setLinkState(urlHasResetToken() ? "invalid" : "missing");
      }
    };
    checkSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        const m = updateError.message || "";
        setError(
          /same as the old|different from/i.test(m)
            ? "Choose a password different from your current one."
            : /weak|strength/i.test(m)
              ? "That password is too weak. Use at least 6 characters."
              : /session|not authenticated|JWT/i.test(m)
                ? "Your reset link is no longer valid. Please request a new one."
                : m
        );
        if (/session|not authenticated|JWT/i.test(m)) setLinkState("invalid");
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/login");
      }, 3000);
    } catch {
      setError("Could not update the password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-20">
        <div className="w-full max-w-md animate-fade-in">
          <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] rounded-3xl p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-4">Password Updated!</h1>
            <p className="text-gray-400 mb-6">
              Your password has been successfully updated.
            </p>
            <p className="text-gray-500 text-sm">
              Redirecting to login...
            </p>
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
              Reset Password
            </h1>
            <p className="text-gray-400">
              {linkState === "ready"
                ? "Enter your new password below"
                : linkState === "checking"
                  ? "Checking your reset link..."
                  : "Reset links are sent to your email"}
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}

          {linkState === "checking" && (
            <div className="text-center py-8">
              <div className="w-12 h-12 border-2 border-[var(--brand)]/30 border-t-[var(--brand)] rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-400">Verifying reset link...</p>
            </div>
          )}

          {linkState === "missing" && (
            <div className="text-center py-2">
              <p className="text-gray-400 mb-6">
                This page only opens from the secure password reset link we email
                you. Request a new link and we&apos;ll send a fresh one to your
                inbox.
              </p>
              <Link
                href="/forgot-password"
                className="inline-block w-full py-4 bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] rounded-xl text-white font-bold hover:shadow-cta transition-all"
              >
                Request a reset link
              </Link>
            </div>
          )}

          {linkState === "invalid" && (
            <div className="text-center py-2">
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-red-400 text-sm text-center">
                  {invalidReason || "Invalid or expired reset link. Please request a new one."}
                </p>
              </div>
              <Link
                href="/forgot-password"
                className="inline-block w-full py-4 bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] rounded-xl text-white font-bold hover:shadow-cta transition-all"
              >
                Request a new link
              </Link>
            </div>
          )}

          {linkState === "ready" && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm text-gray-400 mb-2">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-12 pr-12 py-4 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-[var(--brand)]/50 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-12 pr-4 py-4 bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-[var(--brand)]/50 transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-gradient-to-r from-[var(--brand)] to-[var(--brand-2)] rounded-xl text-white font-bold hover:shadow-cta transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
                ) : (
                  "Update Password"
                )}
              </button>
            </form>
          )}

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
