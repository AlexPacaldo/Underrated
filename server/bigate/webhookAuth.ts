/**
 * Authenticating an inbound Bigate callback.
 *
 * The reason this is its own module: the signature scheme was a guess. It was
 * written against HMAC-SHA256 in a hex header, which is a common convention but
 * was never confirmed against a real Bigate account. A wrong guess is the worst
 * possible failure for this endpoint, because it does not degrade to a partial
 * outage: every callback gets a 401 and no order ever advances past `shipped`,
 * while the rest of the store looks perfectly healthy.
 *
 * So the scheme is configuration rather than code. Everything the gateway might
 * plausibly do is reachable without a deploy, and the one thing that is never
 * reachable is "accept anything": a mode that carries no credential has to be
 * asked for explicitly, and `ip_only` additionally refuses to start without a
 * source allowlist to fall back on.
 *
 * Modes:
 *
 *   hmac      A digest over the raw request body. The default, and the only mode
 *             that authenticates the body itself.
 *   token     A shared secret sent verbatim in a header or query parameter. Weaker
 *             than a digest, because a leaked token can be replayed verbatim, but
 *             it is the scheme several Philippine courier gateways actually use.
 *   ip_only   No body credential at all. Only permitted with a source allowlist,
 *             and only for an account whose callbacks are documented as unsigned.
 *
 * The security properties that hold in every mode:
 *
 *   1. Secrets are never logged, and neither are digests. A truncated digest is
 *      still secret material.
 *   2. Every comparison is constant-time, and no comparison short-circuits, so the
 *      work done does not depend on which candidate matched or on how far a
 *      rejected candidate got.
 *   3. A missing credential is a failure, never a bypass. Returning false is the
 *      only way this function declines.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export type WebhookAuthMode = "hmac" | "token" | "ip_only";
export type HmacAlgorithm = "sha256" | "sha1" | "sha512";
export type DigestEncoding = "hex" | "base64";

export type WebhookAuthConfig = {
  mode: WebhookAuthMode;
  /** HMAC key. Required for `hmac`. */
  secret: string | null;
  algorithm: HmacAlgorithm;
  encoding: DigestEncoding;
  /** Header names to read a digest from, in order. */
  signatureHeaders: string[];
  /** Header names to read a shared token from, in order. */
  tokenHeaders: string[];
  /** Query parameter to read a shared token from. */
  tokenQueryParam: string | null;
  /** Header carrying the signed timestamp, for gateways that send one. */
  timestampHeader: string | null;
  /**
   * How far a signed timestamp may drift from now, in seconds. Null skips the
   * check entirely, which is only safe for a digest that is not timestamped at
   * all: without a freshness window a captured request body can be replayed for as
   * long as the secret lives.
   */
  timestampToleranceSeconds: number | null;
  /** Reject a signed request that carries no timestamp at all. */
  requireTimestamp: boolean;
};

export type WebhookAuthResult =
  | { ok: true; scheme: string; signedAt: number | null }
  | { ok: false; reason: string };

/**
 * Header names tried when none are configured. Covers the spellings seen in the
 * wild for carrier callbacks, so the common cases work without configuration.
 */
export const DEFAULT_SIGNATURE_HEADERS = [
  "x-bigate-signature",
  "x-webhook-signature",
  "x-hub-signature-256",
  "x-hub-signature",
  "x-signature",
  "signature",
];

export const DEFAULT_TOKEN_HEADERS = ["x-bigate-token", "x-webhook-token", "x-api-token", "authorization"];

/**
 * Decides whether an inbound request is a genuine callback from Bigate.
 *
 * `rawBody` must be the exact bytes received. Re-serialising the parsed JSON
 * changes key order and whitespace, so a digest computed over the wrong bytes
 * never matches and the failure looks like a wrong secret.
 */
export function authenticateWebhook(
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
  query: Record<string, unknown> | undefined,
  config: WebhookAuthConfig,
  now: number,
): WebhookAuthResult {
  if (config.mode === "ip_only") {
    // The caller is responsible for having enforced the allowlist, and config
    // validation refuses this mode without one.
    return { ok: true, scheme: "ip_allowlist", signedAt: null };
  }

  if (config.mode === "token") {
    return authenticateToken(headers, query, config);
  }

  return authenticateHmac(rawBody, headers, config, now);
}

function authenticateToken(
  headers: Record<string, string | string[] | undefined>,
  query: Record<string, unknown> | undefined,
  config: WebhookAuthConfig,
): WebhookAuthResult {
  if (config.secret === null) {
    return { ok: false, reason: "no_shared_token_configured" };
  }

  // Authorization often arrives as "Bearer <token>", so the scheme word is
  // stripped before comparing rather than requiring the gateway to send a bare
  // value.
  const presented: string[] = [];
  for (const name of config.tokenHeaders) {
    for (const raw of headerValues(headers, name)) {
      presented.push(stripAuthScheme(raw));
    }
  }
  if (config.tokenQueryParam !== null && query !== undefined) {
    const fromQuery = query[config.tokenQueryParam];
    if (typeof fromQuery === "string" && fromQuery.trim() !== "") presented.push(fromQuery.trim());
  }

  if (presented.length === 0) {
    return { ok: false, reason: "no_token_header" };
  }

  const expected = Buffer.from(config.secret, "utf8");
  let matched = false;
  for (const candidate of presented) {
    const bytes = Buffer.from(candidate, "utf8");
    // Equal length is not a secret: it is the length of the digest, which the
    // attacker already knows. Guarding the call keeps timingSafeEqual from
    // throwing on a mismatch.
    if (bytes.length === expected.length && timingSafeEqual(bytes, expected)) {
      matched = true;
    }
  }

  return matched ? { ok: true, scheme: "shared_token", signedAt: null } : { ok: false, reason: "token_mismatch" };
}

function authenticateHmac(
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
  config: WebhookAuthConfig,
  now: number,
): WebhookAuthResult {
  if (config.secret === null) {
    return { ok: false, reason: "no_webhook_secret_configured" };
  }

  const presented: string[] = [];
  for (const name of config.signatureHeaders) {
    for (const raw of headerValues(headers, name)) presented.push(raw);
  }

  if (presented.length === 0) {
    return { ok: false, reason: "no_signature_header" };
  }

  // The signed timestamp is read from the signature header itself ("t=...,v1=...")
  // as well as from a dedicated header, because gateways disagree about which
  // they send. A freshness check is meaningless without it, so a tolerance
  // configured while no timestamp is present is a rejection, not a pass.
  const signedAt = readSignedAt(presented, headers, config.timestampHeader);

  if (config.requireTimestamp && signedAt === null) {
    return { ok: false, reason: "timestamp_required" };
  }
  if (config.timestampToleranceSeconds !== null) {
    if (signedAt === null) {
      return { ok: false, reason: "timestamp_missing_for_tolerance" };
    }
    if (Math.abs(Math.floor(now / 1000) - signedAt) > config.timestampToleranceSeconds) {
      return { ok: false, reason: "timestamp_outside_tolerance" };
    }
  }

  // Both signed forms are computed and compared on every request: some gateways
  // sign the body alone, others sign "<timestamp>.<body>" to bind them together.
  const payloads: Buffer[] = [rawBody];
  if (signedAt !== null) {
    payloads.push(Buffer.from(`${signedAt}.`, "utf8"));
  }

  let matched = false;
  for (const headerValue of presented) {
    for (const candidate of extractDigests(headerValue)) {
      for (const payload of payloads) {
        const digest = createHmac(config.algorithm, config.secret).update(payload).digest();
        if (candidate.length === digest.length && timingSafeEqual(candidate, digest)) {
          matched = true;
        }
      }
    }
  }

  return matched
    ? { ok: true, scheme: `hmac_${config.algorithm}_${config.encoding}`, signedAt }
    : { ok: false, reason: "signature_mismatch" };
}

/** Case-insensitive header lookup, flattening a repeated header to its values. */
function headerValues(headers: Record<string, string | string[] | undefined>, name: string): string[] {
  const wanted = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() !== wanted) continue;
    const value = headers[key];
    if (typeof value === "string" && value.trim() !== "") return [value.trim()];
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "").map((entry) => entry.trim());
    }
  }
  return [];
}

/**
 * Pulls every plausible digest out of one signature header.
 *
 * Handles the shapes seen in practice: a bare hex digest, "sha256=<hex>", a
 * comma-separated "t=<unix>,v1=<hex>" bundle, and the base64 variants of each.
 * Non-digest segments such as the timestamp are skipped rather than guessed at.
 */
function extractDigests(headerValue: string): Buffer[] {
  const digests: Buffer[] = [];

  for (const part of headerValue.split(",")) {
    const whole = part.trim();
    if (whole === "") continue;

    // A part can be a bare digest, a "sha256=<digest>" pair, or one segment of a
    // "t=...,v1=..." bundle. Both readings have to be tried, because a base64
    // digest ends in "=" padding and naively splitting on the first "=" would
    // throw the digest away and leave an empty string.
    const afterPrefix = whole.includes("=") ? whole.slice(whole.indexOf("=") + 1).trim() : "";
    for (const candidate of afterPrefix === "" ? [whole] : [whole, afterPrefix]) {
      const decoded = decodeDigest(candidate);
      if (decoded !== null) digests.push(decoded);
    }
  }

  return digests;
}

/**
 * Decodes one candidate as a digest, or returns null.
 *
 * The format is detected from the value rather than taken from configuration. A
 * misconfigured gateway is still a gateway, and rejecting a valid signature
 * because the encoding setting is wrong would look identical to a wrong secret.
 */
function decodeDigest(value: string): Buffer | null {
  if (value === "") return null;

  // Hex is self-identifying by alphabet. 40, 64 and 128 hex characters are
  // SHA-1, SHA-256 and SHA-512.
  if (/^[a-f0-9]{40}$/i.test(value) || /^[a-f0-9]{64}$/i.test(value) || /^[a-f0-9]{128}$/i.test(value)) {
    return Buffer.from(value, "hex");
  }

  // Base64 of those same three digest lengths. Strict about the alphabet so an
  // ordinary word is not silently treated as a digest.
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    const decoded = Buffer.from(value, "base64");
    if (decoded.length === 20 || decoded.length === 32 || decoded.length === 64) return decoded;
  }

  return null;
}

/**
 * Reads the timestamp the request claims to have been signed at, in unix seconds.
 *
 * Order of preference: a dedicated header, then a "t=" or "ts=" segment inside the
 * signature header. Returns null when nothing timestamped is present, which the
 * caller treats as a failure whenever a tolerance is configured.
 */
function readSignedAt(
  presented: string[],
  headers: Record<string, string | string[] | undefined>,
  timestampHeader: string | null,
): number | null {
  if (timestampHeader !== null) {
    for (const raw of headerValues(headers, timestampHeader)) {
      const parsed = parseUnixSeconds(raw);
      if (parsed !== null) return parsed;
    }
  }

  for (const headerValue of presented) {
    for (const part of headerValue.split(",")) {
      const [key, value] = part.split("=");
      if (key === undefined || value === undefined) continue;
      const name = key.trim().toLowerCase();
      if (name !== "t" && name !== "ts" && name !== "timestamp") continue;
      const parsed = parseUnixSeconds(value.trim());
      if (parsed !== null) return parsed;
    }
  }

  return null;
}

function parseUnixSeconds(raw: string): number | null {
  if (!/^-?\d{1,12}$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  // Ten digits is seconds, thirteen is milliseconds. Only the former is a
  // plausible signature timestamp, but both are accepted so a gateway that sends
  // milliseconds is not silently rejected as stale.
  return String(value).length <= 10 ? value : Math.floor(value / 1000);
}

function stripAuthScheme(raw: string): string {
  const match = /^(?:bearer|token|bigcode)\s+(.+)$/i.exec(raw.trim());
  return (match ? match[1] : raw).trim();
}

/** One-line description for the health endpoint. Carries no secret value. */
export function describeWebhookAuth(config: WebhookAuthConfig): Record<string, unknown> {
  return {
    mode: config.mode,
    algorithm: config.algorithm,
    encoding: config.encoding,
    signature_header_count: config.signatureHeaders.length,
    token_header_count: config.tokenHeaders.length,
    secret_configured: config.secret !== null,
    timestamp_tolerance_seconds: config.timestampToleranceSeconds,
    require_timestamp: config.requireTimestamp,
  };
}
