/**
 * Design direction: Technical Drop Editorial — product detail presents one component as a designed object with exact, readable choice points.
 */
import ProductGallery from "@/components/ProductGallery";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { money, products } from "@/data/products";
import { useStore } from "@/contexts/StoreContext";
import { ArrowLeft, Check, Minus, Plus, Ruler, ShieldCheck, Truck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { toast } from "sonner";

export default function ProductDetail() {
  const [, params] = useRoute("/product/:slug");
  const product = products.find((item) => item.slug === params?.slug);
  const { addToCart } = useStore();
  const [finish, setFinish] = useState(product?.finishes[0] ?? "");
  const [quantity, setQuantity] = useState(1);

  useEffect(() => { if (product) { setFinish(product.finishes[0]); setQuantity(1); } }, [product?.id]);

  if (!product) {
    return <section className="flex min-h-screen items-end px-4 pb-16 pt-28 sm:px-6 lg:px-9"><div><p className="font-display text-7xl uppercase leading-[.72] text-white/15">Not in<br />the rack.</p><Link href="/shop" className="mt-7 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.15em] text-[#ff5a36]"><ArrowLeft size={14} />Back to shop</Link></div></section>;
  }

  const handleAdd = () => {
    for (let count = 0; count < quantity; count += 1) addToCart(product, finish);
    toast.success(`${product.name} added`, { description: `${quantity} × ${finish}` });
  };

  return (
    <section className="min-h-screen pt-[68px]">
      <div className="mx-auto max-w-[1440px] px-4 pb-16 pt-5 sm:px-6 lg:px-9 lg:pt-8">
        <Link href="/shop" className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.15em] text-white/45 transition hover:text-[#ff5a36]"><ArrowLeft size={14} /> Back to index</Link>
        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)] lg:gap-16">
          <ProductGallery product={product} />
          <div className="flex flex-col justify-center pb-3 lg:pt-6">
            <div className="flex items-center justify-between border-b border-white/15 pb-3"><span className="text-[10px] font-bold uppercase tracking-[.16em] text-[#ff5a36]">{product.category}</span>{product.badge ? <span className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">{product.badge}</span> : null}</div>
            <div className="mt-4 flex items-end justify-between overflow-hidden border-b border-white/10 pb-2"><div className="flex items-center gap-3"><img src="/brand/ur-logo.png" alt="" className="size-10 object-contain" /><img src="/brand/underrated-wordmark.png" alt="Underrated Cycling Co." className="h-8 w-auto object-contain" /></div><span className="font-display -mb-3 text-7xl uppercase leading-none text-white/[.07]">Stamped</span></div>
            <h1 className="mt-7 font-display text-6xl uppercase leading-[.78] tracking-[-.05em] text-white sm:text-7xl">{product.name}</h1>
            <p className="mt-4 text-xl font-medium text-[#ff5a36]">{money(product.price)}</p>
            <p className="mt-6 max-w-xl text-sm leading-7 text-white/55">{product.description}</p>
            <div className="mt-9 border-t border-white/15 pt-5"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-white/45">Finish</p><div className="mt-3 flex flex-wrap gap-2">{product.finishes.map((item) => <button key={item} onClick={() => setFinish(item)} className={`border px-3 py-2 text-[10px] font-bold uppercase tracking-[.12em] transition ${finish === item ? "border-[#ff5a36] bg-[#ff5a36] text-black" : "border-white/15 text-white/60 hover:border-white/55 hover:text-white"}`}>{item}</button>)}</div></div>
            <div className="mt-6 flex gap-3"><div className="flex border border-white/15"><button onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="grid w-10 place-items-center text-white/55 hover:text-white" aria-label="Decrease quantity"><Minus size={16} /></button><span className="grid w-9 place-items-center text-sm font-bold text-white">{quantity}</span><button onClick={() => setQuantity((value) => value + 1)} className="grid w-10 place-items-center text-white/55 hover:text-white" aria-label="Increase quantity"><Plus size={16} /></button></div><button onClick={handleAdd} className="flex-1 bg-[#ff5a36] px-5 py-4 text-xs font-black uppercase tracking-[.16em] text-black transition hover:bg-white active:scale-[.985]">Add to your build — {money(product.price * quantity)}</button></div>
            <div className="mt-7 grid gap-3 border-y border-white/15 py-5 sm:grid-cols-2"><p className="flex gap-3 text-xs leading-5 text-white/45"><Truck size={17} className="shrink-0 text-[#ff5a36]" />Free shipping on orders over $90. Tracking lands when your parts do.</p><p className="flex gap-3 text-xs leading-5 text-white/45"><ShieldCheck size={17} className="shrink-0 text-[#ff5a36]" />Built around the details that matter at the hands and saddle.</p></div>
            <Accordion type="single" collapsible className="mt-2"><AccordionItem value="specs" className="border-white/15"><AccordionTrigger className="text-[10px] font-bold uppercase tracking-[.15em] text-white hover:no-underline">Technical details / 02</AccordionTrigger><AccordionContent><dl className="grid grid-cols-2 gap-x-5 gap-y-3 pb-3 pt-1">{product.specs.map((spec) => <div key={spec.label} className="border-t border-white/10 pt-2"><dt className="text-[9px] font-bold uppercase tracking-[.13em] text-white/40">{spec.label}</dt><dd className="mt-1 text-xs text-white/75">{spec.value}</dd></div>)}</dl></AccordionContent></AccordionItem><AccordionItem value="fitment" className="border-white/15"><AccordionTrigger className="text-[10px] font-bold uppercase tracking-[.15em] text-white hover:no-underline">Fit guide / 03</AccordionTrigger><AccordionContent><div className="border-l-2 border-[#ff5a36] pb-4 pl-4 pt-1"><p className="flex items-center gap-2 text-sm font-semibold text-white"><Ruler size={15} className="text-[#ff5a36]" />{product.fitment.headline}</p><ul className="mt-4 space-y-2">{product.fitment.compatibility.map((item) => <li key={item} className="flex gap-2 text-xs leading-5 text-white/55"><Check size={14} className="mt-0.5 shrink-0 text-[#ff5a36]" />{item}</li>)}</ul><p className="mt-4 border-t border-white/10 pt-3 text-xs leading-5 text-white/50"><span className="font-bold uppercase tracking-[.13em] text-white/70">Before you ride: </span>{product.fitment.checkBeforeRide}</p></div></AccordionContent></AccordionItem><AccordionItem value="care" className="border-white/15"><AccordionTrigger className="text-[10px] font-bold uppercase tracking-[.15em] text-white hover:no-underline">Care & compatibility / 04</AccordionTrigger><AccordionContent><p className="pb-4 text-sm leading-6 text-white/50">Keep the surface clean with a soft cloth, and check the current fit of your specific setup before the final install.</p></AccordionContent></AccordionItem></Accordion>
          </div>
        </div>
      </div>
    </section>
  );
}
