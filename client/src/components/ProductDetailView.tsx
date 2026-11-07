/**
 * Design direction: Technical Drop Editorial — product detail presents one component as a designed object with exact, readable choice points.
 * Kept out of the page so the admin item editor previews the exact view a customer sees.
 */
import ProductGallery from "@/components/ProductGallery";
import PreviewField from "@/components/admin/PreviewField";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { Product } from "@/data/products";
import { availableFinishStock, variationPrice } from "@/data/products";
import type { ProductPreviewMode } from "@/lib/productPreview";
import { ArrowLeft, ArrowRight, Check, Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useStore } from "@/contexts/StoreContext";

function finishColor(value: string) {
  const color = value.toLowerCase();
  if (color.includes("black") || color.includes("graphite")) return "#202124";
  if (color.includes("white")) return "#f2f0e8";
  if (color.includes("silver") || color.includes("gray") || color.includes("grey")) return "#929598";
  if (color.includes("blue")) return "#2451a6";
  if (color.includes("violet") || color.includes("purple")) return "#b34ad7";
  if (color.includes("yellow")) return "#ffd84d";
  if (color.includes("green")) return "#04ae68";
  if (color.includes("pink")) return "#f04ca8";
  if (color.includes("red")) return "#f23b3b";
  if (color.includes("orange") || color.includes("tangerine")) return "#ff5a36";
  return "#777";
}

export default function ProductDetailView({ product, onAdd, preview, topOffset = true, minHeight = true, backHref = "/shop", backLabel = "Shop" }: { product: Product; onAdd?: (product: Product, finish: string, quantity: number) => void; preview?: ProductPreviewMode | null; topOffset?: boolean; minHeight?: boolean; backHref?: string; backLabel?: string }) {
  const { formatMoney } = useCurrency();
  const { cart } = useStore();
  const variationAttributes = product.variationAttributes !== undefined
    ? product.variationAttributes
    : [{ name: "Color", options: product.finishes }];
  // Keep single-choice attributes in the manager as product metadata, but do
  // not ask shoppers to select a value when there is only one available.
  const selectableAttributes = variationAttributes.filter(attribute => attribute.options.length > 1);
  const variations = product.variations?.length
    ? product.variations
    : product.finishes.map(item => ({ finish: item, values: { Color: item } }));
  const [finish, setFinish] = useState(variations[0]?.finish ?? product.finishes[0] ?? "");
  const selectedVariation = variations.find(variant => variant.finish === finish) ?? variations[0];
  const [quantity, setQuantity] = useState(1);
  const availableStock = availableFinishStock(product, finish);
  const inCartQuantity = cart
    .filter(line => line.id === product.id && line.finish === finish)
    .reduce((sum, line) => sum + line.quantity, 0);
  const remainingStock = Math.max(0, availableStock - inCartQuantity);
  const maxOrderQuantity = Math.min(99, remainingStock);
  const weight = product.specs.find((spec) => spec.label.toLowerCase() === "weight")?.value;

  // Keyed on the finishes list rather than the product object so typing in another
  // field does not throw away the finish and quantity the editor preview is showing.
  const finishKey = product.finishes.join("\u0000");
  useEffect(() => {
    setFinish(variations[0]?.finish ?? product.finishes[0] ?? "");
    setQuantity(1);
  }, [finishKey]);

  const selectOption = (name: string, value: string) => {
    const match = variations.find(variant =>
      variant.values[name] === value &&
      selectableAttributes.every(attribute =>
        attribute.name === name || !selectedVariation?.values[attribute.name] ||
        variant.values[attribute.name] === selectedVariation.values[attribute.name]
      )
    ) ?? variations.find(variant => variant.values[name] === value);
    if (match) {
      setFinish(match.finish);
      setQuantity(1);
    }
  };

  const add = () => {
    if (!onAdd) return;
    if (quantity > remainingStock) {
      toast.error("Not enough stock available.", {
        description: `Only ${remainingStock} additional unit(s) can be added right now.`,
      });
      return;
    }
    onAdd(product, finish, quantity);
    toast.success(`${product.name} added`, { description: `${quantity} × ${selectableAttributes.length ? finish : "item"}` });
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
              <p className="mt-4 text-2xl font-semibold text-[#ff5a36]">{formatMoney(variationPrice(product, finish))}</p>
            </PreviewField>

            {selectableAttributes.length ? <PreviewField field="finishes" label="Finishes" preview={preview}>
              <div className="mt-7 border-y border-white/10 bg-white/[.015]">
                <div className="flex items-center justify-between gap-3 border-b border-white/[.08] px-4 py-3">
                  <div><p className="text-[9px] font-black uppercase tracking-[.18em] text-[#ff5a36]">Configure</p><p className="mt-1 text-sm font-bold text-white">Choose your setup</p></div>
                  <span className="border border-white/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[.12em] text-white/40">{selectableAttributes.length} {selectableAttributes.length === 1 ? "option" : "options"}</span>
                </div>
                <div className="space-y-5 px-4 py-4">
                  {selectableAttributes.map(attribute => {
                    const activeValue = selectedVariation?.values[attribute.name] ?? attribute.options[0] ?? "";
                    return <div key={attribute.name}>
                      <div className="mb-2 flex items-center justify-between gap-3"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-white/50">{attribute.name}</p><p className="text-xs font-semibold text-white">{activeValue}</p></div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {attribute.options.map(option => {
                          const availableOption = variations.some(variant =>
                            variant.values[attribute.name] === option &&
                            selectableAttributes.every(other => other.name === attribute.name || !selectedVariation?.values[other.name] || variant.values[other.name] === selectedVariation.values[other.name])
                          );
                          const selected = activeValue === option;
                          return <button key={option} onClick={() => selectOption(attribute.name, option)} aria-pressed={selected} disabled={!availableOption} className={`group/choice relative inline-flex min-h-10 items-center gap-2 border px-3 py-2 text-[10px] font-bold uppercase tracking-[.1em] transition ${selected ? "border-[#ff5a36] bg-[#ff5a36]/10 text-white shadow-[inset_0_-2px_0_#ff5a36]" : "border-white/12 bg-black/20 text-white/60 hover:border-white/45 hover:text-white"} disabled:cursor-not-allowed disabled:opacity-30`}>{attribute.name.toLowerCase().includes("color") ? <span aria-hidden="true" className={`size-3.5 rounded-full border ${selected ? "border-white ring-2 ring-[#ff5a36]/70 ring-offset-1 ring-offset-[#101113]" : "border-white/25"}`} style={{ backgroundColor: attribute.colors?.[option] ?? finishColor(option) }} /> : null}{option}{selected && <Check size={12} className="text-[#ff5a36]" />}</button>;
                        })}
                      </div>
                    </div>;
                  })}
                </div>
                {selectedVariation && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[.08] px-4 py-3"><span className="text-[9px] font-bold uppercase tracking-[.15em] text-white/35">Selected configuration</span><span className="text-xs font-semibold text-white/80">{selectedVariation.finish}</span></div>}
              </div>
            </PreviewField> : null}

            <div className={`mt-5 flex items-center justify-between gap-3 border px-3.5 py-3 ${availableStock > 0 ? "border-emerald-400/20 bg-emerald-400/[.04]" : "border-[#ff5a36]/25 bg-[#ff5a36]/[.04]"}`}>
              <p className="flex items-center gap-2.5 text-[10px] font-bold uppercase tracking-[.13em] text-white/65"><span className={`size-2 shrink-0 rounded-full ${availableStock > 0 ? "bg-emerald-400 shadow-[0_0_10px_#34d399]" : "bg-[#ff5a36] shadow-[0_0_10px_#ff5a36]"}`} />{availableStock > 0 ? <><span className="tabular-nums text-white">{availableStock}</span> available</> : "Sold out"}</p>
              {inCartQuantity > 0 && <p className="text-[10px] font-semibold tabular-nums text-white/45">{inCartQuantity} in cart</p>}
            </div>

            <div className="mt-3 flex gap-2.5">
              <div className="flex h-12 shrink-0 border border-white/15 bg-white/[.02]">
                <button onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="grid w-11 place-items-center text-white/55 transition hover:text-white" aria-label="Decrease quantity"><Minus size={16} /></button>
                <span className="grid w-10 place-items-center text-sm font-bold text-white">{quantity}</span>
                <button onClick={() => setQuantity((value) => Math.min(maxOrderQuantity, value + 1))} disabled={quantity >= maxOrderQuantity} className="grid w-11 place-items-center text-white/55 transition hover:text-white disabled:opacity-30" aria-label="Increase quantity"><Plus size={16} /></button>
              </div>
              <button onClick={add} disabled={!finish || remainingStock === 0 || quantity > remainingStock} className="group/add flex h-12 flex-1 items-center justify-center gap-3 bg-[#ff5a36] px-5 text-xs font-black uppercase tracking-[.16em] text-black transition hover:bg-white active:scale-[.985] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/45"><span>{availableStock ? (remainingStock ? "Add to cart" : "Stock limit reached") : "Sold out"}</span>{remainingStock > 0 && <ArrowRight size={15} className="transition-transform group-hover/add:translate-x-1" />}</button>
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
