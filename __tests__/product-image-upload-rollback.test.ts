/** @jest-environment node */

const mockGetUser = jest.fn();
const mockUserFrom = jest.fn();
const mockDbFrom = jest.fn();
const mockUpload = jest.fn();
const mockRemove = jest.fn();
const mockGetPublicUrl = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockUserFrom,
  })),
}));

jest.mock("@/lib/supabase/service-role", () => ({
  getServiceRoleClient: () => ({
    from: mockDbFrom,
    storage: {
      from: () => ({
        upload: mockUpload,
        remove: mockRemove,
        getPublicUrl: mockGetPublicUrl,
      }),
    },
  }),
}));

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimitAsync: async () => ({ allowed: true, remaining: 59, backend: "memory" }),
  getClientIp: () => "127.0.0.1",
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { POST } from "@/app/api/vendor/products/images/route";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";

type Operation = "select" | "insert" | "update" | "delete";

type Context = {
  table: string;
  operation: Operation;
  payload: unknown;
  filters: Array<[string, unknown]>;
  terminal: "then" | "single" | "maybeSingle";
};

function makeBuilder(table: string, handler: (context: Context) => unknown) {
  const state = {
    operation: "select" as Operation,
    payload: undefined as unknown,
    filters: [] as Array<[string, unknown]>,
  };
  const builder: Record<string, unknown> = {};
  const chain = () => builder;

  builder.select = () => builder;
  builder.insert = (payload: unknown) => {
    state.operation = "insert";
    state.payload = payload;
    return builder;
  };
  builder.update = (payload: unknown) => {
    state.operation = "update";
    state.payload = payload;
    return builder;
  };
  builder.delete = () => {
    state.operation = "delete";
    return builder;
  };
  for (const method of ["eq", "is", "in", "neq"]) {
    builder[method] = (column: string, value: unknown) => {
      state.filters.push([column, value]);
      return builder;
    };
  }
  builder.order = chain;
  builder.limit = chain;

  const resolve = (terminal: "then" | "single" | "maybeSingle") =>
    handler({ table, ...state, terminal });

  builder.single = () => Promise.resolve(resolve("single"));
  builder.maybeSingle = () => Promise.resolve(resolve("maybeSingle"));
  builder.then = (
    onResolve: (value: unknown) => unknown,
    onReject?: (reason: unknown) => unknown
  ) => Promise.resolve(resolve("then")).then(onResolve, onReject);

  return builder;
}

function fromWith(handler: (context: Context) => unknown) {
  return (table: string) => makeBuilder(table, handler);
}

function requestWithTwoFiles() {
  const form = new FormData();
  form.append("product_id", PRODUCT_ID);
  form.append("files", new File([Buffer.from("first")], "first.png", { type: "image/png" }));
  form.append("files", new File([Buffer.from("second")], "second.png", { type: "image/png" }));

  return new Request("http://localhost/api/vendor/products/images", {
    method: "POST",
    headers: { authorization: "Bearer vendor-token" },
    body: form,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "vendor-user" } }, error: null });
  mockUserFrom.mockImplementation(
    fromWith(({ table }) => {
      if (table === "stores") return { data: { id: "store-1" }, error: null };
      return { data: null, error: null };
    })
  );
  mockGetPublicUrl.mockReturnValue({ data: { publicUrl: "https://cdn.example/image.png" } });
  mockRemove.mockResolvedValue({ error: null });
});

describe("POST /api/vendor/products/images rollback", () => {
  test("removes already-uploaded files and restores the previous primary on partial failure", async () => {
    let productImageInsertCount = 0;
    let deletedIds: unknown[] = [];
    const restoredPrimaryIds: unknown[] = [];

    mockUpload
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: new Error("storage write failed") });

    mockDbFrom.mockImplementation(
      fromWith(({ table, operation, filters }) => {
        if (table === "products") {
          return { data: { id: PRODUCT_ID }, error: null };
        }
        if (table === "product_images" && operation === "select") {
          const isPrimaryFilter = filters.some(
            ([column, value]) => column === "is_primary" && value === true
          );
          if (isPrimaryFilter) {
            return { data: { id: "old-primary" }, error: null };
          }
          // The count query and nextSortOrder both resolve here.
          if (filters.some(([column]) => column === "product_id")) {
            return { data: { sort_order: -1 }, error: null, count: 0 };
          }
          return { data: null, error: null, count: 0 };
        }
        if (table === "product_images" && operation === "insert") {
          productImageInsertCount += 1;
          return {
            data: {
              id: `new-${productImageInsertCount}`,
              storage_path: `${PRODUCT_ID}/new-${productImageInsertCount}.png`,
              alt_text: null,
              is_primary: false,
              sort_order: 0,
            },
            error: null,
          };
        }
        if (table === "product_images" && operation === "delete") {
          const idFilter = filters.find(([column]) => column === "id");
          deletedIds = Array.isArray(idFilter?.[1]) ? (idFilter[1] as unknown[]) : [];
          return { error: null };
        }
        if (table === "product_images" && operation === "update") {
          const idFilter = filters.find(([column]) => column === "id");
          if (idFilter) restoredPrimaryIds.push(idFilter[1]);
          return { error: null };
        }
        return { data: null, error: null };
      })
    );

    const res = await POST(requestWithTwoFiles());

    expect(res.status).toBe(500);
    expect(productImageInsertCount).toBe(1);
    expect(mockUpload).toHaveBeenCalledTimes(2);
    // One DB row and one storage object were created before the second upload
    // failed, and both must be cleaned up.
    expect(deletedIds).toEqual(["new-1"]);
    expect(restoredPrimaryIds).toContain("old-primary");
    expect(mockRemove).toHaveBeenCalledWith([
      expect.stringMatching(new RegExp(`^${PRODUCT_ID}/[0-9a-f-]+\\.png$`)),
    ]);
  });
});
