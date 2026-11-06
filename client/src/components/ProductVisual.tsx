/**
 * Design direction: Technical Drop Editorial — product forms are displayed as collectible technical objects against deep graphite.
 */
import { productImagePositionCoordinates, type Product, type ProductImagePosition } from "@/data/products";

export default function ProductVisual({ product, compact = false, src, position, zoom = 1, style, onLoad }: { product: Product; compact?: boolean; src?: string; position?: ProductImagePosition; zoom?: number; style?: React.CSSProperties; onLoad?: React.ReactEventHandler<HTMLImageElement> }) {
  const image = src ?? product.image;

  if (image) {
    const [positionX, positionY] = productImagePositionCoordinates(position);
    return <img src={image} alt={product.name} style={{ objectPosition: position ?? "center", pointerEvents: "none", ...(zoom > 1 ? { position: "absolute", width: `${zoom * 100}%`, height: `${zoom * 100}%`, left: `${(100 - zoom * 100) * positionX / 100}%`, top: `${(100 - zoom * 100) * positionY / 100}%` } : {}), ...style }} onLoad={onLoad} className="h-full w-full max-w-none object-cover transition duration-500 group-hover:scale-[1.035]" />;
  }

  return (
    <div className={`product-visual product-visual--${product.visual} ${compact ? "product-visual--compact" : ""}`} aria-label={`${product.name} product illustration`} role="img">
      <span className="visual-shadow" />
      <span className="visual-object" />
      <span className="visual-detail" />
    </div>
  );
}
