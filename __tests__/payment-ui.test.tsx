/**
 * Payment / receipt UI tests (frontend brief, TASK 22).
 *
 * Covers the shared status model, the safe API error copy, the receipt
 * upload validators and the three payment components.
 */

import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";

import {
  PLACEHOLDER_WALLET_NUMBER,
  VODAFONE_STATE_COPY,
  canSubmitReceipt,
  clearVodafoneHint,
  describeShippingMethod,
  formatDeliveryEstimate,
  getRejectionReason,
  getVodafoneState,
  isExplicitlyRejected,
  isVodafoneHintedOrder,
  paymentProviderLabel,
  pickPayment,
  rememberVodafoneOrder,
  resolveWalletNumber,
  toPaymentProvider,
  type PaymentAttempt,
} from "@/app/lib/payment-status";
import { apiErrorMessage, containsSensitiveDetails, storageErrorMessage } from "@/app/lib/api-error-message";
import {
  RECEIPT_MAX_BYTES,
  ReceiptUploader,
  validatePayerPhone,
  validateReceiptFile,
  validateTransferReference,
} from "@/app/components/payment/ReceiptUploader";
import { VodafoneInstructions } from "@/app/components/payment/VodafoneInstructions";
import { ReceiptViewer } from "@/app/components/payment/ReceiptViewer";

type MockLinkProps = { children?: React.ReactNode; href?: string } & Record<string, unknown>;
type MockImageProps = Record<string, unknown>;
type IconProps = Record<string, unknown>;

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: MockLinkProps) => (
    <a href={typeof href === "string" ? href : undefined} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: MockImageProps) => {
    const { src, alt, width, height, unoptimized, ...rest } = props;
    void unoptimized;
    return (
      // eslint-disable-next-line @next/next/no-img-element -- test double
      <img
        src={typeof src === "string" ? src : ""}
        alt={typeof alt === "string" ? alt : ""}
        width={typeof width === "number" ? width : undefined}
        height={typeof height === "number" ? height : undefined}
        {...(rest as React.ImgHTMLAttributes<HTMLImageElement>)}
      />
    );
  },
}));

jest.mock("lucide-react", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS mock factory
  const ReactLib = require("react");
  const make = (name: string) => {
    const Icon = (props: IconProps) => ReactLib.createElement("svg", { "data-lucide": name, ...props });
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

jest.mock("@/lib/supabaseClient", () => ({
  supabase: { storage: { from: jest.fn() } },
}));

jest.mock("@/app/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    getToken: async () => "test-token",
  }),
}));

import { supabase } from "@/lib/supabaseClient";

const uploadMock = jest.fn();
const fromMock = supabase.storage.from as unknown as jest.Mock;

function vodafone(overrides: Partial<PaymentAttempt> = {}): PaymentAttempt {
  return {
    provider: "vodafone_cash",
    status: "pending",
    amount: 480,
    created_at: "2026-10-01T10:00:00.000Z",
    ...overrides,
  };
}

beforeAll(() => {
  if (!URL.createObjectURL) {
    Object.assign(URL, { createObjectURL: jest.fn(() => "blob:mock"), revokeObjectURL: jest.fn() });
  }
  if (!URL.revokeObjectURL) {
    Object.assign(URL, { revokeObjectURL: jest.fn() });
  }
});

beforeEach(() => {
  uploadMock.mockReset();
  fromMock.mockReturnValue({ upload: uploadMock });
  window.localStorage.clear();
});

describe("payment provider model", () => {
  test("accepts the exact backend provider values", () => {
    expect(toPaymentProvider("cod")).toBe("cod");
    expect(toPaymentProvider("vodafone_cash")).toBe("vodafone_cash");
    expect(toPaymentProvider("stripe")).toBe("stripe");
    expect(toPaymentProvider("wallet")).toBe("wallet");
    expect(toPaymentProvider("paymob")).toBe("paymob");
  });

  test("maps legacy 'card' spellings to stripe for display only", () => {
    expect(toPaymentProvider("card")).toBe("stripe");
    expect(toPaymentProvider("credit_card")).toBe("stripe");
    expect(toPaymentProvider("vodafone")).toBe("vodafone_cash");
    expect(toPaymentProvider("bitcoin")).toBeNull();
    expect(toPaymentProvider(undefined)).toBeNull();
  });

  test("labels unknown providers without pretending they are recorded", () => {
    expect(paymentProviderLabel("vodafone_cash")).toBe("Vodafone Cash");
    expect(paymentProviderLabel("cod")).toBe("Cash on Delivery");
    expect(paymentProviderLabel("")).toBe("Not recorded");
    expect(paymentProviderLabel(undefined)).toBe("Not recorded");
    expect(paymentProviderLabel("some-future-provider")).toBe("some-future-provider");
  });
});

describe("wallet number", () => {
  test("refuses the shipped placeholder value", () => {
    expect(resolveWalletNumber(PLACEHOLDER_WALLET_NUMBER)).toEqual({ number: null, configured: false });
    expect(resolveWalletNumber("")).toEqual({ number: null, configured: false });
    expect(resolveWalletNumber(undefined)).toEqual({ number: null, configured: false });
  });

  test("accepts a real Egyptian mobile number", () => {
    expect(resolveWalletNumber("01012345678")).toEqual({ number: "01012345678", configured: true });
    expect(resolveWalletNumber(" 01012345678 ")).toEqual({ number: "01012345678", configured: true });
    expect(resolveWalletNumber("12345")).toEqual({ number: null, configured: false });
  });
});

describe("payment attempt selection", () => {
  const cod: PaymentAttempt = { provider: "cod", status: "pending", created_at: "2026-10-01T09:00:00.000Z" };
  const cardFailed: PaymentAttempt = { provider: "stripe", status: "failed", created_at: "2026-10-01T11:00:00.000Z" };
  const vf = vodafone();

  test("returns null when there are no attempts", () => {
    expect(pickPayment([])).toBeNull();
    expect(pickPayment(null)).toBeNull();
    expect(pickPayment(undefined)).toBeNull();
  });

  test("prefers a settled attempt over a newer failed retry", () => {
    expect(pickPayment([cardFailed, { ...cod, status: "succeeded" }])?.provider).toBe("cod");
  });

  test("scopes to the requested provider when that provider has rows", () => {
    expect(pickPayment([cod, vf], "vodafone_cash")?.provider).toBe("vodafone_cash");
    expect(pickPayment([cod], "vodafone_cash")?.provider).toBe("cod");
  });
});

describe("rejection vs timeout", () => {
  test("only an admin rejection makes a failed row 'rejected'", () => {
    expect(isExplicitlyRejected(vodafone({ status: "failed" }))).toBe(false);
    expect(
      isExplicitlyRejected(vodafone({ status: "failed", raw_response: { rejected: true } }))
    ).toBe(true);
    expect(isExplicitlyRejected(vodafone({ status: "pending" }))).toBe(false);
    expect(isExplicitlyRejected(null)).toBe(false);
  });

  test("failed without rejection is timed_out, never rejected", () => {
    expect(getVodafoneState({ orderStatus: "pending", payment: vodafone({ status: "failed" }) })).toBe(
      "timed_out"
    );
    expect(VODAFONE_STATE_COPY.timed_out.badge).toBe("Awaiting verification");
    expect(VODAFONE_STATE_COPY.rejected.badge).toBe("Payment rejected");
  });

  test("admin rejection is reported with its reason", () => {
    const payment = vodafone({
      status: "failed",
      raw_response: { rejected: true, verify_note: "Amount does not match" },
    });
    expect(getVodafoneState({ orderStatus: "pending", payment })).toBe("rejected");
    expect(getRejectionReason(payment)).toBe("Amount does not match");
    expect(getRejectionReason(vodafone({ status: "failed" }))).toBeNull();
  });
});

describe("vodafone state machine", () => {
  test("pending receipt means waiting for the customer", () => {
    expect(getVodafoneState({ orderStatus: "pending", payment: vodafone() })).toBe("awaiting_verification");
    expect(getVodafoneState({ orderStatus: "pending", payment: vodafone({ status: "succeeded" }) })).toBe(
      "confirmed"
    );
  });

  test("no attempt yet needs the client hint", () => {
    expect(getVodafoneState({ orderStatus: "pending", hintedVodafone: true })).toBe("receipt_required");
    expect(getVodafoneState({ orderStatus: "pending", hintedVodafone: false })).toBe("not_applicable");
    expect(getVodafoneState({ orderStatus: "paid", hintedVodafone: true })).toBe("not_applicable");
  });

  test("non-vodafone attempts are not applicable", () => {
    expect(getVodafoneState({ orderStatus: "pending", payment: { provider: "cod", status: "pending" } })).toBe(
      "not_applicable"
    );
    expect(
      getVodafoneState({ orderStatus: "pending", payment: { provider: "stripe", status: "pending" } })
    ).toBe("not_applicable");
  });

  test("customers may (re)submit only while the order is still pending", () => {
    expect(
      canSubmitReceipt({ orderStatus: "pending", hintedVodafone: true, payments: [] })
    ).toBe(true);
    expect(canSubmitReceipt({ orderStatus: "paid", hintedVodafone: true, payments: [] })).toBe(false);
    expect(
      canSubmitReceipt({
        orderStatus: "pending",
        payments: [vodafone({ status: "failed", raw_response: { rejected: true } })],
      })
    ).toBe(true);
    expect(canSubmitReceipt({ orderStatus: "pending", payments: [vodafone({ status: "succeeded" })] })).toBe(
      false
    );
    expect(canSubmitReceipt({ orderStatus: "pending", payments: [{ provider: "cod", status: "pending" }] })).toBe(
      false
    );
  });
});

describe("vodafone order hint (non-authoritative)", () => {
  test("round-trips per order id and can be cleared", () => {
    expect(isVodafoneHintedOrder("order-a")).toBe(false);
    rememberVodafoneOrder("order-a");
    expect(isVodafoneHintedOrder("order-a")).toBe(true);
    expect(isVodafoneHintedOrder("order-b")).toBe(false);
    clearVodafoneHint("order-a");
    expect(isVodafoneHintedOrder("order-a")).toBe(false);
  });
});

describe("shipping copy", () => {
  test("formats delivery estimates", () => {
    expect(formatDeliveryEstimate(4, 7)).toBe("4–7 days");
    expect(formatDeliveryEstimate(1, 1)).toBe("1 day");
    expect(formatDeliveryEstimate(null, 7)).toBeNull();
  });

  test("describes the selected method", () => {
    expect(describeShippingMethod(null)).toEqual({ label: "Delivery not set", detail: "" });
    expect(describeShippingMethod({ type: "standard", min_delivery_days: 4, max_delivery_days: 7 })).toEqual({
      label: "Standard delivery",
      detail: "4–7 days",
    });
    expect(describeShippingMethod({ type: "express", min_delivery_days: 1, max_delivery_days: 3 })).toEqual({
      label: "Express delivery",
      detail: "1–3 days",
    });
  });
});

describe("api error copy", () => {
  test("never leaks secrets, SQL or stack frames", () => {
    expect(containsSensitiveDetails("service_role key invalid")).toBe(true);
    expect(containsSensitiveDetails('column "secret" does not exist')).toBe(true);
    expect(containsSensitiveDetails("at submit (/app/api/x.ts:12:5)")).toBe(true);
    expect(containsSensitiveDetails("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload")).toBe(true);
    expect(containsSensitiveDetails("The transfer reference is too short")).toBe(false);
  });

  test("surfaces a readable backend message", () => {
    expect(apiErrorMessage(400, { message: "Transfer reference is too short" }, "fallback")).toBe(
      "Transfer reference is too short"
    );
  });

  test("replaces sensitive and generic 500 messages", () => {
    expect(apiErrorMessage(400, { message: 'column "payemnts" does not exist' }, "fallback")).toBe(
      "Some of the details you sent were rejected. Please review them and try again."
    );
    expect(apiErrorMessage(500, { message: "Failed to submit the receipt" }, "fallback")).toBe(
      "Something went wrong on our side. Please try again."
    );
    expect(apiErrorMessage(404, null, "fallback")).toBe("We could not find what you were looking for.");
    expect(apiErrorMessage(502, null, "fallback")).toBe(
      "Something went wrong on our side. Please try again."
    );
  });

  test("maps storage failures to actionable copy", () => {
    expect(storageErrorMessage("Bucket not found")).toBe(
      "Receipt upload is not available yet. Please contact support before transferring."
    );
    expect(storageErrorMessage("new row violates row-level security policy")).toBe(
      "You are not allowed to upload receipts for this order."
    );
    expect(storageErrorMessage(null)).toBe("Could not upload the receipt. Please try again.");
  });
});

describe("receipt validation", () => {
  test("requires a file", () => {
    expect(validateReceiptFile(null)).toMatch(/Choose a receipt image/);
  });

  test("rejects unsupported types such as SVG or PDF", () => {
    const svg = new File(["<svg/>"], "receipt.svg", { type: "image/svg+xml" });
    const pdf = new File(["%PDF"], "receipt.pdf", { type: "application/pdf" });
    expect(validateReceiptFile(svg)).toMatch(/not supported/);
    expect(validateReceiptFile(pdf)).toMatch(/not supported/);
  });

  test("rejects empty and oversized files", () => {
    const empty = new File([], "receipt.png", { type: "image/png" });
    expect(validateReceiptFile(empty)).toMatch(/empty/);

    const big = new File(["x"], "receipt.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: RECEIPT_MAX_BYTES + 1 });
    expect(validateReceiptFile(big)).toMatch(/5 MB/);
  });

  test("accepts a normal image", () => {
    const ok = new File(["x"], "receipt.png", { type: "image/png" });
    expect(validateReceiptFile(ok)).toBeNull();
  });

  test("validates payer phone and reference", () => {
    expect(validatePayerPhone("")).toMatch(/Enter the phone number/);
    expect(validatePayerPhone("012")).toMatch(/too short/);
    expect(validatePayerPhone("01012345678")).toBeNull();

    expect(validateTransferReference("")).toMatch(/Enter the transfer reference/);
    expect(validateTransferReference("12")).toMatch(/too short/);
    expect(validateTransferReference("TRX-998877")).toBeNull();
  });
});

describe("VodafoneInstructions", () => {
  test("shows the configured wallet number, amount and order", () => {
    render(
      <VodafoneInstructions number="01012345678" amountLabel="EGP 480.00" orderNumber="GS-1001" />
    );
    expect(screen.getByTestId("vodafone-number")).toHaveTextContent("01012345678");
    expect(screen.getByText("EGP 480.00")).toBeInTheDocument();
    expect(screen.getByText("GS-1001")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("warns instead of inventing a number when unconfigured", () => {
    render(<VodafoneInstructions number={null} amountLabel="EGP 480.00" />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/not configured/i);
    expect(screen.queryByTestId("vodafone-number")).not.toBeInTheDocument();
    expect(screen.queryByText(PLACEHOLDER_WALLET_NUMBER)).not.toBeInTheDocument();
  });
});

describe("ReceiptViewer", () => {
  test("renders nothing without a signed url", () => {
    const { container } = render(<ReceiptViewer src={null} />);
    expect(container.firstChild).toBeNull();
  });

  test("opens a lightbox that closes on Escape", () => {
    render(<ReceiptViewer src="https://example.test/receipt.png?token=abc" label="View receipt" />);
    const trigger = screen.getByRole("button", { name: "View receipt" });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByAltText("Transfer receipt")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("ReceiptUploader", () => {
  const fileInput = () => screen.getByLabelText("Receipt image");

  const fillForm = (file?: File) => {
    fireEvent.change(screen.getByLabelText("Phone number you transferred from"), {
      target: { value: "01012345678" },
    });
    fireEvent.change(screen.getByLabelText("Transfer reference / transaction ID"), {
      target: { value: "TRX-998877" },
    });
    if (file) {
      const input = fileInput();
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      fireEvent.change(input);
    }
  };

  test("renders the form with the configured submit label", () => {
    render(<ReceiptUploader orderId="order-1" submitLabel="Submit receipt for verification" />);
    expect(screen.getByLabelText("Phone number you transferred from")).toBeInTheDocument();
    expect(screen.getByLabelText("Transfer reference / transaction ID")).toBeInTheDocument();
    expect(screen.getByText("Submit receipt for verification")).toBeInTheDocument();
  });

  test("blocks submission and shows field errors before any request", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ReceiptUploader orderId="order-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Submit receipt/ }));

    expect(await screen.findByText("Enter the phone number you transferred from.")).toBeInTheDocument();
    expect(screen.getByText("Enter the transfer reference or transaction ID.")).toBeInTheDocument();
    expect(screen.getByText("Choose a receipt image first.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("uploads the receipt and posts it to the payments endpoint", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ success: true, payment: { id: "pmt-1" } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    uploadMock.mockResolvedValue({ error: null });
    const onSubmitted = jest.fn();

    render(<ReceiptUploader orderId="order-1" onSubmitted={onSubmitted} />);
    fillForm(new File(["receipt-bytes"], "receipt.png", { type: "image/png" }));

    fireEvent.click(screen.getByRole("button", { name: /Submit receipt/ }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Receipt submitted/i));
    expect(fromMock).toHaveBeenCalledWith("payment-receipts");
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(uploadMock.mock.calls[0][0]).toMatch(/^user-1\/order-1\//);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      order_id: "order-1",
      payer_phone: "01012345678",
      transfer_reference: "TRX-998877",
      receipt_path: expect.stringContaining("user-1/order-1/"),
    });
    expect(onSubmitted).toHaveBeenCalledWith({ id: "pmt-1" });
  });

  test("shows a safe message and offers a retry when the backend rejects", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: "Transfer reference is too short" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    uploadMock.mockResolvedValue({ error: null });

    render(<ReceiptUploader orderId="order-1" />);
    fillForm(new File(["receipt-bytes"], "receipt.png", { type: "image/png" }));
    fireEvent.click(screen.getByRole("button", { name: /Submit receipt/ }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Transfer reference is too short");
    expect(within(alert).getByText("Try again")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("reports storage failures without leaking internals", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    uploadMock.mockResolvedValue({ error: { message: "Bucket not found" } });

    render(<ReceiptUploader orderId="order-1" />);
    fillForm(new File(["receipt-bytes"], "receipt.png", { type: "image/png" }));
    fireEvent.click(screen.getByRole("button", { name: /Submit receipt/ }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Receipt upload is not available yet/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
