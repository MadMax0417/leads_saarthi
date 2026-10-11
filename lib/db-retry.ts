// Connection-resilience for Neon HTTP queries.
//
// The Neon serverless HTTP driver sends every query as a single fetch request
// and has no built-in retry. When the endpoint is briefly unreachable the
// fetch rejects and the driver throws:
//
//   NeonDbError: Error connecting to database: TypeError: fetch failed
//
// Observed triggers here: flaky DNS that intermittently answers NXDOMAIN for
// Neon's API host (`getaddrinfo ENOTFOUND`), plus scale-to-zero Neon computes
// waking up while the dashboard fires several queries in parallel. Drizzle
// wraps the driver error as "Failed query: ... params: ...", which hides the
// real cause, so retrying connection-level failures here turns a confusing
// error page into a slightly slower load.
//
// The backoff window is deliberately wider than a single blip (six attempts,
// roughly six seconds of waiting): multi-second DNS outages have been
// observed, and a user waiting a little longer beats a failed page render.
//
// A retry can only re-run a request whose response never arrived in time; a
// response lost mid-flight could in theory re-apply a write, but at-most-once
// semantics are impossible to guarantee cheaply here and the alternative is
// failing the request outright. Writes stay guarded by the schema's unique
// keys (e.g. `businesses.dedupe_key`, `lead_submission_items`).

const RETRYABLE_CODES = new Set([
  // Node/undici socket-level errors (including dual-stack connect races).
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "EPIPE",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "ENETUNREACH",
  "EHOSTUNREACH",
  // undici fetch error codes.
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

// `AbortSignal.timeout()` rejections surface as DOMExceptions with this name.
const RETRYABLE_NAMES = new Set(["TimeoutError"]);

const RETRYABLE_MESSAGES = [
  "error connecting to database", // NeonDbError wrapping a rejected fetch
  "fetch failed", // undici TypeError
  "socket hang up",
  "other side closed", // undici SocketError
  "connection terminated unexpectedly",
];

export type ConnectionRetryOptions = {
  /** Total attempts, including the first. Defaults to 6 (five retries). */
  attempts?: number;
  /** Delay before the first retry, doubled per attempt. Defaults to 300 ms. */
  baseDelayMs?: number;
  /** Upper bound for a single backoff delay. Defaults to 2000 ms. */
  maxDelayMs?: number;
  /** Called before each retry; use for server-side logging. */
  onRetry?: (info: { attempt: number; attempts: number; error: unknown }) => void;
};

export const DEFAULT_RETRY_ATTEMPTS = 6;
export const DEFAULT_RETRY_BASE_DELAY_MS = 300;
export const DEFAULT_RETRY_MAX_DELAY_MS = 2000;

/**
 * True when the error (or anything in its `cause` chain, including aggregate
 * errors) looks like a connection-stage failure rather than a query error.
 * Anything else - SQL syntax, constraints, auth - must fail fast and unmangled.
 */
export function isConnectionFailure(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 6) return false;

  const candidate = error as {
    code?: unknown;
    name?: unknown;
    message?: unknown;
    errors?: unknown;
    cause?: unknown;
    sourceError?: unknown;
  };

  if (typeof candidate.code === "string" && RETRYABLE_CODES.has(candidate.code)) {
    return true;
  }

  if (typeof candidate.name === "string" && RETRYABLE_NAMES.has(candidate.name)) {
    return true;
  }

  if (typeof candidate.message === "string") {
    const message = candidate.message.toLowerCase();
    if (RETRYABLE_MESSAGES.some((fragment) => message.includes(fragment))) {
      return true;
    }
  }

  if (Array.isArray(candidate.errors) &&
    candidate.errors.some((nested) => isConnectionFailure(nested, depth + 1))) {
    return true;
  }

  if (isConnectionFailure(candidate.sourceError, depth + 1)) return true;

  return isConnectionFailure(candidate.cause, depth + 1);
}

/** Short human-readable reason for a connection failure, for log lines. */
export function describeConnectionFailure(error: unknown, depth = 0): string {
  if (!error || typeof error !== "object" || depth > 6) return "unknown error";

  const candidate = error as {
    code?: unknown;
    name?: unknown;
    message?: unknown;
    errors?: unknown;
    cause?: unknown;
    sourceError?: unknown;
  };

  // Walk to the deepest cause first: "ENOTFOUND" is more useful than the
  // generic "Error connecting to database: TypeError: fetch failed" wrapper.
  if (Array.isArray(candidate.errors)) {
    for (const nested of candidate.errors) {
      const detail = describeConnectionFailure(nested, depth + 1);
      if (detail !== "unknown error") return detail;
    }
  }

  const sourceDetail = describeConnectionFailure(candidate.sourceError, depth + 1);
  if (sourceDetail !== "unknown error") return sourceDetail;

  const nestedCause = describeConnectionFailure(candidate.cause, depth + 1);
  if (nestedCause !== "unknown error") return nestedCause;

  if (typeof candidate.code === "string" && RETRYABLE_CODES.has(candidate.code)) {
    return candidate.code;
  }
  if (typeof candidate.name === "string" && RETRYABLE_NAMES.has(candidate.name)) {
    return "request timeout";
  }
  if (typeof candidate.message === "string") {
    const message = candidate.message.toLowerCase();
    if (RETRYABLE_MESSAGES.some((fragment) => message.includes(fragment))) {
      return candidate.message.slice(0, 160);
    }
  }
  return "unknown error";
}

/**
 * Runs `operation`, retrying only connection-level failures with exponential
 * backoff plus jitter. Query errors propagate immediately and unchanged.
 */
export async function withConnectionRetry<T>(
  operation: () => Promise<T>,
  options: ConnectionRetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? DEFAULT_RETRY_ATTEMPTS);
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS;

  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts || !isConnectionFailure(error)) throw error;

      options.onRetry?.({ attempt, attempts, error });

      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jitter = Math.random() * backoff * 0.25;
      await new Promise((resolve) => setTimeout(resolve, backoff + jitter));
    }
  }
}
