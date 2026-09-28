/**
 * Public HTTP surface for the Bigate Gateway.
 *
 * Design choices worth keeping:
 *
 * 1. Authentication is HMAC over the raw bytes, compared in constant time. The
 *    signature has to be computed over the exact body, which is why the JSON
 *    parser in `server/index.ts` stashes the raw buffer: re-serialising the parsed
 *    object changes key order and whitespace, and the digest will not match.
 *
 * 2. An unset webhook secret is a 503, never an open door. Failing closed is the
 *    only safe default for an endpoint whose job is to change order state.
 *
 * 3. Rate limiting is a small in-process token bucket, written here rather than
 *    pulled in as middleware: this is the only endpoint that needs it, and the
 *    bucket is small enough to read in one sitting. It is per process, so a
 *    multi-instance deployment must put a shared limiter at the edge. That is
 *    called out in the comment rather than left for someone to discover.
 *
 * 4. The handler acknowledges quickly. Bigate retries on a slow or non-2xx
 *    response, and every retry is deduplicated by the event id in Postgres, so
 *    there is no reason to hold the connection open while logging.
 *
 * 5. Callers get a short machine-readable code. The detailed reason goes to the
 *    log with a request id, so a bad event can be traced without leaking internal
 *    detail to whoever is calling the endpoint.
 */
import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { describeBigateConfig, getBigateConfig, type BigateConfig } from "../bigate/config";
import { BigateError, isBigateError } from "../bigate/errors";
import { BigateClient, type Logger } from "../bigate/client";
import { getServiceClient, applyTrackingEvent } from "../bigate/store";
import { formatTransitionLog, parseTrackingEvent, type TrackingEvent } from "../bigate/tracking";
import { authenticateWebhook } from "../bigate/webhookAuth";
import { requireAdmin, type AdminActor } from "../bigate/adminAuth";
import { bookOrderShipment, type BookingInput } from "../logistics/booking";

/**
 * Identifies this build of the logistics routes in /health.
 *
 * It exists to answer one operational question without reading the source: is the
 * deployed process actually running the code I think it is? A stale deploy is the
 * failure mode that costs the most time here, because the new routes simply 404
 * and the health endpoint keeps reporting a green configuration.
 */
export const LOGISTICS_ROUTES_VERSION = "2026-09-28.1";

/** Raw bodies, keyed by request. WeakMap so nothing is retained after the request. */
const rawBodies = new WeakMap<Request, Buffer>();

/**
 * `verify` hook for express.json(). Captures the bytes before parsing.
 * Usage in server/index.ts: `express.json({ limit: BODY_LIMIT, verify: captureRawBody })`
 */
export function captureRawBody(req: Request, _res: Response, buf: Buffer): void {
  rawBodies.set(req, buf);
}

/** Header carrying the HMAC digest. Overridable for gateways that differ. */
const SIGNATURE_HEADER = "x-bigate-signature";
const EVENT_ID_HEADER = "x-bigate-event-id";

export type LogisticsRouteOptions = {
  logger: Logger;
  /** Overridden in tests. */
  now?: () => number;
};
export function createLogisticsRouter(options: LogisticsRouteOptions): Router {
  const router = Router();
  const now = options.now ?? (() => Date.now());
  const limiter = new TokenBucketLimiter({ capacity: 120, refillPerMinute: 60, maxKeys: 10000 });
  // Cut-off for a booking. Longer than a tracking call because this one creates a
  // label; the abort still matters so the request cannot hang a browser tab
  // forever, and a timeout is reported honestly rather than retried.
  const BOOKING_TIMEOUT_MS = 30000;

  /**
   * Books a parcel for an order. Admin-only, and the only route here that needs a
   * user session.
   *
   * The body may contain parcel weight and dimensions, because the catalogue has
   * no shipping weight. It may not contain the address, the recipient, the items
   * or the amount to collect: those are read from the order, so no client can
   * redirect a parcel. See server/logistics/booking.ts.
   */
  router.post("/logistics/orders/:orderNumber/shipment", async (req: Request, res: Response) => {
    const startedAt = now();
    const orderNumber = String(req.params.orderNumber ?? "").trim();
    let actor: AdminActor;

    try {
      actor = await requireAdmin(req, getServiceClient(), options.logger);
    } catch (error) {
      // Missing or invalid session is 401; a real session without the role is 403.
      // The distinction tells an admin whether signing in again would help.
      const status = isBigateError(error) && error.issues.some(issue => issue.path === "role") ? 403 : 401;
      const message = isBigateError(error) ? error.userMessage : "Could not confirm your permissions.";
      res.status(status).json({ ok: false, code: status === 403 ? "not_admin" : "unauthenticated", detail: message });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const input: BookingInput = {
      weightKg: Number(body.weightKg),
      lengthCm: Number(body.lengthCm),
      widthCm: Number(body.widthCm),
      heightCm: Number(body.heightCm),
      courierCode: typeof body.courierCode === "string" ? body.courierCode : null,
      serviceCode: typeof body.serviceCode === "string" ? body.serviceCode : null,
      remarks: typeof body.remarks === "string" ? body.remarks : null,
    };

    try {
      const result = await bookOrderShipment(
        new BigateClient(getBigateConfig()),
        orderNumber,
        input,
        actor,
        options.logger,
        { signal: AbortSignal.timeout(BOOKING_TIMEOUT_MS) },
      );
      res.status(201).json({ ok: true, ...result });
    } catch (error) {
      const status = bookingErrorStatus(error);
      options.logger.error(
        { order_number: orderNumber, duration_ms: now() - startedAt, ...toLogFields(error) },
        "Could not book a Bigate shipment",
      );
      res.status(status).json({
        ok: false,
        code: isBigateError(error) ? error.kind : "unknown",
        detail: isBigateError(error) ? error.userMessage : "The shipment could not be booked.",
      });
    }
  });

  /**
   * Operational check. Reports whether the integration is configured without
   * revealing a single secret value, so it is safe to expose.
   */
  router.get("/logistics/health", (_req: Request, res: Response) => {
    try {
      const config = getBigateConfig();
      res.status(200).json({
        configured: true,
        // If this does not match the version in the repository, the process is
        // running an older build and the webhook route may not exist yet.
        routes_version: LOGISTICS_ROUTES_VERSION,
        ...describeBigateConfig(config),
      });
    } catch (error) {
      // Misconfiguration is reported in full, because the person reading this is
      // the operator trying to fix the deployment. No secret value appears in
      // the error text: the config validator names variables, never their values.
      const message = isBigateError(error) ? error.userMessage : "The logistics integration is misconfigured.";
      res.status(503).json({ configured: false, routes_version: LOGISTICS_ROUTES_VERSION, detail: message });
    }
  });

  /**
   * Bigate live-tracking callback. No session, no rider cookie: the signature is
   * the credential.
   */
  router.post("/logistics/bigate/webhook", async (req: Request, res: Response) => {
    const startedAt = now();
    // Correlation id for the log line only. Never derived from the signature: a
    // truncated digest is secret material and does not belong in a log store.
    const requestId = headerOr(req, EVENT_ID_HEADER) ?? randomUUID();
    let config: BigateConfig;

    // 1. Configuration. Refuse rather than accept unauthenticated writes.
    try {
      config = getBigateConfig();
    } catch (error) {
      options.logger.error({ request_id: requestId, ...toLogFields(error) }, "Bigate webhook rejected: integration not configured");
      res.status(503).json({ ok: false, code: "not_configured" });
      return;
    }

    // 2. Source allowlist. Checked before anything else and required outright in
    //    ip_only mode, where it is the only thing authenticating the caller. The
    //    config validator already refuses ip_only without one, so an empty
    //    allowlist here means the process is running a build that skipped it.
    const clientIp = clientIpOf(req);
    const allowlistConfigured = config.webhookIpAllowlist.length > 0;
    if (!allowlistConfigured && config.webhookAuth.mode === "ip_only") {
      options.logger.error({ request_id: requestId, client_ip: clientIp }, "Bigate webhook rejected: ip_only mode with no source allowlist");
      res.status(503).json({ ok: false, code: "ip_allowlist_missing" });
      return;
    }
    if (allowlistConfigured && !config.webhookIpAllowlist.includes(clientIp)) {
      options.logger.warn({ request_id: requestId, client_ip: clientIp }, "Bigate webhook rejected: source address is not on the allowlist");
      res.status(403).json({ ok: false, code: "ip_not_allowed" });
      return;
    }

    // 3. Rate limit before doing any work, so a flood cannot reach the database.
    if (!limiter.take(clientIp, now())) {
      options.logger.warn({ request_id: requestId, client_ip: clientIp }, "Bigate webhook rate limited");
      res.status(429).json({ ok: false, code: "rate_limited" });
      return;
    }

    // 4. Authenticate the sender. The scheme is configuration, not code, because
    //    it was written against a guess: see server/bigate/webhookAuth.ts.
    const rawBody = rawBodies.get(req) ?? Buffer.alloc(0);
    const auth = authenticateWebhook(
      rawBody,
      req.headers as Record<string, string | string[] | undefined>,
      req.query as Record<string, unknown>,
      config.webhookAuth,
      now(),
    );

    if (!auth.ok) {
      // The reason is logged, not returned: it names the header we expected, and
      // that is a free description of our own defences.
      options.logger.warn(
        { request_id: requestId, client_ip: clientIp, bytes: rawBody.length, reason: auth.reason, mode: config.webhookAuth.mode },
        "Bigate webhook rejected: sender could not be authenticated",
      );
      res.status(401).json({ ok: false, code: "bad_signature" });
      return;
    }

    // 5. Parse and validate. An unrecognised delivery state is kept, not dropped.
    let event: TrackingEvent;
    try {
      event = parseTrackingEvent(req.body);
    } catch (error) {
      options.logger.error({ request_id: requestId, client_ip: clientIp, ...toLogFields(error) }, "Bigate webhook rejected: body did not validate");
      // 400 tells Bigate the payload is wrong. Retrying an invalid body forever
      // helps nobody.
      res.status(400).json({ ok: false, code: "invalid_payload" });
      return;
    }

    // 6. Persist. Duplicates are a success: the provider is telling us something
    //    we already know, and answering 4xx would make it retry forever.
    try {
      const applied = await applyTrackingEvent(event);
      options.logger.info(
        {
          request_id: requestId,
          duration_ms: now() - startedAt,
          awb: event.awb,
          client_reference: event.clientReference,
          provider_state: event.rawState,
          state: event.state,
          duplicate: applied.duplicate,
          ignored_out_of_order: applied.ignoredOutOfOrder,
          order_status_changed_to: applied.orderStatusChangedTo,
        },
        formatTransitionLog(event, applied.previousStatus),
      );
      res.status(200).json({ ok: true, duplicate: applied.duplicate, state: event.state });
    } catch (error) {
      options.logger.error({ request_id: requestId, client_ip: clientIp, ...toLogFields(error) }, "Bigate webhook could not be recorded");
      // 500 asks Bigate to retry. The event id in Postgres makes the retry safe.
      res.status(500).json({ ok: false, code: "not_recorded" });
    }
  });

  return router;
}

function headerOr(req: Request, name: string): string | null {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * The connecting address, honouring one hop of X-Forwarded-For.
 *
 * `app.set("trust proxy", 1)` in server/index.ts is what makes that header
 * trustworthy; without it, a client could spoof its own IP and defeat the
 * allowlist and the rate limit. The left-most entry is the original client.
 */
function clientIpOf(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof first === "string" && first.trim() !== "") {
    const candidate = first.split(",")[0].trim();
    if (candidate !== "") return candidate.toLowerCase();
  }
  return (req.socket.remoteAddress ?? "unknown").toLowerCase();
}

function toLogFields(error: unknown): Record<string, unknown> {
  if (isBigateError(error)) return error.toLogFields();
  return {
    error: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
  };
}

/**
 * Maps an error to a status the admin UI can act on.
 *
 * The important distinction is 400 versus 409. A 400 means the parcel details are
 * wrong and staff should fix the form. A 409 means the order itself is not ready,
 * or already has a parcel, and retrying will not help. Both are the caller's
 * problem, and neither means the gateway is broken, so neither should be retried
 * by an intermediary.
 */
function bookingErrorStatus(error: unknown): number {
  if (!isBigateError(error)) return 500;
  switch (error.kind) {
    case "validation":
      return 400;
    case "auth":
      return 502;
    case "timeout":
      // Deliberately 504 and not a retryable-looking 5xx on the Bigate side: the
      // label may well have been created, so the message tells staff to reconcile
      // rather than press the button again.
      return 504;
    case "upstream":
      return 502;
    case "network":
      return 502;
    case "config":
      return 503;
    default:
      return 500;
  }
}

/**
 * Fixed-capacity token bucket, keyed by client address.
 *
 * Per process by design: a single Node process is the deployment this server
 * supports today. Before running more than one instance, put a shared limiter at
 * the proxy, because a per-process bucket multiplies the effective limit by the
 * instance count and, worse, lets a caller spread a flood across instances.
 */
class TokenBucketLimiter {
  private readonly buckets = new Map<string, { tokens: number; updatedAt: number }>();

  constructor(private readonly options: { capacity: number; refillPerMinute: number; maxKeys: number }) {}

  take(key: string, now: number): boolean {
    this.sweep(now);
    const refillPerMs = this.options.refillPerMinute / 60000;
    const existing = this.buckets.get(key);

    if (!existing) {
      this.buckets.set(key, { tokens: this.options.capacity - 1, updatedAt: now });
      return true;
    }

    const refilled = Math.min(this.options.capacity, existing.tokens + (now - existing.updatedAt) * refillPerMs);
    if (refilled < 1) {
      this.buckets.set(key, { tokens: refilled, updatedAt: now });
      return false;
    }

    this.buckets.set(key, { tokens: refilled - 1, updatedAt: now });
    return true;
  }

  /** Drops idle buckets so an attacker rotating addresses cannot grow the map. */
  private sweep(now: number): void {
    if (this.buckets.size < this.options.maxKeys) return;
    const staleBefore = now - 10 * 60000;
    const keys = Array.from(this.buckets.keys());
    for (const key of keys) {
      const bucket = this.buckets.get(key);
      if (!bucket || bucket.updatedAt < staleBefore) this.buckets.delete(key);
    }
    // Still oversized: the address space is being used actively, so cap it
    // rather than letting memory grow without bound.
    if (this.buckets.size >= this.options.maxKeys) {
      const overflow = keys.length - this.options.maxKeys / 2;
      for (let index = 0; index < overflow && index < keys.length; index += 1) {
        this.buckets.delete(keys[index]);
      }
    }
  }
}
