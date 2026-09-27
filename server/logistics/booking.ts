/**
 * Books a Bigate parcel for an existing order.
 *
 * The flow is deliberately admin-initiated rather than automatic. Booking a
 * parcel spends money and puts a real courier label on a real order, so it is a
 * decision a human makes after looking at the order.
 *
 * The security rule that shapes this whole file: the request body may only carry
 * things a human has to supply and that the database cannot know, namely the
 * parcel's weight and dimensions. Everything that identifies the recipient or
 * what they paid is read from the order in the database and never accepted from
 * the caller. That means a compromised or careless admin client cannot redirect
 * a parcel, and it means a replayed request books the address the rider gave.
 *
 * A note on cash on delivery: this store's payment methods are gcash and bank
 * transfer, both collected in advance, so every booking is prepaid. The COD path
 * is implemented in `shipment.ts` because the gateway models it, but nothing
 * here can produce a COD parcel today.
 */
import { getBigateConfig } from "../bigate/config";
import { BigateError } from "../bigate/errors";
import { getServiceClient, recordShipment } from "../bigate/store";
import { createShipment, type CreateShipmentInput, type ShipmentAddress, type ShipmentParcel } from "../bigate/shipment";
import type { BigateClient, Logger } from "../bigate/client";

/** What staff supply that the database cannot know. */
export type BookingInput = {
  /**
   * The catalogue records a display weight ("118 g / pair") in a spec blob, not a
   * shipping weight, so a human has to weigh or estimate it. This is the field
   * most likely to be wrong, which is why it is required and validated rather
   * than guessed from the product name.
   */
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  /** Overrides BIGATE_DEFAULT_COURIER_CODE when staff pick a different courier. */
  courierCode?: string | null;
  serviceCode?: string | null;
  remarks?: string | null;
};

export type BookingResult = {
  orderNumber: string;
  shipmentId: string;
  awb: string;
  waybillUrl: string | null;
  courierCode: string;
};

export type BookingOptions = {
  /**
   * Forwarded to the gateway call. The route sets a timeout so a hung request
   * cannot hold a browser tab open, and an abort is reported as a timeout rather
   * than retried, because the label may already exist.
   */
  signal?: AbortSignal;
};

/**
 * Orders can be booked once payment has cleared but before the parcel leaves.
 * 'returned' is included because a parcel that came back needs a replacement, and
 * making staff move the order back to processing first would only add a step that
 * records nothing. Booking a replacement moves the order back to processing by
 * itself, further down.
 */
const BOOKABLE_STATUSES = ["paid", "processing", "returned"] as const;

/** A shipment in any of these states is finished, so a replacement may be booked. */
const CLOSED_SHIPMENT_STATUSES = ["delivered", "rts", "cancelled"] as const;

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  shipping_address: Record<string, unknown> | null;
  order_items: { product_name: string; finish: string; quantity: number }[];
};

export async function bookOrderShipment(
  client: BigateClient,
  orderNumber: string,
  input: BookingInput,
  actor: { userId: string },
  logger: Logger,
  options: BookingOptions = {},
): Promise<BookingResult> {
  validateBookingInput(input);
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("orders")
    .select("id,order_number,status,shipping_address,order_items(product_name,finish,quantity)")
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (error) {
    throw new BigateError({
      kind: "upstream",
      userMessage: `Could not read order ${orderNumber}: ${error.message}`,
      cause: error,
    });
  }

  const order = data as OrderRow | null;
  if (!order) {
    throw new BigateError({
      kind: "validation",
      userMessage: `No order numbered ${orderNumber} exists.`,
      issues: [{ path: "orderNumber", message: "Not found." }],
    });
  }

  // Money first. A parcel must never be created for an order that was not paid.
  if (!(BOOKABLE_STATUSES as readonly string[]).includes(order.status)) {
    throw new BigateError({
      kind: "validation",
      userMessage: `Order ${orderNumber} is ${order.status.replace(/_/g, " ")}, so it cannot be booked. Only a paid or processing order can be shipped.`,
      issues: [{ path: "status", message: `Status is ${order.status}.` }],
    });
  }

  const address = toShipmentAddress(order.shipping_address, order.order_number);

  // Bigate is a domestic Philippine courier. An overseas order in the same table
  // must be refused with a clear message rather than sent to a PH address book.
  if (address.countryCode !== "PH") {
    throw new BigateError({
      kind: "validation",
      userMessage: `Order ${orderNumber} ships to ${address.country}, and Bigate only carries domestic Philippine parcels. Book an international courier for this order instead.`,
      issues: [{ path: "shipping_address.country_code", message: `Country code is ${address.countryCode}.` }],
    });
  }

  // The unique index in 20260928000000 would reject a second live shipment, but
  // checking here gives staff a readable message instead of a constraint error,
  // and a label they already paid for should never be created twice by accident.
  const { data: liveShipments, error: liveError } = await supabase
    .from("shipments")
    .select("id,awb,status")
    .eq("order_id", order.id)
    .not("status", "in", `(${CLOSED_SHIPMENT_STATUSES.join(",")})`);

  if (liveError) {
    throw new BigateError({
      kind: "upstream",
      userMessage: `Could not check for an existing shipment on ${orderNumber}: ${liveError.message}`,
      cause: liveError,
    });
  }

  if (Array.isArray(liveShipments) && liveShipments.length > 0) {
    const existing = liveShipments[0] as { awb: string; status: string };
    throw new BigateError({
      kind: "validation",
      userMessage: `Order ${orderNumber} already has a live shipment (waybill ${existing.awb}, ${existing.status.replace(/_/g, " ")}). A replacement can be booked only after the current parcel is delivered, returned or cancelled.`,
      issues: [{ path: "shipments", message: `Live waybill ${existing.awb}.` }],
    });
  }

  const quantity = order.order_items.reduce((total, item) => total + item.quantity, 0);
  const config = getBigateConfig();
  const courierCode = (input.courierCode ?? "").trim().toUpperCase() || config.defaultCourierCode;

  const parcels: ShipmentParcel[] = [
    {
      lengthCm: input.lengthCm,
      widthCm: input.widthCm,
      heightCm: input.heightCm,
      weightKg: input.weightKg,
      quantity: Math.max(1, quantity),
      description: summariseItems(order.order_items),
    },
  ];

  const shipmentInput: CreateShipmentInput = {
    clientReference: order.order_number,
    courierCode,
    serviceCode: input.serviceCode ?? null,
    address,
    parcels,
    // Every payment method this store accepts is collected in advance.
    cod: null,
    paymentMode: "prepaid",
    remarks: input.remarks ?? null,
  };

  // No retry is attempted here. createShipment is called without a retry count
  // on purpose: if the request times out we do not know whether a label was
  // created, and a second attempt could book a second parcel. The
  // client_reference is the order number, so an unknown outcome is traceable from
  // the Bigate dashboard.
  const { shipment, result } = await createShipment(
    client,
    shipmentInput,
    {
      accountId: config.accountId,
      courierCode: config.defaultCourierCode,
      serviceCode: config.defaultServiceCode,
      waybillHostAllowlist: config.waybillHostAllowlist,
    },
    { logger, signal: options.signal },
  );

  const { shipmentId } = await recordShipment(order.id, shipmentInput, shipment);

  // A replacement parcel puts the order back in the workshop, so the order must
  // stop saying "returned" or the rider sees a parcel that is on its way while the
  // page says it failed. This is the same transition admin_update_order_status
  // allows, applied here because booking is the thing that caused it.
  if (order.status === "returned") {
    const { error: reopenError } = await supabase
      .from("orders")
      .update({ status: "processing" })
      .eq("id", order.id)
      .eq("status", "returned");

    if (reopenError) {
      logger.error(
        { order_number: orderNumber, awb: shipment.awb, detail: reopenError.message },
        "Booked a replacement but could not move the order out of returned",
      );
    } else {
      logger.info({ order_number: orderNumber, awb: shipment.awb }, "Replacement booked; order moved from returned to processing");
    }
  }

  // Mirror the waybill into order_fulfillment so the admin order page and the
  // rider's account page show the tracking number immediately, without waiting
  // for the courier's first scan. Only tracking_number is touched, so an admin
  // note already on the row is left alone.
  const { error: fulfillmentError } = await supabase
    .from("order_fulfillment")
    .upsert(
      { order_id: order.id, tracking_number: shipment.awb, updated_by: actor.userId, updated_at: new Date().toISOString() },
      { onConflict: "order_id" },
    );

  if (fulfillmentError) {
    // The parcel exists and the shipment row is saved, so the webhook will still
    // work. This is a display problem, not a broken booking, so it is logged
    // loudly but does not fail the request.
    logger.error(
      { order_number: orderNumber, awb: shipment.awb, detail: fulfillmentError.message },
      "Booked a shipment but could not mirror the waybill onto the order",
    );
  }

  logger.info(
    {
      order_number: orderNumber,
      awb: shipment.awb,
      courier_code: shipment.courierCode,
      parcel_count: parcels[0].quantity,
      weight_kg: input.weightKg,
      provider_request_id: result.requestId,
      booked_by: actor.userId,
      duration_ms: result.durationMs,
    },
    `Booked Bigate waybill ${shipment.awb} for ${orderNumber}`,
  );

  return {
    orderNumber: order.order_number,
    shipmentId,
    awb: shipment.awb,
    waybillUrl: shipment.waybillUrl,
    courierCode: shipment.courierCode,
  };
}

function validateBookingInput(input: BookingInput): void {
  const problems: string[] = [];
  const positive = [
    ["weightKg", input.weightKg],
    ["lengthCm", input.lengthCm],
    ["widthCm", input.widthCm],
    ["heightCm", input.heightCm],
  ] as const;

  for (const [name, value] of positive) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      problems.push(`${name} must be a positive number`);
    }
  }
  // A parcel heavier than this is a pallet, not a bicycle part, and would be
  // refused by the courier at collection.
  if (typeof input.weightKg === "number" && input.weightKg > 30) {
    problems.push("weightKg looks too heavy for a bicycle part; confirm before booking");
  }
  if (typeof input.lengthCm === "number" && input.lengthCm > 200) {
    problems.push("lengthCm looks too long for a bicycle part");
  }

  if (problems.length > 0) {
    throw new BigateError({
      kind: "validation",
      userMessage: "The parcel details are not usable.",
      issues: problems.map(message => ({ path: "parcel", message })),
    });
  }
}

/** Reads the order's own stored address. Never from the request body. */
function toShipmentAddress(stored: Record<string, unknown> | null, orderNumber: string): ShipmentAddress {
  if (!stored) {
    throw new BigateError({
      kind: "validation",
      userMessage: `Order ${orderNumber} has no delivery address, so there is nowhere to ship it.`,
      issues: [{ path: "shipping_address", message: "Missing." }],
    });
  }

  const str = (key: string): string => {
    const value = stored[key];
    return typeof value === "string" ? value.trim() : "";
  };
  const geo = stored.geo as { latitude?: unknown; longitude?: unknown } | undefined;
  const latitude = Number(geo?.latitude);
  const longitude = Number(geo?.longitude);

  const address: ShipmentAddress = {
    recipientName: str("recipient_name"),
    phone: str("phone"),
    email: str("email") || null,
    line1: str("line1"),
    line2: str("line2") || null,
    city: str("city"),
    region: str("region"),
    postalCode: str("postal_code"),
    country: str("country"),
    countryCode: str("country_code").toUpperCase(),
    geo: {
      // The gateway geocodes from these, and a parcel with 0,0 coordinates is
      // routed to the wrong island. The store validates presence, not accuracy.
      latitude: Number.isFinite(latitude) ? latitude : 0,
      longitude: Number.isFinite(longitude) ? longitude : 0,
    },
  };

  return address;
}

function summariseItems(items: { product_name: string; finish: string; quantity: number }[]): string {
  return items
    .map(item => (item.quantity > 1 ? `${item.quantity}x ${item.product_name} (${item.finish})` : `${item.product_name} (${item.finish})`))
    .join(", ")
    .slice(0, 200);
}
