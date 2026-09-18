"use client";
import { ErrorMessage, Field, Form, Formik } from "formik";
import { Mail, Lock } from "lucide-react";
import * as Yup from 'yup';
import { useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function Login() {
  const [submitError, setSubmitError] = useState(null);
  const [isPending, setIsPending] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthError = useMemo(() => {
    const error = searchParams.get("error");
    return error ? decodeURIComponent(error) : null;
  }, [searchParams]);

  const initialValues = {
    email: "",
    password: "",
  };

  const validationSchema = Yup.object({
    email: Yup.string().email('Invalid email address').required('Email is required'),
    password: Yup.string().min(6, 'Password must be at least 6 characters').required('Password is required'),
  });

  const handleSubmit = async (values) => {
    setSubmitError(null);
    setIsPending(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });

      if (error) {
        const message = error.message === 'Email not confirmed'
          ? 'Please confirm your email address before logging in. Check your inbox.'
          : error.message;
        setSubmitError(message);
        return;
      }

      router.push('/');
    } catch {
      setSubmitError('Login failed. Please check your credentials.');
    } finally {
      setIsPending(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setSubmitError(null);

    try {
      const origin = window.location.origin;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${origin}/auth/callback?next=/`,
          queryParams: {
            access_type: 'consent',
          },
        },
      });

      if (error) {
        setSubmitError(error.message);
        setGoogleLoading(false);
      }
    } catch {
      setSubmitError('Google login failed. Please try again.');
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#1a0a24] flex items-center justify-center p-6">
      <div className="relative w-full max-w-md">
        {/* Outer glow */}
        <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-r from-purple-600/40 via-pink-500/40 to-purple-600/40 blur-2xl" />

        {/* Top accent bar */}
        <div className="absolute -top-1 left-6 right-6 h-1 rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 shadow-[0_0_20px_4px_rgba(236,72,153,0.6)]" />

        <div className="relative rounded-[1.75rem] border border-pink-400/20 bg-gradient-to-b from-[#2a1035]/95 to-[#1a0a24]/95 backdrop-blur-xl p-8 shadow-[0_0_60px_-10px_rgba(217,70,239,0.35)]">
          {/* Header */}
          <p className="text-xs uppercase tracking-[0.3em] text-pink-400 font-bold">
            Welcome back
          </p>
          <h1 className="text-4xl font-extrabold text-white mt-2">
            Sign in to Galaxy
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            Access your orders, wishlist and custom designs.
          </p>

          {/* Form */}
          <Formik initialValues={initialValues} onSubmit={handleSubmit} validationSchema={validationSchema}>
            <Form className="mt-6 space-y-4">
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <Field
                  type="email"
                  name="email"
                  placeholder="Email address"
                  className="w-full h-12 pl-11 pr-4 rounded-2xl bg-slate-100 text-slate-900 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-pink-400 transition-all"
                />
                <ErrorMessage name="email" component="div" className="text-red-500 text-xs mt-1" />
              </div>

              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <Field
                  type="password"
                  name="password"
                  placeholder="Password"
                  className="w-full h-12 pl-11 pr-4 rounded-2xl bg-slate-100 text-slate-900 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-pink-400 transition-all"
                />
                <ErrorMessage name="password" component="div" className="text-red-500 text-xs mt-1" />
              </div>

              <div className="flex justify-end">
                <a
                  href="/forgot-password"
                  className="text-xs text-pink-400 hover:text-pink-300 transition-colors"
                >
                  Forgot Password?
                </a>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full h-12 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 text-white font-bold text-base hover:scale-[1.02] transition-transform shadow-[0_0_25px_-5px_rgba(217,70,239,0.7)]"
              >
                {isPending ? "Signing In..." : "Sign In"}
              </button>

              {(submitError || oauthError) && (
                <div className="p-3 text-sm text-red-400 bg-red-950/40 border border-red-500/30 rounded-2xl text-center">
                  {submitError || oauthError}
                </div>
              )}

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-transparent text-slate-400">or continue with</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={googleLoading}
                className="w-full h-12 rounded-2xl bg-white text-slate-900 font-bold text-base hover:bg-slate-100 transition-colors flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {googleLoading ? (
                  <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Sign in with Google
                  </>
                )}
              </button>
            </Form>
          </Formik>

          {/* Footer */}
          <p className="text-center text-sm text-slate-400 mt-6">
            Don&apos;t have an account?{" "}
            <a
              href="/register"
              className="font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent"
            >
              Create one
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
