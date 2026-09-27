/**
 * Design direction: Technical Drop Editorial - an order line keeps the same product framing as the shop, so history reads like the catalog.
 */
import type { AccountOrderItem } from "@/lib/accountOrders";
import { normalizeImagePositions, productPhotos, type Product, type ProductVisual as ProductVisualKind } from "@/data/products";
import ProductVisual from "@/components/ProductVisual";
import { cn } from "@/lib/utils";

/**
 * The line is a snapshot, not a catalog row, so the placeholder product is built
 * from whatever the order line carries. A part that was archived or removed from
 * the catalog still renders its photo and still has a slug to open.
 */
function placeholderProduct(item: AccountOrderItem): Product {
  const images = Array.isArray(item.product_images) ? item.product_images.filter((photo): photo is string => typeof photo === "string" && photo.trim() !== "") : [];
  const photos = productPhotos({ image: item.product_image_path ?? undefined, images });
  const photo = photos[0];

  return {
    id: item.product_id,
    slug: item.product_slug ?? item.product_id,
    name: item.product_name,
    category: "",
    price: 0,
    descriptor: "",
    description: "",
    finishes: Array.isArray(item.product_finishes) ? item.product_finishes : [],
    image: photo,
    image_positions: normalizeImagePositions(photos, item.product_image_positions),
    visual: (item.product_visual ?? "hoods") as ProductVisualKind,
    specs: [],
    fitment: { headline: "", compatibility: [], checkBeforeRide: "" },
    archived: item.product_archived ?? false,
  };
}

export default function OrderItemVisual({ item, className }: { item: AccountOrderItem; className?: string }) {
  const product = placeholderProduct(item);
  const photo = product.image;

  return (
    <div className={cn("overflow-hidden bg-[#1a1b1e]", className)}>
      <ProductVisual product={product} compact src={photo} position={photo ? product.image_positions?.[photo] : undefined} />
    </div>
  );
}
