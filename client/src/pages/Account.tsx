import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, LogIn, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAddressBook } from "@/contexts/AddressBookContext";
import { fetchAccountOrders, type AccountOrder } from "@/lib/accountOrders";
import AddressBookPanel from "@/components/account/AddressBookPanel";
import OrdersPanel from "@/components/account/OrdersPanel";
import { cn } from "@/lib/utils";

const tabs = [
  { id: "purchases", label: "My Purchases" },
  { id: "addresses", label: "Addresses" },
] as const;

type AccountTab = (typeof tabs)[number]["id"];

export default function Account() {
  const { user, profile, loading, isConfigured } = useAuth();
  const { addresses } = useAddressBook();
  const [tab, setTab] = useState<AccountTab>("purchases");
  const [orders, setOrders] = useState<AccountOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    if (!isConfigured || !user) {
      setOrders([]);
      setOrdersLoading(false);
      return;
    }

    setOrdersLoading(true);
    try {
      setOrders(await fetchAccountOrders());
      setOrdersError(null);
    } catch (error) {
      setOrdersError(error instanceof Error ? error.message : "Could not load orders.");
    } finally {
      setOrdersLoading(false);
    }
  }, [isConfigured, user?.id]);

  useEffect(() => {
    setOrders([]);
    void loadOrders();
  }, [loadOrders]);

  if (!loading && !user) {
    return (
      <section className="min-h-screen bg-[#0c0d0e] pt-[68px]">
        <div className="mx-auto flex min-h-[calc(100vh-68px)] max-w-[1440px] items-center px-4 py-12 sm:px-6 lg:px-9">
          <div className="max-w-xl border border-white/15 bg-[#111214] p-6 sm:p-8">
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/45"><LogIn size={14} className="text-[#ff5a36]" />Sign in required</p>
            <h1 className="mt-5 font-display text-6xl uppercase leading-[.72] text-white">Open your<br />dashboard.</h1>
            <p className="mt-5 text-sm leading-7 text-white/45">Use Google to track orders, submit manual payment references, and keep your delivery addresses in one place.</p>
            <Link href="/sign-in" className="mt-7 inline-flex items-center gap-2 bg-[#ff5a36] px-5 py-4 text-xs font-black uppercase tracking-[0.16em] text-black transition hover:bg-white">Sign in <ArrowRight size={15} /></Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-screen bg-[#0c0d0e] pt-[68px]">
      <div className="border-b border-white/15 bg-[#101113] px-4 py-11 sm:px-6 lg:px-9 lg:py-16">
        <div className="mx-auto max-w-[1440px]">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#ff5a36]">Account dashboard</p>
          <div className="mt-3 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <h1 className="font-display text-6xl uppercase leading-[0.78] tracking-[-0.055em] text-white sm:text-8xl">Your <em className="text-[#ff5a36]">builds</em></h1>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-white/45">Track every order, see where a parcel is, and keep the places you ship to ready for the next one.</p>
            </div>
            <div className="border border-white/15 px-4 py-3">
              <p className="text-xs font-bold text-white">{profile?.full_name || user?.email || "Rider"}</p>
              <p className="mt-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/45"><ShieldCheck size={12} className="text-[#ff5a36]" />{profile?.role ?? "customer"}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-9">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/15">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  "-mb-px border-b-2 pb-3 text-xs font-black uppercase tracking-[0.16em] transition",
                  tab === item.id ? "border-[#ff5a36] text-[#ff5a36]" : "border-transparent text-white/40 hover:text-white",
                )}
              >
                {item.label}
                {item.id === "addresses" && addresses.length > 0 ? <span className="ml-2 text-[10px] text-white/30">{addresses.length}</span> : null}
              </button>
            ))}
          </div>
          <Link href="/shop" className="pb-3 text-[10px] font-black uppercase tracking-[0.14em] text-[#ff5a36] transition hover:text-white">Shop parts</Link>
        </div>

        <div className="pt-6">
          {tab === "purchases" ? (
            <OrdersPanel orders={orders} loading={ordersLoading} error={ordersError} />
          ) : (
            <AddressBookPanel />
          )}
        </div>

        {tab === "purchases" && !ordersLoading && orders.length > 0 ? (
          <p className="mt-8 max-w-xl border-t border-white/10 pt-4 text-xs leading-6 text-white/35">
            Orders are fulfilled after manual payment verification. Submit the transaction reference from the order or the cart, and the timeline updates once the payment clears.
          </p>
        ) : null}
      </div>
    </section>
  );
}
