# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Gamers and geek culture enthusiasts — people who identify with gaming, anime, sci-fi, and pop-culture aesthetics and want to express that identity through custom-printed apparel, accessories, and curated gift bundles. They value visual flair, niche relevance, and fast fulfillment over generic mass-market prints.

## Product Purpose

Galaxy Store is an e-commerce destination for premium custom printing and gaming-inspired merchandise. It exists to let fans buy, customize, and gift products that reflect their passions — with a curated brand world that feels native to gaming and geek culture rather than a generic print-on-demand catalog.

## Positioning

Strong, cohesive gaming/galaxy brand world with niche visual identity — the kind of focused aesthetic and curated experience that generic print shops (Printful, Redbubble, Teespring) cannot truthfully replicate without abandoning their broad-market positioning.

## Operating Context

- **Browsing & shopping:** Users discover products through category browsing, featured drops, themed gift boxes, and a custom print studio with live mockup preview.
- **Custom print workflow:** Users upload artwork or pick a template, preview it on real product mockups, and order the printed product.
- **Gift boxes:** Curated multi-item themed bundles (Birthday, Couples, Anime, Gaming, Graduation) for occasion-based purchasing.
- **Checkout & fulfillment:** Stripe-powered payments, worldwide shipping, 48h dispatch target, order tracking.
- **Account & profile:** User registration, login, password recovery, order history, wishlist.
- **Admin operations:** Product management, order processing, user management, gallery curation, settings — accessed through a dedicated admin panel.
- **Email notifications:** Transactional emails via Resend (order confirmations, password resets).

## Capabilities and Constraints

- Product catalog with category filtering, search, and featured product showcases.
- Custom print studio with live mockup preview before purchase.
- Themed gift box bundles.
- Full e-commerce flow: cart, wishlist, checkout (Stripe), order tracking.
- User accounts with Supabase Auth (email/password, password reset).
- Admin dashboard: products, orders, users, gallery, settings.
- Email notifications via Resend.
- Server-side rendering and API routes via Next.js App Router.
- Database and auth hosted on Supabase (PostgreSQL + RLS).
- Stripe integration for payment processing.
- Tailwind CSS 4 for styling with custom design tokens.
- Tanstack React Query for server-state management.
- Zustand for client-state management.
- Formik + Yup for form handling and validation.
- Swiper for carousel/slider components.
- Lucide React and React Icons for iconography.
- Jest for testing.
- **Undecided:** Multi-currency support, internationalization beyond English, subscription/recurring orders.

## Brand Commitments

- **Name:** Galaxy Store.
- **Visual identity:** Established galaxy/space/gaming aesthetic with neon accents, glassmorphism, and dark theme — logo and wordmark exist.
- **Voice:** Energetic, playful, geek-culture-literate; speaks the language of gaming and fandom communities.
- **No formal brand guide** documented yet; visual identity is implicit in the current implementation.

## Evidence on Hand

- Live Next.js application with full e-commerce functionality.
- 8 sample products across categories (Mugs, Apparel, Art, Accessories, Boxes, Bundles).
- 7 product categories with real Unsplash imagery.
- Hero section, featured drops marquee, category grid, gift boxes, reviews, and CTA sections.
- Admin panel with product, order, user, gallery, and settings management.
- Supabase schema and migrations in `/supabase`.
- Existing metadata/SEO configuration (OpenGraph, Twitter cards, JSON-LD, sitemap, robots).
- **Testimonials shown on homepage** are placeholder/hardcoded — not verified customer reviews.
- **Product images** are Unsplash placeholders — not real product photography.

## Product Principles

1. **Native to the culture.** Every surface should feel like it belongs in the gaming/geek world — not a generic shop with a dark theme bolted on.
2. **Premium, not precious.** Fast dispatch, quality materials, and packaging that feels intentional — not luxury posturing.
3. **Customization as core.** The custom print studio is not a feature; it is the product's reason for being.
4. **Curated over catalog.** Themed gift boxes and featured drops create narrative; endless browsing without direction is failure.
5. **Speed wins trust.** 48h dispatch, instant mockup preview, frictionless checkout — latency and indecision erode the impulse that drives this audience.

## Accessibility & Inclusion

WCAG 2.1 AA compliance target. No product-specific accessibility requirements beyond the standard have been established.
