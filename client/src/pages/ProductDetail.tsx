/**
 * Design direction: Technical Drop Editorial — product detail presents one component as a designed object with exact, readable choice points.
 */
import ProductDetailView from "@/components/ProductDetailView";
import { useCatalog } from "@/contexts/CatalogContext";
import { useStore } from "@/contexts/StoreContext";
import type { Product } from "@/data/products";
import { ArrowLeft } from "lucide-react";
import { Link, useRoute } from "wouter";

export default function ProductDetail() {
  const [, params] = useRoute("/product/:slug");
  const { products, loading } = useCatalog();
  const product = products.find((item) => item.slug === params?.slug);
  const { addToCart } = useStore();

  if (loading && !product) {
    return <section className="flex min-h-screen items-end px-4 pb-16 pt-28 sm:px-6 lg:px-9"><div><p className="font-display text-7xl uppercase leading-[.72] text-white/15">Loading<br />the rack.</p><Link href="/shop" className="mt-7 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.15em] text-[#ff5a36]"><ArrowLeft size={14} />Back to shop</Link></div></section>;
  }

  if (!product || product.finishes.length === 0) {
    return <section className="flex min-h-screen items-end px-4 pb-16 pt-28 sm:px-6 lg:px-9"><div><p className="font-display text-7xl uppercase leading-[.72] text-white/15">Not in<br />the rack.</p><Link href="/shop" className="mt-7 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.15em] text-[#ff5a36]"><ArrowLeft size={14} />Back to shop</Link></div></section>;
  }

  const handleAdd = (item: Product, finish: string, quantity: number) => {
    for (let count = 0; count < quantity; count += 1) addToCart(item, finish);
  };

  return <ProductDetailView product={product} onAdd={handleAdd} />;
}
