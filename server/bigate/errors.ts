/**
 * Error types for the Bigate Gateway integration.
 *
 * Design choices worth keeping:
 *
 * 1. One class, discriminated by `kind`, instead of a deep subclass hierarchy.
 *    The project compiles with no explicit `target` in tsconfig.json, so TypeScript
 *    downlevels to ES5. When `class X extends Error` is downlevelled, the
 *    prototype chain is lost and `instanceof X` silently returns false, which is the
 *    classic way extended built-ins break at runtime. A discriminant survives
 *    downlevelling, survives JSON serialisation, and survives crossing a module or
 *    process boundary, so `kind` is what callers switch on. `isBigateError` is
 *    offered for convenience and works at any target.
 *
 * 2. `userMessage` is written for a human who needs to fix something: a store
 *    operator or a developer, not an end customer. It never contains the Bigcode,
 *    the webhook secret, or a full upstream body. `toLogFields` is the redacted
 *    view for structured logs.
 *
 * 3. `retryable` is an explicit property rather than something callers infer from
 *    the message. A timeout or a 503 is worth another attempt; a 400 means the
 *    payload is wrong and another identical attempt will fail identically.
 */

/** Machine-readable failure classes. Switch on these, never on message text. */
export type BigateErrorKind =
  /** Environment variables are missing or malformed. Fix the deployment. */
  | "config"
  /** The Bigcode was rejected: 401, 403, or a gateway auth error body. */
  | "auth"
  /** Our own request or an inbound webhook failed validation before any call. */
  | "validation"
  /** The connection or the first byte took longer than the configured budget. */
  | "timeout"
  /** Upstream asked us to slow down: HTTP 429. */
  | "rate_limited"
  /** Upstream answered with a 4xx/5xx we cannot interpret as success. */
  | "upstream"
  /** DNS, TCP or TLS failure. The request may or may not have been received. */
  | "network"
  /** A 2xx response whose body was not the JSON shape we require. */
  | "malformed_response";

/** A single field-level complaint, used for request validation failures. */
export type BigateFieldIssue = {
  /** Dotted path into the payload, e.g. `receiver.geo.lat`. */
  path: string;
  message: string;
};

export type BigateErrorOptions = {
  kind: BigateErrorKind;
  /** HTTP status from upstream, when there was one. */
  status?: number | null;
  /** True only when an identical retry could plausibly succeed. */
  retryable?: boolean;
  /** What the caller should do about it, in plain language. */
  userMessage?: string;
  /** Raw upstream body or parsed payload, for logs. Never logged raw tokens. */
  details?: unknown;
  issues?: BigateFieldIssue[];
  /** Milliseconds to wait, when the gateway said so (HTTP 429). */
  retryAfterMs?: number | null;
  cause?: unknown;
};

export class BigateError extends Error {
  readonly kind: BigateErrorKind;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly userMessage: string;
  readonly details: unknown;
  readonly issues: BigateFieldIssue[];
  /** Set when the gateway told us how long to wait, so backoff can respect it. */
  readonly retryAfterMs: number | null;

  constructor(options: BigateErrorOptions) {
    super(options.userMessage ?? defaultUserMessage(options.kind));
    // Restores `instanceof BigateError` after the ES5 downlevel described above.
    Object.setPrototypeOf(this, BigateError.prototype);
    this.name = "BigateError";
    this.kind = options.kind;
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
    this.userMessage = options.userMessage ?? defaultUserMessage(options.kind);
    this.details = options.details ?? null;
    this.issues = options.issues ?? [];
    this.retryAfterMs = options.retryAfterMs ?? null;
    if (options.cause !== undefined) this.cause = options.cause;
  }

  /**
   * Flat, already-redacted object for `console.error(JSON.stringify(...))`.
   * Returns nothing secret, so it is safe to paste into a log aggregator.
   */
  toLogFields(): Record<string, unknown> {
    return {
      error: this.name,
      kind: this.kind,
      status: this.status,
      retryable: this.retryable,
      retry_after_ms: this.retryAfterMs,
      user_message: this.userMessage,
      issues: this.issues.length > 0 ? this.issues : undefined,
      // Truncated because an upstream error page can be a full HTML document.
      details: summarise(this.details),
      cause: this.cause instanceof Error ? this.cause.message : undefined,
    };
  }
}

function defaultUserMessage(kind: BigateErrorKind): string {
  switch (kind) {
    case "config":
      return "The logistics integration is not configured. Set the missing server environment variables and restart the server.";
    case "auth":
      return "Bigate rejected the Bigcode. Check BIGATE_BIGCODE, BIGATE_ACCOUNT_ID and that the credential is still active.";
    case "validation":
      return "The shipment data is incomplete or out of range. Fix the highlighted fields and try again.";
    case "timeout":
      return "Bigate did not respond in time. The request may still have been processed, so check for a duplicate shipment before retrying.";
    case "rate_limited":
      return "Bigate is rate limiting this account. The request will be retried after the interval Bigate asked for.";
    case "upstream":
      return "Bigate returned an error. The order was not created, so nothing needs to be reconciled by hand.";
    case "network":
      return "Could not reach Bigate. The outcome is unknown: Bigate may have received the request, so check the Bigate dashboard before retrying.";
    case "malformed_response":
      return "Bigate replied with a success status but the body was not usable JSON. The response shape needs to be checked against the current API contract.";
  }
}

export function isBigateError(value: unknown): value is BigateError {
  return value instanceof BigateError || (typeof value === "object" && value !== null && (value as { kind?: unknown }).kind !== undefined && (value as { name?: unknown }).name === "BigateError");
}

/** Turns a list of field issues into one sentence a human can act on. */
export function describeIssues(issues: BigateFieldIssue[]): string {
  if (issues.length === 0) return "No field issues were reported.";
  return issues.map(issue => `${issue.path}: ${issue.message}`).join("; ");
}

function summarise(details: unknown): string | null {
  if (details === null || details === undefined) return null;
  const text = typeof details === "string" ? details : safeStringify(details);
  if (text === null) return "[unserialisable]";
  return text.length > 1200 ? `${text.slice(0, 1200)}...[truncated]` : text;
}

function safeStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
