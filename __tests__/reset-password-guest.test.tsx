/**
 * @jest-environment jsdom
 *
 * C1 tests — /reset-password must not blame visitors who open the page
 * without a reset link:
 *   - no session + NO token in the URL -> friendly "request a new link"
 *     panel, never "Invalid or expired reset link"
 *   - no session + a token marker in the URL (?code= / #access_token= /
 *     #error=) -> the "Invalid or expired" message is correct there
 *   - an existing recovery session -> the actual password form
 */

const mockGetSession = jest.fn();
const mockUpdateUser = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
    },
  })),
}));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
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
  Lock: (props: Record<string, unknown>) => <svg data-testid="lock" {...props} />,
  Eye: (props: Record<string, unknown>) => <svg data-testid="eye" {...props} />,
  EyeOff: (props: Record<string, unknown>) => <svg data-testid="eye-off" {...props} />,
  CheckCircle: (props: Record<string, unknown>) => <svg data-testid="check" {...props} />,
  ArrowLeft: (props: Record<string, unknown>) => <svg data-testid="arrow-left" {...props} />,
}));

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import ResetPasswordPage from "@/app/reset-password/page";

function setUrl(path: string) {
  window.history.replaceState({}, "", path);
}

beforeEach(() => {
  jest.clearAllMocks();
  setUrl("/reset-password");
  mockGetSession.mockResolvedValue({ data: { session: null } });
});

test("guest without any token sees a 'request a new link' panel — not an error", async () => {
  render(<ResetPasswordPage />);

  const cta = await screen.findByRole("link", { name: /request a reset link/i });
  expect(cta.getAttribute("href")).toBe("/forgot-password");
  expect(screen.queryByText(/invalid or expired/i)).toBeNull();
  // The password form must not be offered to a visitor with no session.
  expect(screen.queryByRole("button", { name: /update password/i })).toBeNull();
});

test("guest with a PKCE ?code= marker that failed to exchange sees the invalid-link message", async () => {
  setUrl("/reset-password?code=expired-code-value");

  render(<ResetPasswordPage />);

  expect(await screen.findByText(/invalid or expired reset link/i)).toBeInTheDocument();
  const cta = screen.getByRole("link", { name: /request a new link/i });
  expect(cta.getAttribute("href")).toBe("/forgot-password");
  expect(screen.queryByRole("button", { name: /update password/i })).toBeNull();
});

test("guest with an implicit #access_token= marker that failed sees the invalid-link message", async () => {
  setUrl("/reset-password#access_token=deadbeef&type=recovery");

  render(<ResetPasswordPage />);

  expect(await screen.findByText(/invalid or expired reset link/i)).toBeInTheDocument();
});

test("guest with a #error= marker (expired link reported by Supabase) sees the invalid-link message", async () => {
  setUrl("/reset-password#error=access_denied&error_description=Token%20expired");

  render(<ResetPasswordPage />);

  expect(await screen.findByText(/invalid or expired reset link/i)).toBeInTheDocument();
});

test("an existing session sees the password form", async () => {
  mockGetSession.mockResolvedValue({
    data: { session: { user: { id: "user-1" }, access_token: "tok" } },
  });

  render(<ResetPasswordPage />);

  expect(await screen.findByText(/enter your new password below/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /update password/i })).toBeEnabled();
  expect(screen.queryByText(/invalid or expired/i)).toBeNull();
});

test("checking state never shows the invalid message (no premature blame)", () => {
  // getSession never resolves within this test -> page stays in "checking".
  mockGetSession.mockReturnValue(new Promise(() => {}));

  render(<ResetPasswordPage />);

  expect(screen.getByText(/verifying reset link/i)).toBeInTheDocument();
  expect(screen.queryByText(/invalid or expired/i)).toBeNull();
});
