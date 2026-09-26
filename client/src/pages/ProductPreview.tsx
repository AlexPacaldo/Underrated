/**
 * Design direction: Technical Drop Editorial — the admin item preview shows the real shop card and the real item view so an editor is never guessing.
 */
import ProductCard from "@/components/ProductCard";
import ProductDetailView from "@/components/ProductDetailView";
import type { Product } from "@/data/products";
import { postToParent, productPreviewMetricsMessage, productPreviewProductMessage, productPreviewReadyMessage, readPreviewProduct } from "@/lib/productPreview";
import { useEffect, useState } from "react";

const emptyDraft: Product = {
  id: "draft",
  slug: "",
  name: "Untitled part",
  category: "Accessories",
  price: 0,
  descriptor: "",
  description: "",
  finishes: ["Graphite"],
  visual: "hoods",
  specs: [],
  fitment: { headline: "", compatibility: [], checkBeforeRide: "" },
  featured: false,
  archived: false,
  sortOrder: 0,
};

export default function ProductPreview() {
  const [product, setProduct] = useState<Product>(emptyDraft);

  useEffect(() => {
    document.documentElement.style.overflow = "hidden";

    const report = () => postToParent({ type: productPreviewMetricsMessage, height: document.documentElement.scrollHeight });
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const next = readPreviewProduct(event.data);
      if (next) setProduct(next);
    };
    const swallowClicks = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const observer = new ResizeObserver(report);
    observer.observe(document.body);
    window.addEventListener("resize", report);
    window.addEventListener("message", handleMessage);
    document.addEventListener("click", swallowClicks, true);

    postToParent({ type: productPreviewReadyMessage });
    const settle = window.setTimeout(report, 500);

    return () => {
      observer.disconnect();
      window.clearTimeout(settle);
      window.removeEventListener("resize", report);
      window.removeEventListener("message", handleMessage);
      document.removeEventListener("click", swallowClicks, true);
      document.documentElement.style.overflow = "";
    };
  }, []);

  return <div className="pt-[68px]">
    <section className="px-4 py-10 sm:px-6 lg:px-9">
      <div className="mx-auto max-w-[1440px]">
        <p className="text-[10px] font-black uppercase tracking-[.16em] text-white/35">Shop card / how it sits in the index</p>
        <div className="mt-4 grid gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="max-w-[300px]"><ProductCard product={product} /></div>
        </div>
      </div>
    </section>
    <ProductDetailView product={product} topOffset={false} backHref="/shop" backLabel="Back to index" />
  </div>;
}
