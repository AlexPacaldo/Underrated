/**
 * Design direction: Technical Drop Editorial — the admin item preview shows the real shop card and the real item view so an editor is never guessing.
 */
import ProductCard from "@/components/ProductCard";
import ProductDetailView from "@/components/ProductDetailView";
import type { Product } from "@/data/products";
import { postToParent, productPreviewMetricsMessage, productPreviewReadyMessage, productPreviewSelectMessage, productPreviewViewMessage, readPreviewProduct, type ProductPreviewField, type ProductPreviewView } from "@/lib/productPreview";
import { useCallback, useEffect, useState } from "react";

const emptyDraft: Product = {
  id: "draft",
  slug: "",
  name: "Untitled part",
  category: "Accessories",
  price: 0,
  descriptor: "",
  description: "",
  finishes: ["Graphite"],
  images: [],
  visual: "hoods",
  specs: [],
  fitment: { headline: "", compatibility: [], checkBeforeRide: "" },
  featured: false,
  archived: false,
  sortOrder: 0,
};

export default function ProductPreview() {
  const [product, setProduct] = useState<Product>(emptyDraft);
  const [field, setField] = useState<ProductPreviewField | null>(null);
  const [view, setView] = useState<ProductPreviewView>("page");

  const select = useCallback((next: ProductPreviewField) => {
    setField(next);
    postToParent({ type: productPreviewSelectMessage, field: next });
  }, []);

  useEffect(() => {
    document.documentElement.style.overflow = "hidden";

    const report = () => postToParent({ type: productPreviewMetricsMessage, height: document.body.scrollHeight });
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const next = readPreviewProduct(event.data);
      if (next) {
        setProduct(next);
        return;
      }
      const payload = event.data && typeof event.data === "object"
        ? event.data as { type?: string; view?: unknown }
        : null;
      if (payload?.type === productPreviewViewMessage && (payload.view === "page" || payload.view === "card")) {
        setView(payload.view);
      }
    };
    // Outlined fields handle their own clicks, so only everything else is swallowed:
    // that keeps the storefront chrome, the cart button and the back link inert.
    const swallowClicks = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-product-field]")) return;
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

  if (view === "card") {
    return (
      <main className="px-5 pb-12 pt-8 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <p className="text-[10px] font-black uppercase tracking-[.16em] text-white/40">Shop / Item card</p>
          <div className="mt-5 rounded-lg border border-white/10 bg-[#101113] px-5 py-8 sm:px-10 sm:py-12">
            <div className="mx-auto w-full max-w-[320px]">
              <ProductCard product={product} preview={{ active: field, onSelect: select }} />
            </div>
          </div>
        </div>
      </main>
    );
  }

  return <ProductDetailView product={product} preview={{ active: field, onSelect: select }} topOffset={false} minHeight={false} backHref="/shop" backLabel="Shop" />;
}