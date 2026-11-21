import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  experimental: {
    agentUpgrade: "security",
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
  images: {
    // Serve the smallest modern format the browser accepts. AVIF/WebP cut
    // product-image payloads substantially with no visual change.
    formats: ["image/avif", "image/webp"],
    // Allowed optimization qualities. Next.js 16 requires this allowlist;
    // the old singular `quality` config key is no longer valid.
    qualities: [50, 65, 75],
    // Intermediate widths stop the optimizer jumping from 128 -> 256 -> 384,
    // which previously shipped ~2x the pixels needed for cards and logos.
    deviceSizes: [
      16, 32, 48, 64, 96, 128, 160, 192, 224, 256, 320, 384, 512, 640, 750, 828, 1080, 1200, 1920, 2048, 3840,
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "cdn.dummyjson.com",
      },
      {
        protocol: "https",
        hostname: "via.placeholder.com",
      },
      {
        protocol: "https",
        hostname: "httywgkwfqvrbuwuzutu.supabase.co",
      },
      {
        // Both production and staging Supabase projects (and any future one)
        // serve product images from a *.supabase.co host. Without this, the
        // optimizer returns 400 and product cards fall back to a generic image.
        protocol: "https",
        hostname: "**.supabase.co",
      },
      {
        protocol: "https",
        hostname: "i.pinimg.com",
      },
    ],
  },
};

export default nextConfig;
