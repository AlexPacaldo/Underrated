/**
 * Design direction: Technical Drop Editorial — browsing is a compact equipment index with sharp filters and dense product information.
 */
import ProductCard from "@/components/ProductCard";
import { categories, products } from "@/data/products";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";

const filterNames = ["All", ...categories.map((category) => category.name), "Accessories"];

export default function Shop() {
  const initialCategory = new URLSearchParams(window.location.search).get("category") ?? "All";
  const [category, setCategory] = useState(filterNames.includes(initialCategory) ? initialCategory : "All");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("featured");

  const shownProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = products.filter((product) => {
      const categoryMatch = category === "All" || product.category === category;
      const textMatch = !normalizedQuery || `${product.name} ${product.category} ${product.descriptor}`.toLowerCase().includes(normalizedQuery);
      return categoryMatch && textMatch;
    });
    return [...filtered].sort((a, b) => {
      if (sort === "price-low") return a.price - b.price;
      if (sort === "price-high") return b.price - a.price;
      if (sort === "newest") return Number(Boolean(b.badge)) - Number(Boolean(a.badge));
      return Number(Boolean(b.featured)) - Number(Boolean(a.featured));
    });
  }, [category, query, sort]);

  return (
    <section className="min-h-screen pt-[68px]">
      <div className="relative overflow-hidden border-b border-white/15 bg-[#101113] px-4 py-11 sm:px-6 lg:px-9 lg:py-16">
        <span aria-hidden="true" className="pointer-events-none absolute right-[-.08em] top-[-.25em] font-display text-[clamp(9rem,25vw,26rem)] uppercase leading-none text-white/[.025]">Index</span>
        <div className="mx-auto max-w-[1440px]">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#ff5a36]">Parts index / 2026</p>
          <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="font-display text-6xl uppercase leading-[0.78] tracking-[-0.055em] text-white sm:text-8xl">The <em className="text-[#ff5a36]">shop</em></h1><p className="mt-5 max-w-sm text-sm leading-relaxed text-white/45">Contact points, cockpit details, and the small pieces that make a build read differently.</p></div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">06 current components</p></div>
        </div>
      </div>

      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-9">
        <div className="flex flex-col gap-5 border-b border-white/15 pb-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible">
            {filterNames.map((item) => <button key={item} onClick={() => setCategory(item)} className={`whitespace-nowrap border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] transition ${category === item ? "border-[#ff5a36] bg-[#ff5a36] text-black" : "border-white/15 text-white/65 hover:border-white/50 hover:text-white"}`}>{item}</button>)}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="flex min-w-0 items-center border border-white/15 bg-[#121316] text-white/60 focus-within:border-[#ff5a36] sm:w-72"><Search className="ml-3 shrink-0" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search parts" className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none placeholder:text-white/35" aria-label="Search parts" />{query ? <button className="mr-2 grid size-6 place-items-center text-white/50 hover:text-white" onClick={() => setQuery("")} aria-label="Clear search"><X size={15} /></button> : null}</label>
            <label className="flex items-center gap-2 border border-white/15 px-3 text-white/60"><SlidersHorizontal size={15} /><span className="text-[10px] font-bold uppercase tracking-[0.12em]">Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)} className="h-10 bg-transparent pr-1 text-xs font-bold uppercase text-white outline-none"><option value="featured" className="bg-[#111214]">Featured</option><option value="newest" className="bg-[#111214]">Newest</option><option value="price-low" className="bg-[#111214]">Price low</option><option value="price-high" className="bg-[#111214]">Price high</option></select></label>
          </div>
        </div>

        <div className="flex items-center justify-between border-l border-[#ff5a36] py-5 pl-3"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">{shownProducts.length.toString().padStart(2, "0")} {shownProducts.length === 1 ? "component" : "components"}</p><p className="hidden text-[10px] font-bold uppercase tracking-[.14em] text-white/35 sm:block">Select a detail. Make the build read.</p></div>
        {shownProducts.length ? <div className="grid gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-12 lg:gap-x-6 lg:gap-y-14">{shownProducts.map((product, index) => <div className={`reveal-up ${index === 0 ? "lg:col-span-5 lg:pt-8" : index === 1 ? "lg:col-span-3 lg:-mt-7" : index === 2 ? "lg:col-span-4 lg:pt-16" : index === 3 ? "lg:col-span-3 lg:-mt-9" : index === 4 ? "lg:col-span-5 lg:pt-11" : "lg:col-span-4 lg:-mt-3"}`} key={product.id}><div className="mb-3 hidden border-l border-[#ff5a36] pl-2 lg:flex lg:items-center lg:justify-between"><span className="text-[9px] font-bold uppercase tracking-[.16em] text-white/35">Object / {String(index + 1).padStart(2, "0")}</span>{index === 1 || index === 4 ? <span className="font-display text-3xl uppercase leading-none text-white/[.11]">UC</span> : null}</div><ProductCard product={product} priority={index < 3} /></div>)}</div> : <div className="flex min-h-80 flex-col justify-end border-y border-white/15 pb-9"><span className="font-display text-6xl uppercase leading-[.75] text-white/15">Nothing<br />found.</span><p className="mt-5 text-sm text-white/45">Try a broader word or clear your filters.</p><button onClick={() => { setCategory("All"); setQuery(""); }} className="mt-5 w-fit border border-[#ff5a36] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[#ff5a36] hover:bg-[#ff5a36] hover:text-black">Reset shop</button></div>}
      </div>
    </section>
  );
}
