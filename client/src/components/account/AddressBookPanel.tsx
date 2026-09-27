/**
 * Design direction: Technical Drop Editorial - the address book is a flat list of destinations, not a grid of cards.
 */
import { useState } from "react";
import { MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAddressBook } from "@/contexts/AddressBookContext";
import { formatDeliveryAddress } from "@/lib/deliveryAddress";
import type { AccountAddress } from "@/lib/accountAddresses";
import AddressFormDialog, { type AddressFormValue } from "@/components/account/AddressFormDialog";

function AddressRow({ address, onEdit }: { address: AccountAddress; onEdit: (address: AccountAddress) => void }) {
  const { promoteAddress, removeAddress } = useAddressBook();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const handlePromote = async () => {
    setBusy(true);
    try {
      await promoteAddress(address.id);
      toast.success("Default address updated.");
    } catch (error) {
      toast.error("Could not set the default address.", { description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }

    setBusy(true);
    try {
      await removeAddress(address.id);
      setConfirmingDelete(false);
      toast.success("Address removed.");
    } catch (error) {
      toast.error("Could not remove the address.", { description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="grid gap-4 border-b border-white/10 py-5 sm:grid-cols-[1fr_auto] sm:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-2xl uppercase leading-none text-white">{address.label || "Delivery address"}</h3>
          {address.is_default ? (
            <span className="inline-flex items-center gap-1 border border-[#ff5a36]/45 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#ff5a36]">
              <Star size={10} /> Default
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-sm font-bold text-white">{address.recipient_name}</p>
        <p className="mt-1 text-xs leading-5 text-white/55">{formatDeliveryAddress(address)}</p>
        <p className="mt-1 text-xs text-white/40">{address.phone}</p>
        {address.delivery_instructions ? <p className="mt-2 border-l border-[#ff5a36]/40 pl-3 text-xs leading-5 text-white/40">{address.delivery_instructions}</p> : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {!address.is_default ? (
          <button type="button" onClick={handlePromote} disabled={busy} className="flex items-center gap-1.5 border border-white/15 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white/50 transition hover:border-white/40 hover:text-white disabled:opacity-50">
            <Star size={11} /> Set default
          </button>
        ) : null}
        <button type="button" onClick={() => onEdit(address)} className="flex items-center gap-1.5 border border-white/15 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white/50 transition hover:border-white/40 hover:text-white">
          <Pencil size={11} /> Edit
        </button>
        <button type="button" onClick={handleDelete} disabled={busy} onBlur={() => setConfirmingDelete(false)} className={`flex items-center gap-1.5 border px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] transition disabled:opacity-50 ${confirmingDelete ? "border-[#ff5a36] bg-[#ff5a36] text-black" : "border-white/15 text-white/50 hover:border-[#ff5a36]/60 hover:text-[#ff5a36]"}`}>
          <Trash2 size={11} /> {confirmingDelete ? "Confirm" : "Remove"}
        </button>
      </div>
    </article>
  );
}

export default function AddressBookPanel() {
  const { addresses, loading, error, addAddress, editAddress } = useAddressBook();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AccountAddress | null>(null);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (address: AccountAddress) => {
    setEditing(address);
    setDialogOpen(true);
  };

  const handleSubmit = async (value: AddressFormValue) => {
    if (editing) {
      await editAddress(editing.id, value);
      toast.success("Address updated.");
      return;
    }

    await addAddress(value);
    toast.success("Address saved.", { description: value.isDefault ? "It is now your default delivery address." : undefined });
  };

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 pb-4">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">
          {addresses.length === 1 ? "1 saved address" : `${addresses.length} saved addresses`}
        </p>
        <button type="button" onClick={openNew} className="flex items-center gap-2 border border-[#ff5a36] bg-[#ff5a36] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] text-black transition hover:bg-white hover:border-white">
          <Plus size={13} /> Add address
        </button>
      </div>

      {loading ? <p className="py-10 text-sm text-white/45">Loading your addresses...</p> : null}
      {error ? <p className="py-10 text-sm text-[#ff5a36]">{error}</p> : null}

      {!loading && !error && addresses.length === 0 ? (
        <div className="flex min-h-64 flex-col justify-end border-b border-white/15 pb-8">
          <span className="font-display text-5xl uppercase leading-[0.78] text-white/15">No saved<br />addresses.</span>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/45">Save the places you ship to and pick one at checkout without retyping it every time.</p>
          <button type="button" onClick={openNew} className="mt-6 inline-flex w-fit items-center gap-2 bg-[#ff5a36] px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-black transition hover:bg-white">
            <MapPin size={14} /> Add your first address
          </button>
        </div>
      ) : null}

      <div>
        {addresses.map((address) => (
          <AddressRow key={address.id} address={address} onEdit={openEdit} />
        ))}
      </div>

      <AddressFormDialog open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} onSubmit={handleSubmit} />
    </section>
  );
}
