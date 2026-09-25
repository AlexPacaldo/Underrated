import type { DeliveryAddress } from "@/lib/deliveryAddress";
import { supabase } from "@/lib/supabase";

export type AccountOrderStatus = "pending_payment" | "payment_submitted" | "paid" | "rejected" | "cancelled" | "processing" | "shipped" | "delivered";

export type AccountOrderItem = {
  id: string;
  product_name: string;
  finish: string;
  quantity: number;
  line_total_cents: number;
};

export type AccountPaymentSubmission = {
  id: string;
  payment_method: "gcash_qr" | "bank_transfer";
  reference_number: string;
  created_at: string;
};

export type AccountOrder = {
  id: string;
  order_number: string;
  status: AccountOrderStatus;
  total_cents: number;
  currency: "PHP";
  display_currency: string;
  fx_rate: number;
  shipping_address: DeliveryAddress | null;
  created_at: string;
  order_items: AccountOrderItem[];
  manual_payment_submissions: AccountPaymentSubmission[];
};

export async function fetchAccountOrders() {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id,order_number,status,total_cents,currency,display_currency,fx_rate,shipping_address,created_at,order_items(id,product_name,finish,quantity,line_total_cents),manual_payment_submissions(id,payment_method,reference_number,created_at)",
    )
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as AccountOrder[];
}
