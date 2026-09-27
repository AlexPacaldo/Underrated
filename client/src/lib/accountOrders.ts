import type { ProductVisual } from "@/data/products";
import type { DeliveryAddress } from "@/lib/deliveryAddress";
import type { OrderStatus } from "@/lib/orderStatus";
import { supabase } from "@/lib/supabase";

export type AccountOrderStatus = OrderStatus;

export type AccountOrderItem = {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  finish: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  /** Joined in from the catalog, so an archived part still shows its photo and its item view. */
  product_slug: string | null;
  product_image_path: string | null;
  product_images: string[] | null;
  product_image_positions: Record<string, string> | null;
  product_visual: ProductVisual | null;
  product_archived: boolean | null;
  product_finishes: string[] | null;
};

export type AccountOrderTracking = {
  order_id: string;
  tracking_number: string | null;
  fulfillment_note: string | null;
  paid_at: string | null;
  processing_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  rejected_at: string | null;
  updated_at: string;
};

export type AccountPaymentSubmission = {
  id: string;
  payment_method: "gcash_qr" | "bank_transfer";
  reference_number: string;
  payer_name: string | null;
  note: string | null;
  created_at: string;
};

export type AccountOrder = {
  id: string;
  order_number: string;
  status: AccountOrderStatus;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  currency: "PHP";
  display_currency: string;
  fx_rate: number;
  shipping_region: string;
  shipping_address: DeliveryAddress | null;
  created_at: string;
  updated_at: string;
  order_items: AccountOrderItem[];
  manual_payment_submissions: AccountPaymentSubmission[];
  tracking: AccountOrderTracking | null;
};

type OrderRow = Omit<AccountOrder, "order_items" | "tracking">;

const orderColumns =
  "id,order_number,status,subtotal_cents,shipping_cents,total_cents,currency,display_currency,fx_rate,shipping_region,shipping_address,created_at,updated_at,manual_payment_submissions(id,payment_method,reference_number,payer_name,note,created_at)";

const itemColumns =
  "id,order_id,product_id,product_name,finish,quantity,unit_price_cents,line_total_cents,product_slug,product_image_path,product_images,product_image_positions,product_visual,product_archived,product_finishes";

const trackingColumns = "order_id,tracking_number,fulfillment_note,paid_at,processing_at,shipped_at,delivered_at,rejected_at,updated_at";

/**
 * Three reads joined in the client: the order itself, the lines with the catalog
 * photo, and the shipment milestones. The last two come from views because
 * order_items has no foreign key to products and order_fulfillment keeps an
 * admin-only note that a policy cannot hide.
 */
export async function fetchAccountOrders(orderNumber?: string) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const orderQuery = supabase.from("orders").select(orderColumns).order("created_at", { ascending: false });
  const [orderResult, itemResult, trackingResult] = await Promise.all([
    orderNumber ? orderQuery.eq("order_number", orderNumber) : orderQuery,
    supabase.from("account_order_items").select(itemColumns),
    supabase.from("order_tracking").select(trackingColumns),
  ]);

  if (orderResult.error) throw orderResult.error;
  if (itemResult.error) throw itemResult.error;
  if (trackingResult.error) throw trackingResult.error;

  const itemsByOrder = new Map<string, AccountOrderItem[]>();
  for (const item of (itemResult.data ?? []) as AccountOrderItem[]) {
    const list = itemsByOrder.get(item.order_id);
    if (list) list.push(item);
    else itemsByOrder.set(item.order_id, [item]);
  }

  const trackingByOrder = new Map<string, AccountOrderTracking>((trackingResult.data ?? []).map((row) => [row.order_id, row as AccountOrderTracking] as const));

  return ((orderResult.data ?? []) as OrderRow[]).map((order) => ({
    ...order,
    order_items: itemsByOrder.get(order.id) ?? [],
    tracking: trackingByOrder.get(order.id) ?? null,
  }));
}

export async function fetchAccountOrder(orderNumber: string) {
  const [order] = await fetchAccountOrders(orderNumber);
  return order ?? null;
}

export const paymentMethodLabels: Record<AccountPaymentSubmission["payment_method"], string> = {
  gcash_qr: "GCash QR",
  bank_transfer: "Bank transfer",
};

/** The reference the store is verifying right now, if there is one. */
export function latestPaymentSubmission(order: AccountOrder) {
  return order.manual_payment_submissions[order.manual_payment_submissions.length - 1] ?? null;
}

/** Riders can only close an order that is still awaiting payment, which the row policy enforces. */
export async function cancelAccountOrder(orderId: string) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { error } = await supabase.from("orders").update({ status: "cancelled" }).eq("id", orderId).eq("status", "pending_payment");
  if (error) throw error;
}
