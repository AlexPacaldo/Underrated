import { normalizeDeliveryAddress, type DeliveryAddress, type DeliveryCountryCode } from "@/lib/deliveryAddress";
import { supabase } from "@/lib/supabase";

export type AccountAddress = {
  id: string;
  label: string;
  is_default: boolean;
  recipient_name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  country_code: DeliveryCountryCode;
  delivery_instructions: string;
  created_at: string;
  updated_at: string;
};

export type AccountAddressInput = {
  label: string;
  address: DeliveryAddress;
  /** The first address a rider saves becomes the default either way. */
  isDefault?: boolean;
};

export type AccountAddressUpdate = {
  label: string;
  address: DeliveryAddress;
  isDefault?: boolean;
};

const addressColumns =
  "id,label,is_default,recipient_name,phone,line1,line2,city,region,postal_code,country,country_code,delivery_instructions,created_at,updated_at";

/** The checkout and the order history both work in DeliveryAddress shape. */
export function toDeliveryAddress(row: AccountAddress): DeliveryAddress {
  return normalizeDeliveryAddress(row);
}

function toRow(input: { label: string; address: DeliveryAddress }, isDefault: boolean | undefined) {
  const address = normalizeDeliveryAddress(input.address);
  return {
    label: input.label.trim(),
    recipient_name: address.recipient_name,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    region: address.region,
    postal_code: address.postal_code,
    country: address.country,
    country_code: address.country_code,
    delivery_instructions: address.delivery_instructions,
    ...(isDefault === undefined ? {} : { is_default: isDefault }),
  };
}

export async function fetchAccountAddresses() {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase
    .from("addresses")
    .select(addressColumns)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as AccountAddress[];
}

export async function createAccountAddress(input: AccountAddressInput) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase
    .from("addresses")
    .insert(toRow(input, input.isDefault))
    .select(addressColumns)
    .single();

  if (error) throw error;
  return data as AccountAddress;
}

export async function updateAccountAddress(id: string, input: AccountAddressUpdate) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase
    .from("addresses")
    .update(toRow(input, input.isDefault))
    .eq("id", id)
    .select(addressColumns)
    .single();

  if (error) throw error;
  return data as AccountAddress;
}

/** Promoting only writes the flag, so it never has to resend the address fields. */
export async function setDefaultAccountAddress(id: string) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase
    .from("addresses")
    .update({ is_default: true })
    .eq("id", id)
    .select(addressColumns)
    .single();

  if (error) throw error;
  return data as AccountAddress;
}

export async function deleteAccountAddress(id: string) {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { error } = await supabase.from("addresses").delete().eq("id", id);
  if (error) throw error;
}
