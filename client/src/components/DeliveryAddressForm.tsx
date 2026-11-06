import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState, type ReactNode } from "react";
import type { DeliveryAddress } from "@/lib/deliveryAddress";
import {
  fetchShippingRates,
  shippingCountryNameMatches,
  type ShippingRate,
} from "@/lib/shipping";

type DeliveryAddressFormProps = {
  address: DeliveryAddress;
  onChange: (address: DeliveryAddress) => void;
  destinations?: ShippingRate[];
  destinationsLoading?: boolean;
};

const inputClass =
  "h-10 rounded-none border-white/15 bg-[#101113] text-sm text-white placeholder:text-white/30";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white/45">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function DeliveryAddressForm({
  address,
  onChange,
  destinations: suppliedDestinations,
  destinationsLoading,
}: DeliveryAddressFormProps) {
  const [loadedDestinations, setLoadedDestinations] = useState<ShippingRate[]>(
    []
  );
  const [destinationsLoaded, setDestinationsLoaded] = useState(false);
  useEffect(() => {
    if (suppliedDestinations) return;
    let active = true;
    fetchShippingRates()
      .then(rates => {
        if (active) setLoadedDestinations(rates.filter(rate => rate.enabled));
      })
      .catch(() => {
        if (active) setLoadedDestinations([]);
      })
      .finally(() => {
        if (active) setDestinationsLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [suppliedDestinations]);
  const destinations = (suppliedDestinations ?? loadedDestinations).filter(
    rate => rate.enabled && rate.country_code !== "PH"
  );
  const update = <K extends keyof DeliveryAddress>(
    field: K,
    value: DeliveryAddress[K]
  ) => {
    onChange({ ...address, [field]: value });
  };

  const updateCountryCode = (value: string) => {
    const destination = destinations.find(rate => rate.country_code === value);
    if (!destination) return;
    const countryCode: DeliveryAddress["country_code"] =
      value === "US" || value === "CA" ? value : "OTHER";
    onChange({
      ...address,
      country_code: countryCode,
      country: destination.country_name,
    });
  };
  const selectedCountry =
    address.country_code === "OTHER"
      ? (destinations.find(rate =>
          shippingCountryNameMatches(rate.country_name, address.country)
        )?.country_code ?? "")
      : destinations.some(rate => rate.country_code === address.country_code)
        ? address.country_code
        : "";

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Recipient name">
          <Input
            required
            autoComplete="name"
            value={address.recipient_name}
            onChange={event => update("recipient_name", event.target.value)}
            className={inputClass}
            placeholder="Full name"
          />
        </Field>
        <Field label="Phone">
          <Input
            required
            type="tel"
            autoComplete="tel"
            value={address.phone}
            onChange={event => update("phone", event.target.value)}
            className={inputClass}
            placeholder="Phone number"
          />
        </Field>
      </div>
      <Field label="Address line 1">
        <Input
          required
          autoComplete="address-line1"
          value={address.line1}
          onChange={event => update("line1", event.target.value)}
          className={inputClass}
          placeholder="Street address"
        />
      </Field>
      <Field label="Address line 2 (optional)">
        <Input
          autoComplete="address-line2"
          value={address.line2}
          onChange={event => update("line2", event.target.value)}
          className={inputClass}
          placeholder="Apartment, unit, or floor"
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="City">
          <Input
            required
            autoComplete="address-level2"
            value={address.city}
            onChange={event => update("city", event.target.value)}
            className={inputClass}
            placeholder="City"
          />
        </Field>
        <Field label="State / region">
          <Input
            required
            autoComplete="address-level1"
            value={address.region}
            onChange={event => update("region", event.target.value)}
            className={inputClass}
            placeholder="State or region"
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Postal code">
          <Input
            required
            autoComplete="postal-code"
            value={address.postal_code}
            onChange={event => update("postal_code", event.target.value)}
            className={inputClass}
            placeholder="Postal code"
          />
        </Field>
        <Field label="Country">
          <Select value={selectedCountry} onValueChange={updateCountryCode}>
            <SelectTrigger className="h-10 w-full rounded-none border-white/15 bg-[#101113] text-sm text-white">
              <SelectValue placeholder="Select country" />
            </SelectTrigger>
            <SelectContent className="rounded-none border-white/15 bg-[#151719] text-white">
              {destinations.map(destination => (
                <SelectItem
                  key={destination.country_code}
                  value={destination.country_code}
                  className="focus:bg-[#ff5a36] focus:text-black"
                >
                  {destination.country_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      {suppliedDestinations ? (
        destinationsLoading ? (
          <p className="text-[10px] text-white/35">
            Loading available destinations…
          </p>
        ) : destinations.length === 0 ? (
          <p className="text-[10px] text-white/35">
            No international destinations are currently available.
          </p>
        ) : null
      ) : !destinationsLoaded ? (
        <p className="text-[10px] text-white/35">
          Loading available destinations…
        </p>
      ) : destinations.length === 0 ? (
        <p className="text-[10px] text-white/35">
          No international destinations are currently available.
        </p>
      ) : null}
      <Field label="Delivery instructions (optional)">
        <Textarea
          autoComplete="street-address"
          value={address.delivery_instructions}
          onChange={event =>
            update("delivery_instructions", event.target.value)
          }
          className="min-h-20 rounded-none border-white/15 bg-[#101113] text-sm text-white placeholder:text-white/30"
          placeholder="Gate code, landmark, or courier notes"
        />
      </Field>
    </div>
  );
}
