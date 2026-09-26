/**
 * Design direction: Technical Drop Editorial — the homepage is an asymmetric release-sheet built from campaign art, hard seams, and oversized type.
 */
import HomepageSections from "@/components/homepage/HomepageSections";
import { useCatalog } from "@/contexts/CatalogContext";

export default function Home() {
  const { products, categories, homepage } = useCatalog();

  return <HomepageSections content={homepage} products={products} categories={categories} />;
}
