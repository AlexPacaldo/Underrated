export type ShippingRegion = "us" | "canada" | "international";
export type DeliveryCountryCode = "US" | "CA" | "OTHER";

export type DeliveryAddress = {
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
};

export const emptyDeliveryAddress: DeliveryAddress = {
  recipient_name: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postal_code: "",
  country: "",
  country_code: "OTHER",
  delivery_instructions: "",
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeDeliveryAddress(value: unknown): DeliveryAddress {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawCountryCode = typeof source.country_code === "string" ? source.country_code.toUpperCase() : "";
  const countryCode: DeliveryCountryCode = rawCountryCode === "US" || rawCountryCode === "CA" || rawCountryCode === "OTHER" ? rawCountryCode : "OTHER";
  const country = countryCode === "US" ? "United States" : countryCode === "CA" ? "Canada" : text(source.country);

  return {
    recipient_name: text(source.recipient_name),
    phone: text(source.phone),
    line1: text(source.line1),
    line2: text(source.line2),
    city: text(source.city),
    region: text(source.region),
    postal_code: text(source.postal_code),
    country,
    country_code: countryCode,
    delivery_instructions: text(source.delivery_instructions),
  };
}

export function isValidDeliveryAddress(address: DeliveryAddress | null | undefined) {
  const normalized = normalizeDeliveryAddress(address);
  return Boolean(
    (address?.country_code === "US" || address?.country_code === "CA" || address?.country_code === "OTHER") &&
      normalized.recipient_name &&
      normalized.phone &&
      normalized.line1 &&
      normalized.city &&
      normalized.region &&
      normalized.postal_code &&
      normalized.country,
  );
}

export function shippingRegionForAddress(address: DeliveryAddress | null | undefined): ShippingRegion {
  if (address?.country_code === "US") return "us";
  if (address?.country_code === "CA") return "canada";
  return "international";
}

export function formatDeliveryAddress(address: DeliveryAddress | null | undefined) {
  const normalized = normalizeDeliveryAddress(address);
  return [normalized.line1, normalized.line2, normalized.city, normalized.region, normalized.postal_code, normalized.country].filter(Boolean).join(", ");
}
