import { supabase } from "@/lib/supabase";

/**
 * Client side of the Bigate booking endpoint.
 *
 * The browser cannot hold a Bigcode or a service-role key, so booking is a call to
 * this app's own server, which holds the credential and re-reads the order. The
 * caller's Supabase access token is sent along so the server can confirm the
 * person clicking is a store administrator; the token is the only thing the
 * client ever contributes beyond the parcel measurements.
 */

/** What a human has to supply. Everything else comes from the order. */
export type ShipmentBookingInput = {
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  courierCode?: string;
  serviceCode?: string;
  remarks?: string;
};

export type ShipmentBooking = {
  orderNumber: string;
  shipmentId: string;
  awb: string;
  waybillUrl: string | null;
  courierCode: string;
};

/**
 * Empty in production, where the Node server serves the built site and the
 * request is same-origin. Set VITE_LOGISTICS_API_URL only for local development,
 * where Vite serves the site on a different port than the API. This is a URL, not
 * a secret, so the VITE_ prefix is correct here.
 */
const API_BASE = ((import.meta.env.VITE_LOGISTICS_API_URL as string | undefined) ?? "").replace(/\/+$/, "");

export async function bookOrderShipment(orderNumber: string, input: ShipmentBookingInput): Promise<ShipmentBooking> {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw new Error("Your session has expired. Sign in again before booking a shipment.");
  }

  const response = await fetch(`${API_BASE}/api/logistics/orders/${encodeURIComponent(orderNumber)}/shipment`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify(input),
  });

  // The server answers with a short machine-readable code and a sentence written
  // for a human, so the sentence is what gets shown.
  const payload = (await response.json().catch(() => ({}))) as Partial<ShipmentBooking> & { detail?: string };

  if (!response.ok) {
    throw new Error(payload.detail ?? "The shipment could not be booked.");
  }

  return payload as ShipmentBooking;
}
