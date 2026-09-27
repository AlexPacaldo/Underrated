/**
 * Order creation and waybill retrieval.
 *
 * ------------------------------------------------------------------------
 * BEFORE SHIPPING REAL PARCELS: verify the key names below against the Bigate
 * documentation for your own account. This integration was written against a
 * gateway that returns a `{ "data": ... }` envelope and accepts a `receiver` /
 * `parcels` / `cod` shape, and every one of those names is a contract detail the
 * provider can change. They are collected in `buildShipmentPayload` and in
 * `WAYBILL_URL_KEYS` so that correcting the contract is a single-file change
 * rather than a hunt through the integration. Nothing else in the file depends on
 * a particular key name, and no field is silently dropped: an unrecognised value
 * is reported rather than discarded.
 * ------------------------------------------------------------------------
 *
 * Design choices worth keeping:
 *
 * 1. Validation happens before the request, and it is field-addressed. A courier
 *    400 that says "receiver.geo.lat is required" costs a round trip and a support
 *    ticket; the same check locally says which field to fix.
 *
 * 2. Money crosses the boundary in the smallest unit the order already uses.
 *    `orders.total_cents` is integer pesos, so no float ever touches a COD amount.
 *
 * 3. Geolocation is a hard requirement for a Philippine delivery. Guessing it, or
 *    defaulting to a city centroid, produces a parcel a rider cannot locate, so a
 *    missing or out-of-range coordinate is a validation error rather than a
 *    silently substituted value.
 *
 * 4. Creation is never auto-retried. The outbound reference number is our own
 *    order number, which is what makes a manual reconciliation possible if the
 *    outcome is unknown.
 */
import type { BigateCallResult, BigateClient, Logger } from "./client";
import { BigateError, describeIssues, type BigateFieldIssue } from "./errors";

/** A validated Philippine address with the coordinate the courier needs. */
export type ShipmentAddress = {
  recipientName: string;
  /** E.164 or local PH mobile. Validated below. */
  phone: string;
  email?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  /** Province or region. Bigate calls this a province. */
  region: string;
  postalCode: string;
  country: string;
  countryCode: string;
  /** WGS84 decimal degrees. */
  geo: {
    latitude: number;
    longitude: number;
  };
};

export type ShipmentParcel = {
  /** Centimetres. */
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  /** Kilograms. */
  weightKg: number;
  description?: string | null;
  /** Declared value in centavos; defaults to the order value. */
  declaredValueCents?: number | null;
  quantity?: number;
};

/** Cash on delivery, expressed the way a pickup rider collects it. */
export type ShipmentCod = {
  amountCents: number;
  currency: "PHP";
  /** Printed on the waybill so the rider knows the exact amount to collect. */
  referenceNo?: string | null;
  instructions?: string | null;
};

export type CreateShipmentInput = {
  /**
   * Our order number. Sent as the gateway reference and stored as the idempotency
   * handle, so an unknown-outcome failure can be traced back to exactly one
   * shipment.
   */
  clientReference: string;
  /** Courier code from the Bigate book of services, e.g. JNT, FLASH. */
  courierCode: string;
  serviceCode?: string | null;
  address: ShipmentAddress;
  parcels: ShipmentParcel[];
  cod?: ShipmentCod | null;
  remarks?: string | null;
  /** Defaults to now. Format is the gateway's documented one. */
  orderDate?: string | null;
  /** Who is paying: the recipient collects, or we already collected. */
  paymentMode?: "cod" | "prepaid";
};

export type CreatedShipment = {
  /** The courier's tracking number. */
  awb: string;
  /**
   * Link to the generated PDF label, isolated from the rest of the response so
   * callers never have to know the response shape. Always https.
   */
  waybillUrl: string | null;
  courierCode: string;
  /** Raw gateway status, kept for reconciliation. Not interpreted. */
  providerStatus: string | null;
  /** The whole response, for the audit trail. Never logged with credentials. */
  raw: unknown;
};

export type CreateShipmentOptions = {
  signal?: AbortSignal;
  logger?: Logger;
};

/**
 * Values that come from configuration rather than the caller. Passed in rather
 * than read from the environment inside this module so the payload builder stays
 * a pure function and the gateway host allowlist is never silently bypassed.
 */
export type ShipmentDefaults = {
  accountId: string;
  courierCode: string;
  serviceCode: string | null;
  /** Empty means any https host is accepted. */
  waybillHostAllowlist: string[];
};

/**
 * Payload keys, in priority order, that may hold the PDF link. Documented
 * gateways have used more than one of these for the same document.
 */
const WAYBILL_URL_KEYS = ["waybill_url", "waybillUrl", "label_url", "labelUrl", "pdf_url", "pdfUrl", "awb_pdf", "waybill_pdf", "url"];
const AWB_KEYS = ["awb", "awb_number", "awbNumber", "tracking_number", "trackingNumber", "waybill_number", "waybillNumber", "reference_no"];

const SHIPPING_PATH = "shipments";

/**
 * Builds the outbound payload. This is the function to edit when the contract
 * differs: it is pure, it has no I/O, and it is the only place a key name appears.
 */
export function buildShipmentPayload(input: CreateShipmentInput, defaults: ShipmentDefaults): Record<string, unknown> {
  const courierCode = input.courierCode || defaults.courierCode;
  const serviceCode = input.serviceCode ?? defaults.serviceCode;
  const paymentMode = input.paymentMode ?? (input.cod ? "cod" : "prepaid");
  const orderDate = input.orderDate ?? defaultOrderDate();

  return {
    account_id: defaults.accountId,
    // Our own identifier, so the gateway echoes it back on every callback.
    reference_no: input.clientReference,
    courier_code: courierCode,
    service_code: serviceCode,
    order_date: orderDate,
    cod_method: paymentMode === "cod" ? "otd" : "prepaid",
    receiver: {
      name: input.address.recipientName,
      phone: input.address.phone,
      email: input.address.email ?? null,
      address_line: input.address.line1,
      address_line2: input.address.line2 ?? null,
      city: input.address.city,
      province: input.address.region,
      zipcode: input.address.postalCode,
      country: input.address.country,
      country_code: input.address.countryCode,
      // Nested because the gateway resolves by geocoding the coordinate.
      geo: {
        lat: input.address.geo.latitude,
        lng: input.address.geo.longitude,
      },
    },
    parcels: input.parcels.map(parcel => ({
      length: parcel.lengthCm,
      width: parcel.widthCm,
      height: parcel.heightCm,
      weight: parcel.weightKg,
      description: parcel.description ?? null,
      declared_value: parcel.declaredValueCents ?? null,
      quantity: parcel.quantity ?? 1,
    })),
    // The gateway models money as a financial array rather than a scalar, so an
    // order with no COD sends an empty array instead of omitting the field.
    cod: buildCodFinancialArray(input.cod),
    remarks: input.remarks ?? null,
    instructions: input.cod?.instructions ?? null,
  };
}

/** The COD financial array. Empty when the order is prepaid. */
function buildCodFinancialArray(cod: ShipmentCod | null | undefined): Array<Record<string, unknown>> {
  if (!cod || cod.amountCents <= 0) return [];
  return [
    {
      type: "cod",
      amount: cod.amountCents,
      currency: cod.currency,
      reference_no: cod.referenceNo ?? null,
      collectible: true,
    },
  ];
}

function defaultOrderDate(): string {
  // The gateway documents ISO 8601; a date without a timezone is ambiguous.
  return new Date().toISOString();
}

/**
 * Creates a shipment and returns the waybill, with the PDF link pulled out of the
 * envelope.
 *
 * @throws {BigateError} `validation` before the call, or `auth`/`timeout`/
 * `upstream`/`network` from the gateway. Never throws a bare Error.
 */
export async function createShipment(client: BigateClient, input: CreateShipmentInput, defaults: ShipmentDefaults, options: CreateShipmentOptions = {}): Promise<{ shipment: CreatedShipment; result: BigateCallResult<unknown> }> {
  const courierCode = input.courierCode || defaults.courierCode;
  const issues = validateShipmentInput(input, courierCode);
  if (issues.length > 0) {
    throw new BigateError({
      kind: "validation",
      retryable: false,
      userMessage: `The shipment cannot be sent yet. ${describeIssues(issues)}`,
      issues,
    });
  }

  const payload = buildShipmentPayload(input, defaults);

  // attempts stays at the client's default of 1 on purpose: a create that times
  // out may already have produced a real waybill, and a second POST would produce
  // a second parcel for one paid order.
  const result = await client.request<unknown>({
    method: "POST",
    path: SHIPPING_PATH,
    body: payload,
    requestLabel: `create_shipment:${input.clientReference}`,
    signal: options.signal,
  });

  const shipment = extractCreatedShipment(result.data, { courierCode, waybillHostAllowlist: defaults.waybillHostAllowlist });

  options.logger?.info(
    {
      awb: shipment.awb,
      courier_code: shipment.courierCode,
      waybill_url_present: shipment.waybillUrl !== null,
      provider_status: shipment.providerStatus,
      client_reference: input.clientReference,
      duration_ms: result.durationMs,
    },
    "Shipment created",
  );

  return { shipment, result };
}

/**
 * Pulls the AWB and the PDF link out of whatever envelope the gateway used.
 *
 * Exported because the admin console needs the same extraction when it re-reads a
 * shipment, and one implementation means the key list stays in one place.
 */
export function extractCreatedShipment(body: unknown, context: { courierCode: string; waybillHostAllowlist: string[] }): CreatedShipment {
  const containers = collectContainers(body);
  const awb = pickString(containers, AWB_KEYS);
  const waybillUrl = pickWaybillUrl(containers, context.waybillHostAllowlist);
  const courierCode = pickString(containers, ["courier_code", "courierCode", "courier"]) ?? context.courierCode;
  const providerStatus = pickString(containers, ["status", "order_status", "state", "shipment_status"]);

  if (!awb) {
    // Without an AWB there is nothing to track and nothing to reconcile against,
    // so a success response missing it is a failure, not a partial success.
    throw new BigateError({
      kind: "malformed_response",
      userMessage: "Bigate accepted the shipment but returned no waybill number, so the parcel cannot be tracked. Check the Bigate dashboard for the shipment before sending it again.",
      details: body,
    });
  }

  return { awb, waybillUrl, courierCode, providerStatus, raw: body };
}

/**
 * Every object that might hold the values we want, outermost first: the envelope
 * ({ data, result }), then the shipment itself, then nested sub-objects.
 */
function collectContainers(body: unknown): unknown[] {
  const containers: unknown[] = [];
  const visit = (value: unknown, depth: number): void => {
    if (depth > 3 || typeof value !== "object" || value === null) return;
    containers.push(value);
    const record = value as Record<string, unknown>;
    for (const key of ["data", "result", "shipment", "order", "waybill", "label", "waybill_info", "order_details"]) {
      if (record[key] !== undefined) visit(record[key], depth + 1);
    }
  };
  visit(body, 0);
  return containers;
}

function pickString(containers: unknown[], keys: string[]): string | null {
  for (const key of keys) {
    for (const container of containers) {
      const value = (container as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim() !== "") return value.trim();
      // Some gateways nest the number one level deeper, e.g. { data: { awb: { number } } }.
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
      if (typeof value === "object" && value !== null) {
        for (const innerKey of ["number", "value", "code", "id"]) {
          const inner = (value as Record<string, unknown>)[innerKey];
          if (typeof inner === "string" && inner.trim() !== "") return inner.trim();
        }
      }
    }
  }
  return null;
}

function pickWaybillUrl(containers: unknown[], hostAllowlist: string[]): string | null {
  for (const key of WAYBILL_URL_KEYS) {
    const raw = pickString(containers, [key]);
    if (!raw) continue;
    const url = normaliseDocumentUrl(raw);
    if (!url) continue;
    if (hostAllowlist.length > 0 && !hostAllowlist.includes(url.hostname.toLowerCase())) {
      // Stored links are clicked by staff, so an unexpected host is worth
      // dropping rather than persisting.
      continue;
    }
    return url.toString();
  }
  return null;
}

/**
 * Only https and only absolute URLs. A relative path or a javascript: URL from an
 * untrusted response body must never end up in a link we render.
 */
function normaliseDocumentUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

/** Field-addressed validation. Runs before any network call. */
export function validateShipmentInput(input: CreateShipmentInput, courierCode: string): BigateFieldIssue[] {
  const issues: BigateFieldIssue[] = [];
  const add = (path: string, message: string): void => {
    issues.push({ path, message });
  };

  if (input.clientReference.trim() === "") add("clientReference", "an order reference is required so the shipment can be reconciled");
  if (courierCode.trim() === "") add("courierCode", "a courier code is required, for example JNT or FLASH");

  const address = input.address;
  if (!address) {
    add("address", "a delivery address is required");
  } else {
    if (isBlank(address.recipientName)) add("address.recipientName", "the recipient name is required");
    if (isBlank(address.phone)) {
      add("address.phone", "a contact number is required for the rider");
    } else if (!isPhilippineContactNumber(address.phone)) {
      add("address.phone", "expected a Philippine mobile such as 0917 000 0000 or +639170000000");
    }
    if (address.email !== undefined && address.email !== null && address.email !== "" && !isEmail(address.email)) {
      add("address.email", "expected an email address such as rider@example.com");
    }
    if (isBlank(address.line1)) add("address.line1", "the street address is required");
    if (isBlank(address.city)) add("address.city", "the city is required");
    if (isBlank(address.region)) add("address.region", "the province or region is required");
    if (isBlank(address.postalCode)) add("address.postalCode", "the postal code is required");
    if (isBlank(address.country)) add("address.country", "the country is required");
    if (!address.countryCode) add("address.countryCode", "a country code is required, for example PH");

    const { latitude, longitude } = address.geo ?? ({} as ShipmentAddress["geo"]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      add("address.geo", "a latitude and longitude are required so Bigate can geocode the delivery");
    } else {
      if (latitude < -90 || latitude > 90) add("address.geo.latitude", "must be between -90 and 90");
      if (longitude < -180 || longitude > 180) add("address.geo.longitude", "must be between -180 and 180");
      // The Philippines, with slack. Anything outside is a mapping or data-entry
      // error, and a parcel sent to it cannot be delivered.
      if (latitude < 4 || latitude > 21.5 || longitude < 116 || longitude > 127) {
        add("address.geo", "the coordinate is outside the Philippines; check the map pin before creating the shipment");
      }
    }
  }

  if (!Array.isArray(input.parcels) || input.parcels.length === 0) {
    add("parcels", "at least one parcel is required");
  } else {
    input.parcels.forEach((parcel, index) => {
      const dimensions: Array<[string, number]> = [
        ["lengthCm", parcel.lengthCm],
        ["widthCm", parcel.widthCm],
        ["heightCm", parcel.heightCm],
      ];
      for (const dimension of dimensions) {
        const value = dimension[1];
        if (!Number.isFinite(value) || value <= 0) add(`parcels[${index}].${dimension[0]}`, "must be a positive number of centimetres");
        else if (value > 200) add(`parcels[${index}].${dimension[0]}`, "a single side over 200 cm is outside every domestic courier's limit");
      }
      if (!Number.isFinite(parcel.weightKg) || parcel.weightKg <= 0) add(`parcels[${index}].weightKg`, "must be a positive number of kilograms");
      else if (parcel.weightKg > 30) add(`parcels[${index}].weightKg`, "a parcel over 30 kg needs a freight booking, not a parcel shipment");
      if (parcel.quantity !== undefined && (!Number.isInteger(parcel.quantity) || parcel.quantity < 1)) {
        add(`parcels[${index}].quantity`, "must be a whole number of at least 1");
      }
    });
  }

  if (input.cod) {
    if (!Number.isFinite(input.cod.amountCents) || input.cod.amountCents <= 0) {
      add("cod.amountCents", "the amount to collect must be a positive number of centavos");
    }
    if (input.cod.currency !== "PHP") add("cod.currency", "only PHP can be collected on delivery in the Philippines");
  }

  return issues;
}

function isBlank(value: string | null | undefined): boolean {
  return typeof value !== "string" || value.trim() === "";
}

/** Accepts 09XXXXXXXXX, +639XXXXXXXXX, and spaced or hyphenated variants. */
function isPhilippineContactNumber(value: string): boolean {
  const compact = value.replace(/[\s()-]/g, "");
  return /^(\+?63|0)9\d{9}$/.test(compact);
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}
