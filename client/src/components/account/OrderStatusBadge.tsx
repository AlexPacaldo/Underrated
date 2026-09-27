/** Design direction: Technical Drop Editorial - a status is a stamped tag, never a pill. */
import type { OrderStatus } from "@/lib/orderStatus";
import { orderStatusLabels } from "@/lib/orderStatus";
import { cn } from "@/lib/utils";

const tones: Record<OrderStatus, string> = {
  pending_payment: "border-[#ff5a36]/45 text-[#ff5a36]",
  payment_submitted: "border-white/25 text-white/70",
  paid: "border-white/25 text-white/70",
  processing: "border-white/25 text-white/70",
  shipped: "border-[#ff5a36]/45 text-[#ff5a36]",
  delivered: "border-white/15 text-white/45",
  rejected: "border-white/15 text-white/40",
  cancelled: "border-white/15 text-white/40",
};

export default function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center border px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em]", tones[status], className)}>
      {orderStatusLabels[status]}
    </span>
  );
}
