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

function OrderCard({ order }: { order: AccountOrder }) {
  const { formatMoney } = useCurrency();
  const payment = latestPaymentSubmission(order);
  const itemCount = order.order_items.reduce((count, item) => count + item.quantity, 0);
  const orderHref = `/account/orders/${order.order_number}`;
  const money = (cents: number) => formatMoney(cents / 100, order.display_currency, order.fx_rate);

  return (
    <article className="border border-white/15 bg-[#101113]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 py-3.5">
        <div className="flex items-center gap-3">
          <Link href={orderHref} className="font-display text-2xl uppercase leading-none text-white transition hover:text-[#ff5a36]">{order.order_number}</Link>
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">{itemCount} {itemCount === 1 ? "item" : "items"}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">{formatOrderDate(order.created_at)}</p>
          <OrderStatusBadge status={order.status} />
        </div>
      </div>

      <div className="divide-y divide-white/10">
        {order.order_items.length ? order.order_items.map((item) => (
          <div key={item.id} className="flex items-center gap-4 px-4 py-4">
            <OrderItemVisual item={item} className="size-16 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">{item.product_name}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">{item.finish} / Qty {item.quantity}</p>
            </div>
            <p className="shrink-0 text-sm font-bold text-white">{money(item.line_total_cents)}</p>
          </div>
        )) : (
          <div className="flex items-center gap-4 px-4 py-4">
            <div className="grid size-16 shrink-0 place-items-center bg-[#1a1b1e] text-white/20"><Package size={18} /></div>
            <p className="text-sm text-white/45">No lines on this order</p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 border-t border-white/10 px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          {order.shipping_address ? <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">{formatDeliveryAddress(order.shipping_address)}</p> : null}
          {payment ? <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-white/25">{paymentMethodLabels[payment.payment_method]} / {payment.reference_number}</p> : null}
        </div>
        <div className="flex items-end justify-between gap-4 sm:flex-col sm:items-end sm:gap-3">
          <div className="sm:text-right">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">Order total</p>
            <p className="mt-1 font-display text-3xl leading-none text-white">{money(order.total_cents)}</p>
          </div>
          <Link href={orderHref} className="inline-flex items-center gap-2 border border-white/20 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.14em] text-white/70 transition hover:border-[#ff5a36] hover:text-[#ff5a36]">
            View order <ChevronRight size={13} />
          </Link>
        </div>
      </div>
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

      <div className="space-y-4 pt-5">
        {visible.map((order) => (
          <OrderCard key={order.id} order={order} />
        ))}
      </div>
    </section>
  );
}
