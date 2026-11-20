/**
 * Phase 8 — public gallery / creator discovery UI:
 *
 * galleryCover / hasGalleryPreview — deterministic title-card fallback for
 *   gallery entries published without a generated mockup (same title, same
 *   card; unicode/RTL titles keep their first visible character)
 * GalleryCover — renders the persisted preview when one exists, otherwise a
 *   title card carrying the title — never a broken image or a bare icon
 * GalleryItemCard — product link vs plain card, optional creator line, and a
 *   caption title only when the cover does not already show it (no nested
 *   anchors: the creator line stays plain text)
 * CreatorsDirectoryView — creator cards linking to /creators/[username],
 *   counts, and the latest-designs grid with honest empty states
 */

import { render, screen } from "@testing-library/react";

jest.mock("next/link", () => {
  return ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  );
});

jest.mock("@/app/lib/language-context", () => ({
  useLanguage: () => ({ t: (key: string) => key, locale: "en" }),
}));

// publicStorageUrl builds preview/avatar URLs from this at call time.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://galaxy-test.supabase.co";

import {
  COVER_GRADIENT_COUNT,
  galleryCover,
  hasGalleryPreview,
} from "@/lib/creator/gallery-cover";
import { designPreviewUrl } from "@/lib/creator/media";
import { GalleryCover } from "@/app/components/GalleryCover";
import {
  GalleryItemCard,
  type GalleryCardItem,
} from "@/app/components/GalleryItemCard";
import { CreatorsDirectoryView } from "@/app/components/CreatorsDirectoryView";
import type {
  DirectoryCreator,
  DirectoryGalleryItem,
} from "@/lib/creator/directory";

describe("galleryCover", () => {
  test("is deterministic — the same title always yields the same card", () => {
    const first = galleryCover("Galaxy Night");
    expect(first).toEqual(galleryCover("Galaxy Night"));
    expect(first.gradient.startsWith("from-")).toBe(true);
  });

  test("empty or missing titles still get a stable card", () => {
    const baseline = galleryCover("");
    for (const title of ["", "   ", null, undefined]) {
      const cover = galleryCover(title);
      expect(cover.initial).toBe("?");
      expect(cover.gradient).toBe(baseline.gradient);
    }
  });

  test("keeps the first visible code point for unicode and RTL titles", () => {
    expect(galleryCover("  Neo").initial).toBe("N");
    expect(galleryCover("قمر ونجمة").initial).toBe("ق");
    expect(galleryCover("🎨 pop").initial).toBe("🎨");
  });

  test("varied titles spread across the fixed gradient palette", () => {
    const gradients = new Set(
      Array.from({ length: 30 }, (_, index) =>
        galleryCover(`design-${index}`).gradient
      )
    );
    expect(gradients.size).toBeGreaterThan(1);
    expect(gradients.size).toBeLessThanOrEqual(COVER_GRADIENT_COUNT);
  });
});

describe("hasGalleryPreview", () => {
  test("treats null, undefined and blank values as no preview", () => {
    expect(hasGalleryPreview(null)).toBe(false);
    expect(hasGalleryPreview(undefined)).toBe(false);
    expect(hasGalleryPreview("")).toBe(false);
    expect(hasGalleryPreview("   ")).toBe(false);
    expect(hasGalleryPreview("mockups/a/front.png")).toBe(true);
  });
});

describe("designPreviewUrl (preview paths are stored bucket-relative)", () => {
  const BASE = "https://galaxy-test.supabase.co/storage/v1/object/public";

  test("prefixes the design-previews bucket for stored object names", () => {
    expect(designPreviewUrl("mockups/x/tshirt/front-black-h1.png")).toBe(
      `${BASE}/design-previews/mockups/x/tshirt/front-black-h1.png`
    );
  });

  test("leaves already bucket-prefixed paths and full URLs untouched", () => {
    expect(designPreviewUrl("design-previews/mockups/x.png")).toBe(
      `${BASE}/design-previews/mockups/x.png`
    );
    expect(
      designPreviewUrl("https://cdn.example.com/cover.png")
    ).toBe("https://cdn.example.com/cover.png");
  });

  test("returns null for empty input", () => {
    expect(designPreviewUrl(null)).toBeNull();
    expect(designPreviewUrl("   ")).toBeNull();
  });
});

describe("GalleryCover", () => {
  test("renders the persisted preview image when one exists", () => {
    const { container } = render(
      <GalleryCover title="Galaxy Night" previewPath="mockups/x/front.png" />
    );

    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(
      "https://galaxy-test.supabase.co/storage/v1/object/public/design-previews/mockups/x/front.png"
    );
    expect(img?.getAttribute("alt")).toBe("Galaxy Night");
    // no title-card fallback alongside a real preview
    expect(container.querySelector('[role="img"]')).toBeNull();
  });

  test("falls back to a title card carrying the title — never a broken image", () => {
    const { container } = render(
      <GalleryCover title="Galaxy Night" previewPath={null} />
    );

    const card = screen.getByRole("img", { name: "Galaxy Night" });
    expect(card.textContent).toContain("Galaxy Night");
    expect(card.textContent).toContain("G");
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("GalleryItemCard", () => {
  const baseItem: GalleryCardItem = {
    id: "g1",
    title: "Galaxy Night",
    description: "A starry print",
    preview_path: "mockups/g1/front.png",
    tags: ["space", "art"],
    product_id: "prod-1",
    published_at: "2026-02-01T00:00:00.000Z",
  };

  test("links to the published product, shows the caption title, tags and creator line", () => {
    render(
      <GalleryItemCard
        item={baseItem}
        creator={{ username: "alice", display_name: "Alice" }}
      />
    );

    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/product-details/prod-1");
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe(
      "Galaxy Night"
    );
    expect(screen.getByText("@alice")).toBeDefined();
    expect(screen.getByText("#space")).toBeDefined();
    expect(screen.getByText("#art")).toBeDefined();
  });

  test("renders as a plain card without a product and carries the title on the cover", () => {
    const { container } = render(
      <GalleryItemCard
        item={{ ...baseItem, product_id: null, preview_path: null }}
      />
    );

    // not purchasable on its own — no product link, no duplicate caption title
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByRole("img", { name: "Galaxy Night" })).toBeDefined();
    expect(container.textContent).toContain("A starry print");
  });

  test("works without a creator line (profile-page usage)", () => {
    render(<GalleryItemCard item={baseItem} />);

    expect(screen.queryByText(/^@/)).toBeNull();
    expect(screen.getByRole("link").getAttribute("href")).toBe(
      "/product-details/prod-1"
    );
  });
});

describe("CreatorsDirectoryView", () => {
  const creators: DirectoryCreator[] = [
    {
      username: "alice",
      display_name: "Alice",
      avatar_url: null,
      bio: "Galaxy illustrator",
      is_featured: true,
      created_at: "2026-01-01T00:00:00.000Z",
      products: 3,
      gallery: 5,
    },
    {
      username: "bob",
      display_name: "Bob",
      avatar_url: "bob.png",
      bio: null,
      is_featured: false,
      created_at: "2026-01-02T00:00:00.000Z",
      products: 0,
      gallery: 0,
    },
  ];

  const gallery: DirectoryGalleryItem[] = [
    {
      id: "g1",
      title: "Galaxy Night",
      description: null,
      preview_path: "mockups/g1/front.png",
      tags: ["space"],
      product_id: "prod-1",
      published_at: "2026-02-01T00:00:00.000Z",
      creator: { username: "alice", display_name: "Alice" },
    },
    {
      id: "g2",
      title: "Quiet Orbit",
      description: null,
      preview_path: null,
      tags: [],
      product_id: null,
      published_at: null,
      creator: null,
    },
  ];

  test("renders creator cards linking to public profiles with counts", () => {
    render(<CreatorsDirectoryView creators={creators} gallery={gallery} />);

    const aliceLink = screen.getByRole("link", { name: /Alice/ });
    expect(aliceLink.getAttribute("href")).toBe("/creators/alice");
    expect(screen.getByRole("link", { name: /Bob/ }).getAttribute("href")).toBe(
      "/creators/bob"
    );

    expect(
      screen.getByText("3 creator_products_count · 5 creator_gallery_count")
    ).toBeDefined();
    expect(screen.getByText("0 creator_products_count · 0 creator_gallery_count")).toBeDefined();

    // featured marker is announced, not just coloured
    expect(screen.getAllByText("creator_featured").length).toBeGreaterThan(0);
  });

  test("renders the latest-designs grid through the shared gallery card", () => {
    render(<CreatorsDirectoryView creators={creators} gallery={gallery} />);

    expect(screen.getByRole("heading", { level: 2, name: "creators_latest_title" })).toBeDefined();
    // product-linked entry becomes a product link inside the directory too
    const productLink = screen.getByRole("link", { name: /Galaxy Night/ });
    expect(productLink.getAttribute("href")).toBe("/product-details/prod-1");
    // preview-less entry falls back to its title card
    expect(screen.getByRole("img", { name: "Quiet Orbit" })).toBeDefined();
    // creator handle is visible on directory gallery cards (the creator card
    // shows one too — both are plain text by design, never nested links)
    expect(screen.getAllByText("@alice").length).toBeGreaterThanOrEqual(2);
  });

  test("shows honest empty states when there is nothing to discover yet", () => {
    render(<CreatorsDirectoryView creators={[]} gallery={[]} />);

    expect(screen.getByText("creators_empty_title")).toBeDefined();
    expect(screen.getByText("creators_empty")).toBeDefined();
    expect(screen.getByText("creators_latest_empty")).toBeDefined();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
