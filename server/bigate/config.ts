/**
 * Configuration for the Bigate Gateway integration.
 *
 * Everything secret lives here and is read from the process environment only.
 * The variables are deliberately NOT prefixed with VITE_: Vite inlines every
 * VITE_* variable into the JavaScript it ships to the browser, so a VITE_-prefixed
 * Bigcode or service-role key would be readable by anyone who opens developer
 * tools. Only server processes read these names, and `server/index.ts` is the only
 * thing bundled into the Node process.
 *
 * Validation collects every problem before throwing, so a misconfigured deploy
 * reports all of them at once instead of one per restart.
 */
import { BigateError } from "./errors";

export type Env = Record<string, string | undefined>;

export type BigateConfig = {
  /** Gateway root, e.g. https://api.bigate.example/v1. Must be https. */
  baseUrl: string;
  /** Credential Bigate expects in the Authorization header. */
  bigcode: string;
  /**
   * Authorization scheme, sent as `Authorization: <scheme> <bigcode>`.
   * The account documentation this integration was written against uses
   * "Bigcode"; if the gateway expects "Bearer", set BIGATE_AUTH_SCHEME=Bearer
   * rather than editing code.
   */
  authScheme: string;
  /** Bigate account identifier sent with every request and in the payload. */
  accountId: string;
  /**
   * Shared secret used to verify webhook signatures (HMAC-SHA256).
   * Null means "not configured", which the webhook route treats as a
   * misconfiguration rather than as permission to accept anything.
   */
  webhookSecret: string | null;
  /** Optional CIDR-free allowlist of source IPs, comma separated, empty = allow all. */
  webhookIpAllowlist: string[];
  /** Budget for a single request including connection setup. */
  requestTimeoutMs: number;
  /** Extra attempts for idempotent calls. Shipment creation overrides this. */
  retryAttempts: number;
  /** Fallback courier when a call does not name one, e.g. JNT or FLASH. */
  defaultCourierCode: string;
  /** Optional default service level within the courier. */
  defaultServiceCode: string | null;
  /**
   * Hosts permitted to appear in a stored waybill PDF link. Empty = any https
   * host. Set it in production so a compromised or misconfigured gateway response
   * cannot hand staff a link to somewhere else.
   */
  waybillHostAllowlist: string[];
  /** Supabase project URL for the server-side client. */
  supabaseUrl: string;
  /** Service-role key. Bypasses RLS, so it must never reach the browser. */
  supabaseServiceRoleKey: string;
};

function text(env: Env, key: string): string {
  const value = env[key];
  return typeof value === "string" ? value.trim() : "";
}

function readRequired(env: Env, key: string, problems: string[]): string {
  const value = text(env, key);
  if (!value) problems.push(`${key} is required but empty or unset`);
  return value;
}

function readInteger(
  env: Env,
  key: string,
  fallback: number,
  bounds: { min: number; max: number },
  problems: string[],
): number {
  const raw = text(env, key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < bounds.min || parsed > bounds.max) {
    problems.push(`${key} must be a whole number between ${bounds.min} and ${bounds.max} (received "${raw}")`);
    return fallback;
  }
  return parsed;
}

function readList(env: Env, key: string): string[] {
  return text(env, key)
    .split(",")
    .map(entry => entry.trim().toLowerCase())
    .filter(entry => entry.length > 0);
}

/** Accepts an https URL only: the credential travels in a header on every call. */
function readHttpsUrl(raw: string, key: string, problems: string[]): string {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") {
      problems.push(`${key} must use https, received "${url.protocol}//"`);
      return raw;
    }
    // A trailing slash keeps `new URL("orders", base)` from dropping the last path
    // segment of a base that includes one, e.g. .../api/v1.
    return raw.endsWith("/") ? raw : `${raw}/`;
  } catch {
    problems.push(`${key} must be an absolute URL (received "${raw}")`);
    return raw;
  }
}

export function loadBigateConfig(env: Env = process.env): BigateConfig {
  const problems: string[] = [];

  const baseUrl = readHttpsUrl(readRequired(env, "BIGATE_BASE_URL", problems), "BIGATE_BASE_URL", problems);
  const bigcode = readRequired(env, "BIGATE_BIGCODE", problems);
  const accountId = readRequired(env, "BIGATE_ACCOUNT_ID", problems);
  const supabaseUrl = readHttpsUrl(readRequired(env, "SUPABASE_URL", problems), "SUPABASE_URL", problems);
  const supabaseServiceRoleKey = readRequired(env, "SUPABASE_SERVICE_ROLE_KEY", problems);
  const defaultCourierCode = readRequired(env, "BIGATE_DEFAULT_COURIER_CODE", problems);

  if (bigcode.length > 0 && bigcode.length < 12) {
    problems.push("BIGATE_BIGCODE looks too short to be a real credential");
  }
  if (bigcode.length > 0 && /[\s"']/.test(bigcode)) {
    problems.push("BIGATE_BIGCODE must not contain whitespace or quote characters");
  }
  if (/\s/.test(defaultCourierCode)) {
    problems.push("BIGATE_DEFAULT_COURIER_CODE must not contain whitespace");
  }

  const config: BigateConfig = {
    baseUrl,
    bigcode,
    authScheme: text(env, "BIGATE_AUTH_SCHEME") || "Bigcode",
    accountId,
    // An unset secret is a configuration error, not an opt-out: the webhook route
    // checks for null and refuses the request.
    webhookSecret: text(env, "BIGATE_WEBHOOK_SECRET") || null,
    webhookIpAllowlist: readList(env, "BIGATE_WEBHOOK_IP_ALLOWLIST"),
    requestTimeoutMs: readInteger(env, "BIGATE_REQUEST_TIMEOUT_MS", 15000, { min: 1000, max: 120000 }, problems),
    retryAttempts: readInteger(env, "BIGATE_RETRY_ATTEMPTS", 2, { min: 1, max: 5 }, problems),
    defaultCourierCode,
    defaultServiceCode: text(env, "BIGATE_DEFAULT_SERVICE_CODE") || null,
    waybillHostAllowlist: readList(env, "BIGATE_WAYBILL_HOST_ALLOWLIST"),
    supabaseUrl,
    supabaseServiceRoleKey,
  };

  if (problems.length > 0) {
    throw new BigateError({
      kind: "config",
      userMessage: `Bigate integration is not configured: ${problems.join("; ")}`,
      issues: problems.map(problem => ({ path: "env", message: problem })),
    });
  }

  return config;
}

let cached: BigateConfig | null = null;

/**
 * Memoised so the environment is parsed once per process. Throws a `config`
 * BigateError when the deployment is incomplete; callers decide whether that is
 * fatal (the webhook route answers 503) or expected (the storefront, which does
 * not use logistics).
 */
export function getBigateConfig(): BigateConfig {
  if (!cached) cached = loadBigateConfig();
  return cached;
}

/** Test seam: lets a test supply its own environment. */
export function resetBigateConfigCache(): void {
  cached = null;
}

/** Redacted description for /health and for boot logs. Contains no secrets. */
export function describeBigateConfig(config: BigateConfig): Record<string, unknown> {
  return {
    base_url: config.baseUrl,
    account_id: config.accountId,
    auth_scheme: config.authScheme,
    bigcode_present: config.bigcode.length > 0,
    webhook_signature_configured: config.webhookSecret !== null,
    webhook_ip_allowlist_size: config.webhookIpAllowlist.length,
    request_timeout_ms: config.requestTimeoutMs,
    retry_attempts: config.retryAttempts,
    default_courier_code: config.defaultCourierCode,
    default_service_code: config.defaultServiceCode,
    waybill_host_allowlist: config.waybillHostAllowlist,
  };
}

export function isProduction(env: Env = process.env): boolean {
  return text(env, "NODE_ENV") === "production";
}
