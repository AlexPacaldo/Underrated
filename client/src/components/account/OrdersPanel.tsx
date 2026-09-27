/**
 * Design direction: Technical Drop Editorial - the purchase list is an order sheet: hairline rules, stamped totals, no card chrome.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, ChevronRight, Package } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { formatOrderDate, countOrdersByFilter, orderFilters, orderMatchesFilter, type OrderFilter } from "@/lib/orderStatus";
import { latestPaymentSubmission, paymentMethodLabels, type AccountOrder } from "@/lib/accountOrders";
import { formatDeliveryAddress } from "@/lib/deliveryAddress";
import OrderItemVisual from "@/components/account/OrderItemVisual";
import OrderStatusBadge from "@/components/account/OrderStatusBadge";
import { cn } from "@/lib/utils";

function OrderRow({ order }: { order: AccountOrder }) {
  const { formatMoney } = useCurrency();
  const lead = order.order_items[0];
  const extraLines = Math.max(0, order.order_items.length - 1);
  const payment = latestPaymentSubmission(order);

  return (
    <article className="border-b border-white/10">
      <Link href={`/account/orders/${order.order_number}`} className="group grid gap-4 py-5 transition hover:bg-white/[.02] sm:grid-cols-[auto_1fr_auto] sm:items-start sm:px-2">
        <div className="relative size-20 shrink-0 overflow-hidden bg-[#1a1b1e]">
          {lead ? <OrderItemVisual item={lead} className="size-20" /> : <div className="grid size-20 place-items-center text-white/20"><Package size={20} /></div>}
          {extraLines > 0 ? (
            <span className="absolute bottom-0 right-0 bg-black/70 px-1.5 py-0.5 text-[10px] font-black tracking-[0.1em] text-white">+{extraLines}</span>
          ) : null}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="font-display text-2xl uppercase leading-none text-white">{order.order_number}</p>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="mt-2 truncate text-xs text-white/45">
            {lead ? `${lead.quantity} x ${lead.product_name} / ${lead.finish}` : "No lines on this order"}
            {extraLines > 0 ? ` + ${extraLines} more` : ""}
          </p>
          {order.shipping_address ? <p className="mt-1 truncate text-xs text-white/35">{formatDeliveryAddress(order.shipping_address)}</p> : null}
          {payment ? <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">{paymentMethodLabels[payment.payment_method]} / {payment.reference_number}</p> : null}
        </div>

        <div className="flex items-end justify-between gap-4 sm:flex-col sm:items-end sm:gap-2">
          <div className="sm:text-right">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Order total</p>
            <p className="mt-1 font-display text-2xl leading-none text-white">{formatMoney(order.total_cents / 100, order.display_currency, order.fx_rate)}</p>
            <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">{formatOrderDate(order.created_at)}</p>
          </div>
          <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/30 transition group-hover:text-[#ff5a36]">
            Details <ChevronRight size={13} />
          </span>
        </div>
      </Link>
    </article>
  );
}

export default function OrdersPanel({ orders, loading, error }: { orders: AccountOrder[]; loading: boolean; error: string | null }) {
  const [filter, setFilter] = useState<OrderFilter>("all");
  const counts = useMemo(() => countOrdersByFilter(orders.map((order) => order.status)), [orders]);
  const visible = useMemo(() => orders.filter((order) => orderMatchesFilter(order.status, filter)), [filter, orders]);

  return (
    <section>
      <div className="flex flex-wrap items-center gap-2 border-b border-white/15 pb-4">
        {orderFilters.map((item) => {
          const active = item.id === filter;
          const count = counts[item.id];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={cn(
                "flex items-center gap-2 border px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition",
                active ? "border-[#ff5a36] bg-[#ff5a36] text-black" : "border-white/15 text-white/50 hover:border-white/35 hover:text-white",
              )}
            >
              {item.label}
              <span className={cn("text-[9px]", active ? "text-black/60" : "text-white/30")}>{count}</span>
            </button>
          );
        })}
      </div>

      {loading ? <p className="py-10 text-sm text-white/45">Loading your orders...</p> : null}
      {error ? <p className="py-10 text-sm text-[#ff5a36]">{error}</p> : null}

      {!loading && !error && visible.length === 0 ? (
        <div className="flex min-h-64 flex-col justify-end border-b border-white/15 pb-8">
          <span className="font-display text-5xl uppercase leading-[0.78] text-white/15">{orders.length === 0 ? <>No orders<br />yet.</> : <>Nothing in<br />this tab.</>}</span>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/45">
            {orders.length === 0 ? "Reserve your first build from the shop and it will show up here with its shipment timeline." : "Switch tabs to see the rest of your orders."}
          </p>
          {orders.length === 0 ? (
            <Link href="/shop" className="mt-6 inline-flex w-fit items-center gap-2 bg-[#ff5a36] px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-black transition hover:bg-white">
              Shop parts <ArrowRight size={14} />
            </Link>
          ) : null}
        </div>
      ) : null}

      <div>
        {visible.map((order) => (
          <OrderRow key={order.id} order={order} />
        ))}
      </div>
    </section>
  );
}
