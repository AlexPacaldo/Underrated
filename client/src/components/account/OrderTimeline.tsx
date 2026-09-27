/**
 * Design direction: Technical Drop Editorial - the timeline is a workshop rail: square markers, hairline rules, stamped dates.
 * The order detail and the admin console both read the rider's version of the shipment from here.
 */
import { formatOrderDate, type OrderTimeline as OrderTimelineData } from "@/lib/orderStatus";
import { cn } from "@/lib/utils";

const markerClass = {
  done: "border-[#ff5a36] bg-[#ff5a36]",
  current: "border-[#ff5a36] bg-transparent",
  todo: "border-white/20 bg-transparent",
};

const labelClass = {
  done: "text-white",
  current: "text-[#ff5a36]",
  todo: "text-white/35",
};

export default function OrderTimeline({ timeline, className }: { timeline: OrderTimelineData; className?: string }) {
  return (
    <div className={cn("w-full", className)}>
      <ol className="grid gap-y-6 sm:grid-cols-4 sm:gap-x-0">
        {timeline.steps.map((step, index) => (
          <li key={step.key} className="relative sm:pr-4">
            <div className="flex items-center gap-3 sm:block">
              <div className="flex w-full items-center gap-2 sm:mb-3">
                <span aria-hidden className={cn("size-3 shrink-0 border-2", markerClass[step.state])} />
                {index < timeline.steps.length - 1 ? <span aria-hidden className={cn("hidden h-px flex-1 sm:block", step.state === "done" ? "bg-[#ff5a36]/50" : "bg-white/15")} /> : null}
              </div>
              <p className={cn("text-[10px] font-black uppercase tracking-[0.16em]", labelClass[step.state])}>{step.label}</p>
            </div>
            <p className="mt-2 text-xs leading-5 text-white/45">{step.detail}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">
              {formatOrderDate(step.at, true) ?? (step.state === "done" ? "Confirmed" : "Pending")}
            </p>
          </li>
        ))}
      </ol>

      {timeline.terminal ? (
        <div className="mt-6 border border-white/15 bg-white/[.02] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">{timeline.terminal.label}</p>
          <p className="mt-2 text-sm leading-6 text-white/60">{timeline.terminal.detail}</p>
          {formatOrderDate(timeline.terminal.at, true) ? <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">{formatOrderDate(timeline.terminal.at, true)}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
