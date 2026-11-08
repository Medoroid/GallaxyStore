/**
 * @jest-environment jsdom
 *
 * C2 tests — the products page must never flash "0 products" before the
 * first search response arrives:
 *   - while the first fetch is pending the counter shows "Loading products…"
 *   - after the response the real total is shown
 *   - a later filter refresh (old result exists) keeps showing the previous
 *     real count instead of resetting to 0
 */

import React from "react";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  usePathname: () => "/products",
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("lucide-react", () => ({
  Search: (props: Record<string, unknown>) => <svg data-testid="search" {...props} />,
  SlidersHorizontal: (props: Record<string, unknown>) => <svg data-testid="filters" {...props} />,
  ChevronLeft: (props: Record<string, unknown>) => <svg data-testid="chevron-left" {...props} />,
  ChevronRight: (props: Record<string, unknown>) => <svg data-testid="chevron-right" {...props} />,
  ArrowUpDown: (props: Record<string, unknown>) => <svg data-testid="sort" {...props} />,
}));

jest.mock("@/app/components/ProductCard", () => ({
  ProductCard: () => <div data-testid="product-card" />,
}));

jest.mock("@/app/components/spinner", () => ({
  __esModule: true,
  default: () => <div data-testid="spinner" />,
}));

jest.mock("@/lib/products", () => ({
  toProductCardProduct: (product: unknown) => product,
}));

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import ProductsPage from "@/app/products/page";

type Deferred = {
  promise: Promise<{ ok: boolean; json: () => Promise<unknown> }>;
  resolve: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
};

function deferredResponse(): Deferred {
  let resolve!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
  const promise = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function successBody(total: number) {
  return {
    success: true,
    products: Array.from({ length: Math.min(total, 12) }, (_, i) => ({
      id: `p-${i}`,
      name: `Product ${i}`,
    })),
    total,
    total_pages: 1,
    page: 1,
    facets: { categories: [], brands: [] },
  };
}

const originalFetch = global.fetch;

afterAll(() => {
  global.fetch = originalFetch;
});

test("never flashes '0 products' while the first response is pending", async () => {
  const first = deferredResponse();
  const fetchMock = jest.fn(() => first.promise);
  global.fetch = fetchMock as unknown as typeof fetch;

  render(<ProductsPage />);

  expect(await screen.findByText(/loading products/i)).toBeInTheDocument();
  expect(screen.queryByText(/0 products/)).toBeNull();

  first.resolve({
    ok: true,
    json: async () => successBody(3),
  });

  expect(await screen.findByText(/3 products/)).toBeInTheDocument();
  expect(screen.queryByText(/loading products/i)).toBeNull();
});

test("keeps the previous real count while a refresh is in flight", async () => {
  const first = deferredResponse();
  const second = deferredResponse();
  const responses = [first.promise, second.promise];
  const fetchMock = jest.fn(() => responses.shift() ?? second.promise);
  global.fetch = fetchMock as unknown as typeof fetch;

  const { container } = render(<ProductsPage />);

  first.resolve({ ok: true, json: async () => successBody(7) });
  expect(await screen.findByText(/7 products/)).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);

  // Changing the sort order triggers a refetch while `result` still holds
  // the previous response — the counter must keep the REAL old count, not
  // reset to "0" or "Loading".
  const sortSelect = container.querySelector("select");
  expect(sortSelect).not.toBeNull();
  fireEvent.change(sortSelect as Element, { target: { value: "price-asc" } });

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(screen.getByText(/7 products/)).toBeInTheDocument();
  expect(screen.queryByText(/0 products/)).toBeNull();
  expect(screen.queryByText(/loading products/i)).toBeNull();

  second.resolve({ ok: true, json: async () => successBody(5) });
  expect(await screen.findByText(/5 products/)).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText(/loading products/i)).toBeNull());
});
