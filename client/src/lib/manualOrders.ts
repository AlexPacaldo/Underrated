import type { CartLine } from "@/contexts/StoreContext";
import { products } from "@/data/products";
import { supabase } from "@/lib/supabase";

export type ManualPaymentMethod = "gcash_qr" | "bank_transfer";

export type ManualOrder = {
  id: string;
  order_number: string;
  status: "pending_payment" | "payment_submitted" | "paid" | "rejected" | "cancelled";
  total_cents: number;
};

type CreateManualOrderInput = {
  cart: CartLine[];
  shippingRegion: string;
  shippingCents: number;
  subtotalCents: number;
  totalCents: number;
};

export async function createManualOrder(input: CreateManualOrderInput) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      shipping_region: input.shippingRegion,
      subtotal_cents: input.subtotalCents,
      shipping_cents: input.shippingCents,
      total_cents: input.totalCents,
      status: "pending_payment",
    })
    .select("id,order_number,status,total_cents")
    .single();

  if (error) throw error;

  const items = input.cart.flatMap((line) => {
    const product = products.find((item) => item.id === line.id);
    if (!product) return [];
    return {
      order_id: order.id,
      product_id: product.id,
      product_name: product.name,
      finish: line.finish,
      quantity: line.quantity,
      unit_price_cents: Math.round(product.price * 100),
      line_total_cents: Math.round(product.price * 100) * line.quantity,
    };
  });

  const { error: itemsError } = await supabase.from("order_items").insert(items);
  if (itemsError) throw itemsError;

  return order as ManualOrder;
}

export async function submitManualPayment(orderId: string, paymentMethod: ManualPaymentMethod, referenceNumber: string, payerName: string, note: string) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { error: submissionError } = await supabase.from("manual_payment_submissions").insert({
    order_id: orderId,
    payment_method: paymentMethod,
    reference_number: referenceNumber.trim(),
    payer_name: payerName.trim() || null,
    note: note.trim() || null,
  });

  if (submissionError) throw submissionError;

  const { data, error } = await supabase
    .from("orders")
    .update({ status: "payment_submitted" })
    .eq("id", orderId)
    .select("id,order_number,status,total_cents")
    .single();

  if (error) throw error;
  return data as ManualOrder;
}
