/**
 * Design direction: Technical Drop Editorial — the cart is a sliding workshop drawer with plain-language prototype status.
 */
import { useCatalog } from "@/contexts/CatalogContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useAuth } from "@/contexts/AuthContext";
import DeliveryAddressForm from "@/components/DeliveryAddressForm";
import { Checkbox } from "@/components/ui/checkbox";
import { emptyDeliveryAddress, formatDeliveryAddress, isValidDeliveryAddress, normalizeDeliveryAddress, shippingRegionForAddress, type DeliveryAddress, type ShippingRegion } from "@/lib/deliveryAddress";
import { useStore } from "@/contexts/StoreContext";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createManualOrder, submitManualPayment, type ManualOrder, type ManualPaymentMethod } from "@/lib/manualOrders";
import { Banknote, MapPin, Minus, PackageCheck, Plus, QrCode, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import ProductVisual from "@/components/ProductVisual";

const shippingRegions: { value: ShippingRegion; label: string; timing: string }[] = [
  { value: "ph", label: "Philippines", timing: "2–4 business days" },
  { value: "us", label: "United States", timing: "5–8 business days" },
  { value: "canada", label: "Canada", timing: "7–10 business days" },
  { value: "international", label: "International", timing: "10–18 business days" },
];

const paymentDetails = {
  gcashName: import.meta.env.VITE_GCASH_ACCOUNT_NAME || "Set VITE_GCASH_ACCOUNT_NAME",
  gcashNumber: import.meta.env.VITE_GCASH_ACCOUNT_NUMBER || "Set VITE_GCASH_ACCOUNT_NUMBER",
  gcashQr: import.meta.env.VITE_GCASH_QR_IMAGE_URL || "",
  bankName: import.meta.env.VITE_BANK_NAME || "Set VITE_BANK_NAME",
  bankAccountName: import.meta.env.VITE_BANK_ACCOUNT_NAME || "Set VITE_BANK_ACCOUNT_NAME",
  bankAccountNumber: import.meta.env.VITE_BANK_ACCOUNT_NUMBER || "Set VITE_BANK_ACCOUNT_NUMBER",
};

export default function CartDrawer() {
  const { user, profile, isConfigured, signInWithGoogle, saveDefaultAddress } = useAuth();
  const { products } = useCatalog();
  const { currency, rate, rateReady, formatMoney } = useCurrency();
  const { cart, cartOpen, closeCart, subtotal, updateQuantity, removeLine, clearCart } = useStore();
  const [deliveryAddress, setDeliveryAddress] = useState<DeliveryAddress>(emptyDeliveryAddress);
  const [addressMode, setAddressMode] = useState<"saved" | "new">("new");
  const [saveAsDefault, setSaveAsDefault] = useState(true);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [manualOrder, setManualOrder] = useState<ManualOrder | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<ManualPaymentMethod>("gcash_qr");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [payerName, setPayerName] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const savedAddress = profile && user && profile.id === user.id ? profile.default_shipping_address : null;
  const normalizedSavedAddress = savedAddress ? normalizeDeliveryAddress(savedAddress) : null;
  const hasSavedAddress = Boolean(normalizedSavedAddress && isValidDeliveryAddress(normalizedSavedAddress));
  const savedAddressKey = savedAddress ? JSON.stringify(savedAddress) : null;

  useEffect(() => {
    const nextSavedAddress = savedAddressKey ? normalizeDeliveryAddress(savedAddress) : null;
    if (nextSavedAddress && isValidDeliveryAddress(nextSavedAddress)) {
      setDeliveryAddress(nextSavedAddress);
      setAddressMode("saved");
      setSaveAsDefault(false);
    } else {
      setDeliveryAddress(emptyDeliveryAddress);
      setAddressMode("new");
      setSaveAsDefault(true);
    }
    setAddressError(null);
  }, [savedAddressKey, user?.id]);

  useEffect(() => {
    setManualOrder(null);
    setPaymentMethod("gcash_qr");
    setReferenceNumber("");
    setPayerName("");
    setPaymentNote("");
    setAddressError(null);
  }, [user?.id]);

  const activeAddress = addressMode === "saved" && normalizedSavedAddress && hasSavedAddress ? normalizedSavedAddress : deliveryAddress;
  const addressIsValid = isValidDeliveryAddress(activeAddress);
  const activeShippingRegion = shippingRegionForAddress(activeAddress);
  const selectedRegion = shippingRegions.find((region) => region.value === activeShippingRegion) ?? shippingRegions[shippingRegions.length - 1];
  const shipping = useMemo(() => {
    if (cart.length === 0 || !addressIsValid) return 0;
    if (activeShippingRegion === "ph") return subtotal >= 5000 ? 0 : 250;
    if (activeShippingRegion === "us") return subtotal >= 5000 ? 0 : 800;
    if (activeShippingRegion === "canada") return subtotal >= 7500 ? 0 : 1200;
    return 1800;
  }, [activeShippingRegion, addressIsValid, cart.length, subtotal]);
  const estimatedTotal = subtotal + shipping;
  const displayedTotal = manualOrder ? manualOrder.total_cents / 100 : estimatedTotal;
  const unavailableLines = cart.filter((line) => !products.some((product) => product.id === line.id));
  const hasUnavailableLines = unavailableLines.length > 0;
  const exchangeRatePending = currency !== "PHP" && !rateReady;
  const checkoutBlocked = hasUnavailableLines || exchangeRatePending;

  const handleAddressChange = (nextAddress: DeliveryAddress) => {
    setDeliveryAddress(nextAddress);
    setAddressMode("new");
    setAddressError(null);
  };

  const handleUseSavedAddress = () => {
    if (!normalizedSavedAddress || !hasSavedAddress) return;
    setDeliveryAddress(normalizedSavedAddress);
    setAddressMode("saved");
    setSaveAsDefault(false);
    setAddressError(null);
  };

  const handleEditAddress = () => {
    setDeliveryAddress(normalizedSavedAddress ?? emptyDeliveryAddress);
    setAddressMode("new");
    setSaveAsDefault(true);
    setAddressError(null);
  };

  const handleUseDifferentAddress = () => {
    setDeliveryAddress(emptyDeliveryAddress);
    setAddressMode("new");
    setSaveAsDefault(false);
    setAddressError(null);
  };

  const handleCreateOrder = async () => {
    if (!isConfigured) {
      toast.error("Supabase is not configured yet.", { description: "Add the Supabase environment variables before taking manual orders." });
      return;
    }

    if (!user) {
      try {
        await signInWithGoogle();
      } catch (error) {
        toast.error("Google sign-in failed.", { description: error instanceof Error ? error.message : "Try again in a moment." });
      }
      return;
    }

    if (cart.length === 0) return;

    if (hasUnavailableLines) {
      toast.error("Remove unavailable items first.", { description: "A part in your build was archived or removed from the catalog." });
      return;
    }

    if (exchangeRatePending) {
      toast.error("Exchange rate is still loading.", { description: "Wait a moment, or switch back to PHP to continue." });
      return;
    }

    const address = normalizeDeliveryAddress(addressMode === "saved" ? normalizedSavedAddress : deliveryAddress);
    if (!isValidDeliveryAddress(address)) {
      setAddressError("Enter the required delivery address fields before reserving the order.");
      toast.error("Delivery address needed.", { description: "Add the recipient, contact, and destination details for this order." });
      return;
    }

    setCreatingOrder(true);
    try {
      if (addressMode === "new" && saveAsDefault) await saveDefaultAddress(address);

      const order = await createManualOrder({ cart, shippingRegion: shippingRegionForAddress(address), shippingAddress: address, displayCurrency: currency, fxRate: rate });
      setManualOrder(order);
      setAddressError(null);
      toast.success("Order reserved.", { description: `Use ${order.order_number} as your payment note if possible.` });
    } catch (error) {
      toast.error("Could not create order.", { description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setCreatingOrder(false);
    }
  };

  const handleSubmitPayment = async () => {
    if (!manualOrder || !referenceNumber.trim()) {
      toast.error("Reference number required.", { description: "Enter the GCash or bank transaction reference before submitting." });
      return;
    }

    setSubmittingPayment(true);
    try {
      const order = await submitManualPayment(manualOrder.id, paymentMethod, referenceNumber, payerName, paymentNote);
      setManualOrder(order);
      clearCart();
      toast.success("Payment reference submitted.", { description: "We'll verify it against the received payment before fulfillment." });
    } catch (error) {
      toast.error("Could not submit payment.", { description: error instanceof Error ? error.message : "Please try again." });
    } finally {
      setSubmittingPayment(false);
    }
  };

  return (
    <div className={`fixed inset-0 z-50 ${cartOpen ? "pointer-events-auto" : "pointer-events-none"}`} aria-hidden={!cartOpen} inert={!cartOpen}>
      <button onClick={closeCart} className={`absolute inset-0 bg-black/65 transition-opacity duration-300 ${cartOpen ? "opacity-100" : "opacity-0"}`} aria-label="Close cart" />
      <aside className={`absolute inset-y-0 right-0 flex w-full max-w-[480px] flex-col border-l border-white/10 bg-[#101113] shadow-2xl transition-transform duration-300 ${cartOpen ? "translate-x-0" : "translate-x-full"}`} aria-label="Shopping cart">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
          <span className="font-display text-3xl uppercase text-white">Your build</span>
          <button onClick={closeCart} className="grid size-9 place-items-center border border-white/15 text-white hover:border-[#ff5a36] hover:text-[#ff5a36]" aria-label="Close cart"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {cart.length === 0 ? (
            <div className="flex h-full min-h-72 flex-col justify-end border-b border-white/10 pb-8">
              <span className="font-display text-6xl uppercase leading-[0.78] text-white/15">No parts<br />yet.</span>
              <p className="mt-5 max-w-xs text-sm leading-relaxed text-white/45">The good builds start with one considered detail.</p>
            </div>
          ) : cart.map((line) => {
            const product = products.find((item) => item.id === line.id);
            if (!product) {
              return (
                <div key={`${line.id}-${line.finish}`} className="flex items-center justify-between gap-3 border-b border-white/10 py-4">
                  <div className="min-w-0">
                    <p className="font-display text-xl uppercase leading-none text-white/45">Unavailable part</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">{line.finish} · archived from the catalog</p>
                  </div>
                  <button onClick={() => removeLine(line.id, line.finish)} className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-[#ff5a36] hover:text-white">Remove</button>
                </div>
              );
            }
            return (
              <div key={`${line.id}-${line.finish}`} className="flex gap-3 border-b border-white/10 py-4">
                <div className="size-20 shrink-0 overflow-hidden bg-[#1a1b1e]"><ProductVisual product={product} compact /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div><p className="font-display text-xl uppercase leading-none text-white">{product.name}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">{line.finish}</p></div>
                    <button onClick={() => removeLine(line.id, line.finish)} className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40 hover:text-[#ff5a36]">Remove</button>
                  </div>
                  <div className="mt-4 flex items-center justify-between"><div className="flex items-center border border-white/15"><button onClick={() => updateQuantity(line.id, line.finish, line.quantity - 1)} className="grid size-7 place-items-center text-white/60 hover:text-white" aria-label={`Decrease ${product.name} quantity`}><Minus size={13} /></button><span className="grid w-7 place-items-center text-xs font-bold text-white">{line.quantity}</span><button onClick={() => updateQuantity(line.id, line.finish, line.quantity + 1)} className="grid size-7 place-items-center text-white/60 hover:text-white" aria-label={`Increase ${product.name} quantity`}><Plus size={13} /></button></div><span className="text-sm font-bold text-white">{formatMoney(product.price * line.quantity)}</span></div>
                </div>
              </div>
            );
          })}
          {cart.length > 0 && !manualOrder ? (
            user ? (
              <section className="mt-5 border border-white/10 bg-[#151719] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/55"><MapPin size={14} className="text-[#ff5a36]" />Delivery address</p>
                    <p className="mt-1 text-xs text-white/40">Tell us exactly where this order should go.</p>
                  </div>
                  {hasSavedAddress && addressMode === "saved" ? <button type="button" onClick={handleEditAddress} className="shrink-0 text-[10px] font-black uppercase tracking-[0.12em] text-[#ff5a36] hover:text-white">Change</button> : null}
                </div>
                {hasSavedAddress && addressMode === "saved" ? (
                  <div className="mt-4 border border-white/10 bg-[#101113] p-3">
                    <p className="text-sm font-bold text-white">{activeAddress.recipient_name}</p>
                    <p className="mt-1 text-xs leading-5 text-white/55">{formatDeliveryAddress(activeAddress)}</p>
                    <p className="mt-1 text-xs text-white/40">{activeAddress.phone}</p>
                  </div>
                ) : (
                  <>
                    {hasSavedAddress ? <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2"><button type="button" onClick={handleUseSavedAddress} className="text-[10px] font-black uppercase tracking-[0.12em] text-[#ff5a36] hover:text-white">Use saved address</button><button type="button" onClick={handleUseDifferentAddress} className="text-[10px] font-black uppercase tracking-[0.12em] text-white/45 hover:text-white">Start with a different address</button></div> : null}
                    <DeliveryAddressForm address={deliveryAddress} onChange={handleAddressChange} />
                    <label className="mt-4 flex cursor-pointer items-start gap-2 text-xs leading-5 text-white/55">
                      <Checkbox checked={saveAsDefault} onCheckedChange={(checked) => setSaveAsDefault(checked === true)} className="mt-0.5 rounded-none border-white/25 data-[state=checked]:border-[#ff5a36] data-[state=checked]:bg-[#ff5a36] data-[state=checked]:text-black" />
                      <span>Save this as my default delivery address for future orders.</span>
                    </label>
                  </>
                )}
                {addressError ? <p className="mt-3 text-xs leading-5 text-[#ff5a36]">{addressError}</p> : null}
              </section>
            ) : (
              <section className="mt-5 border border-white/10 bg-[#151719] p-4">
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/55"><MapPin size={14} className="text-[#ff5a36]" />Delivery address</p>
                <p className="mt-2 text-xs leading-5 text-white/45">Sign in first, then we’ll ask where this order should be delivered and save it for next time.</p>
              </section>
            )
          ) : null}
        </div>
        <div className="border-t border-white/10 p-5">
          {cart.length > 0 && !manualOrder ? <div className="mb-5 border-y border-white/10 py-4"><div className="flex items-center justify-between gap-4"><div><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em] text-white/60"><MapPin size={14} className="text-[#ff5a36]" />Delivery estimate</p><p className="mt-1 text-xs text-white/40">{addressIsValid ? `${selectedRegion.label} · ${selectedRegion.timing}` : "Enter a delivery address to calculate shipping."}</p></div></div><div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3"><p className="flex items-center gap-2 text-xs text-white/55"><PackageCheck size={15} className="text-[#ff5a36]" />{addressIsValid ? selectedRegion.timing : "Address needed"}</p><span className={`text-xs font-bold ${addressIsValid && shipping === 0 ? "text-[#ff5a36]" : "text-white"}`}>{!addressIsValid ? "—" : shipping === 0 ? "Shipping included" : formatMoney(shipping)}</span></div></div> : null}
          {cart.length > 0 ? <div className="space-y-2 border-b border-white/10 pb-4"><div className="flex items-baseline justify-between"><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Parts subtotal</span><span className="text-sm font-bold text-white">{formatMoney(subtotal)}</span></div><div className="flex items-baseline justify-between"><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Estimated shipping</span><span className="text-sm font-bold text-white">{!addressIsValid ? "Address needed" : shipping === 0 ? "Included" : formatMoney(shipping)}</span></div></div> : null}
          <div className="mb-4 mt-4 flex items-baseline justify-between"><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/65">{manualOrder ? "Order total" : "Estimated total"}</span><span className="font-display text-3xl text-white">{manualOrder ? formatMoney(manualOrder.total_cents / 100, manualOrder.display_currency, manualOrder.fx_rate) : formatMoney(displayedTotal)}</span></div>
          {manualOrder ? (
            <div className="space-y-4">
              <div className="border border-white/10 bg-[#151719] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">Order reserved</p>
                    <p className="mt-1 font-display text-3xl uppercase text-white">{manualOrder.order_number}</p>
                  </div>
                  <span className="border border-[#ff5a36]/35 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#ff5a36]">{manualOrder.status.replace("_", " ")}</span>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-white/50">Pay the exact PHP total of <span className="font-bold text-white">{formatMoney(manualOrder.total_cents / 100, "PHP", 1)}</span>, then submit the transaction reference. The converted estimate is for display only; verification uses the PHP order total.</p>
              </div>

              {manualOrder.status === "pending_payment" ? (
                <>
                  <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as ManualPaymentMethod)}>
                    <SelectTrigger className="h-11 rounded-none border-white/20 bg-[#151719] text-xs text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-none border-white/15 bg-[#151719] text-white">
                      <SelectItem value="gcash_qr" className="focus:bg-[#ff5a36] focus:text-black">GCash QR</SelectItem>
                      <SelectItem value="bank_transfer" className="focus:bg-[#ff5a36] focus:text-black">Bank transfer</SelectItem>
                    </SelectContent>
                  </Select>

                  {paymentMethod === "gcash_qr" ? (
                    <div className="grid gap-3 border border-white/10 p-4">
                      <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/55"><QrCode size={14} className="text-[#ff5a36]" />GCash details</p>
                      {paymentDetails.gcashQr ? <img src={paymentDetails.gcashQr} alt="GCash QR code" className="mx-auto aspect-square max-h-44 border border-white/10 object-contain" /> : null}
                      <div className="grid gap-1 text-xs text-white/60"><span>Name: <strong className="text-white">{paymentDetails.gcashName}</strong></span><span>Number: <strong className="text-white">{paymentDetails.gcashNumber}</strong></span></div>
                    </div>
                  ) : (
                    <div className="grid gap-2 border border-white/10 p-4 text-xs text-white/60">
                      <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/55"><Banknote size={14} className="text-[#ff5a36]" />Bank details</p>
                      <span>Bank: <strong className="text-white">{paymentDetails.bankName}</strong></span>
                      <span>Name: <strong className="text-white">{paymentDetails.bankAccountName}</strong></span>
                      <span>Account: <strong className="text-white">{paymentDetails.bankAccountNumber}</strong></span>
                    </div>
                  )}

                  <Input value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} placeholder="Transaction reference number" className="h-11 rounded-none border-white/20 bg-[#151719] text-sm text-white placeholder:text-white/30" />
                  <Input value={payerName} onChange={(event) => setPayerName(event.target.value)} placeholder="Payer name, optional" className="h-11 rounded-none border-white/20 bg-[#151719] text-sm text-white placeholder:text-white/30" />
                  <Textarea value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} placeholder="Notes, optional" className="min-h-20 rounded-none border-white/20 bg-[#151719] text-sm text-white placeholder:text-white/30" />
                  <button onClick={handleSubmitPayment} disabled={submittingPayment} className="w-full bg-[#ff5a36] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-black transition hover:bg-white disabled:cursor-wait disabled:opacity-60 active:scale-[0.98]">{submittingPayment ? "Submitting..." : "Submit payment reference"}</button>
                </>
              ) : (
                <p className="border border-white/10 p-4 text-center text-xs leading-relaxed text-white/50">Payment reference received. Hold tight while the payment is verified manually.</p>
              )}
            </div>
          ) : (
            <>
              {hasUnavailableLines ? <p className="mb-3 border border-[#ff5a36]/30 bg-[#ff5a36]/5 p-3 text-xs leading-5 text-[#ff5a36]">Remove the unavailable part{unavailableLines.length > 1 ? "s" : ""} above before checking out.</p> : null}
              {exchangeRatePending ? <p className="mb-3 border border-white/10 bg-white/[.03] p-3 text-xs leading-5 text-white/55">Updating the {currency} exchange rate. Checkout unlocks once it loads, or switch back to PHP.</p> : null}
              <button onClick={handleCreateOrder} disabled={cart.length === 0 || creatingOrder || checkoutBlocked} className="w-full bg-[#ff5a36] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]">{creatingOrder ? "Reserving order..." : user ? "Submit order" : "Sign in to submit order"}</button>
            </>
          )}
          <p className="mt-3 text-center text-[10px] leading-relaxed text-white/35">Shipping is an estimate. Orders are fulfilled after manual payment verification.</p>
        </div>
      </aside>
    </div>
  );
}
