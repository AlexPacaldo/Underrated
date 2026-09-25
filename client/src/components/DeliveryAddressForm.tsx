import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ReactNode } from "react";
import type { DeliveryAddress } from "@/lib/deliveryAddress";

type DeliveryAddressFormProps = {
  address: DeliveryAddress;
  onChange: (address: DeliveryAddress) => void;
};

const inputClass = "h-10 rounded-none border-white/15 bg-[#101113] text-sm text-white placeholder:text-white/30";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white/45">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function DeliveryAddressForm({ address, onChange }: DeliveryAddressFormProps) {
  const update = <K extends keyof DeliveryAddress>(field: K, value: DeliveryAddress[K]) => {
    onChange({ ...address, [field]: value });
  };

  const updateCountryCode = (value: string) => {
    const countryCode = value as DeliveryAddress["country_code"];
    onChange({
      ...address,
      country_code: countryCode,
      country: countryCode === "US" ? "United States" : countryCode === "CA" ? "Canada" : "",
    });
  };

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Recipient name">
          <Input required autoComplete="name" value={address.recipient_name} onChange={(event) => update("recipient_name", event.target.value)} className={inputClass} placeholder="Full name" />
        </Field>
        <Field label="Phone">
          <Input required type="tel" autoComplete="tel" value={address.phone} onChange={(event) => update("phone", event.target.value)} className={inputClass} placeholder="Phone number" />
        </Field>
      </div>
      <Field label="Address line 1">
        <Input required autoComplete="address-line1" value={address.line1} onChange={(event) => update("line1", event.target.value)} className={inputClass} placeholder="Street address" />
      </Field>
      <Field label="Address line 2 (optional)">
        <Input autoComplete="address-line2" value={address.line2} onChange={(event) => update("line2", event.target.value)} className={inputClass} placeholder="Apartment, unit, or floor" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="City">
          <Input required autoComplete="address-level2" value={address.city} onChange={(event) => update("city", event.target.value)} className={inputClass} placeholder="City" />
        </Field>
        <Field label="State / region">
          <Input required autoComplete="address-level1" value={address.region} onChange={(event) => update("region", event.target.value)} className={inputClass} placeholder="State or region" />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Postal code">
          <Input required autoComplete="postal-code" value={address.postal_code} onChange={(event) => update("postal_code", event.target.value)} className={inputClass} placeholder="Postal code" />
        </Field>
        <Field label="Country">
          <Select value={address.country_code} onValueChange={updateCountryCode}>
            <SelectTrigger className="h-10 w-full rounded-none border-white/15 bg-[#101113] text-sm text-white"><SelectValue placeholder="Select country" /></SelectTrigger>
            <SelectContent className="rounded-none border-white/15 bg-[#151719] text-white">
              <SelectItem value="US" className="focus:bg-[#ff5a36] focus:text-black">United States</SelectItem>
              <SelectItem value="CA" className="focus:bg-[#ff5a36] focus:text-black">Canada</SelectItem>
              <SelectItem value="OTHER" className="focus:bg-[#ff5a36] focus:text-black">Another country</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      {address.country_code === "OTHER" ? (
        <Field label="Country name">
          <Input required autoComplete="country-name" value={address.country} onChange={(event) => update("country", event.target.value)} className={inputClass} placeholder="Country" />
        </Field>
      ) : null}
      <Field label="Delivery instructions (optional)">
        <Textarea autoComplete="street-address" value={address.delivery_instructions} onChange={(event) => update("delivery_instructions", event.target.value)} className="min-h-20 rounded-none border-white/15 bg-[#101113] text-sm text-white placeholder:text-white/30" placeholder="Gate code, landmark, or courier notes" />
      </Field>
    </div>
  );
}
