/**
 * The single place that talks HTTP to Bigate.
 *
 * Design choices worth keeping:
 *
 * 1. No HTTP library and no middleware. Node 22 ships a WHATWG `fetch`, and the
 *    timeout is `AbortSignal.timeout`, so there is no dependency to audit and
 *    nothing to keep current. Adding axios or node-fetch here would only add
 *    interceptors and retry semantics that have to be reasoned about again.
 *
 * 2. Every credentialed request resolves its path against the configured base and
 *    then re-checks the origin. The Authorization header is attached before the
 *    request leaves, so a path or base that drifted to another host would leak the
 *    Bigcode. The check turns that into a configuration error.
 *
 * 3. Retries are opt-in per call and are off by default. A shipment creation that
 *    times out may still have been received, and blindly repeating it produces a
 *    second parcel. Callers that can prove idempotency (a read, or a POST carrying
 *    our own reference number) pass `attempts`; `createShipment` does not, and
 *    instead surfaces an unknown-outcome error for a human to reconcile.
 *
 * 4. Backoff is exponential with full jitter, and a 429's `Retry-After` wins over
 *    our own schedule. Full jitter avoids a fleet of servers retrying a recovering
 *    gateway in lockstep, which is how a rate limit turns into an outage.
 */
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import type { BigateConfig } from "./config";
import { BigateError, isBigateError } from "./errors";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH";

export type BigateRequest = {
  method: HttpMethod;
  /** Path relative to the configured base, e.g. "shipments". */
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /**
   * Total attempts including the first. 1 disables retrying. Only raise this for
   * a request that is safe to repeat.
   */
  attempts?: number;
  /**
   * Forwarded as `Idempotency-Key`. Bigate's contract for this header is not in
   * the documentation this was written from, so it is opt-in: set it once the
   * gateway is confirmed to honour it.
   */
  idempotencyKey?: string;
  /** Caller-side cancellation, combined with the configured timeout. */
  signal?: AbortSignal;
  /** Logged with the request and the response, for support conversations. */
  requestLabel?: string;
};

export type BigateCallResult<T> = {
  data: T;
  status: number;
  /** Echoed back for correlation; also used in the structured logs. */
  requestId: string;
  /** Milliseconds spent waiting on the gateway. */
  durationMs: number;
};

export type Logger = {
  info: (fields: Record<string, unknown>, message: string) => void;
  warn: (fields: Record<string, unknown>, message: string) => void;
  error: (fields: Record<string, unknown>, message: string) => void;
};

const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

export class BigateClient {
  private readonly baseOrigin: string;

  constructor(
    private readonly config: BigateConfig,
    private readonly logger: Logger = silentLogger,
  ) {
    this.baseOrigin = new URL(config.baseUrl).origin;
  }

  /**
   * @throws {BigateError} always, with `kind` describing the failure and
   * `retryable` saying whether another attempt could help.
   */
  async request<T>(request: BigateRequest): Promise<BigateCallResult<T>> {
    const attempts = Math.max(1, request.attempts ?? 1);
    let lastError: BigateError | null = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await this.attempt<T>(request, attempt);
      } catch (error) {
        const bigateError = error instanceof BigateError ? error : this.wrapUnexpected(error, request);
        lastError = bigateError;

        const canRetry = attempt < attempts && bigateError.retryable;
        if (!canRetry) throw bigateError;

        const waitMs = retryDelayMs(attempt, bigateError);
        this.logger.warn(
          {
            ...bigateError.toLogFields(),
            attempt,
            attempts,
            retry_in_ms: waitMs,
            request_label: request.requestLabel ?? null,
          },
          "Bigate request failed, retrying",
        );
        await sleep(waitMs);
      }
    }

    // Unreachable: the loop either returns or throws. Kept so the return type
    // stays honest without an `any` cast.
    throw lastError ?? new BigateError({ kind: "network" });
  }

  private async attempt<T>(request: BigateRequest, attempt: number): Promise<BigateCallResult<T>> {
    const url = this.buildUrl(request.path, request.query);
    const requestId = randomUUID();
    const timeoutSignal = AbortSignal.timeout(this.config.requestTimeoutMs);
    // any() lets a caller abort (a closing request, a shutting-down server) while
    // the timeout still applies.
    const signal = request.signal ? AbortSignal.any([timeoutSignal, request.signal]) : timeoutSignal;

    const headers: Record<string, string> = {
      // This is the only line in the codebase that reads the Bigcode.
      Authorization: `${this.config.authScheme} ${this.config.bigcode}`,
      Accept: "application/json",
      "User-Agent": `underrated-cycling-store/1.0 (+bigate-gateway)`,
      "X-Request-Id": requestId,
    };
    if (request.body !== undefined) headers["Content-Type"] = "application/json";
    if (request.idempotencyKey) headers["Idempotency-Key"] = request.idempotencyKey;

    const startedAt = Date.now();
    this.logger.info(
      { request_id: requestId, method: request.method, path: url.pathname, attempt, request_label: request.requestLabel ?? null },
      "Calling Bigate",
    );

    let response: Response;
    try {
      response = await fetch(url, {
        method: request.method,
        headers,
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        signal,
        redirect: "error",
      });
    } catch (error) {
      throw this.toTransportError(error, { requestId, url, timeoutSignal, request });
    }

    // Read once as text: the body stream can only be consumed a single time, and
    // an error page is far more informative than a parse failure.
    const rawBody = await response.text().catch(() => "");
    const durationMs = Date.now() - startedAt;

    this.logger.info(
      { request_id: requestId, status: response.status, duration_ms: durationMs, bytes: rawBody.length },
      "Bigate responded",
    );

    if (!response.ok) {
      throw this.toHttpError(response.status, rawBody, response.headers.get("retry-after"));
    }

    if (rawBody.trim() === "") {
      throw new BigateError({
        kind: "malformed_response",
        status: response.status,
        userMessage: `Bigate returned ${response.status} with an empty body where JSON was expected.`,
        details: null,
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch (error) {
      // A reverse proxy in front of the gateway will return HTML here.
      throw new BigateError({
        kind: "malformed_response",
        status: response.status,
        userMessage: `Bigate returned ${response.status} with a body that is not JSON. Something other than the gateway may be answering.`,
        details: rawBody.slice(0, 600),
        cause: error,
      });
    }

    return { data: parsed as T, status: response.status, requestId, durationMs };
  }

  /**
   * Resolves a path against the base and refuses to leave the configured origin.
   * The Authorization header is attached to whatever comes out of here, so this
   * is the guard that keeps the Bigcode on the host it belongs to.
   */
  private buildUrl(path: string, query?: BigateRequest["query"]): URL {
    const url = new URL(path.replace(/^\/+/, ""), this.config.baseUrl);
    if (url.origin !== this.baseOrigin) {
      throw new BigateError({
        kind: "config",
        userMessage: `Refusing to send the Bigcode to ${url.origin}: BIGATE_BASE_URL resolves requests to ${this.baseOrigin}.`,
      });
    }
    if (query) {
      const keys = Object.keys(query);
      for (const key of keys) {
        const value = query[key];
        if (value === undefined) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  }

  private toTransportError(
    error: unknown,
    context: { requestId: string; url: URL; timeoutSignal: AbortSignal; request: BigateRequest },
  ): BigateError {
    if (context.timeoutSignal.aborted) {
      return new BigateError({
        kind: "timeout",
        retryable: false,
        userMessage: `Bigate did not respond within ${this.config.requestTimeoutMs}ms. The request may have been processed; check the Bigate dashboard for a duplicate shipment before sending it again.`,
        details: { request_id: context.requestId, path: context.url.pathname },
        cause: error,
      });
    }
    if (isBigateError(error)) return error;
    const message = error instanceof Error ? error.message : String(error);
    // Deliberately not retryable: a socket error gives no way to tell whether the
    // request reached the gateway. A caller that has an idempotency key can decide
    // otherwise for itself.
    return new BigateError({
      kind: "network",
      retryable: false,
      userMessage: `Could not reach the Bigate gateway at ${context.url.origin}: ${message}. The outcome is unknown, so check for an existing shipment before retrying.`,
      details: { request_id: context.requestId, path: context.url.pathname },
      cause: error,
    });
  }

  private toHttpError(status: number, rawBody: string, retryAfterHeader: string | null): BigateError {
    const details = extractUpstreamMessage(rawBody) ?? rawBody.slice(0, 600);

    if (status === 401 || status === 403) {
      return new BigateError({
        kind: "auth",
        status,
        retryable: false,
        userMessage: `Bigate rejected the credential (HTTP ${status}). Check BIGATE_BIGCODE, BIGATE_ACCOUNT_ID, and that the account is still in good standing.`,
        details,
      });
    }

    if (status === 400 || status === 422) {
      return new BigateError({
        kind: "validation",
        status,
        retryable: false,
        // Upstream field complaints are the most useful thing in a 400, so pass
        // them through verbatim rather than replacing them with our own wording.
        userMessage: `Bigate rejected the shipment data (HTTP ${status}): ${details}`,
        details,
      });
    }

    if (status === 429) {
      const retryAfterMs = parseRetryAfterMs(retryAfterHeader);
      return new BigateError({
        kind: "rate_limited",
        status,
        retryable: true,
        retryAfterMs,
        userMessage: `Bigate is rate limiting this account (HTTP 429). Retry after ${retryAfterMs !== null ? `${retryAfterMs}ms` : "the backoff interval"}.`,
        details,
      });
    }

    return new BigateError({
      kind: "upstream",
      status,
      // 5xx is the gateway's problem and is worth another attempt; other 4xx are
      // our fault and would fail the same way again.
      retryable: status >= 500,
      userMessage: `Bigate returned HTTP ${status}: ${details}`,
      details,
    });
  }

  private wrapUnexpected(error: unknown, request: BigateRequest): BigateError {
    return new BigateError({
      kind: "network",
      retryable: false,
      userMessage: `Unexpected failure while calling Bigate for ${request.requestLabel ?? request.path}.`,
      details: null,
      cause: error,
    });
  }
}

/** Exponential backoff with full jitter, capped so a 5th attempt stays sane. */
function retryDelayMs(attempt: number, error: BigateError): number {
  // A rate limit's own instruction outranks our own schedule: retrying earlier
  // than we were told to is how a soft limit becomes a hard block.
  if (error.retryAfterMs !== null) return Math.min(error.retryAfterMs, 60000);
  const ceiling = Math.min(250 * 2 ** (attempt - 1), 8000);
  return Math.floor(Math.random() * ceiling);
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(header);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - Date.now());
}

/** Pulls a human message out of a gateway error body without dumping the whole thing. */
function extractUpstreamMessage(rawBody: string): string | null {
  if (!rawBody) return null;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    const candidate = findMessage(parsed);
    if (candidate) return candidate;
  } catch {
    // Not JSON. Fall through to the raw text.
  }
  return rawBody.trim().slice(0, 300) || null;
}

function findMessage(value: unknown, depth = 0): string | null {
  if (depth > 4 || typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  for (const key of ["message", "error_description", "error_message", "detail", "errors", "error"]) {
    const found = record[key];
    if (typeof found === "string" && found.trim() !== "") return found.trim();
    if (Array.isArray(found) && found.length > 0) {
      const first = found[0];
      if (typeof first === "string") return first.trim();
      if (typeof first === "object" && first !== null) {
        const nested = findMessage(first, depth + 1);
        if (nested) return nested;
      }
    }
  }
  return null;
}
