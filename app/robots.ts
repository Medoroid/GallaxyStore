import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://galaxystore.com";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api", "/checkout", "/orders", "/profile", "/wishlist"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
