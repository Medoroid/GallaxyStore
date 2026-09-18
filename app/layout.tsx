import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import Providers from "./components/providers";

const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://galaxystore.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Galaxy Store | Custom Prints & Gaming Gear",
    template: "%s | Galaxy Store",
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
    "galaxy store",
  ],
  authors: [{ name: "Galaxy Store" }],
  creator: "Galaxy Store",
  publisher: "Galaxy Store",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "Galaxy Store",
    title: "Galaxy Store | Custom Prints & Gaming Gear",
    description:
      "Premium custom printing & gaming-inspired gifts. Tees, mugs, posters, phone cases and themed gift boxes.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Galaxy Store",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Galaxy Store | Custom Prints & Gaming Gear",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Galaxy Store",
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
          <Navbar />
          <div className="mt-22">
          {children}
          </div>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
