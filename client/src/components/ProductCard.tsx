/**
 * Design direction: Technical Drop Editorial — product cards read as graphic equipment labels, not rounded marketplace tiles.
 */
import { useCurrency } from "@/contexts/CurrencyContext";
import { Product } from "@/data/products";
import { Plus } from "lucide-react";
import { Link } from "wouter";
import { useStore } from "@/contexts/StoreContext";
import ProductVisual from "@/components/ProductVisual";
import PreviewField from "@/components/admin/PreviewField";
import type { ProductPreviewMode } from "@/lib/productPreview";

export default function ProductCard({ product, preview }: { product: Product; priority?: boolean; preview?: ProductPreviewMode | null }) {
  const { addToCart } = useStore();
  const { formatMoney } = useCurrency();
  const leadImage = product.image;
  const galleryFrame = leadImage ? product.image_frames?.[leadImage] ?? "wide" : "wide";
  const cropPosition = leadImage
    ? galleryFrame === "portrait" ? product.image_positions?.[leadImage] : product.card_image_position
    : undefined;

  return (
    <article className="group">
      <div className="relative">
        <PreviewField field="image" label="Photos" preview={preview}>
          <Link href={`/product/${product.slug}`} className="block">
            <div className="product-card-media relative aspect-[4/5] overflow-hidden bg-[#161719]">
              <ProductVisual
                product={product}
                position={cropPosition}
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
              {product.badge ? <span className="product-image-label absolute left-3 top-3 border border-white/30 bg-black/55 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white backdrop-blur-sm">{product.badge}</span> : null}
            </div>
          </Link>
        </PreviewField>
        <button aria-label={`Add ${product.name} to cart`} onClick={() => addToCart(product)} className="absolute bottom-3 right-3 grid size-9 place-items-center border border-white/30 bg-black/55 text-white backdrop-blur-sm transition hover:border-[#ff5a36] hover:bg-[#ff5a36] hover:text-black active:scale-95 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100">
          <Plus size={16} strokeWidth={2.5} />
        </button>
      </div>
      <div className="pt-3">
        <PreviewField field="name" label="Name / descriptor" preview={preview} className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">{product.category}</p>
          <Link href={`/product/${product.slug}`} className="mt-1.5 block font-display text-2xl uppercase leading-[0.95] tracking-tight text-white hover:text-[#ff5a36]">
            {product.name}
          </Link>
        </PreviewField>
        <PreviewField field="price" label="Price" preview={preview} className="mt-1.5 w-fit">
          <span className="block text-sm text-white/50">{formatMoney(product.price)}</span>
        </PreviewField>
      </div>
    </article>
  );
}
