import { useAuth } from "@/contexts/AuthContext";
import { money } from "@/data/products";
import { fetchAccountOrders, type AccountOrder } from "@/lib/accountOrders";
import { ArrowRight, Clock3, LogIn, PackageCheck, ReceiptText, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";

const statusLabels: Record<AccountOrder["status"], string> = {
  pending_payment: "Pending payment",
  payment_submitted: "Payment submitted",
  paid: "Paid",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export default function Account() {
  const { user, profile, loading, isConfigured } = useAuth();
  const [orders, setOrders] = useState<AccountOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !isConfigured) return;

    setOrdersLoading(true);
    fetchAccountOrders()
      .then((data) => {
        setOrders(data);
        setOrdersError(null);
      })
      .catch((error) => setOrdersError(error instanceof Error ? error.message : "Could not load orders."))
      .finally(() => setOrdersLoading(false));
  }, [isConfigured, user]);

  if (!loading && !user) {
    return (
      <section className="min-h-screen bg-[#0c0d0e] pt-[68px]">
        <div className="mx-auto flex min-h-[calc(100vh-68px)] max-w-[1440px] items-center px-4 py-12 sm:px-6 lg:px-9">
          <div className="max-w-xl border border-white/15 bg-[#111214] p-6 sm:p-8">
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/45"><LogIn size={14} className="text-[#ff5a36]" />Sign in required</p>
            <h1 className="mt-5 font-display text-6xl uppercase leading-[.72] text-white">Open your<br />dashboard.</h1>
            <p className="mt-5 text-sm leading-7 text-white/45">Use Google to view orders and submit manual payment references.</p>
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
              <p className="mt-5 max-w-md text-sm leading-relaxed text-white/45">Track reserved orders and manual payment submissions tied to your Google account.</p>
            </div>
            <div className="border border-white/15 px-4 py-3">
              <p className="text-xs font-bold text-white">{profile?.full_name || user?.email || "Rider"}</p>
              <p className="mt-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/45"><ShieldCheck size={12} className="text-[#ff5a36]" />{profile?.role ?? "customer"}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1440px] gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[.34fr_.66fr] lg:px-9">
        <aside className="border border-white/15 bg-[#111214] p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">Verification flow</p>
          <div className="mt-6 space-y-4">
            <p className="flex gap-3 text-sm leading-6 text-white/50"><ReceiptText size={17} className="mt-0.5 shrink-0 text-[#ff5a36]" />Submit an order from the cart.</p>
            <p className="flex gap-3 text-sm leading-6 text-white/50"><Clock3 size={17} className="mt-0.5 shrink-0 text-[#ff5a36]" />Pay through GCash QR or bank transfer.</p>
            <p className="flex gap-3 text-sm leading-6 text-white/50"><PackageCheck size={17} className="mt-0.5 shrink-0 text-[#ff5a36]" />Send the reference number, then wait for manual verification.</p>
          </div>
        </aside>

        <div className="min-h-96 border-t border-white/15">
          <div className="flex items-center justify-between border-b border-white/15 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">Orders</p>
            <Link href="/shop" className="text-[10px] font-black uppercase tracking-[0.14em] text-[#ff5a36] hover:text-white">Shop parts</Link>
          </div>

          {ordersLoading ? <p className="py-10 text-sm text-white/45">Loading orders...</p> : null}
          {ordersError ? <p className="py-10 text-sm text-[#ff5a36]">{ordersError}</p> : null}
          {!ordersLoading && !ordersError && orders.length === 0 ? (
            <div className="flex min-h-80 flex-col justify-end border-b border-white/15 pb-8">
              <span className="font-display text-6xl uppercase leading-[.75] text-white/15">No orders<br />yet.</span>
              <p className="mt-5 text-sm text-white/45">Reserve your first build from the shop.</p>
            </div>
          ) : null}

          <div className="divide-y divide-white/10">
            {orders.map((order) => (
              <article key={order.id} className="py-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <p className="font-display text-3xl uppercase leading-none text-white">{order.order_number}</p>
                    <p className="mt-2 text-xs text-white/40">{formatDate(order.created_at)}</p>
                  </div>
                  <div className="sm:text-right">
                    <p className="font-display text-3xl leading-none text-white">{money(order.total_cents / 100)}</p>
                    <p className="mt-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#ff5a36]">{statusLabels[order.status]}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-2">
                  {order.order_items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 bg-white/[.03] px-3 py-2 text-xs text-white/55">
                      <span>{item.quantity}x {item.product_name} / {item.finish}</span>
                      <span className="font-bold text-white">{money(item.line_total_cents / 100)}</span>
                    </div>
                  ))}
                </div>

                {order.manual_payment_submissions.length > 0 ? (
                  <div className="mt-4 border border-white/10 p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Payment references</p>
                    {order.manual_payment_submissions.map((submission) => (
                      <p key={submission.id} className="mt-2 text-xs text-white/55">{submission.payment_method.replace("_", " ")} / <span className="font-bold text-white">{submission.reference_number}</span> / {formatDate(submission.created_at)}</p>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}