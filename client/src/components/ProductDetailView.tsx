/**
 * Design direction: Technical Drop Editorial — product detail presents one component as a designed object with exact, readable choice points.
 * Kept out of the page so the admin item editor previews the exact view a customer sees.
 */
import ProductGallery from "@/components/ProductGallery";
import PreviewField from "@/components/admin/PreviewField";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { Product } from "@/data/products";
import type { ProductPreviewMode } from "@/lib/productPreview";
import { ArrowLeft, Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function ProductDetailView({ product, onAdd, preview, topOffset = true, minHeight = true, backHref = "/shop", backLabel = "Shop" }: { product: Product; onAdd?: (product: Product, finish: string, quantity: number) => void; preview?: ProductPreviewMode | null; topOffset?: boolean; minHeight?: boolean; backHref?: string; backLabel?: string }) {
  const { formatMoney } = useCurrency();
  const [finish, setFinish] = useState(product.finishes[0] ?? "");
  const [quantity, setQuantity] = useState(1);
  const weight = product.specs.find((spec) => spec.label.toLowerCase() === "weight")?.value;

  // Keyed on the finishes list rather than the product object so typing in another
  // field does not throw away the finish and quantity the editor preview is showing.
  const finishKey = product.finishes.join("\u0000");
  useEffect(() => {
    setFinish(product.finishes[0] ?? "");
    setQuantity(1);
  }, [finishKey]);

  const add = () => {
    if (!onAdd) return;
    onAdd(product, finish, quantity);
    toast.success(`${product.name} added`, { description: `${quantity} × ${finish}` });
  };

  return (
    <section className={`${minHeight ? "min-h-screen " : ""}${topOffset ? "pt-[68px]" : ""}`}>
      <div className="mx-auto max-w-[1200px] px-4 pb-16 pt-5 sm:px-6 lg:px-9 lg:pt-8">
        <Link href={backHref} className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.15em] text-white/45 transition hover:text-[#ff5a36]"><ArrowLeft size={14} /> Back to {backLabel.toLowerCase()}</Link>

        <div className="mx-auto mt-7 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,560px)_minmax(380px,1fr)] lg:items-start lg:gap-16">
          <PreviewField field="image" label="Gallery" preview={preview}>
            <ProductGallery product={product} />
          </PreviewField>

          <div className="flex w-full flex-col pb-3 lg:max-w-[560px]">
            <div className="flex items-center justify-between gap-4">
              <PreviewField field="category" label="Category" preview={preview}>
                <p className="text-[10px] font-bold uppercase tracking-[.16em] text-white/45">{product.category}</p>
              </PreviewField>
              {product.badge ? <span className="border border-white/20 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.14em] text-white/55">{product.badge}</span> : null}
            </div>

            <PreviewField field="name" label="Name" preview={preview}>
              <h1 className="mt-5 font-display text-5xl uppercase leading-[.84] tracking-[-.045em] text-white sm:text-6xl">{product.name}</h1>
            </PreviewField>

            <PreviewField field="price" label="Price" preview={preview}>
              <p className="mt-4 text-2xl font-semibold text-[#ff5a36]">{formatMoney(product.price)}</p>
            </PreviewField>

            <PreviewField field="finishes" label="Finishes" preview={preview}>
              <div className="mt-8">
                <p className="text-[10px] font-bold uppercase tracking-[.16em] text-white/45">Option <span className="px-1 text-white/20">—</span> <span className="text-white/80">{finish}</span></p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {product.finishes.map((item) => (
                    <button key={item} onClick={() => setFinish(item)} className={`min-w-[84px] border px-3 py-2.5 text-[10px] font-bold uppercase tracking-[.12em] transition ${finish === item ? "border-[#ff5a36] bg-[#ff5a36] text-black" : "border-white/15 text-white/60 hover:border-white/55 hover:text-white"}`}>{item}</button>
                  ))}
                </div>
              </div>
            </PreviewField>

            <p className="mt-5 flex items-center gap-2.5 text-[10px] font-bold uppercase tracking-[.13em] text-white/55">
              <span className="size-1.5 shrink-0 bg-[#ff5a36]" />
              In stock
            </p>

            <div className="mt-4 flex gap-2.5">
              <div className="flex h-12 border border-white/15">
                <button onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="grid w-11 place-items-center text-white/55 transition hover:text-white" aria-label="Decrease quantity"><Minus size={16} /></button>
                <span className="grid w-10 place-items-center text-sm font-bold text-white">{quantity}</span>
                <button onClick={() => setQuantity((value) => Math.min(99, value + 1))} disabled={quantity >= 99} className="grid w-11 place-items-center text-white/55 transition hover:text-white disabled:opacity-30" aria-label="Increase quantity"><Plus size={16} /></button>
              </div>
              <button onClick={add} disabled={!finish} className="h-12 flex-1 bg-[#ff5a36] px-5 text-xs font-black uppercase tracking-[.16em] text-black transition hover:bg-white active:scale-[.985] disabled:opacity-50">Add to cart</button>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-8 border-y border-white/10 py-5">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[.16em] text-white/40">Weight</p>
                <p className="mt-2 text-[13px] leading-5 text-white/75">{weight ?? "—"}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[.16em] text-white/40">Shipping</p>
                <p className="mt-2 text-[13px] leading-5 text-white/75">Calculated at checkout</p>
              </div>
            </div>

            <PreviewField field="description" label="Description" preview={preview}>
              <div className="mt-5 max-w-[58ch] space-y-4 text-sm leading-7 text-white/50">
                {product.description.split(/\r?\n(?:[ \t]*\r?\n)+/).map((paragraph, index) => (
                  <p key={index} className="whitespace-pre-line">{paragraph}</p>
                ))}
              </div>
            </PreviewField>
          </div>
        </div>
      </div>
    </section>
  );
}
