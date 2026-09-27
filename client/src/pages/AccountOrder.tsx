/**
 * Design direction: Technical Drop Editorial — the order sheet is a workshop docket: a stamped timeline, the parcel, and a receipt block.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, Ban, Check, ExternalLink, MapPin, Repeat2, Truck } from "lucide-react";
import { toast } from "sonner";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useCatalog } from "@/contexts/CatalogContext";
import { useStore } from "@/contexts/StoreContext";
import { cancelAccountOrder, fetchAccountOrder, latestPaymentSubmission, paymentMethodLabels, type AccountOrder } from "@/lib/accountOrders";
import { buildOrderTimeline, formatOrderDate, orderStatusLabels } from "@/lib/orderStatus";
import { submitManualPayment, type ManualPaymentMethod } from "@/lib/manualOrders";
import { formatDeliveryAddress, shippingRegionForAddress, type ShippingRegion } from "@/lib/deliveryAddress";
import OrderItemVisual from "@/components/account/OrderItemVisual";
import OrderStatusBadge from "@/components/account/OrderStatusBadge";
import OrderTimeline from "@/components/account/OrderTimeline";
import PaymentReferenceForm from "@/components/PaymentReferenceForm";

const regionLabels: Record<ShippingRegion, string> = {
  ph: "Philippines",
  us: "United States",
  canada: "Canada",
  international: "International",
};

function SummaryRow({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={`text-[10px] font-bold uppercase tracking-[0.16em] ${emphasis ? "text-white/65" : "text-white/45"}`}>{label}</span>
      <span className={emphasis ? "font-display text-3xl leading-none text-white" : "text-sm font-bold text-white"}>{value}</span>
    </div>
  );
}

export default function AccountOrder() {
  const [, params] = useRoute("/account/orders/:orderNumber");
  const orderNumber = params?.orderNumber ?? "";
  const { formatMoney } = useCurrency();
  const { products } = useCatalog();
  const { addToCart } = useStore();
  const [order, setOrder] = useState<AccountOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<ManualPaymentMethod>("gcash_qr");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [payerName, setPayerName] = useState("");
  const [paymentNote, setPaymentNote] = useState("");

  const load = useCallback(async () => {
    if (!orderNumber) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      setOrder(await fetchAccountOrder(orderNumber));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the order.");
    } finally {
      setLoading(false);
    }
  }, [orderNumber]);

  useEffect(() => {
    setOrder(null);
    setShowPayment(false);
    void load();
  }, [load]);

  const handleBuyAgain = () => {
    if (!order) return;
    let added = 0;
    for (const item of order.order_items) {
      const product = products.find((candidate) => candidate.id === item.product_id);
      if (!product) continue;
      const finish = product.finishes.includes(item.finish) ? item.finish : product.finishes[0];
      if (!finish) continue;
      for (let count = 0; count < item.quantity; count += 1) addToCart(product, finish);
      added += 1;
    }

    if (added === 0) {
      toast.error("Those parts are no longer in the shop.", { description: "Browse the catalog to find a replacement." });
      return;
    }

    toast.success("Back in your build.", { description: "Review the cart, then reserve the order." });
  };

  const handleCancelOrder = async () => {
    if (!order) return;
    if (!confirmingCancel) {
      setConfirmingCancel(true);
      return;
    }

    setBusy(true);
    try {
      await cancelAccountOrder(order.id);
      setConfirmingCancel(false);
      await load();
      toast.success("Order cancelled.");
    } catch (cancelError) {
      toast.error("Could not cancel the order.", { description: cancelError instanceof Error ? cancelError.message : "Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitPayment = async () => {
    if (!order) return;
    if (!referenceNumber.trim()) {
      toast.error("Reference number required.", { description: "Enter the GCash or bank transaction reference before submitting." });
      return;
    }

    setBusy(true);
    try {
      await submitManualPayment(order.id, paymentMethod, referenceNumber, payerName, paymentNote);
      setShowPayment(false);
      setReferenceNumber("");
      setPayerName("");
      setPaymentNote("");
      await load();
      toast.success("Payment reference submitted.", { description: "We'll verify it against the received payment before fulfillment." });
    } catch (submitError) {
      toast.error("Could not submit payment.", { description: submitError instanceof Error ? submitError.message : "Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const money = (cents: number) => (order ? formatMoney(cents / 100, order.display_currency, order.fx_rate) : "");

  return (
    <section className="min-h-screen bg-[#0c0d0e] pt-[68px]">
      <div className="border-b border-white/15 bg-[#101113] px-4 py-8 sm:px-6 lg:px-9">
        <div className="mx-auto max-w-[1440px]">
          <Link href="/account" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/45 transition hover:text-white">
            <ArrowLeft size={13} /> My purchases
          </Link>
          <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#ff5a36]">Order detail</p>
              <h1 className="mt-2 font-display text-5xl uppercase leading-[0.82] tracking-[-0.05em] text-white sm:text-7xl">{order?.order_number ?? "—"}</h1>
              {order ? <p className="mt-3 text-xs text-white/40">Placed {formatOrderDate(order.created_at, true)}</p> : null}
            </div>
            {order ? (
              <div className="flex flex-wrap items-center gap-3">
                <OrderStatusBadge status={order.status} />
                <button
                  type="button"
                  onClick={handleBuyAgain}
                  className="flex items-center gap-2 border border-white/20 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] text-white/70 transition hover:border-[#ff5a36] hover:text-[#ff5a36]"
                >
                  <Repeat2 size={13} /> Buy again
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-9">
        {loading ? <p className="py-10 text-sm text-white/45">Loading the order...</p> : null}
        {error ? <p className="py-10 text-sm text-[#ff5a36]">{error}</p> : null}

        {!loading && !error && !order ? (
          <div className="flex min-h-64 flex-col justify-end border-b border-white/15 pb-8">
            <span className="font-display text-5xl uppercase leading-[0.78] text-white/15">Order<br />not found.</span>
            <p className="mt-5 text-sm text-white/45">This order is not on your account.</p>
            <Link href="/account" className="mt-6 inline-flex w-fit items-center gap-2 bg-[#ff5a36] px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-black transition hover:bg-white">
              Back to my purchases
            </Link>
          </div>
        ) : null}

        {order ? (
          <div className="grid gap-6 lg:grid-cols-[.62fr_.38fr]">
            <div className="grid gap-6">
              <section className="border border-white/15 bg-[#111214] p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">Order status</p>
                <OrderTimeline
                  className="mt-5"
                  timeline={buildOrderTimeline({
                    status: order.status,
                    createdAt: order.created_at,
                    paidAt: order.tracking?.paid_at ?? null,
                    shippedAt: order.tracking?.shipped_at ?? null,
                    deliveredAt: order.tracking?.delivered_at ?? null,
                    rejectedAt: order.tracking?.rejected_at ?? null,
                    trackingNumber: order.tracking?.tracking_number ?? null,
                  })}
                />

                {order.tracking?.tracking_number || order.tracking?.fulfillment_note ? (
                  <div className="mt-6 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-2">
                    {order.tracking.tracking_number ? (
                      <div>
                        <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/45"><Truck size={13} className="text-[#ff5a36]" />Tracking number</p>
                        <p className="mt-2 text-sm font-bold text-white">{order.tracking.tracking_number}</p>
                      </div>
                    ) : null}
                    {order.tracking.fulfillment_note ? (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">Shipping note</p>
                        <p className="mt-2 text-xs leading-5 text-white/60">{order.tracking.fulfillment_note}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>

              <section className="border border-white/15 bg-[#111214] p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">Items</p>
                <div className="mt-4 divide-y divide-white/10 border-t border-white/10">
                  {order.order_items.map((item) => {
                    const available = products.some((product) => product.id === item.product_id) && !item.product_archived;
                    const viewHref = item.product_slug ? `/product/${item.product_slug}` : null;
                    return (
                      <div key={item.id} className="flex gap-3 py-4">
                        <OrderItemVisual item={item} className="size-20 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-display text-xl uppercase leading-none text-white">{item.product_name}</p>
                          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">{item.finish}</p>
                          <p className="mt-2 text-xs text-white/50">{item.quantity} x {money(item.unit_price_cents)}</p>
                          {viewHref ? (
                            <Link
                              href={viewHref}
                              className={`mt-3 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] transition ${available ? "text-[#ff5a36] hover:text-white" : "text-white/30"}`}
                              aria-disabled={!available}
                              onClick={(event) => {
                                if (!available) event.preventDefault();
                              }}
                            >
                              {available ? "Buy again" : "No longer in the shop"} <ExternalLink size={11} />
                            </Link>
                          ) : null}
                        </div>
                        <p className="shrink-0 text-sm font-bold text-white">{money(item.line_total_cents)}</p>
                      </div>
                    );
                  })}
                </div>
              </section>

              {order.status === "pending_payment" ? (
                <section className="border border-[#ff5a36]/30 bg-[#ff5a36]/[.04] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#ff5a36]">Awaiting payment</p>
                      <p className="mt-2 text-xs leading-5 text-white/55">Send the exact PHP total, then submit the transaction reference so the order can move to fulfillment.</p>
                    </div>
                    {!showPayment ? <button type="button" onClick={() => setShowPayment(true)} className="bg-[#ff5a36] px-5 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-black transition hover:bg-white">Pay now</button> : null}
                  </div>

                  {showPayment ? (
                    <div className="mt-5 grid gap-4 border-t border-white/10 pt-5">
                      <PaymentReferenceForm
                        totalCents={order.total_cents}
                        paymentMethod={paymentMethod}
                        onPaymentMethodChange={setPaymentMethod}
                        referenceNumber={referenceNumber}
                        onReferenceNumberChange={setReferenceNumber}
                        payerName={payerName}
                        onPayerNameChange={setPayerName}
                        note={paymentNote}
                        onNoteChange={setPaymentNote}
                      />
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <button type="button" onClick={handleSubmitPayment} disabled={busy} className="bg-[#ff5a36] px-5 py-4 text-[10px] font-black uppercase tracking-[0.14em] text-black transition hover:bg-white disabled:cursor-wait disabled:opacity-60">
                          {busy ? "Submitting..." : "Submit payment reference"}
                        </button>
                        <button type="button" onClick={() => setShowPayment(false)} className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.14em] text-white/45 transition hover:text-white">
                          Not now
                        </button>
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>

            <div className="grid content-start gap-6">
              <section className="border border-white/15 bg-[#111214] p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">Order breakdown</p>
                <div className="mt-4 grid gap-3">
                  <SummaryRow label="Merchandise subtotal" value={money(order.subtotal_cents)} />
                  <SummaryRow label={`Shipping / ${regionLabels[shippingRegionForAddress(order.shipping_address)]}`} value={order.shipping_cents === 0 ? "Included" : money(order.shipping_cents)} />
                  <div className="mt-1 border-t border-white/10 pt-3">
                    <SummaryRow label="Order total" value={money(order.total_cents)} emphasis />
                  </div>
                  <p className="text-[10px] leading-5 text-white/30">Charged in {order.currency} at the rate saved when the order was placed.</p>
                </div>
              </section>

              <section className="border border-white/15 bg-[#111214] p-5">
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/45"><MapPin size={13} className="text-[#ff5a36]" />Delivery address</p>
                {order.shipping_address ? (
                  <>
                    <p className="mt-3 text-sm font-bold text-white">{order.shipping_address.recipient_name}</p>
                    <p className="mt-1 text-xs leading-5 text-white/55">{formatDeliveryAddress(order.shipping_address)}</p>
                    <p className="mt-1 text-xs text-white/40">{order.shipping_address.phone}</p>
                    {order.shipping_address.delivery_instructions ? <p className="mt-2 border-l border-[#ff5a36]/40 pl-3 text-xs leading-5 text-white/40">{order.shipping_address.delivery_instructions}</p> : null}
                    <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">{regionLabels[shippingRegionForAddress(order.shipping_address)]} / {order.shipping_region}</p>
                  </>
                ) : (
                  <p className="mt-3 text-xs text-white/45">No delivery address on this order.</p>
                )}
              </section>

              <section className="border border-white/15 bg-[#111214] p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">Payment</p>
                <p className="mt-3 text-sm font-bold text-white">{orderStatusLabels[order.status]}</p>
                {latestPaymentSubmission(order) ? (
                  <div className="mt-3 grid gap-1 text-xs text-white/55">
                    {order.manual_payment_submissions.map((submission) => (
                      <p key={submission.id} className="flex items-start gap-2">
                        <Check size={12} className="mt-0.5 shrink-0 text-[#ff5a36]" />
                        <span>
                          {paymentMethodLabels[submission.payment_method]} / <span className="font-bold text-white">{submission.reference_number}</span>
                          {submission.payer_name ? ` / ${submission.payer_name}` : ""} / {formatOrderDate(submission.created_at)}
                          {submission.note ? <span className="block text-white/35">{submission.note}</span> : null}
                        </span>
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs leading-5 text-white/45">No payment reference submitted yet.</p>
                )}
              </section>

              {order.status === "pending_payment" ? (
                <button
                  type="button"
                  onClick={handleCancelOrder}
                  onBlur={() => setConfirmingCancel(false)}
                  disabled={busy}
                  className={`flex items-center justify-center gap-2 border px-5 py-4 text-[10px] font-black uppercase tracking-[0.14em] transition disabled:opacity-60 ${confirmingCancel ? "border-[#ff5a36] bg-[#ff5a36] text-black" : "border-white/15 text-white/45 hover:border-[#ff5a36]/60 hover:text-[#ff5a36]"}`}
                >
                  <Ban size={13} /> {confirmingCancel ? "Confirm cancellation" : "Cancel order"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
