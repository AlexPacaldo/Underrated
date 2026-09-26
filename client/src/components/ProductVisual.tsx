/**
 * Design direction: Technical Drop Editorial — product forms are displayed as collectible technical objects against deep graphite.
 */
import type { Product, ProductImagePosition } from "@/data/products";

export default function ProductVisual({ product, compact = false, src, position, style }: { product: Product; compact?: boolean; src?: string; position?: ProductImagePosition; style?: React.CSSProperties }) {
  const image = src ?? product.image;

  if (image) {
    return <img src={image} alt={product.name} style={{ objectPosition: position ?? "center", pointerEvents: "none", ...style }} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]" />;
  }

  return (
    <div className={`product-visual product-visual--${product.visual} ${compact ? "product-visual--compact" : ""}`} aria-label={`${product.name} product illustration`} role="img">
      <span className="visual-shadow" />
      <span className="visual-object" />
      <span className="visual-detail" />
    </div>
  );
}
