/**
 * Component tests — GiftBoxesGrid (public /gift-boxes listing).
 *
 *   - loading skeleton / empty / error + retry states
 *   - ready state: title, real prices, savings badge only when > 0,
 *     compare-at strike-through, item-count chip, link to the product page
 *   - non-ok or success:false responses degrade to the error state
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import GiftBoxesGrid from "@/app/components/GiftBoxesGrid";
import { formatCurrency } from "@/lib/formatCurrency";

jest.mock("next/link", () => ({
  __esModule: true,
  default: (props: { children?: React.ReactNode; href?: string }) => (
    <a href={props.href}>{props.children}</a>
  ),
}));

jest.mock("@/app/lib/language-context", () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    locale: "en",
    dir: "ltr",
    setLocale: () => undefined,
  }),
}));

// lib/products.ts imports the shared browser client at module scope.
jest.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

type MockResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

const ok = (data: unknown): Promise<MockResponse> =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });

const fail = (status = 500): Promise<MockResponse> =>
  Promise.resolve({ ok: false, status, json: () => Promise.resolve({ message: "boom" }) });

const mockFetch = jest.fn();

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
});

beforeEach(() => {
  mockFetch.mockReset();
  (global as unknown as { fetch: unknown }).fetch = mockFetch;
});

const boxes = [
  {
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    name: "Deluxe Box",
    slug: "deluxe-box",
    short_description: "A curated pick",
    base_price: 20,
    compare_at_price: null,
    currency: "USD",
    image: "box/1.jpg",
    item_count: 3,
    contents_value: 24,
    savings: 4,
  },
  {
    id: "bbbbbbbb-0000-4000-8000-000000000002",
    name: "Mini Box",
    slug: "mini-box",
    short_description: null,
    base_price: 10,
    compare_at_price: 15,
    currency: "USD",
    image: null,
    item_count: 2,
    contents_value: null,
    savings: null,
  },
];

describe("GiftBoxesGrid", () => {
  it("shows the loading state while fetching", () => {
    mockFetch.mockReturnValue(new Promise(() => undefined));

    render(<GiftBoxesGrid />);

    const grid = screen.getByTestId("gift-boxes-grid");
    expect(grid.textContent).toContain("gift_boxes_loading");
    expect(mockFetch).toHaveBeenCalledWith("/api/gift-boxes");
  });

  it("shows the empty state when no boxes are available", async () => {
    mockFetch.mockReturnValue(ok({ success: true, boxes: [] }));

    render(<GiftBoxesGrid />);

    await waitFor(() =>
      expect(screen.getByText("gift_boxes_empty")).toBeInTheDocument()
    );
    expect(screen.queryByText("gift_boxes_title")).not.toBeInTheDocument();
  });

  it("shows the error state and retries on click", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network down"));
    mockFetch.mockReturnValueOnce(ok({ success: true, boxes }));

    render(<GiftBoxesGrid />);

    await waitFor(() =>
      expect(screen.getByText("gift_boxes_load_error")).toBeInTheDocument()
    );

    fireEvent.click(screen.getByText("gift_box_retry"));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText("Deluxe Box")).toBeInTheDocument());
    expect(screen.queryByText("gift_boxes_load_error")).not.toBeInTheDocument();
  });

  it("maps a non-ok response to the error state", async () => {
    mockFetch.mockReturnValue(fail(503));

    render(<GiftBoxesGrid />);

    await waitFor(() =>
      expect(screen.getByText("gift_boxes_load_error")).toBeInTheDocument()
    );
  });

  it("maps success:false to the error state (never a silent empty grid)", async () => {
    mockFetch.mockReturnValue(ok({ success: false, message: "nope" }));

    render(<GiftBoxesGrid />);

    await waitFor(() =>
      expect(screen.getByText("gift_boxes_load_error")).toBeInTheDocument()
    );
  });

  it("renders boxes with title, real prices, savings badge and product links", async () => {
    mockFetch.mockReturnValue(ok({ success: true, boxes }));

    const { container } = render(<GiftBoxesGrid />);

    await waitFor(() => expect(screen.getByText("Deluxe Box")).toBeInTheDocument());

    // Section header (keys reused from the existing gift-boxes page).
    expect(screen.getByText("gift_boxes_title")).toBeInTheDocument();
    expect(screen.getByText("gift_boxes_subtitle")).toBeInTheDocument();

    // Both cards link to their product pages.
    expect(screen.getByText("Deluxe Box").closest("a")).toHaveAttribute(
      "href",
      "/product-details/aaaaaaaa-0000-4000-8000-000000000001"
    );
    expect(screen.getByText("Mini Box").closest("a")).toHaveAttribute(
      "href",
      "/product-details/bbbbbbbb-0000-4000-8000-000000000002"
    );

    // Real prices via formatCurrency.
    expect(screen.getByText(formatCurrency(20, "USD"))).toBeInTheDocument();
    expect(screen.getByText(formatCurrency(10, "USD"))).toBeInTheDocument();
    // Compare-at strike-through only for the box that actually has one.
    expect(screen.getByText(formatCurrency(15, "USD"))).toBeInTheDocument();

    // Savings badge appears only for the box with savings > 0.
    const savingsBadges = screen.getAllByText(/−\$/);
    expect(savingsBadges).toHaveLength(1);
    expect(savingsBadges[0].textContent).toBe("−" + formatCurrency(4, "USD"));

    // Item count chip rendered per card.
    expect(screen.getAllByText("gift_box_items_count")).toHaveLength(2);

    // Descriptions: only the box with one renders it.
    expect(screen.getByText("A curated pick")).toBeInTheDocument();

    // The box with an image renders it; the image-less one falls back to an icon.
    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute("src")).toContain("box/1.jpg");
    expect(images[0].getAttribute("alt")).toBe("Deluxe Box");
  });
});
