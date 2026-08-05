// ---------------------------------------------------------------------------
// Structured logger for Onion Facility Center API
// ---------------------------------------------------------------------------
// Provides: logger.info(), logger.warn(), logger.error(), logger.debug()
// Each log entry includes timestamp, level, and optional context object.
// Includes request body logging with sensitive field masking.

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getEnvLevel(): LogLevel {
  const env = (process.env.LOG_LEVEL || "info").toLowerCase() as LogLevel;
  return LEVEL_WEIGHT[env] !== undefined ? env : "info";
}

const currentLevel = getEnvLevel();

function shouldLog(level: LogLevel): boolean {
  return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[currentLevel];
}

function fmt(level: LogLevel, msg: string, ctx?: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  const base = `${ts} [${level.toUpperCase().padEnd(5)}] ${msg}`;
  if (ctx && Object.keys(ctx).length > 0) {
    return `${base} ${JSON.stringify(ctx)}`;
  }
  return base;
}

function log(level: LogLevel, msg: string, ctx?: Record<string, unknown>) {
  if (!shouldLog(level)) return;
  const line = fmt(level, msg, ctx);
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => log("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => log("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => log("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => log("error", msg, ctx),
};

// ---------------------------------------------------------------------------
// Sensitive field masking for request body logging
// ---------------------------------------------------------------------------

/** Fields that should never be logged in plaintext. */
const SENSITIVE_FIELDS = new Set([
  "password",
  "password_hash",
  "token",
  "refreshToken",
  "refresh_token",
  "accessToken",
  "access_token",
  "secret",
  "api_key",
  "apiKey",
  "authorization",
  "credit_card",
  "creditCard",
  "ssn",
  "bank_account",
  "bankAccount",
]);

/** Characters to show at start/end of masked values. */
const MASK_ANCHOR = 2;

/**
 * Deep-clone an object and mask sensitive fields.
 * Passwords → "****", tokens → "tok_****", others → "***".
 * Non-sensitive fields pass through unchanged.
 */
export function maskBody(body: unknown): unknown {
  if (body === null || body === undefined) return body;
  if (typeof body !== "object") return body;

  if (Array.isArray(body)) {
    return body.map((item) => maskBody(item));
  }

  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_FIELDS.has(key) || SENSITIVE_FIELDS.has(lowerKey)) {
      // Keep a hint of the value for debugging (first/last 2 chars)
      if (typeof value === "string" && value.length > MASK_ANCHOR * 2) {
        masked[key] = `${value.slice(0, MASK_ANCHOR)}****${value.slice(-MASK_ANCHOR)}`;
      } else if (typeof value === "string") {
        masked[key] = "****";
      } else {
        masked[key] = "[MASKED]";
      }
    } else if (typeof value === "object" && value !== null) {
      masked[key] = maskBody(value);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

// ---------------------------------------------------------------------------
// Request-scoped logger helper — attaches context to every log in a request
// ---------------------------------------------------------------------------

export interface RequestLogContext {
  requestId?: string;
  userId?: string;
  userRole?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  [key: string]: unknown;
}

export function reqLogger(ctx: RequestLogContext) {
  return {
    info: (msg: string, extra?: Record<string, unknown>) =>
      log("info", msg, { ...ctx, ...extra }),
    warn: (msg: string, extra?: Record<string, unknown>) =>
      log("warn", msg, { ...ctx, ...extra }),
    error: (msg: string, extra?: Record<string, unknown>) =>
      log("error", msg, { ...ctx, ...extra }),
    debug: (msg: string, extra?: Record<string, unknown>) =>
      log("debug", msg, { ...ctx, ...extra }),
  };
}
