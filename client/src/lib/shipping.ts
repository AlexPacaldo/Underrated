import type { DeliveryAddress, ShippingRegion } from "@/lib/deliveryAddress";
import type { Product } from "@/data/products";
import type { CartLine } from "@/contexts/StoreContext";
import { supabase } from "@/lib/supabase";

export type ShippingRate = {
  country_code: string;
  country_name: string;
  first_kg_cents: number;
  per_500g_cents: number;
  max_weight_kg: number;
  enabled: boolean;
  updated_at?: string;
};

export type ShippingQuote = {
  amount: number;
  weightKg: number;
  steps: number;
  rate: ShippingRate | null;
  error?: string;
};

function countryKey(value: string) {
  const compact = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (compact === "vietnam") return "vietnam";
  if (compact === "uae") return "unitedarabemirates";
  if (compact === "unitedstatesofamerica") return "unitedstates";
  if (compact === "unitedkingdomofgreatbritainandnorthernireland")
    return "unitedkingdom";
  return compact;
}

export function shippingCountryNameMatches(left: string, right: string) {
  return countryKey(left) === countryKey(right);
}

export async function fetchShippingRates() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("shipping_rates")
    .select(
      "country_code,country_name,first_kg_cents,per_500g_cents,max_weight_kg,enabled,updated_at"
    )
    .order("country_name");
  if (error) throw error;
  return (data ?? []) as ShippingRate[];
}

export async function saveShippingRate(rate: ShippingRate) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.from("shipping_rates").upsert({
    country_code: rate.country_code.trim().toUpperCase(),
    country_name: rate.country_name.trim(),
    first_kg_cents: rate.first_kg_cents,
    per_500g_cents: rate.per_500g_cents,
    max_weight_kg: rate.max_weight_kg,
    enabled: rate.enabled,
  });
  if (error) throw error;
}

export function quoteShipping(
  address: DeliveryAddress,
  region: ShippingRegion,
  cart: CartLine[],
  products: Product[],
  rates: ShippingRate[],
  subtotal: number,
  phpToUsdRate: number
): ShippingQuote {
  if (region === "ph")
    return {
      amount: subtotal >= 5000 ? 0 : 250 + (phpToUsdRate > 0 ? 6 / phpToUsdRate : 0),
      weightKg: 0,
      steps: 0,
      rate: null,
    };
  const lines = cart.map(line => ({
    product: products.find(item => item.id === line.id),
    line,
  }));
  if (
    lines.some(
      ({ product }) =>
        !product ||
        !Number.isFinite(product.shippingWeightKg) ||
        !product.shippingWeightKg ||
        product.shippingWeightKg <= 0
    )
  ) {
    return {
      amount: 0,
      weightKg: 0,
      steps: 0,
      rate: null,
      error:
        "Add a shipping weight to every item in the cart to calculate delivery.",
    };
  }
  const weightKg = lines.reduce(
    (sum, { product, line }) =>
      sum + product!.shippingWeightKg! * line.quantity,
    0
  );
  const code =
    address.country_code === "OTHER" ? "" : address.country_code.toUpperCase();
  const rate = rates.find(
    item =>
      item.enabled &&
      ((code && item.country_code.toUpperCase() === code) ||
        shippingCountryNameMatches(item.country_name, address.country))
  );
  if (!rate)
    return {
      amount: 0,
      weightKg,
      steps: 0,
      rate: null,
      error: `Shipping rates for ${address.country || "this destination"} are not configured. Please contact the store.`,
    };
  if (weightKg > rate.max_weight_kg)
    return {
      amount: 0,
      weightKg,
      steps: 0,
      rate,
      error: `This parcel exceeds the ${rate.max_weight_kg} kg limit for ${rate.country_name}.`,
    };
  const steps = weightKg <= 1 ? 0 : Math.ceil((weightKg - 1) / 0.5 - 1e-9);
  const baseAmount = (rate.first_kg_cents + steps * rate.per_500g_cents) / 100;
  return {
    amount: baseAmount + (phpToUsdRate > 0 ? 6 / phpToUsdRate : 0),
    weightKg,
    steps,
    rate,
  };
}
