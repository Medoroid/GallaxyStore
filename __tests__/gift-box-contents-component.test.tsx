/**
 * Component tests — GiftBoxContents (product page block).
 *
 *   - loading skeleton while the detail request is in flight
 *   - a non-box product / pending migration renders NOTHING (zero impact on
 *     the regular product page)
 *   - error state + working retry (refetch on click)
 *   - ready state: hidden components are shown WITHOUT a link, out-of-stock
 *     badge, real prices from formatCurrency, savings only when provided,
 *     mixed currency renders "—" instead of fabricated numbers
 */

import React from "react";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import GiftBoxContents from "@/app/components/GiftBoxContents";
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

const PRODUCT_ID = "aaaaaaaa-0000-4000-8000-000000000001";

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

const detailPayload = {
  success: true,
  is_gift_box: true,
  box: { id: PRODUCT_ID, name: "Deluxe Box", slug: "deluxe-box", currency: "USD" },
  contents_value: 29,
  savings: 9,
  contents: [
    {
      id: "c1",
      product_id: "bbbbbbbb-0000-4000-8000-000000000002",
      variant_id: "cccccccc-0000-4000-8000-000000000003",
      quantity: 2,
      note: "Keep dry",
      product: {
        id: "bbbbbbbb-0000-4000-8000-000000000002",
        name: "Visible Mug",
        slug: "visible-mug",
        publicly_accessible: true,
        href: "/product-details/visible-mug",
      },
      image: "comp/1.jpg",
      variant: { id: "cccccccc-0000-4000-8000-000000000003", sku: "MUG-S", label: "M" },
      unit_price: 12,
      in_stock: true,
      stock: 4,
    },
    {
      id: "c2",
      product_id: "dddddddd-0000-4000-8000-000000000004",
      variant_id: null,
      quantity: 1,
      note: null,
      product: {
        id: "dddddddd-0000-4000-8000-000000000004",
        name: "Hidden Print",
        slug: "hidden-print",
        publicly_accessible: false,
        href: null,
      },
      image: null,
      variant: null,
      unit_price: 5,
      in_stock: false,
      stock: 0,
    },
  ],
};

describe("GiftBoxContents", () => {
  it("shows the loading skeleton while the request is pending", () => {
    mockFetch.mockReturnValue(new Promise(() => undefined)); // never resolves

    render(<GiftBoxContents productId={PRODUCT_ID} />);

    const block = screen.getByTestId("gift-box-contents");
    expect(within(block).getByText("gift_box_contents_title")).toBeInTheDocument();
    expect(block.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(mockFetch).toHaveBeenCalledWith(`/api/gift-boxes/${PRODUCT_ID}`);
  });

  it("renders NOTHING for a product that is not a gift box", async () => {
    mockFetch.mockReturnValue(ok({ success: true, is_gift_box: false, contents: [] }));

    const { container } = render(<GiftBoxContents productId={PRODUCT_ID} />);

    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it("renders NOTHING while the schema is pending (graceful hide)", async () => {
    mockFetch.mockReturnValue(
      ok({ success: true, is_gift_box: true, schema_pending: true })
    );

    const { container } = render(<GiftBoxContents productId={PRODUCT_ID} />);

    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it("shows the error state on a network failure and retries on click", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network down"));
    mockFetch.mockReturnValueOnce(ok(detailPayload));

    render(<GiftBoxContents productId={PRODUCT_ID} />);

    await waitFor(() =>
      expect(screen.getByText("gift_box_load_error")).toBeInTheDocument()
    );

    fireEvent.click(screen.getByText("gift_box_retry"));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByText("Visible Mug")).toBeInTheDocument()
    );
    expect(screen.queryByText("gift_box_load_error")).not.toBeInTheDocument();
  });

  it("shows the error state for a non-ok response", async () => {
    mockFetch.mockReturnValue(fail(500));

    render(<GiftBoxContents productId={PRODUCT_ID} />);

    await waitFor(() =>
      expect(screen.getByText("gift_box_load_error")).toBeInTheDocument()
    );
  });

  it("renders contents: linked vs hidden components, badges, notes and real prices", async () => {
    mockFetch.mockReturnValue(ok(detailPayload));

    const { container } = render(<GiftBoxContents productId={PRODUCT_ID} />);

    await waitFor(() => expect(screen.getByText("Visible Mug")).toBeInTheDocument());

    // Accessible component renders as a link…
    const visible = screen.getByText("Visible Mug");
    expect(visible.tagName).toBe("A");
    expect(visible).toHaveAttribute("href", "/product-details/visible-mug");

    // …the hidden one is shown but NEVER linked.
    const hidden = screen.getByText("Hidden Print");
    expect(hidden.tagName).toBe("SPAN");
    expect(within(hidden.closest("li") as HTMLElement).getByText("gift_box_hidden_notice")).toBeInTheDocument();

    // Out-of-stock badge on the depleted component only.
    const outOfStock = screen.getAllByText("gift_box_out_of_stock");
    expect(outOfStock).toHaveLength(1);
    expect(outOfStock[0].closest("li")).toContainElement(hidden);

    // Quantity, variant label, real money, note.
    expect(screen.getByText("×2")).toBeInTheDocument();
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getByText(formatCurrency(12, "USD"))).toBeInTheDocument();
    expect(screen.getByText(formatCurrency(5, "USD"))).toBeInTheDocument();
    expect(screen.getByText("Keep dry")).toBeInTheDocument();

    // Item count chip + value row + savings badge (server-provided math).
    expect(screen.getByText("gift_box_items_count")).toBeInTheDocument();
    expect(screen.getByText("gift_box_contents_value")).toBeInTheDocument();
    const savings = screen.getByText(/gift_box_savings/);
    expect(savings.textContent).toContain(formatCurrency(9, "USD"));
    expect(container.textContent).toContain(formatCurrency(29, "USD"));

    // Component image resolves through the storage helper.
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toContain("comp/1.jpg");
  });

  it("renders an empty box with the empty copy and no value row", async () => {
    mockFetch.mockReturnValue(
      ok({ ...detailPayload, contents: [], contents_value: null, savings: null })
    );

    render(<GiftBoxContents productId={PRODUCT_ID} />);

    await waitFor(() => expect(screen.getByText("gift_box_empty")).toBeInTheDocument());
    expect(screen.queryByText("gift_box_contents_value")).not.toBeInTheDocument();
  });

  it("shows an em dash instead of fabricated value when the server returns nulls", async () => {
    mockFetch.mockReturnValue(
      ok({ ...detailPayload, contents_value: null, savings: null })
    );

    render(<GiftBoxContents productId={PRODUCT_ID} />);

    await waitFor(() => expect(screen.getByText("Visible Mug")).toBeInTheDocument());
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/gift_box_savings/)).not.toBeInTheDocument();
  });
});
