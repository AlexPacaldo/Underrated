import type { CartLine } from "@/contexts/StoreContext";
import type { DeliveryAddress, ShippingRegion } from "@/lib/deliveryAddress";
import { supabase } from "@/lib/supabase";

export type ManualPaymentMethod = "gcash_qr" | "bank_transfer";
export type ManualOrderStatus = "pending_payment" | "payment_submitted" | "paid" | "rejected" | "cancelled" | "processing" | "shipped" | "delivered";

export type ManualOrder = {
  id: string;
  order_number: string;
  status: ManualOrderStatus;
  total_cents: number;
  currency: "PHP";
  display_currency: string;
  fx_rate: number;
  shipping_address: DeliveryAddress | null;
};

type CreateManualOrderInput = {
  cart: CartLine[];
  shippingRegion: ShippingRegion;
  shippingAddress: DeliveryAddress;
  displayCurrency: string;
  fxRate: number;
};

export async function createManualOrder(input: CreateManualOrderInput) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase.rpc("create_manual_order", {
    p_items: input.cart.map((line) => ({ product_id: line.id, finish: line.finish, quantity: line.quantity })),
    p_shipping_address: input.shippingAddress,
    p_shipping_region: input.shippingRegion,
    p_display_currency: input.displayCurrency,
    p_fx_rate: input.fxRate,
  });

  if (error) throw error;
  if (!data) throw new Error("The order could not be created.");
  return data as ManualOrder;
}

export async function submitManualPayment(orderId: string, paymentMethod: ManualPaymentMethod, referenceNumber: string, payerName: string, note: string) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase.rpc("submit_manual_payment", {
    p_order_id: orderId,
    p_payment_method: paymentMethod,
    p_reference_number: referenceNumber,
    p_payer_name: payerName,
    p_note: note,
  });

  if (error) throw error;
  if (!data) throw new Error("The payment reference could not be submitted.");
  return data as ManualOrder;
}
