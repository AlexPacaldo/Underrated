/**
 * Admin authentication for the logistics booking endpoint.
 *
 * Why this exists: the webhook needs no session because the HMAC signature is its
 * credential, but *booking a parcel* costs money and ships a real object to a
 * real person. That call must never come from an anonymous request, so the
 * endpoint checks the caller's Supabase access token and their role.
 *
 * The storefront already holds a session, so the browser sends the same access
 * token it uses for every other Supabase call. The server validates it with the
 * service-role client and then reads the role from `profiles`, which is the
 * authoritative answer.
 *
 * Deliberate design points:
 *
 * 1. The token is only ever *verified*, never used as a database credential. All
 *    queries run as the service role, so a bug in this file can escalate, but it
 *    cannot be tricked into reading another rider's data by a forged token.
 * 2. A missing token is 401 and a non-admin is 403. They are different answers
 *    on purpose: one means "log in", the other means "logging in will not help".
 * 3. The role check reads the database on every call rather than trusting a
 *    claim inside the token, so revoking someone's admin role takes effect
 *    immediately rather than when their token expires.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Request } from "express";
import { BigateError } from "./errors";
import type { Logger } from "./client";

export type AdminActor = {
  userId: string;
  email: string | null;
};

/**
 * Reads the bearer token from the Authorization header.
 *
 * The header arrives as an array in Express's types even though a real request
 * sends a single value, so the array case is handled rather than cast away.
 */
export function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== "string") return null;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match ? match[1].trim() : null;
}

/**
 * Verifies the caller's session and confirms they are a store administrator.
 *
 * `supabase.auth.getUser(jwt)` asks the auth server whether the token is real and
 * still valid; it does not trust the token's own claims. The profile read then
 * answers the question the caller could otherwise fake.
 *
 * Throws a BigateError with kind 'config' or 'validation'; the route maps those
 * onto 401/403, so this function stays free of Express concerns.
 */
export async function requireAdmin(
  req: Request,
  supabase: SupabaseClient,
  logger: Logger,
): Promise<AdminActor> {
  const token = readBearerToken(req);
  if (!token) {
    throw new BigateError({
      kind: "config",
      userMessage: "Sign in before booking a shipment.",
      issues: [{ path: "authorization", message: "No bearer token was supplied." }],
    });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    logger.warn({ detail: error?.message }, "Rejected a logistics request with an invalid session");
    throw new BigateError({
      kind: "config",
      userMessage: "Your session has expired. Sign in again and retry.",
      issues: [{ path: "authorization", message: "The access token was rejected." }],
    });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError) {
    logger.error({ detail: profileError.message }, "Could not read the caller's role");
    throw new BigateError({
      kind: "config",
      userMessage: "The booking service could not confirm your permissions.",
      issues: [{ path: "profiles", message: profileError.message }],
    });
  }

  // Staff is deliberately not enough. Booking a parcel spends money, so the bar
  // is the same bar as changing an order's status.
  if (profile?.role !== "admin") {
    logger.warn({ role: profile?.role ?? null }, "Rejected a logistics request from a non-admin");
    throw new BigateError({
      kind: "validation",
      userMessage: "Only a store administrator can book a shipment.",
      issues: [{ path: "role", message: `Role is ${profile?.role ?? "missing"}.` }],
    });
  }

  return { userId: data.user.id, email: data.user.email ?? null };
}
