/**
 * @jest-environment node
 *
 * A4 tests — structured production logger:
 *   - warnings AND errors are kept in production (info is dropped)
 *   - LOG_LEVEL can override the default
 *   - secrets/tokens are redacted from every record
 *   - PII in values (e-mail, JWT-shaped strings) is masked
 *   - structured context (requestId / route / operation) lands on the record
 */

type Logged = { level: string; args: string[] };
const logged: Logged[] = [];

/** process.env.NODE_ENV is typed read-only; mutate through a cast for tests. */
function setEnv(key: string, value: string | undefined) {
  const env = process.env as unknown as Record<string, string | undefined>;
  if (value === undefined) delete env[key];
  else env[key] = value;
}

function capture(level: string) {
  return (...args: unknown[]) => {
    logged.push({ level, args: args.map(String) });
  };
}

let consoleError: jest.SpyInstance;
let consoleWarn: jest.SpyInstance;
let consoleLog: jest.SpyInstance;

beforeEach(() => {
  logged.length = 0;
  consoleError = jest.spyOn(console, "error").mockImplementation(capture("error"));
  consoleWarn = jest.spyOn(console, "warn").mockImplementation(capture("warn"));
  consoleLog = jest.spyOn(console, "log").mockImplementation(capture("log"));
  delete process.env.LOG_LEVEL;
});

afterEach(() => {
  consoleError.mockRestore();
  consoleWarn.mockRestore();
  consoleLog.mockRestore();
  delete process.env.LOG_LEVEL;
});
function records(): Record<string, unknown>[] {
  return logged.flatMap((l) =>
    l.args.map((a) => {
      try {
        return JSON.parse(a) as Record<string, unknown>;
      } catch {
        return { raw: a, level: l.level };
      }
    })
  );
}

describe("levels", () => {
  test("development keeps info + warn + error", async () => {
    const prev = process.env.NODE_ENV;
    setEnv("NODE_ENV", "development");
    const { logger } = await import("@/lib/logger");
    logger.info("i"); logger.warn("w"); logger.error("e");
    setEnv("NODE_ENV", prev);
    expect(logged.map((l) => l.level).sort()).toEqual(["error", "log", "warn"]);
  });

  test("production keeps warn + error but drops info", async () => {
    const prev = process.env.NODE_ENV;
    setEnv("NODE_ENV", "production");
    const { logger } = await import("@/lib/logger");
    logger.info("noisy-info");
    logger.warn("security-warning");
    logger.error("hard-error");
    setEnv("NODE_ENV", prev);

    const levels = logged.map((l) => l.level);
    expect(levels).not.toContain("log");
    expect(levels).toContain("warn"); // A4: warnings survive production
    expect(levels).toContain("error");
    const recs = records();
    expect(recs.some((r) => r.message === "security-warning")).toBe(true);
    expect(recs.some((r) => r.message === "noisy-info")).toBe(false);
  });

  test("LOG_LEVEL=debug overrides production default", async () => {
    const prev = process.env.NODE_ENV;
    process.env.LOG_LEVEL = "debug";
    setEnv("NODE_ENV", "production");
    const { logger } = await import("@/lib/logger");
    logger.debug("dbg");
    setEnv("NODE_ENV", prev);
    expect(logged.some((l) => l.args.join(" ").includes("dbg"))).toBe(true);
  });
});

describe("structured output", () => {
  test("every record is JSON with timestamp + level + message", async () => {
    const { logger } = await import("@/lib/logger");
    logger.warn("hello");
    const rec = records()[0];
    expect(rec.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(rec.level).toBe("warn");
    expect(rec.message).toBe("hello");
  });

  test("withContext merges requestId/route/operation/errorCode", async () => {
    const { logger } = await import("@/lib/logger");
    logger
      .withContext({
        requestId: "req-42",
        route: "/api/gift-box",
        operation: "gift-box.request.create",
        errorCode: 429,
      })
      .warn("rate limited");
    const rec = records()[0];
    expect(rec.requestId).toBe("req-42");
    expect(rec.route).toBe("/api/gift-box");
    expect(rec.operation).toBe("gift-box.request.create");
    expect(rec.errorCode).toBe(429);
    expect(rec.message).toBe("rate limited");
  });
});

describe("secret redaction", () => {
  test("sensitive keys are redacted at any depth", async () => {
    const { logger } = await import("@/lib/logger");
    logger.error("login failed", {
      email: "a@b.com",
      password: "hunter2",
      nested: { access_token: "abc.def.ghi", cookie: "sb=1", api_key: "sk_live_x" },
      items: [{ refresh_token: "rt" }],
    });
    const rec = records()[0];
    const data = JSON.stringify(rec.data);
    expect(data).not.toContain("hunter2");
    expect(data).not.toContain("abc.def.ghi");
    expect(data).not.toContain("sk_live_x");
    expect(data).not.toContain("sb=1");
    expect(data).not.toContain("rt");
    expect(data).toContain("[REDACTED]");
  });

  test("e-mail addresses inside values are masked", async () => {
    const { logger } = await import("@/lib/logger");
    logger.warn("notify", { note: "contact client@galaxy.example about order" });
    const rec = records()[0];
    expect(JSON.stringify(rec.data)).not.toContain("client@galaxy.example");
    expect(JSON.stringify(rec.data)).toContain("c***@galaxy.example");
  });

  test("JWT-shaped strings are masked inside free text", async () => {
    const { logger } = await import("@/lib/logger");
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    logger.error("upstream said", { body: `token was ${jwt} ok` });
    const rec = records()[0];
    expect(JSON.stringify(rec.data)).not.toContain(jwt);
    expect(JSON.stringify(rec.data)).toContain("[REDACTED_TOKEN]");
  });

  test("Error objects become name/message/stack, message masked", async () => {
    const { logger } = await import("@/lib/logger");
    const err = new Error("boom for user@secret.example");
    logger.error("failed", err);
    const rec = records()[0];
    const data = rec.data as Record<string, unknown>;
    expect(data.name).toBe("Error");
    expect(String(data.message)).not.toContain("user@secret.example");
    expect(String(data.stack)).toContain("Error");
  });

  test("long strings are truncated", async () => {
    const { logger } = await import("@/lib/logger");
    logger.warn("big", { blob: "x".repeat(5000) });
    const rec = records()[0];
    const data = JSON.stringify(rec.data);
    expect(data.length).toBeLessThan(6000);
    expect(data).toContain("truncated");
  });
});
