/**
 * One place for order status so the account page, the order detail and the admin
 * console describe the same shipment the same way.
 */

export type OrderStatus = "pending_payment" | "payment_submitted" | "paid" | "rejected" | "cancelled" | "processing" | "shipped" | "delivered" | "returned";

export const orderStatusLabels: Record<OrderStatus, string> = {
  pending_payment: "Pending payment",
  payment_submitted: "Payment submitted",
  paid: "Paid",
  rejected: "Payment rejected",
  cancelled: "Cancelled",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  // Set by the courier callback when a parcel comes back to the workshop. It is
  // not a failure of payment, so it is described in its own words rather than as
  // a rejection.
  returned: "Returned to sender",
};

/** Short line used in the admin console, where the full label crowds the row. */
export const orderStatusShortLabels: Record<OrderStatus, string> = {
  pending_payment: "To pay",
  payment_submitted: "Verifying",
  paid: "Paid",
  rejected: "Rejected",
  cancelled: "Cancelled",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  returned: "Returned",
};

/**
 * How far along the happy path an order is. A rejected, cancelled or returned
 * order stops counting. `returned` ranks 1 because the parcel is back with the
 * workshop and has to be dealt with, not because the rider paid and we failed.
 */
const stageByStatus: Record<OrderStatus, number> = {
  pending_payment: 0,
  payment_submitted: 1,
  paid: 2,
  processing: 2,
  shipped: 3,
  delivered: 4,
  rejected: -1,
  cancelled: -1,
  returned: 1,
};

export const orderStatuses: OrderStatus[] = [
  "pending_payment",
  "payment_submitted",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "rejected",
  "cancelled",
  "returned",
];

export type OrderFilter = "all" | "to_pay" | "to_ship" | "to_receive" | "completed" | "cancelled";

export type OrderFilterDefinition = {
  id: OrderFilter;
  label: string;
  /** The statuses the tab shows, which is also how the count in the tab is worked out. */
  statuses: OrderStatus[];
};

export const orderFilters: OrderFilterDefinition[] = [
  { id: "all", label: "All", statuses: orderStatuses },
  { id: "to_pay", label: "To Pay", statuses: ["pending_payment"] },
  { id: "to_ship", label: "To Ship", statuses: ["payment_submitted", "paid", "processing", "returned"] },
  { id: "to_receive", label: "To Receive", statuses: ["shipped"] },
  { id: "completed", label: "Completed", statuses: ["delivered"] },
  { id: "cancelled", label: "Cancelled", statuses: ["cancelled", "rejected"] },
];

export function orderFilterDefinition(filter: OrderFilter) {
  return orderFilters.find((item) => item.id === filter) ?? orderFilters[0];
}

export function orderMatchesFilter(status: OrderStatus, filter: OrderFilter) {
  return orderFilterDefinition(filter).statuses.includes(status);
}

export function countOrdersByFilter(statuses: OrderStatus[]): Record<OrderFilter, number> {
  const counts = {} as Record<OrderFilter, number>;
  for (const filter of orderFilters) {
    counts[filter.id] = statuses.filter((status) => filter.statuses.includes(status)).length;
  }
  return counts;
}

export type OrderTimelineStep = {
  key: "placed" | "paid" | "shipped" | "received";
  label: string;
  detail: string;
  at: string | null;
  state: "done" | "current" | "todo";
};

export type OrderTerminal = {
  label: string;
  detail: string;
  at: string | null;
};

export type OrderTimeline = {
  steps: OrderTimelineStep[];
  terminal: OrderTerminal | null;
};

export type OrderTimelineInput = {
  status: OrderStatus;
  createdAt: string;
  paidAt?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  rejectedAt?: string | null;
  trackingNumber?: string | null;
};

/**
 * Placed, paid, shipped, received. A milestone counts as reached from the order
 * status even when the admin never wrote a timestamp, so the timeline still moves
 * for orders that predate the fulfillment record.
 */
export function buildOrderTimeline(order: OrderTimelineInput): OrderTimeline {
  const stage = stageByStatus[order.status];
  const reached = (stageIndex: number) => stage >= stageIndex;
  const placedDone = true;
  const paidDone = Boolean(order.paidAt) || reached(2);
  const shippedDone = Boolean(order.shippedAt) || reached(3);
  const receivedDone = Boolean(order.deliveredAt) || reached(4);

  const steps: OrderTimelineStep[] = [
    { key: "placed", label: "Order placed", detail: "We have your order.", at: order.createdAt, state: "done" },
    { key: "paid", label: "Payment verified", detail: "Payment confirmed against the submitted reference.", at: order.paidAt ?? null, state: "todo" },
    { key: "shipped", label: "Order shipped out", detail: "The parcel left the workshop.", at: order.shippedAt ?? null, state: "todo" },
    { key: "received", label: "Order received", detail: "Marked as delivered.", at: order.deliveredAt ?? null, state: "todo" },
  ];

  // The first milestone that has not happened yet is the one the rider waits on.
  const flags = [placedDone, paidDone, shippedDone, receivedDone];
  const firstOpen = flags.indexOf(false);
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (flags[index]) {
      step.state = "done";
      continue;
    }
    step.state = index === firstOpen ? "current" : "todo";
    if (step.state === "current" && step.key === "paid") step.detail = "Send the payment reference so we can verify it.";
    if (step.state === "current" && step.key === "shipped") step.detail = "We are getting the parcel ready.";
    if (step.state === "current" && step.key === "received") step.detail = "Waiting for the parcel to land.";
  }

  if (order.status === "cancelled") {
    return {
      steps: steps.map((step) => ({ ...step, state: "todo" as const, detail: "This order was cancelled." })),
      terminal: { label: "Order cancelled", detail: "This order was cancelled before it shipped.", at: null },
    };
  }

  if (order.status === "rejected") {
    return {
      steps: steps.map((step) => ({ ...step, state: "todo" as const, detail: "This order was closed." })),
      terminal: { label: "Payment rejected", detail: "We could not verify the payment. Place a new order to try again.", at: order.rejectedAt ?? null },
    };
  }

  return { steps, terminal: null };
}

const shortDate = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });
const dateTime = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export function formatOrderDate(value: string | null | undefined, withTime = false) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return (withTime ? dateTime : shortDate).format(date);
}
