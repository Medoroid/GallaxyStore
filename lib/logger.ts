type LogLevel = "info" | "warn" | "error";

function log(level: LogLevel, message: string, data?: unknown) {
  if (process.env.NODE_ENV === "production" && level !== "error") return;

  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

  if (level === "error") {
    console.error(`${prefix} ${message}`, data || "");
  } else if (level === "warn") {
    console.warn(`${prefix} ${message}`, data || "");
  } else {
    console.log(`${prefix} ${message}`, data || "");
  }
}

export const logger = {
  info: (message: string, data?: unknown) => log("info", message, data),
  warn: (message: string, data?: unknown) => log("warn", message, data),
  error: (message: string, data?: unknown) => log("error", message, data),
};
