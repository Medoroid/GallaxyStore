/**
 * Checkout UI: the two post-order dead ends.
 *
 *   - The checkout RPC commits the order and clears the cart, but the payment
 *     RPC can still fail. The customer must be routed to the order page (where
 *     they can choose/resume a payment) instead of being left on an empty cart.
 *   - A fully discounted (zero-total) order is already settled, so checkout must
 *     confirm it instead of asking for a transfer.
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

const mockClearCart = jest.fn();

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...props
  }: {
    children?: React.ReactNode;
    href?: string;
  } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : undefined} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    const { src, alt, fill, sizes, ...rest } = props;
    void fill;
    void sizes;
    // eslint-disable-next-line @next/next/no-img-element -- test double
    return <img src={typeof src === "string" ? src : ""} alt={typeof alt === "string" ? alt : ""} {...rest} />;
  },
}));

jest.mock("lucide-react", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS mock factory
  const ReactLib = require("react");
  const make = (name: string) => {
    const Icon = (props: Record<string, unknown>) =>
      ReactLib.createElement("svg", { "data-lucide": name, ...props });
    Icon.displayName = name;
    return Icon;
  };
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === "then") return undefined;
        return typeof prop === "string" ? make(prop) : undefined;
      },
    }
  );
});

jest.mock("@/app/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "customer@example.com" },
    getToken: async () => "test-token",
  }),
}));

jest.mock("@/app/stores/cartStore", () => ({
  useCartStore: () => ({
    items: [
      {
        id: "line-1",
        product_id: "prod-1",
        variant_id: "var-1",
        name: "Galaxy Tee",
        image: "/tee.png",
        price: 150,
        quantity: 1,
        currency: "EGP",
        color: null,
        size: null,
      },
    ],
    getTotal: () => 150,
    getCount: () => 1,
    clearCart: mockClearCart,
  }),
}));

jest.mock("@/app/components/payment/ReceiptUploader", () => ({
  ReceiptUploader: () => <div data-testid="receipt-uploader" />,
}));

jest.mock("@/app/components/payment/VodafoneInstructions", () => ({
  ExternalWalletInstructions: () => <div data-testid="wallet-instructions" />,
}));

import CheckoutPage from "@/app/checkout/page";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    json: async () => body,
  } as Response;
}

function installFetch(orderResponse: { body: unknown; status: number }) {
  const fetchMock = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const target = String(url);
    const method = init?.method ?? "GET";

    if (target.includes("/api/payment-methods")) {
      return jsonResponse({
        success: true,
        external_wallet: { enabled: false, account_number: "", provider_name: "" },
      });
    }
    if (target.includes("/api/shipping")) {
      return jsonResponse({ success: true, options: [] });
    }
    if (target.includes("/api/cart") && method === "GET") {
      return jsonResponse({ success: true, cart_id: "cart-1" });
    }
    if (target.includes("/api/cart") && method === "POST") {
      return jsonResponse({ success: true, item_count: 1, failed_items: [] });
    }
    if (target.includes("/api/checkout/preview")) {
      return jsonResponse({
        success: true,
        cart_id: "cart-1",
        currency: "EGP",
        item_count: 1,
        subtotal: 150,
        discount: 0,
        stored_discount: 0,
        tax: 0,
        shipping_fee: 0,
        gift_wrap_fee: 0,
        gift_wrap_item_count: 0,
        total: 150,
        items: [
          {
            cart_item_id: "line-1",
            variant_id: "var-1",
            product_name: "Galaxy Tee",
            quantity: 1,
            unit_price: 150,
            color: null,
            size: null,
          },
        ],
        coupon: null,
        coupon_error: null,
        price_changes: [],
        stock_issues: [],
        shipping_options: [],
        selected_shipping_method_id: null,
        selected_shipping_method: null,
      });
    }
    if (target.includes("/api/orders")) {
      return jsonResponse(orderResponse.body, orderResponse.status);
    }
    return jsonResponse({ success: false }, 404);
  });

  (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

async function goToConfirmAndPlaceOrder() {
  // Address step: fill every required field, then continue.
  const textboxes = screen.getAllByRole("textbox");
  const values = ["Test Customer", "01012345678", "customer@example.com", "1 Test Street", "Cairo", "Cairo", "12345"];
  textboxes.slice(0, values.length).forEach((box, index) => {
    fireEvent.change(box, { target: { value: values[index] } });
  });

  fireEvent.click(screen.getByRole("button", { name: /Continue to Payment/i }));
  await screen.findByText("Payment Method");

  fireEvent.click(screen.getByRole("button", { name: /Review Order/i }));
  await screen.findByText("Review Your Order");

  fireEvent.click(screen.getByRole("button", { name: /Place Order/i }));
}

describe("CheckoutPage post-order states", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("routes to the order page when the order was created but payment setup failed", async () => {
    installFetch({
      status: 502,
      body: {
        success: false,
        message: "Your order was created, but the payment method could not be started.",
        order_id: "order-1",
        order_number: "GS-9001",
      },
    });

    render(<CheckoutPage />);
    await goToConfirmAndPlaceOrder();

    expect(await screen.findByText("Order Created")).toBeInTheDocument();
    expect(screen.getByText("GS-9001")).toBeInTheDocument();

    const finishLink = screen.getByRole("link", { name: /Finish payment/i });
    expect(finishLink).toHaveAttribute("href", "/orders/order-1");

    // The cart was already converted by the checkout RPC, so it must be cleared
    // locally too — otherwise the empty-cart screen would take over.
    expect(mockClearCart).toHaveBeenCalled();
    expect(screen.queryByText("Cart is Empty")).not.toBeInTheDocument();
  });

  test("confirms a fully discounted order instead of asking for a transfer", async () => {
    installFetch({
      status: 201,
      body: {
        success: true,
        order_id: "order-2",
        order_number: "GS-9002",
        total: 0,
        currency: "EGP",
        free_order: true,
        payment_status: "paid",
      },
    });

    render(<CheckoutPage />);
    await goToConfirmAndPlaceOrder();

    expect(await screen.findByText("Order Confirmed!")).toBeInTheDocument();
    expect(mockClearCart).toHaveBeenCalled();
    // No transfer/receipt step for a settled free order.
    await waitFor(() => expect(screen.queryByTestId("receipt-uploader")).not.toBeInTheDocument());
  });
});
