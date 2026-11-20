/**
 * /creators page prerender contract (Phase 8):
 *
 *   - pending migrations -> the honest "not available yet" notice, so the
 *     static build never fails on the known pending-SQL condition AND the
 *     page never claims "no creators exist"
 *   - data -> the directory view receives creators + gallery unchanged
 *   - any other failure still throws (error page, never fake empty data)
 */

jest.mock("@/lib/supabase/public-server", () => ({
  getPublicServerClient: jest.fn(),
}));

jest.mock("@/lib/creator/directory", () => {
  const actual = jest.requireActual("@/lib/creator/directory");
  return { ...actual, fetchCreatorDirectory: jest.fn() };
});

import CreatorsPage from "@/app/creators/page";
import { CreatorsDirectoryView } from "@/app/components/CreatorsDirectoryView";
import { CreatorsUnavailable } from "@/app/components/CreatorsUnavailable";
import {
  MigrationsRequiredError,
  fetchCreatorDirectory,
} from "@/lib/creator/directory";

const mockedFetch = fetchCreatorDirectory as jest.Mock;

beforeEach(() => {
  mockedFetch.mockReset();
});

const CREATOR = {
  username: "alice",
  display_name: "Alice",
  avatar_url: null,
  bio: "Galaxy illustrator",
  is_featured: true,
  created_at: "2026-01-01T00:00:00.000Z",
  products: 2,
  gallery: 1,
};

const GALLERY_ITEM = {
  id: "g1",
  title: "Galaxy Night",
  description: null,
  preview_path: null,
  tags: ["space"],
  product_id: null,
  published_at: "2026-02-01T00:00:00.000Z",
  creator: { username: "alice", display_name: "Alice" },
};

function renderedType(element: unknown): unknown {
  return (element as { type: unknown }).type;
}

describe("/creators page", () => {
  test("renders the honest pending notice while migrations are unapplied", async () => {
    mockedFetch.mockRejectedValue(
      new MigrationsRequiredError("pending manual SQL")
    );

    const element = await CreatorsPage();
    expect(renderedType(element)).toBe(CreatorsUnavailable);
  });

  test("passes fetched creators and gallery straight to the directory view", async () => {
    const data = { creators: [CREATOR], gallery: [GALLERY_ITEM], galleryTotal: 1 };
    mockedFetch.mockResolvedValue(data);

    const element = await CreatorsPage();
    expect(renderedType(element)).toBe(CreatorsDirectoryView);
    expect((element as { props: Record<string, unknown> }).props).toMatchObject({
      creators: data.creators,
      gallery: data.gallery,
    });
  });

  test("unexpected failures still throw — never fake empty discovery data", async () => {
    mockedFetch.mockRejectedValue(new Error("database down"));

    await expect(CreatorsPage()).rejects.toThrow("database down");
  });
});
