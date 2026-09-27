/**
 * Live tracking: parsing what Bigate sends and deciding what it means for us.
 *
 * ------------------------------------------------------------------------
 * BEFORE GOING LIVE: confirm the inbound key names and the state vocabulary
 * against the Bigate documentation for your own account. Both are collected in
 * `EVENT_KEY_ALIASES` and `TRACKING_STATE_ALIASES` so the contract is one edit
 * away, and an unrecognised value is surfaced as an `unknown` state that is
 * stored and logged rather than guessed at.
 * ------------------------------------------------------------------------
 *
 * Design choices worth keeping:
 *
 * 1. Parsing is tolerant, interpretation is strict. A key can appear under any of
 *    several documented aliases, but a shipment event is only accepted once we
 *    have a waybill, a state and a timestamp. Anything short of that is a
 *    validation failure, because a tracking row with no AWB cannot be attributed
 *    to an order and a timestamp-free event corrupts the timeline.
 *
 * 2. A courier state is not an order status. IN_TRANSIT does not mean `paid`, and
 *    mapping it that way would let a delivery webhook rewrite the payment state.
 *    Only the two genuinely terminal outcomes touch `orders.status`; every other
 *    event updates the shipment and the timeline and leaves the order alone.
 *
 * 3. Monotonic states. Once a parcel is delivered or returned, a late or
 *    out-of-order callback cannot walk it backwards.
 */
import { BigateError, describeIssues, type BigateFieldIssue } from "./errors";

/** Our own lifecycle vocabulary, independent of the courier's wording. */
export type ShipmentState =
  | "label_created"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "rts"
  | "failed_attempt"
  | "cancelled"
  | "info_received"
  | "unknown";

/** The `public.order_status` values a tracking event is allowed to produce. */
export type TrackingDrivenOrderStatus = "delivered" | "returned";

/**
 * Courier wording to our vocabulary. Keys are upper-cased before lookup, so
 * "in_transit", "IN TRANSIT" and "In-Transit" all resolve. Seemingly redundant
 * entries are kept where a courier has genuinely used both spellings.
 */
const TRACKING_STATE_ALIASES: Record<string, ShipmentState> = {
  // Not yet collected from the sender.
  LABEL_CREATED: "label_created",
  CREATED: "label_created",
  BOOKED: "label_created",
  ORDER_CREATED: "label_created",
  WAITING_FOR_PICKUP: "label_created",
  // Collected by the courier.
  PICKED_UP: "picked_up",
  PICKUP: "picked_up",
  COLLECTED: "picked_up",
  PICKED_UP_BY_COURIER: "picked_up",
  // Moving through the network.
  IN_TRANSIT: "in_transit",
  INTRANSIT: "in_transit",
  IN_TRANSIT_SCAN: "in_transit",
  HUB_ARRIVAL: "in_transit",
  ARRIVED_AT_HUB: "in_transit",
  DEPARTED: "in_transit",
  SORTING: "in_transit",
  // On the rider's van.
  OUT_FOR_DELIVERY: "out_for_delivery",
  OUTFORDELIVERY: "out_for_delivery",
  ON_DELIVERY: "out_for_delivery",
  // Terminal, successful.
  DELIVERED: "delivered",
  DELIVERED_SUCCESS: "delivered",
  SIGNED: "delivered",
  // Terminal, unsuccessful. Return to sender is the big one in the Philippines.
  RTS: "rts",
  RETURNED: "rts",
  RETURN_TO_SENDER: "rts",
  RETURN_IN_TRANSIT: "rts",
  // Terminal, cancelled by the sender before dispatch.
  CANCELLED: "cancelled",
  CANCELED: "cancelled",
  // Attempted and missed. Not terminal: the courier will try again.
  FAILED_ATTEMPT: "failed_attempt",
  DELIVERY_FAILED: "failed_attempt",
  UNSUCCESSFUL_DELIVERY: "failed_attempt",
  ADDRESS_ISSUE: "failed_attempt",
  // Accepted but nothing has happened yet.
  INFO_RECEIVED: "info_received",
  DATA_RECEIVED: "info_received",
};

/** Rank used to reject a callback that would move a parcel backwards. */
const STATE_RANK: Record<ShipmentState, number> = {
  label_created: 0,
  info_received: 0,
  picked_up: 1,
  in_transit: 2,
  out_for_delivery: 3,
  failed_attempt: 3,
  delivered: 4,
  rts: 4,
  cancelled: 4,
  unknown: -1,
};

/** Keys an event field may appear under, in priority order. */
const EVENT_KEY_ALIASES = {
  eventId: ["event_id", "eventId", "id", "webhook_id", "message_id", "uuid"],
  awb: ["awb", "awb_number", "awbNumber", "tracking_number", "trackingNumber", "waybill_number", "waybillNumber"],
  clientReference: ["reference_no", "referenceNo", "client_reference", "clientReference", "order_number", "orderNumber", "merchant_reference"],
  rawState: ["status", "state", "tracking_status", "trackingStatus", "delivery_status", "deliveryStatus", "status_description", "statusDescription", "description"],
  occurredAt: ["occurred_at", "occurredAt", "timestamp", "event_time", "eventTime", "scan_time", "scanTime", "updated_at", "updatedAt", "created_at", "createdAt"],
  description: ["description", "remarks", "remark", "note", "notes", "status_description"],
  location: ["location", "scan_location", "scanLocation", "hub", "branch", "facility"],
  courierCode: ["courier_code", "courierCode", "courier", "carrier", "carrier_code"],
  recipientPhone: ["recipient_phone", "recipientPhone", "phone", "contact"],
  remarks: ["remarks", "reason", "reason_description", "notes"],
} as const;

export type TrackingEvent = {
  /** Provider's own id. The idempotency key for this event. */
  eventId: string;
  awb: string | null;
  clientReference: string | null;
  state: ShipmentState;
  /** Exactly as the provider spelled it, kept for reconciliation. */
  rawState: string;
  occurredAt: string;
  description: string | null;
  location: string | null;
  courierCode: string | null;
  /** The untouched body, stored so an unknown state can be investigated later. */
  raw: unknown;
};

/**
 * Parses and validates an inbound webhook body.
 *
 * @throws {BigateError} kind `validation`, with one issue per missing field, so a
 * misconfigured subscription is diagnosable from the logs alone.
 */
export function parseTrackingEvent(body: unknown): TrackingEvent {
  const issues: BigateFieldIssue[] = [];
  const source = asRecord(body);

  if (!source) {
    throw new BigateError({
      kind: "validation",
      userMessage: "The tracking webhook body was not a JSON object.",
      issues: [{ path: "body", message: "expected a JSON object" }],
    });
  }

  // Gateways commonly wrap the event: { data: {...} }, { event: {...} }.
  const event = asRecord(source.data) ?? asRecord(source.event) ?? source;

  const eventId = pickString(event, EVENT_KEY_ALIASES.eventId);
  if (!eventId) issues.push({ path: "eventId", message: "the provider event id is required so retries can be recognised" });

  const awb = pickString(event, EVENT_KEY_ALIASES.awb);
  const clientReference = pickString(event, EVENT_KEY_ALIASES.clientReference);
  if (!awb && !clientReference) {
    // One of the two is needed to attach the event to an order. The AWB is
    // preferred because it survives a reference change.
    issues.push({ path: "awb", message: "a waybill number or a client reference is required to match the event to an order" });
  }

  const rawState = pickString(event, EVENT_KEY_ALIASES.rawState);
  if (!rawState) issues.push({ path: "state", message: "a delivery state is required" });

  const occurredAtRaw = pickString(event, EVENT_KEY_ALIASES.occurredAt);
  const occurredAt = normaliseTimestamp(occurredAtRaw);
  if (!occurredAt) {
    issues.push({ path: "occurredAt", message: "an event timestamp is required, in ISO 8601 or epoch seconds/milliseconds" });
  }

  if (issues.length > 0) {
    throw new BigateError({
      kind: "validation",
      userMessage: `The tracking webhook is missing required fields. ${describeIssues(issues)}`,
      issues,
      details: body,
    });
  }

  return {
    eventId: eventId as string,
    awb,
    clientReference,
    state: mapTrackingState(rawState as string),
    rawState: rawState as string,
    // Non-null: the validator above guarantees it.
    occurredAt: occurredAt as string,
    description: pickString(event, EVENT_KEY_ALIASES.description),
    location: pickString(event, EVENT_KEY_ALIASES.location),
    courierCode: pickString(event, EVENT_KEY_ALIASES.courierCode),
    raw: body,
  };
}

/**
 * Maps provider wording to our state. Unrecognised wording becomes `unknown`
 * instead of throwing: a courier adding a new state must not be able to break the
 * webhook, and the raw value is stored either way.
 */
export function mapTrackingState(raw: string): ShipmentState {
  const key = raw.trim().toUpperCase().replace(/[\s\-.]+/g, "_");
  return TRACKING_STATE_ALIASES[key] ?? "unknown";
}

/**
 * The order status a state implies, or null when it implies none. Deliberately
 * sparse: `picked_up` and `in_transit` map to nothing, because `orders.status`
 * between `processing` and `delivered` is already `shipped` and the admin
 * transition rules would reject a rewrite.
 */
export function orderStatusForState(state: ShipmentState): TrackingDrivenOrderStatus | null {
  if (state === "delivered") return "delivered";
  if (state === "rts") return "returned";
  return null;
}

/** True when the state cannot be left behind. */
export function isTerminalState(state: ShipmentState): boolean {
  return state === "delivered" || state === "rts" || state === "cancelled";
}

/**
 * Guards against out-of-order callbacks. A courier may deliver a scan before a
 * transit scan reaches us, and a retry may replay an older event; neither may
 * rewrite history.
 */
export function shouldAdvanceState(previous: ShipmentState | null, next: ShipmentState): boolean {
  if (next === "unknown") return false;
  if (previous === null) return true;
  if (isTerminalState(previous)) return false;
  if (previous === next) return false;
  return STATE_RANK[next] > STATE_RANK[previous];
}

/**
 * A single log line that answers "what happened and what will the rider see?"
 * Written for a human reading a log aggregator at 2am.
 */
export function formatTransitionLog(event: TrackingEvent, previous: ShipmentState | null): string {
  const orderEffect = orderStatusForState(event.state);
  const movement = shouldAdvanceState(previous, event.state) ? event.state : `${event.state} (ignored: already at ${previous ?? "unknown"})`;
  const effects = [
    `state ${previous ?? "none"} -> ${movement}`,
    event.awb ? `awb ${event.awb}` : null,
    event.clientReference ? `reference ${event.clientReference}` : null,
    event.location ? `location ${event.location}` : null,
    orderEffect ? `order becomes ${orderEffect}` : "order status unchanged",
  ].filter(entry => entry !== null);
  return `Bigate tracking: ${effects.join(" | ")}`;
}

/** Parses ISO 8601, epoch seconds and epoch milliseconds into ISO 8601 UTC. */
function normaliseTimestamp(value: string | null): string | null {
  if (!value) return null;

  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && String(Math.trunc(asNumber)) === value.trim()) {
    // Ten digits is seconds, thirteen is milliseconds. Both are in use in the wild.
    const millis = String(Math.trunc(asNumber)).length <= 10 ? asNumber * 1000 : asNumber;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** First non-empty string across the alias list, checking nested wrappers too. */
function pickString(source: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    // A few gateways wrap scalars, e.g. { awb: { number: "..." } }.
    const nested = asRecord(value);
    if (nested) {
      for (const innerKey of ["number", "value", "code", "id", "name"]) {
        const inner = nested[innerKey];
        if (typeof inner === "string" && inner.trim() !== "") return inner.trim();
      }
    }
  }
  return null;
}
