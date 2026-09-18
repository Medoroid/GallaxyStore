'use client';

import { ErrorMessage, Field, Form, Formik } from "formik";
import { Mail, Lock, User, Calendar } from "lucide-react";
import * as Yup from 'yup';
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type RegisterValues = {
  firstName: string;
  lastName: string;
  age: string;
  email: string;
  username: string;
  password: string;
};

export default function Register() {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const navigate = useRouter();

  const initialValues: RegisterValues = {
    firstName: "",
    lastName: "",
    age: '',
    email: "",
    username: "",
    password: ""
  };
 // من جهة الفرونت إند

  const validationSchema = Yup.object({
    firstName: Yup.string().required('First name is required'),
    lastName: Yup.string().required('Last name is required'),
    age: Yup.date().required('Age is required'),
    email: Yup.string().email('Invalid email format').required('Email is required'),
    username: Yup.string().min(3, 'Username must be at least 3 characters').required('Username is required'),
    password: Yup.string().min(6, 'Password must be at least 6 characters').required('Password is required')
  });

  const handleSubmit = async (values: RegisterValues) => {
    setSubmitError(null);
    setIsPending(true);

    try {
      const { error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          data: {
            full_name: `${values.firstName} ${values.lastName}`,
            userName: values.username,
            age: values.age,
          }
        }
      });

      if (error) {
        setSubmitError(error.message);
        return;
      }

      navigate.push('/login');
    } catch {
      setSubmitError("An error occurred during signup. Please try again.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#1a0a24] flex items-center justify-center p-6">
      <div className="relative w-full max-w-md mt-24">
        {/* Outer glow */}
        <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-r from-purple-600/40 via-pink-500/40 to-purple-600/40 blur-2xl" />

        {/* Top accent bar */}
        <div className="absolute -top-1 left-6 right-6 h-1 rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 shadow-[0_0_20px_4px_rgba(236,72,153,0.6)]" />

        <div className="relative rounded-[1.75rem] border border-pink-400/20 bg-gradient-to-b from-[#2a1035]/95 to-[#1a0a24]/95 backdrop-blur-xl p-8 shadow-[0_0_60px_-10px_rgba(217,70,239,0.35)]">
          {/* Header */}
          <p className="text-xs uppercase tracking-[0.3em] text-pink-400 font-bold">
            Join the Galaxy
          </p>
          <h1 className="text-4xl font-extrabold text-white mt-2">
            Sign up to Galaxy
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            Access your orders, wishlist and custom designs.
          </p>

          {/* Form */}
          <Formik initialValues={initialValues} onSubmit={handleSubmit} validationSchema={validationSchema}>
            <Form className="mt-6 space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <Field
                    type="text"
                    name="firstName"
                    placeholder="First Name"
                    className="w-full h-12 pl-11 pr-4 rounded-2xl bg-slate-100 text-slate-900 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-pink-400 transition-all"
                  />
                  <ErrorMessage name="firstName" component="div" className="text-red-500 text-xs mt-1" />
                </div>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <Field
                    type="text"
                    name="lastName"
                    placeholder="Last Name"
                    className="w-full h-12 pl-11 pr-4 rounded-2xl bg-slate-100 text-slate-900 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-pink-400 transition-all"
                  />
                  <ErrorMessage name="lastName" component="div" className="text-red-500 text-xs mt-1" />
                </div>
              </div>

              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <Field
                  type="date"
                  name="age"
                  placeholder="Age"
                  className="w-full h-12 pl-11 pr-4 rounded-2xl bg-slate-100 text-slate-900 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-pink-400 transition-all"
                />
                <ErrorMessage name="age" component="div" className="text-red-500 text-xs mt-1" />
              </div>
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
                <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <Field
                  type="text"
                  name="username"
                  placeholder="Username"
                  className="w-full h-12 pl-11 pr-4 rounded-2xl bg-slate-100 text-slate-900 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-pink-400 transition-all"
                />
                <ErrorMessage name="username" component="div" className="text-red-500 text-xs mt-1" />
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

              {submitError && (
                <div className="p-3 text-sm text-red-400 bg-red-950/40 border border-red-500/30 rounded-2xl text-center">
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="w-full h-12 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 text-white font-bold text-base hover:scale-[1.02] transition-transform shadow-[0_0_25px_-5px_rgba(217,70,239,0.7)]"
              >
                {isPending ? "Signing Up..." : "Sign Up"}
              </button>
            </Form>
          </Formik>

          {/* Footer */}
          <p className="text-center text-sm text-slate-400 mt-6">
            I already have an account?{" "}
            <a
              href="/login"
              className="font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent"
            >
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
