/**
 * Design direction: Technical Drop Editorial — product cards read as graphic equipment labels, not rounded marketplace tiles.
 */
import { useCurrency } from "@/contexts/CurrencyContext";
import { availableFinishStock, Product, startingVariationPrice } from "@/data/products";
import { Plus } from "lucide-react";
import { Link } from "wouter";
import { useStore } from "@/contexts/StoreContext";
import ProductVisual from "@/components/ProductVisual";
import PreviewField from "@/components/admin/PreviewField";
import type { ProductPreviewMode } from "@/lib/productPreview";

export default function ProductCard({ product, preview }: { product: Product; priority?: boolean; preview?: ProductPreviewMode | null }) {
  const { addToCart, cart } = useStore();
  const { formatMoney } = useCurrency();
  const defaultFinish = product.finishes[0] ?? "";
  const hasSelectableOptions = Boolean(product.variationAttributes?.length);
  const variationPrices = product.variations?.map(variation => variation.pricePhpCents).filter((price): price is number => Number.isSafeInteger(price));
  const hasPriceRange = Boolean(variationPrices && new Set(variationPrices).size > 1);
  const availableStock = availableFinishStock(product, defaultFinish);
  const hasAnyAvailableStock = product.finishes.length
    ? product.finishes.some(finish => availableFinishStock(product, finish) > 0)
    : availableStock > 0;
  const soldOut = !hasAnyAvailableStock;
  const inCart = cart
    .filter(line => line.id === product.id && line.finish === defaultFinish)
    .reduce((sum, line) => sum + line.quantity, 0);
  const canAdd = inCart < availableStock;
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
                zoom={galleryFrame === "wide" ? product.card_image_zoom : 1}
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
              {product.badge && <span className="product-image-label absolute left-3 top-3 border border-white/30 bg-black/55 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white backdrop-blur-sm">{product.badge}</span>}
              {soldOut && <span className="absolute right-3 top-3 inline-flex items-center gap-2 border border-[#ff5a36]/70 bg-[#090a0b]/90 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-lg backdrop-blur-sm"><span className="size-1.5 bg-[#ff5a36]" aria-hidden="true" />Sold out</span>}
            </div>
          </Link>
        </PreviewField>
        {!soldOut && <button aria-label={hasSelectableOptions ? `Add ${product.name} in ${defaultFinish} to cart` : `Add ${product.name} to cart`} onClick={() => addToCart(product, defaultFinish)} disabled={!canAdd} title={canAdd ? (hasSelectableOptions ? `Add ${defaultFinish} to cart` : "Add to cart") : availableStock === 0 ? "Out of stock" : "Stock limit reached"} className="absolute bottom-3 right-3 grid size-9 place-items-center border border-white/30 bg-black/55 text-white backdrop-blur-sm transition hover:border-[#ff5a36] hover:bg-[#ff5a36] hover:text-black active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100">
          <Plus size={16} strokeWidth={2.5} />
        </button>}
      </div>
      <div className="pt-3">
        <PreviewField field="name" label="Name / descriptor" preview={preview} className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">{product.category}</p>
          <Link href={`/product/${product.slug}`} className="mt-1.5 block font-display text-2xl uppercase leading-[0.95] tracking-tight text-white hover:text-[#ff5a36]">
            {product.name}
          </Link>
        </PreviewField>
        <PreviewField field="price" label="Price" preview={preview} className="mt-1.5 w-fit">
          <span className="block text-sm text-white/50">{hasPriceRange ? "From " : ""}{formatMoney(startingVariationPrice(product))}</span>
        </PreviewField>
      </div>
    </article>
  );
}
