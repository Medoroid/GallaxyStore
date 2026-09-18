import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://galaxystore.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages = [
    "",
    "/products",
    "/custom-print",
    "/gallery",
    "/gift-boxes",
    "/cart",
    "/checkout",
    "/login",
    "/register",
    "/forgot-password",
    "/about",
    "/faq",
    "/terms",
    "/contact",
    "/shipping",
    "/returns",
    "/privacy",
    "/track-order",
  ];

  const staticEntries = staticPages.map((page) => ({
    url: `${BASE_URL}${page}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: page === "" ? 1 : 0.8,
  }));

  return [...staticEntries];
}
