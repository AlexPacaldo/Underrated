/**
 * Server-side persistence for logistics.
 *
 * Design choices worth keeping:
 *
 * 1. A separate Supabase client built from the service-role key, never the
 *    anon client from `client/src/lib/supabase.ts`. The webhook endpoint is
 *    unauthenticated from the store's point of view, so it needs to write rows the
 *    rider's RLS policies forbid. The service-role key bypasses RLS, which is
 *    exactly why it lives only in this file and only in the server bundle: a
 *    VITE_-prefixed variable of the same name would be published to the browser.
 *
 * 2. Writes go through a Postgres function rather than a sequence of client
 *    calls. Applying a tracking event is: insert the event, move the shipment,
 *    maybe close the order. Doing that in SQL means it is one transaction, it is
 *    idempotent on the provider's event id, and two simultaneous retries cannot
 *    interleave. PostgREST cannot express that.
 *
 * 3. No admin impersonation. `admin_update_order_status` requires a signed-in
 *    store administrator, and a courier webhook has no session. The service-role
 *    function below is granted to `service_role` only, so the webhooks advance the
 *    order lifecycle without ever borrowing a customer's or an admin's authority.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getBigateConfig } from "./config";
import { BigateError } from "./errors";
import type { CreateShipmentInput, CreatedShipment } from "./shipment";
import type { ShipmentState, TrackingEvent } from "./tracking";

let client: SupabaseClient | null = null;

/** Service-role client, created once per process. */
export function getServiceClient(): SupabaseClient {
  if (client) return client;
  const config = getBigateConfig();
  client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      // A background service has no user session to persist or refresh.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return client;
}

/** Test seam. */
export function resetServiceClient(): void {
  client = null;
}

export type RecordShipmentResult = {
  shipmentId: string;
  created: boolean;
};

/**
 * Stores a created shipment against its order. Upserts on the provider and AWB so
 * that re-running a booking after an unknown outcome converges on one row instead
 * of creating a duplicate parcel record.
 */
export async function recordShipment(
  orderId: string,
  input: CreateShipmentInput,
  shipment: CreatedShipment,
): Promise<RecordShipmentResult> {
  const supabase = getServiceClient();
  const parcelCount = input.parcels.reduce((total, parcel) => total + (parcel.quantity ?? 1), 0);
  const totalWeightKg = input.parcels.reduce((total, parcel) => total + parcel.weightKg * (parcel.quantity ?? 1), 0);

  const { data, error } = await supabase
    .from("shipments")
    .upsert(
      {
        order_id: orderId,
        provider: "bigate",
        client_reference: input.clientReference,
        awb: shipment.awb,
        courier_code: shipment.courierCode,
        service_code: input.serviceCode ?? null,
        waybill_url: shipment.waybillUrl,
        status: "label_created",
        provider_status: shipment.providerStatus,
        parcel_count: parcelCount,
        weight_kg: Number(totalWeightKg.toFixed(3)),
        cod_amount_cents: input.cod?.amountCents ?? null,
        requested_at: new Date().toISOString(),
        last_event_at: null,
      },
      { onConflict: "provider,awb", ignoreDuplicates: false },
    )
    .select("id")
    .single();

  if (error) {
    throw new BigateError({
      kind: "upstream",
      userMessage: `The shipment was created at Bigate (waybill ${shipment.awb}) but could not be saved against the order, so the tracking webhook will not find it. Save the waybill manually: ${error.message}`,
      details: { awb: shipment.awb, order_id: orderId, client_reference: input.clientReference },
      cause: error,
    });
  }

  return { shipmentId: (data as { id: string }).id, created: true };
}

export type ApplyTrackingResult = {
  /** True when this event had already been recorded, i.e. a provider retry. */
  duplicate: boolean;
  shipmentId: string | null;
  orderId: string | null;
  /** The shipment state after the call, for logging. */
  status: ShipmentState | null;
  /** The state before the call, so the log can name the transition. */
  previousStatus: ShipmentState | null;
  /** True when the event was a replay of an older state and was not applied. */
  ignoredOutOfOrder: boolean;
  /** Set when the event moved the order, so the caller can log it loudly. */
  orderStatusChangedTo: string | null;
};

/**
 * Hands the event to Postgres, which inserts it once, guards against a backwards
 * transition, and closes the order only for the two terminal states.
 */
export async function applyTrackingEvent(event: TrackingEvent): Promise<ApplyTrackingResult> {
  const supabase = getServiceClient();

  const { data, error } = await supabase.rpc("logistics_record_tracking_event", {
    p_awb: event.awb,
    p_client_reference: event.clientReference,
    p_event_id: event.eventId,
    p_status: event.state,
    p_provider_status: event.rawState,
    p_occurred_at: event.occurredAt,
    p_location: event.location,
    p_description: event.description,
    p_payload: event.raw,
  });

  if (error) {
    throw new BigateError({
      kind: "upstream",
      userMessage: `A Bigate tracking event (${event.rawState}) was received but could not be recorded: ${error.message}. It is not lost, because Bigate will retry, but check that the event is not being rejected by the database every time.`,
      details: { awb: event.awb, client_reference: event.clientReference, event_id: event.eventId },
      cause: error,
    });
  }

  const row = (data ?? {}) as {
    duplicate?: boolean;
    shipment_id?: string | null;
    order_id?: string | null;
    status?: string | null;
    previous_status?: string | null;
    ignored_out_of_order?: boolean;
    order_status_changed_to?: string | null;
  };

  return {
    duplicate: row.duplicate === true,
    shipmentId: row.shipment_id ?? null,
    orderId: row.order_id ?? null,
    status: (row.status as ShipmentState | null) ?? null,
    previousStatus: (row.previous_status as ShipmentState | null) ?? null,
    ignoredOutOfOrder: row.ignored_out_of_order === true,
    orderStatusChangedTo: row.order_status_changed_to ?? null,
  };
}

/** Looks up the order a shipment belongs to, for reconciliation. */
export async function findShipmentByAwb(awb: string): Promise<{ id: string; orderId: string; status: string; clientReference: string } | null> {
  const supabase = getServiceClient();
  const { data, error } = await supabase.from("shipments").select("id,order_id,status,client_reference").eq("provider", "bigate").eq("awb", awb).maybeSingle();
  if (error) {
    throw new BigateError({
      kind: "upstream",
      userMessage: `Could not look up shipment ${awb}: ${error.message}`,
      cause: error,
    });
  }
  const row = data as { id: string; order_id: string; status: string; client_reference: string } | null;
  return row ? { id: row.id, orderId: row.order_id, status: row.status, clientReference: row.client_reference } : null;
}
