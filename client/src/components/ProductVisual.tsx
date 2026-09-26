/**
 * Design direction: Technical Drop Editorial — product forms are displayed as collectible technical objects against deep graphite.
 */
import type { Product } from "@/data/products";

export default function ProductVisual({ product, compact = false, src }: { product: Product; compact?: boolean; src?: string }) {
  const image = src ?? product.image;

  if (image) {
    return <img src={image} alt={product.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]" />;
  }

  return (
    <div className={`product-visual product-visual--${product.visual} ${compact ? "product-visual--compact" : ""}`} aria-label={`${product.name} product illustration`} role="img">
      <span className="visual-shadow" />
      <span className="visual-object" />
      <span className="visual-detail" />
    </div>
  );
}
