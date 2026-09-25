/**
 * Design direction: Technical Drop Editorial — the cart is a sliding workshop drawer with plain-language prototype status.
 */
import { money, products } from "@/data/products";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createManualOrder, submitManualPayment, type ManualOrder, type ManualPaymentMethod } from "@/lib/manualOrders";
import { Banknote, MapPin, Minus, PackageCheck, Plus, QrCode, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import ProductVisual from "@/components/ProductVisual";

const shippingRegions = [
  { value: "us", label: "United States", timing: "2–5 business days" },
  { value: "canada", label: "Canada", timing: "5–8 business days" },
  { value: "international", label: "International", timing: "7–14 business days" },
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
  const { user, isConfigured, signInWithGoogle } = useAuth();
  const { cart, cartOpen, closeCart, subtotal, updateQuantity, removeLine, clearCart } = useStore();
  const [shippingRegion, setShippingRegion] = useState("us");
  const [manualOrder, setManualOrder] = useState<ManualOrder | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<ManualPaymentMethod>("gcash_qr");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [payerName, setPayerName] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const selectedRegion = shippingRegions.find((region) => region.value === shippingRegion) ?? shippingRegions[0];
  const shipping = useMemo(() => {
    if (cart.length === 0) return 0;
    if (shippingRegion === "us") return subtotal >= 90 ? 0 : 8;
    if (shippingRegion === "canada") return subtotal >= 150 ? 12 : 20;
    return 32;
  }, [cart.length, shippingRegion, subtotal]);
  const estimatedTotal = subtotal + shipping;
  const subtotalCents = Math.round(subtotal * 100);
  const shippingCents = Math.round(shipping * 100);
  const totalCents = Math.round(estimatedTotal * 100);
  const displayedTotal = manualOrder ? manualOrder.total_cents / 100 : estimatedTotal;

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

    setCreatingOrder(true);
    try {
      const order = await createManualOrder({ cart, shippingRegion, shippingCents, subtotalCents, totalCents });
      setManualOrder(order);
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
    <div className={`fixed inset-0 z-50 ${cartOpen ? "pointer-events-auto" : "pointer-events-none"}`} aria-hidden={!cartOpen}>
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
            if (!product) return null;
            return (
              <div key={`${line.id}-${line.finish}`} className="flex gap-3 border-b border-white/10 py-4">
                <div className="size-20 shrink-0 overflow-hidden bg-[#1a1b1e]"><ProductVisual product={product} compact /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div><p className="font-display text-xl uppercase leading-none text-white">{product.name}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">{line.finish}</p></div>
                    <button onClick={() => removeLine(line.id, line.finish)} className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40 hover:text-[#ff5a36]">Remove</button>
                  </div>
                  <div className="mt-4 flex items-center justify-between"><div className="flex items-center border border-white/15"><button onClick={() => updateQuantity(line.id, line.finish, line.quantity - 1)} className="grid size-7 place-items-center text-white/60 hover:text-white" aria-label={`Decrease ${product.name} quantity`}><Minus size={13} /></button><span className="grid w-7 place-items-center text-xs font-bold text-white">{line.quantity}</span><button onClick={() => updateQuantity(line.id, line.finish, line.quantity + 1)} className="grid size-7 place-items-center text-white/60 hover:text-white" aria-label={`Increase ${product.name} quantity`}><Plus size={13} /></button></div><span className="text-sm font-bold text-white">{money(product.price * line.quantity)}</span></div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="border-t border-white/10 p-5">
          {cart.length > 0 && !manualOrder ? <div className="mb-5 border-y border-white/10 py-4"><div className="flex items-center justify-between gap-4"><div><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em] text-white/60"><MapPin size={14} className="text-[#ff5a36]" />Estimate delivery</p><p className="mt-1 text-xs text-white/40">Choose a shipping region for an order estimate.</p></div><Select value={shippingRegion} onValueChange={setShippingRegion}><SelectTrigger className="h-9 min-w-36 rounded-none border-white/20 bg-[#151719] text-xs text-white"><SelectValue /></SelectTrigger><SelectContent className="rounded-none border-white/15 bg-[#151719] text-white"><SelectItem value="us" className="focus:bg-[#ff5a36] focus:text-black">United States</SelectItem><SelectItem value="canada" className="focus:bg-[#ff5a36] focus:text-black">Canada</SelectItem><SelectItem value="international" className="focus:bg-[#ff5a36] focus:text-black">International</SelectItem></SelectContent></Select></div><div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3"><p className="flex items-center gap-2 text-xs text-white/55"><PackageCheck size={15} className="text-[#ff5a36]" />{selectedRegion.timing}</p><span className={`text-xs font-bold ${shipping === 0 ? "text-[#ff5a36]" : "text-white"}`}>{shipping === 0 ? "Shipping included" : money(shipping)}</span></div></div> : null}
          {cart.length > 0 ? <div className="space-y-2 border-b border-white/10 pb-4"><div className="flex items-baseline justify-between"><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Parts subtotal</span><span className="text-sm font-bold text-white">{money(subtotal)}</span></div><div className="flex items-baseline justify-between"><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Estimated shipping</span><span className="text-sm font-bold text-white">{shipping === 0 ? "Included" : money(shipping)}</span></div></div> : null}
          <div className="mb-4 mt-4 flex items-baseline justify-between"><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/65">{manualOrder ? "Order total" : "Estimated total"}</span><span className="font-display text-3xl text-white">{money(displayedTotal)}</span></div>
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
                <p className="mt-3 text-xs leading-relaxed text-white/50">Pay the exact total, then submit the transaction reference. Screenshots help, but final verification is done against the received GCash or bank transaction.</p>
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
            <button onClick={handleCreateOrder} disabled={cart.length === 0 || creatingOrder} className="w-full bg-[#ff5a36] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]">{creatingOrder ? "Reserving order..." : user ? "Submit order" : "Sign in to submit order"}</button>
          )}
          <p className="mt-3 text-center text-[10px] leading-relaxed text-white/35">Shipping is an estimate. Orders are fulfilled after manual payment verification.</p>
        </div>
      </aside>
    </div>
  );
}
