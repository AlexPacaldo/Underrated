/**
 * Design direction: Technical Drop Editorial — product cards read as graphic equipment labels, not rounded marketplace tiles.
 */
import { money, Product } from "@/data/products";
import { Plus } from "lucide-react";
import { Link } from "wouter";
import { useStore } from "@/contexts/StoreContext";
import ProductVisual from "@/components/ProductVisual";

export default function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  const { addToCart } = useStore();

  return (
    <article className="group border-t border-white/15 pt-3">
      <Link href={`/product/${product.slug}`} className="block">
        <div className="relative aspect-[4/5] overflow-hidden bg-[#161719]">
          <ProductVisual product={product} />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
          {product.badge ? <span className="absolute left-3 top-3 border border-white/30 bg-black/55 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white backdrop-blur-sm">{product.badge}</span> : null}
          <span className="absolute bottom-3 left-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">{product.category}</span>
        </div>
      </Link>
      <div className="flex items-start justify-between gap-3 pt-3">
        <div>
          <Link href={`/product/${product.slug}`} className="font-display text-2xl uppercase leading-none tracking-tight text-white hover:text-[#ff5a36]">
            {product.name}
          </Link>
          <p className="mt-1 text-xs text-white/45">{product.descriptor}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="pt-1 text-sm font-bold text-white">{money(product.price)}</span>
          <button aria-label={`Add ${product.name} to cart`} onClick={() => addToCart(product)} className="grid size-8 place-items-center border border-white/25 text-white transition hover:border-[#ff5a36] hover:bg-[#ff5a36] active:scale-95">
            <Plus size={15} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </article>
  );
}
