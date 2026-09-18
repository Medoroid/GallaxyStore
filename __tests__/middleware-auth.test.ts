/**
 * Middleware Authentication Tests
 *
 * Tests route protection logic for admin, checkout, orders, wishlist, profile.
 *
 * @jest-environment node
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

function loadEnv() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  }
}
loadEnv();

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

describe("Middleware Route Protection", () => {
  describe("Admin routes", () => {
    test("/admin redirects unauthenticated users to /login", async () => {
      const res = await fetch(`${BASE_URL}/admin`, {
        redirect: "manual",
      });
      expect(res.status).toBe(307);
      const location = res.headers.get("location");
      expect(location).toContain("/login");
    });

    test("/admin/orders redirects unauthenticated users", async () => {
      const res = await fetch(`${BASE_URL}/admin/orders`, {
        redirect: "manual",
      });
      expect(res.status).toBe(307);
    });

    test("/admin/products redirects unauthenticated users", async () => {
      const res = await fetch(`${BASE_URL}/admin/products`, {
        redirect: "manual",
      });
      expect(res.status).toBe(307);
    });

    test("/admin/reviews redirects unauthenticated users", async () => {
      const res = await fetch(`${BASE_URL}/admin/reviews`, {
        redirect: "manual",
      });
      expect(res.status).toBe(307);
    });

    test("/admin/refunds redirects unauthenticated users", async () => {
      const res = await fetch(`${BASE_URL}/admin/refunds`, {
        redirect: "manual",
      });
      expect(res.status).toBe(307);
    });

    test("/admin/vendors redirects unauthenticated users", async () => {
      const res = await fetch(`${BASE_URL}/admin/vendors`, {
        redirect: "manual",
      });
      expect(res.status).toBe(307);
    });

    test("/admin/settings redirects unauthenticated users", async () => {
      const res = await fetch(`${BASE_URL}/admin/settings`, {
        redirect: "manual",
      });
      expect(res.status).toBe(307);
    });

    test("/admin/users redirects unauthenticated users", async () => {
      const res = await fetch(`${BASE_URL}/admin/users`, {
        redirect: "manual",
      });
      expect(res.status).toBe(307);
    });
  });

  describe("Protected routes (require auth)", () => {
    test("/checkout redirects unauthenticated users to /login", async () => {
      const res = await fetch(`${BASE_URL}/checkout`, {
        redirect: "manual",
      });
      expect(res.status).toBe(307);
      const location = res.headers.get("location");
      expect(location).toContain("/login");
    });

    test("/orders redirects unauthenticated users to /login", async () => {
      const res = await fetch(`${BASE_URL}/orders`, {
        redirect: "manual",
      });
      expect(res.status).toBe(307);
    });

    test("/wishlist redirects unauthenticated users to /login", async () => {
      const res = await fetch(`${BASE_URL}/wishlist`, {
        redirect: "manual",
      });
      expect(res.status).toBe(307);
    });

    test("/profile redirects unauthenticated users to /login", async () => {
      const res = await fetch(`${BASE_URL}/profile`, {
        redirect: "manual",
      });
      expect(res.status).toBe(307);
    });
  });

  describe("Public routes (no auth required)", () => {
    test("/ is accessible without auth", async () => {
      const res = await fetch(`${BASE_URL}/`, { redirect: "manual" });
      expect(res.status).toBe(200);
    });

    test("/products is accessible without auth", async () => {
      const res = await fetch(`${BASE_URL}/products`, { redirect: "manual" });
      expect(res.status).toBe(200);
    });

    test("/login is accessible without auth", async () => {
      const res = await fetch(`${BASE_URL}/login`, { redirect: "manual" });
      expect(res.status).toBe(200);
    });

    test("/register is accessible without auth", async () => {
      const res = await fetch(`${BASE_URL}/register`, { redirect: "manual" });
      expect(res.status).toBe(200);
    });

    test("/cart is accessible without auth", async () => {
      const res = await fetch(`${BASE_URL}/cart`, { redirect: "manual" });
      expect(res.status).toBe(200);
    });

    test("/gallery is accessible without auth", async () => {
      const res = await fetch(`${BASE_URL}/gallery`, { redirect: "manual" });
      expect(res.status).toBe(200);
    });

    test("/faq is accessible without auth", async () => {
      const res = await fetch(`${BASE_URL}/faq`, { redirect: "manual" });
      expect(res.status).toBe(200);
    });
  });
});
