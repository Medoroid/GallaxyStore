import type { Metadata } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://galaxystore.com";

export const productsMetadata: Metadata = {
  title: "Products",
  description:
    "Browse our collection of custom prints, gaming gear, t-shirts, mugs, posters, phone cases and more.",
  openGraph: {
    title: "Products | Galaxy Store",
    description:
      "Browse our collection of custom prints, gaming gear, t-shirts, mugs, posters, phone cases and more.",
    url: `${SITE_URL}/products`,
  },
};

export const galleryMetadata: Metadata = {
  title: "Gallery",
  description:
    "Explore our gallery of custom designs, prints, and creative works from the Galaxy Store community.",
  openGraph: {
    title: "Gallery | Galaxy Store",
    description:
      "Explore our gallery of custom designs, prints, and creative works.",
    url: `${SITE_URL}/gallery`,
  },
};

export const giftBoxesMetadata: Metadata = {
  title: "Gift Boxes",
  description:
    "Curated gift boxes for every occasion. Birthday, couples, anime, gaming and graduation themes.",
  openGraph: {
    title: "Gift Boxes | Galaxy Store",
    description:
      "Curated gift boxes for every occasion.",
    url: `${SITE_URL}/gift-boxes`,
  },
};

export const customPrintMetadata: Metadata = {
  title: "Custom Print Studio",
  description:
    "Design your own custom prints. Upload artwork, add text, choose products and preview live.",
  openGraph: {
    title: "Custom Print Studio | Galaxy Store",
    description:
      "Design your own custom prints. Upload artwork, add text, choose products.",
    url: `${SITE_URL}/custom-print`,
  },
};

export const cartMetadata: Metadata = {
  title: "Shopping Cart",
  description: "Review your cart and proceed to checkout.",
  robots: { index: false, follow: false },
};

export const checkoutMetadata: Metadata = {
  title: "Checkout",
  description: "Complete your order with secure payment.",
  robots: { index: false, follow: false },
};

export const loginMetadata: Metadata = {
  title: "Login",
  description: "Sign in to your Galaxy Store account.",
  robots: { index: false, follow: false },
};

export const registerMetadata: Metadata = {
  title: "Register",
  description: "Create a new Galaxy Store account.",
  robots: { index: false, follow: false },
};

export const ordersMetadata: Metadata = {
  title: "My Orders",
  description: "View your order history and track deliveries.",
  robots: { index: false, follow: false },
};

export const wishlistMetadata: Metadata = {
  title: "Wishlist",
  description: "Your saved products and favorites.",
  robots: { index: false, follow: false },
};

export const adminMetadata: Metadata = {
  title: "Admin Dashboard",
  description: "Manage your store.",
  robots: { index: false, follow: false },
};
