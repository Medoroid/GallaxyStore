---
name: Galaxy Store
description: Premium custom printing & gaming-inspired gifts — a cosmic e-commerce experience
colors:
  neon: "#9835fd"
  secondary: "#FF4FD8"
  accent: "#FFD166"
  background: "#120018"
  foreground: "#FAFAFA"
  muted: "oklch(0.22 0.06 305 / 0.6)"
  muted-foreground: "oklch(0.75 0.04 305)"
  card: "oklch(0.18 0.09 305 / 0.55)"
  border: "oklch(0.98 0.01 300 / 0.12)"
  input: "oklch(0.98 0.01 300 / 0.08)"
  ring: "oklch(0.58 0.27 300)"
  destructive: "oklch(0.68 0.25 25)"
  popover: "oklch(0.16 0.08 305)"
typography:
  display:
    fontFamily: "Poppins, Tajawal, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 6vw, 4rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Poppins, Tajawal, system-ui, sans-serif"
    fontSize: "clamp(1.875rem, 4vw, 2.5rem)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Poppins, Tajawal, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Poppins, Tajawal, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Poppins, Tajawal, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.15em"
rounded:
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.25rem"
  2xl: "1.5rem"
  3xl: "1.875rem"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
  2xl: "3rem"
components:
  button-primary:
    backgroundColor: "{colors.neon}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "12px 24px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "12px 24px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.3xl}"
    padding: "12px"
  card-hover:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.3xl}"
    padding: "12px"
  input:
    backgroundColor: "{colors.input}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "12px 16px"
  input-focus:
    backgroundColor: "{colors.input}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "12px 16px"
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "8px 16px"
  nav-link-active:
    backgroundColor: "rgba(255,255,255,0.1)"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "8px 16px"
  badge:
    backgroundColor: "{colors.neon}"
    textColor: "{colors.foreground}"
    rounded: "9999px"
    padding: "4px 10px"
---

# Design System: Galaxy Store

## Overview

**Creative North Star: "The Pixel Nebula"**

Galaxy Store is a digital cosmos where gaming culture meets galaxy aesthetics — bold, unapologetic, and culture-native. The system is playful and immersive: every surface should feel like stepping into a curated universe, not browsing a catalog. Deep space purples form the void; electric neon accents pulse through it like living light. Glassmorphism gives components weightless transparency, while colored glow halos create depth without heavy shadows.

The palette is cosmic in character — deep space purple as the infinite backdrop, electric violet and hot pink as the neon pulse, and warm gold as the premium highlight. Typography is bold and confident, with Poppins at heavy weights driving every heading. Spacing is generous and rhythmic, with generous section gaps creating breathing room between content blocks.

**Key Characteristics:**
- Dark-first: the deep purple void (#120018) is the constant canvas
- Neon pulse: purple (#9835fd) and pink (#FF4FD8) as primary energy
- Gold warmth: amber (#FFD166) as premium highlight and trust signal
- Glassmorphism: frosted translucent surfaces with backdrop blur
- Glow halos: colored light defines depth, not traditional shadows
- Bold confidence: extra-bold headings, generous spacing, unapologetic presence

## Colors

The palette is cosmic in character — a dark void illuminated by neon energy and warmed by gold accents. Colors are always expressed in OKLCH for precision, with hex equivalents for portability.

### Primary
- **Electric Violet** (#9835fd): The signature neon pulse. Used on primary CTAs, nav icon backgrounds, focus rings, and the brand logo glow. This is the identity color — its presence signals "Galaxy Store."
- **Deep Space** (#120018): The infinite backdrop. Every surface, every page, every viewport starts here. It is not a background; it is the cosmos itself.

### Secondary
- **Cosmic Pink** (#FF4FD8): The energy twin. Used alongside violet for gradient CTAs, hover glows, accent borders, and active states. Where violet is the signature, pink is the pulse.

### Tertiary
- **Solar Gold** (#FFD166): Premium warmth and trust. Used on prices, star ratings, section headings, and trust signals. Gold breaks the neon duopoly and adds depth to the palette.

### Neutral
- **Void White** (oklch(0.98 0.005 300)): Primary text on dark surfaces. Near-white with a subtle cool tint.
- **Glass Surface** (oklch(0.22 0.06 305 / 0.6)): Frosted glass background for cards, panels, and overlays. Semi-transparent with purple undertone.
- **Muted Text** (oklch(0.75 0.04 305)): Secondary text, labels, descriptions. Reads as subdued against the dark void.
- **Border Wash** (oklch(0.98 0.01 300 / 0.12)): Subtle dividers and borders. Barely visible structure.
- **Input Void** (oklch(0.98 0.01 300 / 0.08)): Form field backgrounds. The darkest neutral in the interactive layer.

### Named Rules
**The Neon Rarity Rule.** The primary accent (Electric Violet) and secondary accent (Cosmic Pink) each appear on ≤15% of any given screen. Their scarcity is what makes them electric. Overuse kills the glow.

**The Gold Trust Rule.** Solar Gold is reserved for value signals: prices, ratings, and trust indicators. It never decorates; it always communicates value.

## Typography

**Display Font:** Poppins (with Tajawal, system-ui, sans-serif)
**Body Font:** Poppins (with Tajawal, system-ui, sans-serif)
**Label/Mono Font:** Poppins (same stack, uppercase tracking)

**Character:** Bold, geometric, and confident. Poppins at weight 800 drives every heading with unapologetic presence. The single-typeface system keeps the cosmos unified — no competing voices.

### Hierarchy
- **Display** (800, clamp(2.5rem, 6vw, 4rem), 1.05): Hero headlines. The largest voice on the page, used once per section maximum.
- **Headline** (800, clamp(1.875rem, 4vw, 2.5rem), 1.1): Section titles. Bold and commanding.
- **Title** (600, 1.25rem, 1.3): Card titles, modal headers, subsection headings.
- **Body** (400, 0.875rem, 1.6): Paragraphs, descriptions, reviews. Readable at length.
- **Label** (600, 0.6875rem, 1.4, 0.15em tracking, uppercase): Eyebrows, categories, badges. Small but assertive.

### Named Rules
**The Extrabold Heading Rule.** All headings are weight 800. No heading uses a lighter weight. The cosmos speaks in bold.

**The Eyebrow Uppercase Rule.** Section eyebrows and category labels are always uppercase with 0.15em tracking. They are whispers before the headline shouts.

## Layout

The spatial model is a centered max-width container (1280px / max-w-7xl) with 16px horizontal padding. Content breathes generous vertical space: section gaps are 80px (mt-20), subsection gaps are 32px (space-y-8). The grid is 4-column on desktop, 3-column on tablet, 2-column on mobile for product grids. Category grids stretch to 7 columns on desktop. The layout is fully responsive with Tailwind's breakpoint system.

The fixed navbar occupies the top with glassmorphism, compressing from 16px to 8px vertical padding on scroll. Content starts at pt-24 to clear the nav. Hero sections use full-width rounded containers with gradient overlays.

### Named Rules
**The Section Breathing Rule.** Every major section gets 80px (mt-20) of vertical space above it. The heading gets 32px below it. This rhythm creates the cosmic breathing room.

## Elevation & Depth

The system uses a Glow + Shadow Hybrid approach. Glass surfaces use subtle dark shadows for structural grounding; neon glows add expressive depth on interaction. At rest, components are flat glass panels. On hover and focus, colored glow halos bloom outward — neon violet, cosmic pink, or solar gold — creating the signature depth language.

### Shadow Vocabulary
- **Glass Shadow** (`0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)`): Structural base for glass panels. Gives frosted surfaces weight.
- **Neon Glow** (`0 0 24px rgba(138,43,226,0.55), 0 0 60px rgba(138,43,226,0.25)`): Purple halo for primary interactions — nav scroll, card hover, CTA emphasis.
- **Pink Glow** (`0 0 24px rgba(255,79,216,0.55), 0 0 60px rgba(255,79,216,0.25)`): Pink halo for secondary interactions — wishlist, quick-view, active nav states.
- **Gold Glow** (`0 0 24px rgba(255,209,102,0.45)`): Warm halo for value signals — cart badge, star ratings, price highlights.

### Named Rules
**The Glow-At-Rest Rule.** Components are flat at rest. Glows appear only as a response to state: hover, focus, scroll, or active selection. The cosmos is calm until you touch it.

## Shapes

The form language is rounded and confident. Every interactive element and container uses generous border-radius: cards at 24px (rounded-3xl), buttons and inputs at 16px (rounded-xl), badges at full pill (rounded-full). There are no sharp corners anywhere in the system. The radius creates a soft, approachable silhouette that contrasts with the bold neon energy — the cosmos is powerful but never aggressive.

### Named Rules
**The Rounded Everything Rule.** Every container, button, input, badge, and card uses rounded corners. The minimum radius is 12px (rounded-xl). Sharp corners do not exist in this universe.

## Components

### Buttons
- **Shape:** Rounded-xl (16px radius)
- **Primary:** Electric Violet background with white text, gradient variant (purple→pink) for hero CTAs. Padding 12px 24px. On hover: scale 1.02 with pink glow bloom.
- **Secondary / Ghost:** Glass background (transparent with subtle white overlay), white text. On hover: white/10 background or pink glow. No visible border.
- **Focus:** Pink glow halo on focus-visible. No visible focus ring — the glow is the signal.

### Cards
- **Corner Style:** Rounded-3xl (24px radius)
- **Background:** Glass surface (semi-transparent purple-tinted dark with backdrop blur)
- **Shadow Strategy:** Glass shadow at rest; pink or neon glow on hover
- **Border:** 1px solid rgba(255,255,255,0.10)
- **Internal Padding:** 12px (product cards), varies by context
- **Hover Treatment:** -translate-y-1 with glow bloom, image scale-110, overlay buttons slide in

### Inputs / Fields
- **Style:** Glass background (rgba(255,255,255,0.08)), rounded-xl (16px), white text, no visible border
- **Focus:** Pink glow halo replaces border. No outline.
- **Height:** 44px (h-11)
- **Placeholder:** Muted foreground color

### Navigation
- **Style:** Fixed header with glassmorphism background (purple-pink gradient glass). Compresses on scroll.
- **Links:** Rounded-xl pill shape, muted text at rest, glass background on hover. Active state: white/10 background with subtle pink inset border.
- **Mobile:** Slide-down glass panel with stacked links, animated fade-in-up.

### Badges / Chips
- **Style:** Full pill (rounded-full), Electric Violet background, white text, uppercase tracking, 10px font size
- **Usage:** Product badges ("New", "Sale"), cart count, category labels

### Review Cards
- **Style:** Glass surface, rounded-2xl, 20px padding
- **Content:** Star rating (gold), quote text (muted), author name (foreground)

### Skeleton Loaders
- **Style:** Glass surface, rounded-2xl, pulse animation
- **Placeholder blocks:** White at 3-5% opacity, rounded shapes matching content layout

### [Signature Component] Glass Navigation Bar
The navbar is the system's signature element. It uses a purple-to-pink gradient glass background with heavy backdrop blur (24px, 180% saturation). On scroll, it compresses and gains a pink glow halo. The brand logo sits in a rounded-xl box with the neon gradient and a perpetual pulse-glow animation. Icon buttons use glass with hover pink-glow. The cart button is always the gradient neon, making it the most prominent interactive element.

## Do's and Don'ts

### Do:
- **Do** use the neon gradient (purple→pink) for primary CTAs and brand moments — it is the signature.
- **Do** apply glow halos only on interaction (hover, focus, active) — never at rest.
- **Do** use Solar Gold for prices, ratings, and trust signals — it breaks the neon duopoly.
- **Do** keep glass surfaces semi-transparent with backdrop blur — opacity is what makes them alive.
- **Do** use extra-bold (800) for all headings — the cosmos speaks in bold.
- **Do** maintain 80px vertical spacing between major sections — breathing room is non-negotiable.
- **Do** use uppercase + wide tracking for eyebrows and labels — they whisper before the headline shouts.

### Don't:
- **Don't** use neon accents on more than 15% of any screen — scarcity creates the electric effect.
- **Don't** add shadows without a colored glow — a zero-offset dark shadow is dead weight in this system.
- **Don't** use sharp corners (radius below 12px) on any component — the universe is rounded.
- **Don't** place gradient text on dark backgrounds — emphasis comes from weight and gold color, not gradient fills.
- **Don't** use gray for secondary text on colored surfaces — tint it from the surface hue or use muted-foreground.
- **Don't** apply glassmorphism to small inline elements — glass is for surfaces and containers, not spans.
