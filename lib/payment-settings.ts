/**
 * Server-side payment method configuration.
 *
 * The external-wallet account is stored exactly once in `store_settings` under
 * the `external_wallet` key and is never exposed publicly. Authenticated
 * checkout reads a reduced, display-only shape through `/api/payment-methods`.
 */

export const EXTERNAL_WALLET_SETTING_KEY = "external_wallet";

export type ExternalWalletSettings = {
  enabled: boolean;
  provider_name: string;
  account_name: string;
  account_number: string;
  instructions: string;
};

export const DEFAULT_EXTERNAL_WALLET_SETTINGS: ExternalWalletSettings = {
  enabled: false,
  provider_name: "",
  account_name: "",
  account_number: "",
  instructions: "",
};

const MAX_PROVIDER_NAME = 60;
const MAX_ACCOUNT_NAME = 100;
const MAX_ACCOUNT_NUMBER = 80;
const MAX_INSTRUCTIONS = 500;

/** Account numbers may be local wallets, IBANs or transfer handles. */
const ACCOUNT_NUMBER_RE = /^[A-Za-z0-9+\-_.@/\s]{3,80}$/;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function assertLength(
  field: string,
  value: string,
  max: number,
  strict: boolean
): void {
  if (strict && value.length > max) {
    throw new Error(`${field} must be ${max} characters or fewer`);
  }
}

/**
 * Normalize a stored/admin-supplied value.
 *
 * `strict` is used by the admin settings endpoint so typos are rejected instead
 * of silently saved. Public reads use the non-strict form so a malformed legacy
 * row simply disables the method rather than breaking checkout.
 */
export function normalizeExternalWalletSettings(
  value: unknown,
  strict = false
): ExternalWalletSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    if (strict) throw new Error("External wallet settings must be an object");
    return { ...DEFAULT_EXTERNAL_WALLET_SETTINGS };
  }

  const raw = value as Record<string, unknown>;
  const provider_name = text(raw.provider_name);
  const account_name = text(raw.account_name);
  const account_number = text(raw.account_number);
  const instructions = text(raw.instructions);
  const enabled = raw.enabled === true;

  assertLength("Provider name", provider_name, MAX_PROVIDER_NAME, strict);
  assertLength("Account name", account_name, MAX_ACCOUNT_NAME, strict);
  assertLength("Account number", account_number, MAX_ACCOUNT_NUMBER, strict);
  assertLength("Instructions", instructions, MAX_INSTRUCTIONS, strict);

  if (strict && enabled) {
    if (!provider_name) throw new Error("Provider name is required when wallet transfers are enabled");
    if (!account_name) throw new Error("Account name is required when wallet transfers are enabled");
    if (!account_number) throw new Error("Account number is required when wallet transfers are enabled");
    if (!ACCOUNT_NUMBER_RE.test(account_number)) {
      throw new Error("Account number contains unsupported characters");
    }
  }

  return { enabled, provider_name, account_name, account_number, instructions };
}

export function isExternalWalletConfigured(value: unknown): boolean {
  const settings = normalizeExternalWalletSettings(value);
  return Boolean(
    settings.enabled &&
      settings.provider_name &&
      settings.account_name &&
      settings.account_number
  );
}

/**
 * The only shape sent to an authenticated customer. The internal flags
 * (`updated_by`, `is_public`, raw JSON) are deliberately dropped.
 */
export function publicExternalWalletSettings(value: unknown): ExternalWalletSettings {
  const settings = normalizeExternalWalletSettings(value);
  if (!isExternalWalletConfigured(settings)) {
    return { ...DEFAULT_EXTERNAL_WALLET_SETTINGS };
  }
  return {
    enabled: true,
    provider_name: settings.provider_name,
    account_name: settings.account_name,
    account_number: settings.account_number,
    instructions: settings.instructions,
  };
}

type SettingsClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string
      ) => {
        maybeSingle: () => PromiseLike<{
          data: { value?: unknown } | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };
};

/** Read the private setting with a service-role client. */
export async function loadExternalWalletSettings(
  client: SettingsClient
): Promise<ExternalWalletSettings> {
  const { data, error } = await client
    .from("store_settings")
    .select("value")
    .eq("key", EXTERNAL_WALLET_SETTING_KEY)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Could not load wallet settings");
  }

  return normalizeExternalWalletSettings(data?.value);
}

export type CheckoutPaymentMethod = "cod" | "external_wallet";

export function normalizeCheckoutPaymentMethod(value: unknown): CheckoutPaymentMethod | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "cod" || normalized === "external_wallet") return normalized;
  return null;
}
