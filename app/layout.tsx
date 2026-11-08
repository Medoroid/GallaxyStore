import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { AnnouncementBar } from "./components/AnnouncementBar";
import Providers from "./components/providers";
import { getPublicStoreSettings } from "@/lib/storeSettings";

const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://galaxystore.com";
const DEFAULT_STORE_NAME = "Galaxy Store";

// B4 — layout reads store_settings (name, announcement). Revalidate every
// 5 minutes so admin changes go live without a redeploy, while pages stay
// cached instead of hitting the database on every request.
export const revalidate = 300;

/**
 * B4 — the site/store name comes from the admin-managed `store_settings`
 * table (falls back to the brand name while unset). Announcement bar text is
 * rendered by <AnnouncementBar /> from the same source.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicStoreSettings();
  const storeName = settings.store_name ?? DEFAULT_STORE_NAME;

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: `${storeName} | Custom Prints & Gaming Gear`,
      template: `%s | ${storeName}`,
    },
    description:
      "Premium custom printing & gaming-inspired gifts. Tees, mugs, posters, phone cases and themed gift boxes — designed in the multiverse, delivered to your door.",
    keywords: [
      "custom prints",
      "gaming gear",
      "t-shirts",
      "mugs",
      "posters",
      "phone cases",
      "gift boxes",
      "personalized gifts",
      storeName.toLowerCase(),
    ],
    authors: [{ name: storeName }],
    creator: storeName,
    publisher: storeName,
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    openGraph: {
      type: "website",
      locale: "en_US",
      url: SITE_URL,
      siteName: storeName,
      title: `${storeName} | Custom Prints & Gaming Gear`,
      description:
        "Premium custom printing & gaming-inspired gifts. Tees, mugs, posters, phone cases and themed gift boxes.",
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: storeName,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${storeName} | Custom Prints & Gaming Gear`,
      description:
        "Premium custom printing & gaming-inspired gifts. Tees, mugs, posters, phone cases and themed gift boxes.",
      images: ["/og-image.png"],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    alternates: {
      canonical: SITE_URL,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await getPublicStoreSettings();
  const storeName = settings.store_name ?? DEFAULT_STORE_NAME;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: storeName,
    url: SITE_URL,
    description:
      "Premium custom printing & gaming-inspired gifts.",
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/products?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <html
      lang="en"
      className="antialiased"
      style={{
        "--font-geist-sans": "Arial, Helvetica, sans-serif",
        "--font-geist-mono": '"Courier New", Consolas, monospace',
      } as React.CSSProperties}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body suppressHydrationWarning>
        <Providers>
          <AnnouncementBar />
          <Navbar />
          {/* Pages manage their own top-padding to account for the fixed Navbar height.
              Recommended: pt-24 without AnnouncementBar, pt-28 when it is active. */}
          <div>
          {children}
          </div>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
