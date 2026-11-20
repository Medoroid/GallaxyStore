/**
 * @jest-environment node
 *
 * invalidateThemeCache must purge BOTH theme caches:
 *   1. the in-memory resolution cache (30 s TTL), and
 *   2. the root layout's ISR cache (`export const revalidate = 300`).
 * Without (2) a publish keeps serving the previous style tag for up to five
 * minutes — the exact "half-updated storefront" the publishing system must
 * never show. Every mutation route calls this function, so one assertion
 * here covers create/update/publish/restore/settings/delete.
 */

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));
jest.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    withContext: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

import { revalidatePath } from "next/cache";
import { invalidateThemeCache } from "@/lib/themes/server";

beforeEach(() => {
  jest.clearAllMocks();
});

test("invalidateThemeCache purges the root layout ISR cache for the next visit", () => {
  invalidateThemeCache();
  expect(revalidatePath).toHaveBeenCalledTimes(1);
  expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
});
