/**
 * Design direction: Technical Drop Editorial — admin previews are scaled print proofs, never re-implementations of the storefront.
 * Outlines the part of a real storefront component that maps to one editor field, so the frame is the fastest way to fill it in.
 */
import type { ProductPreviewField, ProductPreviewMode } from "@/lib/productPreview";
import { type MouseEvent, type ReactNode } from "react";

/**
 * Props to spread straight onto an element that has to stay a direct child of its parent.
 * Radix collections merge into their immediate children, so the accordion items cannot be wrapped.
 */
export function previewFieldProps(field: ProductPreviewField, preview?: ProductPreviewMode | null, className = "") {
  if (!preview) return { className };

  // preventDefault stops the storefront link underneath without stopPropagation, so the gallery
  // tiles, accordions and finish buttons stay usable while the editor jumps to the field.
  const active = preview.active === field;

  return {
    "data-product-field": field,
    onClickCapture: (event: MouseEvent) => { event.preventDefault(); preview.onSelect(field); },
    className: `relative cursor-pointer ${active ? "z-10 outline-2 -outline-offset-2 outline-[#ff5a36]" : "outline-2 -outline-offset-2 outline-dashed outline-white/25 hover:outline-[#ff5a36]"} ${className}`.trim(),
  };
}

export default function PreviewField({ field, label, preview, className = "", children }: { field: ProductPreviewField; label: string; preview?: ProductPreviewMode | null; className?: string; children: ReactNode }) {
  if (!preview) return <>{children}</>;

  const active = preview.active === field;

  return <div data-product-field={field} onClickCapture={(event) => { event.preventDefault(); preview.onSelect(field); }} className={`group/preview relative ${className} ${active ? "z-10 cursor-pointer outline-2 -outline-offset-2 outline-[#ff5a36]" : "cursor-pointer outline-2 -outline-offset-2 outline-dashed outline-white/25 hover:outline-[#ff5a36]"}`}>
    {children}
    <span className={`pointer-events-none absolute left-2 top-2 z-30 border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[.16em] transition ${active ? "border-[#ff5a36] bg-[#ff5a36] text-black" : "border-[#ff5a36] bg-black/80 text-[#ff5a36] opacity-0 group-hover/preview:opacity-100"}`}>{label} / click to edit</span>
  </div>;
}