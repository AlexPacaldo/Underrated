import type { AccountRole } from "@/contexts/AuthContext";
import { mapHomepage, mapProduct } from "@/contexts/CatalogContext";
import type { HomepageContent } from "@/data/storefront";
import { normalizeImagePositions, type Product } from "@/data/products";
import type { DeliveryAddress } from "@/lib/deliveryAddress";
import { supabase } from "@/lib/supabase";

export type AdminOrderStatus = "pending_payment" | "payment_submitted" | "paid" | "rejected" | "cancelled" | "processing" | "shipped" | "delivered";

export type AdminOrder = {
  id: string;
  order_number: string;
  user_id: string;
  status: AdminOrderStatus;
  total_cents: number;
  currency: string;
  display_currency: string;
  fx_rate: number;
  shipping_region: string;
  shipping_address: DeliveryAddress | null;
  fulfillment_note: string | null;
  tracking_number: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  order_items: { id: string; product_name: string; finish: string; quantity: number; line_total_cents: number }[];
  manual_payment_submissions: { id: string; payment_method: string; reference_number: string; payer_name: string | null; created_at: string }[];
};

export type AdminProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AccountRole;
  created_at: string;
};

export type AdminOrderFulfillment = {
  order_id: string;
  tracking_number: string | null;
  fulfillment_note: string | null;
  admin_note: string | null;
};

export async function fetchAdminOrders() {
  if (!supabase) throw new Error("Supabase is not configured.");
  const [orderResult, fulfillmentResult] = await Promise.all([
    supabase
      .from("orders")
      .select("id,order_number,user_id,status,total_cents,currency,display_currency,fx_rate,shipping_region,shipping_address,created_at,updated_at,order_items(id,product_name,finish,quantity,line_total_cents),manual_payment_submissions(id,payment_method,reference_number,payer_name,created_at)")
      .order("created_at", { ascending: false }),
    supabase.from("order_fulfillment").select("order_id,tracking_number,fulfillment_note,admin_note"),
  ]);
  if (orderResult.error) throw orderResult.error;
  if (fulfillmentResult.error) throw fulfillmentResult.error;
  const fulfillment = new Map<string, AdminOrderFulfillment>((fulfillmentResult.data ?? []).map((row) => [row.order_id, row] as const));
  return ((orderResult.data ?? []) as Omit<AdminOrder, "tracking_number" | "fulfillment_note" | "admin_note">[]).map((order) => {
    const detail = fulfillment.get(order.id);
    return {
      ...order,
      tracking_number: detail?.tracking_number ?? null,
      fulfillment_note: detail?.fulfillment_note ?? null,
      admin_note: detail?.admin_note ?? null,
    } as AdminOrder;
  });
}

export async function updateAdminOrderStatus(orderId: string, status: AdminOrderStatus, fulfillmentNote: string, trackingNumber: string, adminNote: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("admin_update_order_status", {
    p_order_id: orderId,
    p_status: status,
    p_fulfillment_note: fulfillmentNote,
    p_tracking_number: trackingNumber,
    p_admin_note: adminNote,
  });
  if (error) throw error;
  return data;
}

export async function fetchAdminProducts() {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.from("products").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapProduct);
}

export async function saveAdminProduct(product: Product) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const image = product.image?.trim() || null;
  const images = (product.images ?? []).map((item) => item.trim()).filter((item) => item && item !== image);
  const { data, error } = await supabase.from("products").upsert({
    id: product.id,
    slug: product.slug.trim(),
    name: product.name.trim(),
    category: product.category.trim(),
    price_php_cents: Math.max(0, Math.round(product.price * 100)),
    badge: product.badge?.trim() || null,
    descriptor: product.descriptor.trim(),
    description: product.description.trim(),
    finishes: product.finishes,
    image_path: image,
    images,
    // Framing is written against the final photo list, so removing a photo cannot leave a stale crop behind.
    image_positions: normalizeImagePositions([image, ...images].filter((item): item is string => Boolean(item)), product.image_positions),
    visual: product.visual,
    specs: product.specs,
    fitment: product.fitment,
    featured: Boolean(product.featured),
    archived: Boolean(product.archived),
    sort_order: product.sortOrder ?? 0,
  }, { onConflict: "id" }).select("*").single();  if (error) throw error;
  return mapProduct(data);
}

export async function setAdminProductArchived(productId: string, archived: boolean) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.from("products").update({ archived }).eq("id", productId);
  if (error) throw error;
}

export async function setAdminProductFeatured(productId: string, featured: boolean) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.from("products").update({ featured }).eq("id", productId);
  if (error) throw error;
}

export async function fetchAdminHomepage() {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.from("homepage_content").select("*").eq("id", "primary").maybeSingle();
  if (error) throw error;
  return mapHomepage(data);
}

export async function saveAdminHomepage(content: HomepageContent) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.from("homepage_content").upsert({ id: "primary", ...content }, { onConflict: "id" }).select("*").single();
  if (error) throw error;
  return mapHomepage(data);
}

export async function fetchAdminProfiles() {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.from("profiles").select("id,email,full_name,role,created_at").order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AdminProfile[];
}

export async function setAdminProfileRole(email: string, role: AccountRole) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("set_profile_role_by_email", { p_email: email, p_role: role });
  if (error) throw error;
  return data;
}

function safeFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "asset";
}

export async function uploadStorefrontAsset(file: File, folder: "products" | "homepage") {
  if (!supabase) throw new Error("Supabase is not configured.");
  const unique = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${folder}/${unique}-${safeFileName(file.name)}`;
  const { error } = await supabase.storage.from("storefront-assets").upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from("storefront-assets").getPublicUrl(path);
  return data.publicUrl;
}
