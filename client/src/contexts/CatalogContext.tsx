import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { isProductImagePosition, normalizeCardImageZoom, normalizeImageFrames, normalizeImagePositions, categories as fallbackCategories, products as fallbackProducts, type CatalogCategory, type Product, type ProductVisual } from "@/data/products";
import { defaultHomepageContent, type HomepageContent } from "@/data/storefront";
import { supabase } from "@/lib/supabase";

type CatalogContextValue = {
  products: Product[];
  categories: CatalogCategory[];
  homepage: HomepageContent;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const CatalogContext = createContext<CatalogContextValue | undefined>(undefined);
const visuals = new Set<ProductVisual>(["hoods", "valve", "saddle", "tape", "stem", "stand"]);

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function mapProduct(value: unknown): Product {
  const row = asRecord(value);
  const rawVisual = typeof row.visual === "string" ? row.visual : "hoods";
  const visual = visuals.has(rawVisual as ProductVisual) ? (rawVisual as ProductVisual) : "hoods";
  const rawFinishes = Array.isArray(row.finishes) ? row.finishes.filter((item): item is string => typeof item === "string") : [];
  const rawSpecs = Array.isArray(row.specs) ? row.specs : [];
  const specs = rawSpecs.flatMap((item) => {
    const spec = asRecord(item);
    return typeof spec.label === "string" && typeof spec.value === "string" ? [{ label: spec.label, value: spec.value }] : [];
  });
  const rawFitment = asRecord(row.fitment);
  const compatibility = Array.isArray(rawFitment.compatibility) ? rawFitment.compatibility.filter((item): item is string => typeof item === "string") : [];
  const image = typeof row.image_path === "string" && row.image_path.trim() ? row.image_path : undefined;
  const rawImages = Array.isArray(row.images) ? row.images.filter((item): item is string => typeof item === "string") : [];
  const images = rawImages.map((item) => item.trim()).filter((item) => item && item !== image);
  const image_positions = normalizeImagePositions([image, ...images].filter((item): item is string => Boolean(item)), row.image_positions);
  const image_frames = normalizeImageFrames([image, ...images].filter((item): item is string => Boolean(item)), row.image_frames);
  const card_image_position = isProductImagePosition(row.card_image_position) ? row.card_image_position : undefined;
  const card_image_zoom = normalizeCardImageZoom(row.card_image_zoom);
  const priceCents = Number(row.price_php_cents ?? 0);

  return {
    id: String(row.id ?? ""),
    slug: String(row.slug ?? ""),
    name: String(row.name ?? "Untitled part"),
    category: String(row.category ?? "Accessories"),
    price: Number.isFinite(priceCents) ? priceCents / 100 : 0,
    badge: typeof row.badge === "string" && row.badge.trim() ? row.badge : undefined,
    descriptor: String(row.descriptor ?? ""),
    description: String(row.description ?? ""),
    finishes: rawFinishes,
    image,
    images,
    image_positions,
    image_frames,
    card_image_position,
    card_image_zoom,
    visual,
    specs,
    fitment: {
      headline: String(rawFitment.headline ?? ""),
      compatibility,
      checkBeforeRide: String(rawFitment.checkBeforeRide ?? ""),
    },
    featured: Boolean(row.featured),
    archived: Boolean(row.archived),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

export function mapCategory(value: unknown): CatalogCategory {
  const row = asRecord(value);
  const name = String(row.name ?? "Untitled category");
  return {
    id: String(row.id ?? name),
    name,
    sortOrder: Number(row.sort_order ?? 0),
  };
}

export function mapHomepage(value: unknown): HomepageContent {
  const row = asRecord(value);
  const text = (key: keyof HomepageContent, fallback: string) => typeof row[key] === "string" ? row[key] as string : fallback;
  return {
    hero_image_path: text("hero_image_path", defaultHomepageContent.hero_image_path),
    hero_alt: text("hero_alt", defaultHomepageContent.hero_alt),
    hero_kicker: text("hero_kicker", defaultHomepageContent.hero_kicker),
    hero_title: text("hero_title", defaultHomepageContent.hero_title),
    hero_accent: text("hero_accent", defaultHomepageContent.hero_accent),
    hero_suffix: text("hero_suffix", defaultHomepageContent.hero_suffix),
    hero_description: text("hero_description", defaultHomepageContent.hero_description),
    drop_label: text("drop_label", defaultHomepageContent.drop_label),
    drop_title: text("drop_title", defaultHomepageContent.drop_title),
    drop_accent: text("drop_accent", defaultHomepageContent.drop_accent),
    drop_description: text("drop_description", defaultHomepageContent.drop_description),
    story_image_path: text("story_image_path", defaultHomepageContent.story_image_path),
    story_alt: text("story_alt", defaultHomepageContent.story_alt),
    story_label: text("story_label", defaultHomepageContent.story_label),
    story_title: text("story_title", defaultHomepageContent.story_title),
    story_accent: text("story_accent", defaultHomepageContent.story_accent),
    journal_label: text("journal_label", defaultHomepageContent.journal_label),
    journal_title: text("journal_title", defaultHomepageContent.journal_title),
    journal_accent: text("journal_accent", defaultHomepageContent.journal_accent),
    journal_description: text("journal_description", defaultHomepageContent.journal_description),
    journal_post_one_image_path: text("journal_post_one_image_path", defaultHomepageContent.journal_post_one_image_path),
    journal_post_one_label: text("journal_post_one_label", defaultHomepageContent.journal_post_one_label),
    journal_post_one_place: text("journal_post_one_place", defaultHomepageContent.journal_post_one_place),
    journal_post_two_image_path: text("journal_post_two_image_path", defaultHomepageContent.journal_post_two_image_path),
    journal_post_two_label: text("journal_post_two_label", defaultHomepageContent.journal_post_two_label),
    journal_post_two_place: text("journal_post_two_place", defaultHomepageContent.journal_post_two_place),
    journal_post_three_image_path: text("journal_post_three_image_path", defaultHomepageContent.journal_post_three_image_path),
    journal_post_three_label: text("journal_post_three_label", defaultHomepageContent.journal_post_three_label),
    journal_post_three_place: text("journal_post_three_place", defaultHomepageContent.journal_post_three_place),
  };
}

function buildCategories(stored: CatalogCategory[], products: Product[]) {
  const next = new Map(stored.map((category) => [category.name, category]));
  for (const product of products) {
    const name = product.category.trim();
    if (!name || next.has(name)) continue;
    next.set(name, {
      id: `product-${name}`,
      name,
      sortOrder: Math.max(0, ...Array.from(next.values(), (category) => category.sortOrder)) + 10,
    });
  }
  return Array.from(next.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>(fallbackProducts);
  const [categories, setCategories] = useState<CatalogCategory[]>(() => buildCategories(fallbackCategories, fallbackProducts));
  const [homepage, setHomepage] = useState<HomepageContent>(defaultHomepageContent);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setProducts(fallbackProducts);
      setCategories(buildCategories(fallbackCategories, fallbackProducts));
      setHomepage(defaultHomepageContent);
      setLoading(false);
      return;
    }

    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setLoading(true);
    const [productResult, homepageResult, categoryResult] = await Promise.all([
      supabase.from("products").select("id,slug,name,category,price_php_cents,badge,descriptor,description,finishes,image_path,images,image_positions,image_frames,card_image_position,card_image_zoom,visual,specs,fitment,featured,archived,sort_order").eq("archived", false).order("sort_order", { ascending: true }),
      supabase.from("homepage_content").select("*").eq("id", "primary").maybeSingle(),
      supabase.from("categories").select("id,name,sort_order").order("sort_order", { ascending: true }),
    ]);

    if (requestId.current !== currentRequest) return;

    // A missing category table should not take the storefront down; fall back to
    // the built-in list until the migration is applied.
    const storedCategories = categoryResult.error ? fallbackCategories : (categoryResult.data ?? []).map(mapCategory);

    if (productResult.error) {
      setError(productResult.error.message);
      setCategories(buildCategories(storedCategories, []));
    } else {
      const nextProducts = (productResult.data ?? []).map(mapProduct);
      setProducts(nextProducts);
      setCategories(buildCategories(storedCategories, nextProducts));
      setError(null);
    }

    if (homepageResult.error) {
      setHomepage(defaultHomepageContent);
      setError((current) => current ?? homepageResult.error?.message ?? null);
    } else if (homepageResult.data) {
      setHomepage(mapHomepage(homepageResult.data));
    } else {
      setHomepage(defaultHomepageContent);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<CatalogContextValue>(() => ({ products, categories, homepage, loading, error, refresh }), [categories, error, homepage, loading, products, refresh]);
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const context = useContext(CatalogContext);
  if (!context) throw new Error("useCatalog must be used inside CatalogProvider");
  return context;
}
