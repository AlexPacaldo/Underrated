/**
 * Design direction: Technical Drop Editorial - the address editor is a workshop form: square fields, hairline borders, one stamped action.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import DeliveryAddressForm from "@/components/DeliveryAddressForm";
import { emptyDeliveryAddress, isValidDeliveryAddress, type DeliveryAddress } from "@/lib/deliveryAddress";
import type { AccountAddress } from "@/lib/accountAddresses";

export type AddressFormValue = {
  label: string;
  address: DeliveryAddress;
  /** Omitted when the rider never touched the checkbox, so editing cannot demote a default. */
  isDefault?: boolean;
};

type AddressFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: AccountAddress | null;
  /** The default flag is only sent when the rider touches it, so editing never silently promotes. */
  onSubmit: (value: AddressFormValue) => Promise<void>;
};

const inputClass = "h-10 rounded-none border-white/15 bg-[#101113] text-sm text-white placeholder:text-white/30";

export default function AddressFormDialog({ open, onOpenChange, initial, onSubmit }: AddressFormDialogProps) {
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState<DeliveryAddress>(emptyDeliveryAddress);
  const [isDefault, setIsDefault] = useState(false);
  const [defaultTouched, setDefaultTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel(initial?.label ?? "");
    setAddress(
      initial
        ? {
            recipient_name: initial.recipient_name,
            phone: initial.phone,
            line1: initial.line1,
            line2: initial.line2,
            city: initial.city,
            region: initial.region,
            postal_code: initial.postal_code,
            country: initial.country,
            country_code: initial.country_code,
            delivery_instructions: initial.delivery_instructions,
          }
        : emptyDeliveryAddress,
    );
    setIsDefault(initial?.is_default ?? false);
    setDefaultTouched(false);
    setError(null);
  }, [initial, open]);

  const handleSubmit = async () => {
    if (!isValidDeliveryAddress(address)) {
      setError("Fill in the recipient, contact, and destination fields before saving.");
      return;
    }

    setSaving(true);
    try {
      await onSubmit({ label, address, isDefault: defaultTouched ? isDefault : undefined });
      onOpenChange(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The address could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl gap-0 overflow-y-auto rounded-none border-white/15 bg-[#111214] p-0 text-white sm:max-w-2xl">
        <DialogHeader className="border-b border-white/10 px-5 py-4 text-left">
          <DialogTitle className="font-display text-2xl uppercase text-white">{initial ? "Edit address" : "New address"}</DialogTitle>
          <DialogDescription className="text-xs leading-5 text-white/45">Saved addresses can be picked again at checkout, and the default one is offered first.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 px-5 py-5">
          <label className="grid gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white/45">
            <span>Label</span>
            <Input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={60} placeholder="Home, Office, Parents'" className={inputClass} />
          </label>

          <DeliveryAddressForm address={address} onChange={setAddress} />

          <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-white/55">
            <Checkbox
              checked={isDefault}
              onCheckedChange={(checked) => {
                setIsDefault(checked === true);
                setDefaultTouched(true);
              }}
              className="mt-0.5 rounded-none border-white/25 data-[state=checked]:border-[#ff5a36] data-[state=checked]:bg-[#ff5a36] data-[state=checked]:text-black"
            />
            <span>Make this my default delivery address.</span>
          </label>

          {error ? <p className="text-xs leading-5 text-[#ff5a36]">{error}</p> : null}
        </div>

        <DialogFooter className="flex-row items-center justify-end gap-3 border-t border-white/10 px-5 py-4">
          <button type="button" onClick={() => onOpenChange(false)} className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-white/45 transition hover:text-white">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving} className="bg-[#ff5a36] px-5 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-black transition hover:bg-white disabled:cursor-wait disabled:opacity-60">
            {saving ? "Saving..." : "Save address"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
