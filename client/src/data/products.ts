export type ProductVisual =
  "hoods" | "valve" | "saddle" | "tape" | "stem" | "stand";

/**
 * Where a photo sits inside the frame that crops it. Photos always fill their frame, so this is what
 * decides which part of the shot survives the crop, on the card, in the gallery and in the zoom.
 */
export const productImagePositions = [
  "top left",
  "top",
  "top right",
  "left",
  "center",
  "right",
  "bottom left",
  "bottom",
  "bottom right",
] as const;

export type ProductImagePosition =
  (typeof productImagePositions)[number] | `${number}% ${number}%`;

export const productImageFrames = ["wide", "portrait"] as const;

export type ProductImageFrame = (typeof productImageFrames)[number];

export function isProductImageFrame(
  value: unknown
): value is ProductImageFrame {
  return productImageFrames.some(frame => frame === value);
}

export function productImageFrameRatio(frame?: ProductImageFrame) {
  return frame === "portrait" ? 4 / 5 : 4 / 3;
}

export function isProductImagePosition(
  value: unknown
): value is ProductImagePosition {
  if (typeof value !== "string") return false;
  if ((productImagePositions as readonly string[]).includes(value)) return true;
  // Also accept percentage format like "50% 50%"
  return /^\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%$/.test(value);
}

export function productImagePositionCoordinates(
  position?: ProductImagePosition
): [number, number] {
  if (!position) return [50, 50];
  const percentages = position.match(/^(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
  if (percentages) return [Number(percentages[1]), Number(percentages[2])];

  const parts = position.split(" ");
  const horizontal = parts.find(part => ["left", "right"].includes(part));
  const vertical = parts.find(part => ["top", "bottom"].includes(part));
  const x = horizontal === "left" ? 0 : horizontal === "right" ? 100 : 50;
  const y = vertical === "top" ? 0 : vertical === "bottom" ? 100 : 50;
  return [x, y];
}

export function formatProductImagePosition(
  x: number,
  y: number
): ProductImagePosition {
  return `${x.toFixed(2)}% ${y.toFixed(2)}%` as ProductImagePosition;
}

export function normalizeCardImageZoom(value: unknown): number {
  const zoom = Number(value);
  return Number.isFinite(zoom) ? Math.max(1, Math.min(3, zoom)) : 1;
}

/** Every photo in order, the primary first. Framing is keyed by url, so this is the list positions are kept against. */
export function productPhotos(product: Pick<Product, "image" | "images">) {
  const photos: string[] = [];
  for (const value of [product.image, ...(product.images ?? [])]) {
    const item = typeof value === "string" ? value.trim() : "";
    if (item && !photos.includes(item)) photos.push(item);
  }
  return photos;
}

/** Keeps a framing only if the photo still exists and the value is one of the nine real positions. */
export function normalizeImagePositions(
  photos: string[],
  positions: unknown
): Partial<Record<string, ProductImagePosition>> {
  const result: Partial<Record<string, ProductImagePosition>> = {};
  if (!positions || typeof positions !== "object") return result;
  const source = positions as Record<string, unknown>;
  for (const photo of photos) {
    const value = source[photo];
    if (isProductImagePosition(value)) result[photo] = value;
  }
  return result;
}

/** Keeps a frame choice only for photos that still exist. Missing choices use the wide default. */
export function normalizeImageFrames(
  photos: string[],
  frames: unknown
): Partial<Record<string, ProductImageFrame>> {
  const result: Partial<Record<string, ProductImageFrame>> = {};
  if (!frames || typeof frames !== "object") return result;
  const source = frames as Record<string, unknown>;
  for (const photo of photos) {
    const value = source[photo];
    if (isProductImageFrame(value)) result[photo] = value;
  }
  return result;
}

export type Product = {
  id: string;
  slug: string;
  name: string;
  category: string;
  price: number;
  /** Packed shipping weight used by checkout, in kilograms. */
  shippingWeightKg?: number;
  /** Physical units on hand, including units reserved for open orders. */
  stockQuantity: number;
  /** Units held for orders that have not shipped yet. */
  reservedQuantity: number;
  /** Physical and reserved quantities keyed by customer-facing finish. */
  finishStock?: Record<string, number>;
  finishReservedStock?: Record<string, number>;
  badge?: string;
  descriptor: string;
  description: string;
  finishes: string[];
  variationAttributes?: ProductVariationAttribute[];
  variations?: ProductVariation[];
  image?: string;
  /** Extra photos beyond the primary image, in gallery order. */
  images?: string[];
  /** Which part of each photo to keep when a frame crops it, keyed by photo url. */
  image_positions?: Partial<Record<string, ProductImagePosition>>;
  /** Independent crop used by the shop card when the gallery uses a wide frame. */
  card_image_position?: ProductImagePosition;
  /** Zoom applied to the shop-card crop. */
  card_image_zoom?: number;
  /** Which display frame each photo uses, keyed by photo url. */
  image_frames?: Partial<Record<string, ProductImageFrame>>;
  visual: ProductVisual;
  specs: { label: string; value: string }[];
  fitment: {
    headline: string;
    compatibility: string[];
    checkBeforeRide: string;
  };
  featured?: boolean;
  archived?: boolean;
  sortOrder?: number;
};

export type ProductVariationAttribute = { name: string; options: string[]; colors?: Record<string, string> };
export type ProductVariation = { finish: string; values: Record<string, string>; pricePhpCents?: number };

export function variationPrice(product: Product, finish: string) {
  const cents = product.variations?.find(item => item.finish === finish)?.pricePhpCents;
  return typeof cents === "number" && Number.isSafeInteger(cents) && cents >= 0
    ? cents / 100
    : product.price;
}

export function startingVariationPrice(product: Product) {
  const prices = product.variations
    ?.map(variation => variation.pricePhpCents)
    .filter((price): price is number => typeof price === "number" && Number.isSafeInteger(price) && price >= 0);
  return prices?.length ? Math.min(...prices) / 100 : product.price;
}

export function variationFinish(
  attributes: ProductVariationAttribute[],
  values: Record<string, string>
) {
  if (attributes.length === 0) return "Standard";
  if (attributes.length === 1) return values[attributes[0].name] ?? "";
  return attributes.map(attribute => `${attribute.name}: ${values[attribute.name] ?? ""}`).join(" · ");
}

export function finishStock(product: Product, finish: string) {
  return Math.max(0, product.finishStock
    ? product.finishStock[finish] ?? 0
    : product.stockQuantity);
}

export function finishReservedStock(product: Product, finish: string) {
  return Math.max(0, product.finishReservedStock
    ? product.finishReservedStock[finish] ?? 0
    : product.reservedQuantity);
}

export function availableFinishStock(product: Product, finish: string) {
  return Math.max(0, finishStock(product, finish) - finishReservedStock(product, finish));
}

export type CatalogCategory = {
  id: string;
  name: string;
  sortOrder: number;
};

export const products: Product[] = [
  {
    id: "stealth-hoods",
    slug: "stealth-hoods",
    name: "Stealth Hoods",
    category: "Hoods",
    price: 3800,
    stockQuantity: 0,
    reservedQuantity: 0,
    badge: "New drop",
    descriptor: "Variation without compromise.",
    description:
      "A sculpted grip profile for the riders who tune every touchpoint. Built to feel planted in the sprint and quiet on the long way home.",
    finishes: [
      "Matte Black",
      "Graphite",
      "Iced White",
      "Silver",
      "Violet",
      "Yellow",
      "Green",
      "Pink",
      "Signal Red",
    ],
    visual: "hoods",
    specs: [
      { label: "Fit", value: "Road STI" },
      { label: "Material", value: "High-grip elastomer" },
      { label: "Weight", value: "118 g / pair" },
    ],
    fitment: {
      headline: "Built around road STI profiles.",
      compatibility: [
        "Road STI lever bodies",
        "Pairs with standard bar tape wraps",
        "Use as a matched left/right pair",
      ],
      checkBeforeRide:
        "Confirm your lever-body shape and current hood dimensions before removing the original pair.",
    },
    featured: true,
    sortOrder: 1,
  },
  {
    id: "rocket-valve-cap",
    slug: "rocket-valve-cap",
    name: "Rocket Valve Cap",
    category: "Valve Caps",
    price: 950,
    stockQuantity: 0,
    reservedQuantity: 0,
    badge: "Limited run",
    descriptor: "Small part. Loud signal.",
    description:
      "A pocket-sized detail with a machined finish and enough color to change the whole build. Sold as a pair.",
    finishes: ["Signal Tangerine", "Iced White", "Deep Blue"],
    image: "/manus-storage/underrated-valvecap_f8df5399.jpg",
    visual: "valve",
    specs: [
      { label: "Fit", value: "Presta valves" },
      { label: "Material", value: "Anodized alloy" },
      { label: "Included", value: "2 caps" },
    ],
    fitment: {
      headline: "Made for Presta valve stems.",
      compatibility: [
        "Road and track tubes with Presta valves",
        "Tubeless valves with standard Presta threads",
        "Sold as a matching pair",
      ],
      checkBeforeRide:
        "Check that your valve core and extender leave enough exposed thread for a secure hand-tight fit.",
    },
    featured: true,
    sortOrder: 2,
  },
  {
    id: "iced-saddle",
    slug: "iced-saddle",
    name: "Iced Saddle",
    category: "Saddles",
    price: 6500,
    stockQuantity: 0,
    reservedQuantity: 0,
    descriptor: "A clean break from the expected.",
    description:
      "A narrow-profile saddle shaped for quick position changes, finished in an ice-white composite surface that turns a build into a statement.",
    finishes: ["Iced White", "Graphite"],
    image: "/manus-storage/underrated-saddle_50233c3e.jpg",
    visual: "saddle",
    specs: [
      { label: "Width", value: "143 mm" },
      { label: "Rails", value: "Chromoly" },
      { label: "Weight", value: "244 g" },
    ],
    fitment: {
      headline: "A 143 mm profile with standard round rails.",
      compatibility: [
        "Seatposts designed for round rails",
        "Road, track, and gravel build positions",
        "Works with conventional two-bolt clamps",
      ],
      checkBeforeRide:
        "Confirm rail-clamp compatibility and observe your seatpost’s recommended torque before final adjustment.",
    },
    featured: true,
    sortOrder: 3,
  },
  {
    id: "deep-blue-tape",
    slug: "deep-blue-tape",
    name: "Deep Blue Tape",
    category: "Cockpit",
    price: 1800,
    stockQuantity: 0,
    reservedQuantity: 0,
    descriptor: "Hold the line.",
    description:
      "Cushioned tape with a tightly controlled wrap texture, made to pull a cockpit together without swallowing the detail.",
    finishes: ["Deep Blue", "Graphite", "Iced White"],
    visual: "tape",
    specs: [
      { label: "Length", value: "2 × 220 cm" },
      { label: "Thickness", value: "2.5 mm" },
      { label: "Finish", value: "Microtexture" },
    ],
    fitment: {
      headline: "Cut and wrap for any drop-bar cockpit.",
      compatibility: [
        "Standard road and gravel drop bars",
        "Pairs with most road STI hoods",
        "Enough length for a full two-side wrap",
      ],
      checkBeforeRide:
        "Measure your current wrap and leave a little excess before trimming the final bar-end finish.",
    },
    featured: true,
    sortOrder: 4,
  },
  {
    id: "covert-stem",
    slug: "covert-stem",
    name: "Covert Stem",
    category: "Cockpit",
    price: 4500,
    stockQuantity: 0,
    reservedQuantity: 0,
    descriptor: "No wasted surface.",
    description:
      "A compact forged alloy stem with a low visual profile and an unapologetically dark finish.",
    finishes: ["Graphite"],
    visual: "stem",
    specs: [
      { label: "Clamp", value: "31.8 mm" },
      { label: "Rise", value: "−7°" },
      { label: "Lengths", value: "90 / 100 / 110 mm" },
    ],
    fitment: {
      headline: "Made for a 31.8 mm bar and 1⅛ in steerer.",
      compatibility: [
        "31.8 mm road or gravel handlebars",
        "1⅛ in threadless steerers",
        "Available in three reach lengths",
      ],
      checkBeforeRide:
        "Confirm handlebar clamp size, steerer diameter, and cable clearance before you commit to a length.",
    },
    sortOrder: 5,
  },
  {
    id: "display-stand",
    slug: "display-stand",
    name: "Trophy Display Stand",
    category: "Accessories",
    price: 2500,
    stockQuantity: 0,
    reservedQuantity: 0,
    badge: "Workshop pick",
    descriptor: "Park it with intention.",
    description:
      "A compact display piece for the build that refuses to hide in a corner between rides.",
    finishes: ["Graphite", "Signal Tangerine"],
    visual: "stand",
    specs: [
      { label: "Fit", value: "Road + track" },
      { label: "Base", value: "Non-marking rubber" },
      { label: "Use", value: "Display / storage" },
    ],
    fitment: {
      headline: "A display rest for road and track builds.",
      compatibility: [
        "Road and track wheel profiles",
        "Clean indoor floors and studio setups",
        "Non-marking rubber contact point",
      ],
      checkBeforeRide:
        "Use the stand only on a level surface and confirm the wheel sits fully in the support channel.",
    },
    sortOrder: 6,
  },
];

export const categories: CatalogCategory[] = [
  { id: "cockpit", name: "Cockpit", sortOrder: 10 },
  { id: "hoods", name: "Hoods", sortOrder: 20 },
  { id: "valve-caps", name: "Valve Caps", sortOrder: 30 },
  { id: "saddles", name: "Saddles", sortOrder: 40 },
  { id: "accessories", name: "Accessories", sortOrder: 50 },
];

export function money(
  value: number,
  currency = "PHP",
  rate = 1,
  locale = "en-PH"
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "JPY" ? 0 : 2,
  }).format(value * rate);
}
