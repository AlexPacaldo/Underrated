/**
 * Design direction: Technical Drop Editorial — the admin item editor and its preview frame talk over one small typed message protocol.
 */
import type { Product, ProductVisual, ProductImagePosition } from "@/data/products";
import { productImagePositions, isProductImagePosition } from "@/data/products";

export const productPreviewPath = "/admin/product-preview";

export const productPreviewProductMessage = "product-preview:product";
export const productPreviewReadyMessage = "product-preview:ready";
export const productPreviewMetricsMessage = "product-preview:metrics";
export const productPreviewSelectMessage = "product-preview:select";

/** Every part of the item view an editor can jump to from the preview frame. */
export const productPreviewFields = ["name", "category", "price", "badge", "image", "descriptor", "description", "finishes", "specs", "fitment"] as const;

export type ProductPreviewField = typeof productPreviewFields[number];

export type ProductPreviewMode = {
  active: ProductPreviewField | null;
  onSelect: (field: ProductPreviewField) => void;
};

const visuals: ProductVisual[] = ["hoods", "valve", "saddle", "tape", "stem", "stand"];

export function postToParent(message: Record<string, unknown>) {
  if (typeof window === "undefined" || window.parent === window) return;
  window.parent.postMessage(message, window.location.origin);
}

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function text(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function list(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function imageList(value: unknown) {
  return list(value).map((item) => item.trim()).filter(Boolean);
}

export function readPreviewField(data: unknown): ProductPreviewField | null {
  const payload = asRecord(data);
  if (payload.type !== productPreviewSelectMessage) return null;
  return productPreviewFields.includes(payload.field as ProductPreviewField) ? (payload.field as ProductPreviewField) : null;
}

export function readPreviewProduct(data: unknown): Product | null {
  const payload = asRecord(data);
  if (payload.type !== productPreviewProductMessage) return null;
  const row = asRecord(payload.product);
  const visual = visuals.includes(row.visual as ProductVisual) ? (row.visual as ProductVisual) : "hoods";
  const specs = Array.isArray(row.specs) ? row.specs.flatMap((item) => { const spec = asRecord(item); return typeof spec.label === "string" && typeof spec.value === "string" ? [{ label: spec.label, value: spec.value }] : []; }) : [];
  const rawFitment = asRecord(row.fitment);
  const price = Number(row.price);
  const image = typeof row.image === "string" && row.image.trim() ? row.image : undefined;
  const images = imageList(row.images);
  const imagePositions: Partial<Record<string, ProductImagePosition>> = {};
  const rawPositions = row.image_positions;
  if (rawPositions && typeof rawPositions === "object") {
    const source = rawPositions as Record<string, unknown>;
    for (const key of Object.keys(source)) {
      const value = source[key];
      if (isProductImagePosition(value)) {
        imagePositions[key] = value;
      }
    }
  }
  return {
    id: text(row.id, "draft"),
    slug: text(row.slug, ""),
    name: text(row.name, "Untitled part"),
    category: text(row.category, "Accessories"),
    price: Number.isFinite(price) ? price : 0,
    badge: typeof row.badge === "string" && row.badge.trim() ? row.badge : undefined,
    descriptor: text(row.descriptor, ""),
    description: text(row.description, ""),
    finishes: list(row.finishes),
    image,
    images: images.filter((item) => item !== image),
    image_positions: imagePositions,
    visual,
    specs,
    fitment: { headline: text(rawFitment.headline, ""), compatibility: list(rawFitment.compatibility), checkBeforeRide: text(rawFitment.checkBeforeRide, "") },
    featured: Boolean(row.featured),
    archived: Boolean(row.archived),
    sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
  };
}

export function readPreviewProductHeight(data: unknown): number | null {
  const payload = asRecord(data);
  if (payload.type !== productPreviewMetricsMessage || typeof payload.height !== "number" || !Number.isFinite(payload.height)) return null;
  return Math.ceil(payload.height);
}