/**
 * @jest-environment node
 *
 * Contract tests — /api/admin/content/images (banner/section uploads):
 *   - auth FIRST (401 before any body/storage work)
 *   - file rules shared with product images (type + size)
 *   - bucket missing (migration not applied) → 503
 *     CONTENT_MIGRATION_REQUIRED — never a generic 500
 *   - success → public URL + storage path
 */

const mockAuth: { current: { user?: { id: string; email?: string }; error?: string; status?: number } } = {
  current: { user: { id: "admin-uid-1", email: "admin@galaxy.test" } },
};
jest.mock("@/app/api/admin/_lib/verifyAdmin", () => ({
  verifyAdmin: jest.fn(async () => mockAuth.current),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    withContext: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

const mockUpload = jest.fn();
const mockGetPublicUrl = jest.fn(() => ({
  data: { publicUrl: "https://proj.supabase.co/storage/v1/object/public/site-banners/site/a.jpg" },
}));
jest.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: jest.fn(() => ({
    storage: {
      from: jest.fn(() => ({ upload: mockUpload, getPublicUrl: mockGetPublicUrl })),
    },
  })),
}));

import { POST } from "@/app/api/admin/content/images/route";

function uploadRequest(file?: File): Request {
  const form = new FormData();
  if (file) form.append("file", file);
  return new Request("http://localhost:3000/api/admin/content/images", {
    method: "POST",
    headers: { ...(mockAuth.current.user ? { Authorization: "Bearer t" } : {}) },
    body: form,
  });
}

function jpegFile(): File {
  // Minimal real JPEG signature (SOI + JFIF APP0) — ≥12 bytes so the
  // server-side byte sniffer recognises it.
  const bytes = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00,
  ]);
  return new File([bytes], "banner.jpg", { type: "image/jpeg" });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.current = { user: { id: "admin-uid-1", email: "admin@galaxy.test" } };
  mockUpload.mockResolvedValue({ error: null });
});

describe("POST /api/admin/content/images", () => {
  test("401 before any body or storage work", async () => {
    mockAuth.current = { error: "Authorization required", status: 401 };
    const res = await POST(uploadRequest(jpegFile()));
    expect(res.status).toBe(401);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  test("400 without a file", async () => {
    const res = await POST(uploadRequest());
    expect(res.status).toBe(400);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  test("400 on a disallowed file type", async () => {
    const file = new File(["MZ"], "payload.exe", { type: "application/x-msdownload" });
    const res = await POST(uploadRequest(file));
    expect(res.status).toBe(400);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  test("503 CONTENT_MIGRATION_REQUIRED when the bucket does not exist", async () => {
    mockUpload.mockResolvedValue({ error: { message: "Bucket not found" } });
    const res = await POST(uploadRequest(jpegFile()));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.code).toBe("CONTENT_MIGRATION_REQUIRED");
    expect(json.message).toContain("20261108130000_site_content_banners_sections.sql");
  });

  test("201 returns the public URL and the storage path", async () => {
    const res = await POST(uploadRequest(jpegFile()));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.url).toContain("/storage/v1/object/public/site-banners/");
    expect(json.path).toMatch(/^site\/.+\.jpg$/);

    expect(mockUpload).toHaveBeenCalledTimes(1);
    const [path, , options] = mockUpload.mock.calls[0] as [
      string,
      Buffer,
      { contentType: string },
    ];
    expect(path).toMatch(/^site\/.+\.jpg$/);
    expect(options.contentType).toBe("image/jpeg");
  });

  test("a non-migration storage failure stays a 500 (honest failure)", async () => {
    mockUpload.mockResolvedValue({ error: { message: "payload too large" } });
    const res = await POST(uploadRequest(jpegFile()));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.code).toBeUndefined();
  });
});
