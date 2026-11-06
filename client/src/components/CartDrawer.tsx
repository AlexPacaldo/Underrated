/**
 * Design direction: Technical Drop Editorial — the cart is a sliding workshop drawer with plain-language prototype status.
 */
import { useCatalog } from "@/contexts/CatalogContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAddressBook } from "@/contexts/AddressBookContext";
import DeliveryAddressForm from "@/components/DeliveryAddressForm";
import { Checkbox } from "@/components/ui/checkbox";
import {
  emptyDeliveryAddress,
  formatDeliveryAddress,
  isValidDeliveryAddress,
  normalizeDeliveryAddress,
  shippingRegionForAddress,
  type DeliveryAddress,
  type ShippingRegion,
} from "@/lib/deliveryAddress";
import { useStore } from "@/contexts/StoreContext";
import { Input } from "@/components/ui/input";
import {
  createManualOrder,
  submitManualPayment,
  type ManualOrder,
} from "@/lib/manualOrders";
import PaymentReferenceForm, {
  paypalAvailable,
} from "@/components/PaymentReferenceForm";
import { ArrowLeft, MapPin, Minus, PackageCheck, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import ProductVisual from "@/components/ProductVisual";
import {
  fetchShippingRates,
  quoteShipping,
  type ShippingRate,
} from "@/lib/shipping";

const shippingRegions: {
  value: ShippingRegion;
  label: string;
  timing: string;
}[] = [
  { value: "ph", label: "Philippines", timing: "2–4 business days" },
  { value: "us", label: "United States", timing: "5–8 business days" },
  { value: "canada", label: "Canada", timing: "7–10 business days" },
  {
    value: "international",
    label: "International",
    timing: "10–18 business days",
  },
];

export default function CartDrawer() {
  const { user, isConfigured, signInWithGoogle } = useAuth();
  const { addresses, addAddress } = useAddressBook();
  const { products } = useCatalog();
  const { currency, rate, rateReady, formatMoney } = useCurrency();
  const {
    cart,
    cartOpen,
    closeCart,
    subtotal,
    totalItems,
    updateQuantity,
    removeLine,
    clearCart,
  } = useStore();
  const [checkoutView, setCheckoutView] = useState<"cart" | "checkout">("cart");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [deliveryAddress, setDeliveryAddress] =
    useState<DeliveryAddress>(emptyDeliveryAddress);
  const [addressMode, setAddressMode] = useState<"saved" | "new">("new");
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    null
  );
  const [addressLabel, setAddressLabel] = useState("");
  const [saveToAddressBook, setSaveToAddressBook] = useState(false);
  const [saveAsDefault, setSaveAsDefault] = useState(true);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [manualOrder, setManualOrder] = useState<ManualOrder | null>(null);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [payerName, setPayerName] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [shippingRatesLoading, setShippingRatesLoading] = useState(true);
  const defaultAddressId =
    addresses.find(address => address.is_default)?.id ??
    addresses[0]?.id ??
    null;
  const selectedAddress =
    addresses.find(address => address.id === selectedAddressId) ?? null;
  const savedAddress = selectedAddress
    ? normalizeDeliveryAddress(selectedAddress)
    : null;
  const hasSavedAddress = Boolean(
    savedAddress && isValidDeliveryAddress(savedAddress)
  );
  const savedAddressKey = savedAddress ? JSON.stringify(savedAddress) : null;

  useEffect(() => {
    if (!cartOpen) return;
    let active = true;
    setShippingRatesLoading(true);
    fetchShippingRates()
      .then(rates => {
        if (active) setShippingRates(rates);
      })
      .catch(() => {
        if (active) setShippingRates([]);
      })
      .finally(() => {
        if (active) setShippingRatesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [cartOpen]);

  useEffect(() => {
    setSelectedAddressId(defaultAddressId);
  }, [defaultAddressId, user?.id]);

  useEffect(() => {
    const nextSavedAddress = savedAddressKey
      ? normalizeDeliveryAddress(savedAddress)
      : null;
    if (nextSavedAddress && isValidDeliveryAddress(nextSavedAddress)) {
      setDeliveryAddress(nextSavedAddress);
      setAddressMode("saved");
      setSaveToAddressBook(false);
    } else {
      setDeliveryAddress(emptyDeliveryAddress);
      setAddressMode("new");
      setSaveToAddressBook(addresses.length === 0);
    }
    setAddressError(null);
  }, [savedAddressKey, user?.id]);

  useEffect(() => {
    setManualOrder(null);
    setReferenceNumber("");
    setPayerName("");
    setPaymentNote("");
    setAddressError(null);
  }, [user?.id]);

  useEffect(() => {
    if (cartOpen && !manualOrder) setCheckoutView("cart");
  }, [cartOpen, manualOrder]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [checkoutView, manualOrder]);

  const activeAddress =
    addressMode === "saved" && savedAddress && hasSavedAddress
      ? savedAddress
      : deliveryAddress;
  const addressIsValid = isValidDeliveryAddress(activeAddress);
  const activeShippingRegion = shippingRegionForAddress(activeAddress);
  const selectedRegion =
    shippingRegions.find(region => region.value === activeShippingRegion) ??
    shippingRegions[shippingRegions.length - 1];
  const shippingQuote = useMemo(() => {
    if (cart.length === 0 || !addressIsValid)
      return { amount: 0, weightKg: 0, steps: 0, rate: null };
    return quoteShipping(
      activeAddress,
      activeShippingRegion,
      cart,
      products,
      shippingRates,
      subtotal
    );
  }, [
    activeAddress,
    activeShippingRegion,
    addressIsValid,
    cart,
    products,
    shippingRates,
    subtotal,
  ]);
  const shipping = shippingQuote.amount;
  const estimatedTotal = subtotal + shipping;
  const displayedTotal = manualOrder
    ? manualOrder.total_cents / 100
    : estimatedTotal;
  const unavailableLines = cart.filter(
    line => !products.some(product => product.id === line.id)
  );
  const hasUnavailableLines = unavailableLines.length > 0;
  const stockIssueLines = cart.filter(line => {
    const product = products.find(item => item.id === line.id);
    return (
      product !== undefined &&
      product.stockQuantity - product.reservedQuantity < line.quantity
    );
  });
  const hasStockIssues = stockIssueLines.length > 0;
  const exchangeRatePending = !rateReady;
  const checkoutBlocked =
    hasUnavailableLines ||
    hasStockIssues ||
    exchangeRatePending ||
    !paypalAvailable ||
    (addressIsValid && (shippingRatesLoading || Boolean(shippingQuote.error)));

  const handleAddressChange = (nextAddress: DeliveryAddress) => {
    setDeliveryAddress(nextAddress);
    setAddressMode("new");
    setAddressError(null);
  };

  const handleSelectSavedAddress = (id: string) => {
    setSelectedAddressId(id);
    setAddressMode("saved");
    setSaveToAddressBook(false);
    setAddressError(null);
  };

  const handleUseDifferentAddress = () => {
    setDeliveryAddress(emptyDeliveryAddress);
    setAddressMode("new");
    setSaveToAddressBook(true);
    setAddressError(null);
  };

  const handleCreateOrder = async () => {
    if (!isConfigured) {
      toast.error("Supabase is not configured yet.", {
        description:
          "Add the Supabase environment variables before taking manual orders.",
      });
      return;
    }

    if (!user) {
      try {
        await signInWithGoogle();
      } catch (error) {
        toast.error("Google sign-in failed.", {
          description:
            error instanceof Error ? error.message : "Try again in a moment.",
        });
      }
      return;
    }

    if (cart.length === 0) return;

    if (hasUnavailableLines) {
      toast.error("Remove unavailable items first.", {
        description:
          "A part in your build was archived or removed from the catalog.",
      });
      return;
    }

    if (exchangeRatePending) {
      toast.error("Exchange rate is still loading.", {
        description: "Wait a moment for the USD rate and try again.",
      });
      return;
    }

    const address = normalizeDeliveryAddress(
      addressMode === "saved" ? savedAddress : deliveryAddress
    );
    if (!isValidDeliveryAddress(address)) {
      setAddressError(
        "Enter the required delivery address fields before reserving the order."
      );
      toast.error("Delivery address needed.", {
        description:
          "Add the recipient, contact, and destination details for this order.",
      });
      return;
    }

    setCreatingOrder(true);
    try {
      if (addressMode === "new" && saveToAddressBook) {
        await addAddress({
          label: addressLabel,
          address,
          isDefault: saveAsDefault || addresses.length === 0,
        });
      }

      const order = await createManualOrder({
        cart,
        shippingRegion: shippingRegionForAddress(address),
        shippingAddress: address,
        displayCurrency: currency,
        fxRate: rate,
      });
      setManualOrder(order);
      setAddressError(null);
      toast.success("Order reserved.", {
        description: `Use ${order.order_number} as your payment note if possible.`,
      });
    } catch (error) {
      toast.error("Could not create order.", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setCreatingOrder(false);
    }
  };

  const handleSubmitPayment = async () => {
    if (!manualOrder || !referenceNumber.trim()) {
      toast.error("PayPal transaction ID required.", {
        description: "Enter the transaction ID from PayPal before submitting.",
      });
      return;
    }

    setSubmittingPayment(true);
    try {
      const order = await submitManualPayment(
        manualOrder.id,
        "paypal",
        referenceNumber,
        payerName,
        paymentNote
      );
      setManualOrder(order);
      clearCart();
      toast.success("Payment reference submitted.", {
        description:
          "We'll verify it against the received payment before fulfillment.",
      });
    } catch (error) {
      toast.error("Could not submit payment.", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setSubmittingPayment(false);
    }
  };

  const showingCheckout = checkoutView === "checkout" || Boolean(manualOrder);

  return (
    <div
      className={`fixed inset-0 z-50 ${cartOpen ? "pointer-events-auto" : "pointer-events-none"}`}
      aria-hidden={!cartOpen}
      inert={!cartOpen}
    >
      <button
        onClick={closeCart}
        className={`absolute inset-0 bg-black/65 transition-opacity duration-300 ${cartOpen ? "opacity-100" : "opacity-0"}`}
        aria-label="Close cart"
      />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full max-w-[480px] flex-col border-l border-white/10 bg-[#0f1012] shadow-2xl transition-transform duration-300 ${cartOpen ? "translate-x-0" : "translate-x-full"}`}
        aria-label="Shopping cart"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {checkoutView === "checkout" && !manualOrder ? (
              <button
                onClick={() => setCheckoutView("cart")}
                className="grid size-8 shrink-0 place-items-center border border-white/15 text-white/60 transition hover:border-[#ff5a36] hover:text-[#ff5a36]"
                aria-label="Back to cart"
              >
                <ArrowLeft size={16} />
              </button>
            ) : null}
            <h2 className="font-display text-4xl uppercase leading-none tracking-tight text-white">
              {manualOrder ? "Order" : showingCheckout ? "Checkout" : "Cart"}
            </h2>
            {!showingCheckout && totalItems > 0 ? (
              <span className="border border-white/15 px-2 py-0.5 text-[10px] font-bold tracking-[0.08em] text-white/55">
                {totalItems}
              </span>
            ) : null}
          </div>
          <button
            onClick={closeCart}
            className="grid size-9 shrink-0 place-items-center border border-white/15 text-white transition hover:border-[#ff5a36] hover:text-[#ff5a36]"
            aria-label="Close cart"
          >
            <X size={18} />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {!showingCheckout ? (
            cart.length === 0 ? (
              <div className="flex h-full min-h-72 flex-col justify-end px-5 pb-9">
                <span className="font-display text-6xl uppercase leading-[0.78] text-white/15">
                  No parts
                  <br />
                  yet.
                </span>
                <p className="mt-5 max-w-xs text-sm leading-relaxed text-white/45">
                  The good builds start with one considered detail.
                </p>
                <button
                  onClick={closeCart}
                  className="mt-6 w-fit border-b border-white/25 pb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-white/60 transition hover:border-[#ff5a36] hover:text-[#ff5a36]"
                >
                  Continue shopping
                </button>
              </div>
            ) : (
              <div className="px-5">
                {cart.map(line => {
                  const product = products.find(item => item.id === line.id);
                  if (!product) {
                    return (
                      <div
                        key={`${line.id}-${line.finish}`}
                        className="flex items-center justify-between gap-3 border-b border-white/10 py-4"
                      >
                        <div className="min-w-0">
                          <p className="font-display text-xl uppercase leading-none text-white/45">
                            Unavailable part
                          </p>
                          <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">
                            {line.finish} · archived from the catalog
                          </p>
                        </div>
                        <button
                          onClick={() => removeLine(line.id, line.finish)}
                          className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-[#ff5a36] hover:text-white"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={`${line.id}-${line.finish}`}
                      className="flex gap-4 border-b border-white/10 py-4 first:pt-5"
                    >
                      <div className="size-[72px] shrink-0 overflow-hidden bg-[#1a1b1e]">
                        <ProductVisual product={product} compact />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-display text-xl uppercase leading-none text-white">
                              {product.name}
                            </p>
                            <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">
                              {line.finish}
                            </p>
                          </div>
                          <span className="shrink-0 pt-0.5 text-sm font-bold text-white">
                            {formatMoney(product.price)}
                          </span>
                        </div>
                        <div className="mt-3.5 flex items-center justify-between gap-3">
                          <div className="flex items-center border border-white/15">
                            <button
                              onClick={() =>
                                updateQuantity(
                                  line.id,
                                  line.finish,
                                  line.quantity - 1
                                )
                              }
                              className="grid size-8 place-items-center text-white/60 transition hover:text-white"
                              aria-label={`Decrease ${product.name} quantity`}
                            >
                              <Minus size={13} />
                            </button>
                            <span className="grid w-8 place-items-center text-xs font-bold text-white">
                              {line.quantity}
                            </span>
                            <button
                              onClick={() =>
                                updateQuantity(
                                  line.id,
                                  line.finish,
                                  line.quantity + 1
                                )
                              }
                              aria-label={`Increase ${product.name} quantity`}
                              disabled={
                                line.quantity >=
                                product.stockQuantity - product.reservedQuantity
                              }
                              className="grid size-8 place-items-center text-white/60 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                          <button
                            onClick={() => removeLine(line.id, line.finish)}
                            className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40 transition hover:text-[#ff5a36]"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : !manualOrder ? (
            <div className="px-5 py-5">
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/60">
                <MapPin size={14} className="text-[#ff5a36]" />
                Delivery address
              </p>
              {user ? (
                <>
                  {addresses.length > 0 && addressMode === "saved" ? (
                    <div className="mt-4 grid gap-2">
                      {addresses.map(row => {
                        const candidate = normalizeDeliveryAddress(row);
                        const picked = row.id === selectedAddressId;
                        return (
                          <button
                            key={row.id}
                            type="button"
                            onClick={() => handleSelectSavedAddress(row.id)}
                            aria-pressed={picked}
                            className={`flex w-full items-start gap-3 border p-3 text-left transition ${picked ? "border-[#ff5a36] bg-[#ff5a36]/5" : "border-white/10 bg-[#141517] hover:border-white/30"}`}
                          >
                            <span
                              className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border ${picked ? "border-[#ff5a36]" : "border-white/25"}`}
                            >
                              {picked ? (
                                <span className="size-2 rounded-full bg-[#ff5a36]" />
                              ) : null}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center justify-between gap-2">
                                <span className="truncate text-xs font-bold uppercase tracking-[0.06em] text-white">
                                  {row.label || "Delivery address"}
                                </span>
                                {row.is_default ? (
                                  <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.12em] text-[#ff5a36]">
                                    Default
                                  </span>
                                ) : null}
                              </span>
                              <span className="mt-1 block text-xs leading-5 text-white/55">
                                {candidate.recipient_name} · {candidate.phone}
                              </span>
                              <span className="block text-xs leading-5 text-white/40">
                                {formatDeliveryAddress(candidate)}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={handleUseDifferentAddress}
                        className="w-fit text-[10px] font-black uppercase tracking-[0.12em] text-white/45 transition hover:text-[#ff5a36]"
                      >
                        Use a different address
                      </button>
                    </div>
                  ) : null}

                  {addressMode === "new" ? (
                    <div className="mt-4 space-y-4">
                      {addresses.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setAddressMode("saved");
                            setDeliveryAddress(emptyDeliveryAddress);
                            setAddressError(null);
                          }}
                          className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white/45 transition hover:text-[#ff5a36]"
                        >
                          <ArrowLeft size={12} /> Saved addresses
                        </button>
                      ) : null}
                      <DeliveryAddressForm
                        address={deliveryAddress}
                        onChange={handleAddressChange}
                        destinations={shippingRates}
                        destinationsLoading={shippingRatesLoading}
                      />
                      <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-white/55">
                        <Checkbox
                          checked={saveToAddressBook}
                          onCheckedChange={checked =>
                            setSaveToAddressBook(checked === true)
                          }
                          className="mt-0.5 rounded-none border-white/25 data-[state=checked]:border-[#ff5a36] data-[state=checked]:bg-[#ff5a36] data-[state=checked]:text-black"
                        />
                        <span>
                          Save this address so I can pick it again next time.
                        </span>
                      </label>
                      {saveToAddressBook ? (
                        <div className="grid gap-3">
                          <label className="grid gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white/45">
                            <span>Label</span>
                            <Input
                              value={addressLabel}
                              onChange={event =>
                                setAddressLabel(event.target.value)
                              }
                              maxLength={60}
                              placeholder="Home, Office, Parents'"
                              className="h-10 rounded-none border-white/15 bg-[#101113] text-sm text-white placeholder:text-white/30"
                            />
                          </label>
                          <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-white/55">
                            <Checkbox
                              checked={saveAsDefault}
                              onCheckedChange={checked =>
                                setSaveAsDefault(checked === true)
                              }
                              className="mt-0.5 rounded-none border-white/25 data-[state=checked]:border-[#ff5a36] data-[state=checked]:bg-[#ff5a36] data-[state=checked]:text-black"
                            />
                            <span>Make it my default delivery address.</span>
                          </label>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {addressError ? (
                    <p className="mt-3 text-xs leading-5 text-[#ff5a36]">
                      {addressError}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="mt-3 text-xs leading-6 text-white/45">
                  Sign in first, then we’ll ask where this order should be
                  delivered and save it for next time.
                </p>
              )}
            </div>
          ) : null}
        </div>

        <div className="border-t border-white/10 px-5 py-5">
          {manualOrder ? (
            <div className="space-y-4">
              <div className="border border-white/10 bg-[#151719] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">
                      Order reserved
                    </p>
                    <p className="mt-1 font-display text-3xl uppercase text-white">
                      {manualOrder.order_number}
                    </p>
                  </div>
                  <span className="border border-[#ff5a36]/35 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#ff5a36]">
                    {manualOrder.status.replace("_", " ")}
                  </span>
                </div>
              </div>

              <div className="flex items-baseline justify-between border-b border-white/10 pb-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/65">
                  Order total
                </span>
                <span className="font-display text-3xl text-white">
                  {formatMoney(
                    manualOrder.total_cents / 100,
                    manualOrder.display_currency,
                    manualOrder.fx_rate
                  )}
                </span>
              </div>

              {manualOrder.status === "pending_payment" ? (
                <>
                  <PaymentReferenceForm
                    totalCents={manualOrder.total_cents}
                    displayCurrency={manualOrder.display_currency}
                    fxRate={manualOrder.fx_rate}
                    referenceNumber={referenceNumber}
                    onReferenceNumberChange={setReferenceNumber}
                    payerName={payerName}
                    onPayerNameChange={setPayerName}
                    note={paymentNote}
                    onNoteChange={setPaymentNote}
                  />
                  <button
                    onClick={handleSubmitPayment}
                    disabled={submittingPayment || !paypalAvailable}
                    className="w-full bg-[#ff5a36] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]"
                  >
                    {submittingPayment
                      ? "Submitting..."
                      : "Submit PayPal transaction ID"}
                  </button>
                </>
              ) : (
                <p className="border border-white/10 p-4 text-center text-xs leading-relaxed text-white/50">
                  Payment reference received. Hold tight while the payment is
                  verified manually.
                </p>
              )}
            </div>
          ) : showingCheckout ? (
            <>
              <div className="space-y-2.5">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-xs text-white/50">Subtotal</span>
                  <span className="text-sm font-bold text-white">
                    {formatMoney(subtotal)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-xs text-white/50">Shipping</span>
                  <span className="text-sm font-bold text-white">
                    {!addressIsValid ? (
                      <span className="text-xs font-normal text-white/40">
                        Enter address
                      </span>
                    ) : shippingRatesLoading ? (
                      <span className="text-xs font-normal text-white/40">
                        Loading rate
                      </span>
                    ) : shippingQuote.error ? (
                      <span className="text-xs font-normal text-[#ff5a36]">
                        Unavailable
                      </span>
                    ) : shipping === 0 ? (
                      "Included"
                    ) : (
                      formatMoney(shipping)
                    )}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-t border-white/10 pt-3">
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/65">
                    Total
                  </span>
                  <span className="font-display text-3xl text-white">
                    {formatMoney(displayedTotal)}
                  </span>
                </div>
              </div>
              {addressIsValid ? (
                <p className="mt-2.5 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-white/35">
                  <PackageCheck size={13} className="text-[#ff5a36]" />
                  {selectedRegion.label} ·{" "}
                  {shippingQuote.weightKg > 0
                    ? `${shippingQuote.weightKg.toFixed(2)} kg packed weight`
                    : selectedRegion.timing}
                </p>
              ) : null}
              {addressIsValid && shippingQuote.error ? (
                <p className="mt-3 border border-[#ff5a36]/30 bg-[#ff5a36]/5 p-3 text-xs leading-5 text-[#ff5a36]">
                  {shippingQuote.error}
                </p>
              ) : null}
              {addressIsValid &&
              !shippingQuote.error &&
              shippingQuote.rate &&
              shippingQuote.steps > 0 ? (
                <p className="mt-2 text-[10px] leading-4 text-white/35">
                  Includes {shippingQuote.steps} additional 500 g{" "}
                  {shippingQuote.steps === 1 ? "step" : "steps"} over the first
                  kilogram.
                </p>
              ) : null}
              {hasUnavailableLines ? (
                <p className="mt-3 border border-[#ff5a36]/30 bg-[#ff5a36]/5 p-3 text-xs leading-5 text-[#ff5a36]">
                  Remove the unavailable part
                  {unavailableLines.length > 1 ? "s" : ""} above before checking
                  out.
                </p>
              ) : null}
              {hasStockIssues ? (
                <p className="mt-3 border border-[#ff5a36]/30 bg-[#ff5a36]/5 p-3 text-xs leading-5 text-[#ff5a36]">
                  Stock changed for {stockIssueLines
                    .map(line => products.find(item => item.id === line.id)?.name)
                    .filter(Boolean)
                    .join(", ")}. Reduce the quantity or remove the item to
                  continue.
                </p>
              ) : null}
              {exchangeRatePending ? (
                <p className="mt-3 border border-white/10 bg-white/[.03] p-3 text-xs leading-5 text-white/55">
                  Updating the USD exchange rate. Checkout unlocks once it
                  loads.
                </p>
              ) : null}
              {!paypalAvailable ? (
                <p className="mt-3 border border-[#ff5a36]/30 bg-[#ff5a36]/5 p-3 text-xs leading-5 text-[#ff5a36]">
                  PayPal QR code is not configured yet, so checkout is
                  temporarily unavailable. Please contact the store for help.
                </p>
              ) : null}
              <button
                onClick={handleCreateOrder}
                disabled={cart.length === 0 || creatingOrder || checkoutBlocked}
                className="mt-4 w-full bg-white px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-black transition hover:bg-[#ff5a36] disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.99]"
              >
                {creatingOrder
                  ? "Placing order..."
                  : user
                    ? "Place order"
                    : "Sign in to continue"}
              </button>
              <p className="mt-3 text-center text-[10px] leading-relaxed text-white/35">
                Shipping is an estimate. Orders are fulfilled after manual
                payment verification.
              </p>
            </>
          ) : cart.length > 0 ? (
            <>
              <div className="space-y-2.5">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-xs text-white/50">Subtotal</span>
                  <span className="text-sm font-bold text-white">
                    {formatMoney(subtotal)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-xs text-white/50">Shipping</span>
                  <span className="text-xs text-white/40">At checkout</span>
                </div>
              </div>
              {hasUnavailableLines ? (
                <p className="mt-3 border border-[#ff5a36]/30 bg-[#ff5a36]/5 p-3 text-xs leading-5 text-[#ff5a36]">
                  Remove the unavailable part
                  {unavailableLines.length > 1 ? "s" : ""} above before checking
                  out.
                </p>
              ) : null}
              {hasStockIssues ? (
                <p className="mt-3 border border-[#ff5a36]/30 bg-[#ff5a36]/5 p-3 text-xs leading-5 text-[#ff5a36]">
                  Stock changed for {stockIssueLines
                    .map(line => products.find(item => item.id === line.id)?.name)
                    .filter(Boolean)
                    .join(", ")}. Reduce the quantity or remove the item to
                  continue.
                </p>
              ) : null}
              <button
                onClick={() => setCheckoutView("checkout")}
                className="mt-5 w-full bg-white px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-black transition hover:bg-[#ff5a36] active:scale-[0.99]"
              >
                Checkout
              </button>
              <button
                onClick={closeCart}
                className="mt-3 w-full text-center text-[10px] font-bold uppercase tracking-[0.16em] text-white/45 transition hover:text-white"
              >
                Continue shopping
              </button>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
