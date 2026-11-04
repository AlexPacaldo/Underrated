/**
 * Design direction: Technical Drop Editorial — the homepage is an asymmetric release-sheet built from campaign art, hard seams, and oversized type.
 * The whole stack lives in one component so the storefront and the admin preview can never drift apart.
 */
import ProductCard from "@/components/ProductCard";
import FoldText from "@/components/FoldText";
import type { CatalogCategory, Product } from "@/data/products";
import type { HomepageContent, HomepageSectionId } from "@/data/storefront";
import { ArrowDownRight, ArrowRight, MoveUpRight } from "lucide-react";
import { type ReactNode } from "react";
import { Link } from "wouter";

export type HomepagePreviewMode = {
  active: HomepageSectionId;
  onSelect: (section: HomepageSectionId) => void;
};

export type HomepageSectionsProps = {
  content: HomepageContent;
  products: Product[];
  categories: CatalogCategory[];
  preview?: HomepagePreviewMode | null;
};

const standardNotes = ["Small parts.", "Sharper builds.", "No wasted surface."];

const FOLD_DURATION = 2;
const FOLD_STAGGER = 0.1;
const foldPieceCount = (text: string) => Array.from(text.replace(/\s/g, "")).length;

function journalCards(content: HomepageContent) {
  return [
    { image: content.journal_post_one_image_path, label: content.journal_post_one_label, place: content.journal_post_one_place },
    { image: content.journal_post_two_image_path, label: content.journal_post_two_label, place: content.journal_post_two_place },
    { image: content.journal_post_three_image_path, label: content.journal_post_three_label, place: content.journal_post_three_place },
  ];
}

function SectionShell({ children, id, label, editable, preview }: { children: ReactNode; id: HomepageSectionId | null; label: string; editable: boolean; preview?: HomepagePreviewMode | null }) {
  if (!preview) return <>{children}</>;

  const active = editable && id !== null && preview.active === id;
  const select = editable && id !== null ? () => preview.onSelect(id) : undefined;

  return <div data-homepage-section={editable ? id ?? undefined : undefined} onClickCapture={select ? (event) => { event.preventDefault(); event.stopPropagation(); select(); } : undefined} className={`group/preview relative ${editable ? "cursor-pointer" : ""} ${active ? "z-10 outline-2 -outline-offset-2 outline-[#ff5a36]" : editable ? "outline-2 -outline-offset-2 outline-dashed outline-white/20 hover:outline-[#ff5a36]" : ""}`}>
    {children}
    <span className={`pointer-events-none absolute left-3 top-3 z-30 flex items-center gap-2 border px-2 py-1 text-[9px] font-black uppercase tracking-[.16em] ${active ? "border-[#ff5a36] bg-[#ff5a36] text-black" : editable ? "border-[#ff5a36] bg-black/80 text-[#ff5a36] opacity-0 transition group-hover/preview:opacity-100" : "border-white/25 bg-black/80 text-white/55 opacity-0 transition group-hover/preview:opacity-100"}`}>{label}{editable ? " / click to edit" : " / fixed section"}</span>
  </div>;
}

export default function HomepageSections({ content, products, categories, preview }: HomepageSectionsProps) {
  const accentFoldDelay = foldPieceCount(content.hero_title) * FOLD_STAGGER;
  const suffixFoldDelay = (foldPieceCount(content.hero_title) + foldPieceCount(content.hero_accent)) * FOLD_STAGGER;

  return (
    <>
      <SectionShell id="hero" label="Hero campaign" editable preview={preview}>
        <section className="homepage-hero relative min-h-[790px] overflow-hidden bg-[#090a0b] pt-[68px] sm:min-h-[850px]">
          <img src={content.hero_image_path} alt={content.hero_alt} className="absolute inset-0 h-full w-full object-cover object-[62%_center]" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,4,4,.95)_0%,rgba(3,4,4,.72)_34%,rgba(3,4,4,.22)_65%,rgba(3,4,4,.25)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(3,4,4,.7)_0%,transparent_32%)]" />
          <div className="relative mx-auto flex min-h-[722px] max-w-[1440px] flex-col justify-end px-4 pb-8 pt-20 sm:px-6 sm:pb-10 lg:min-h-[782px] lg:px-9">
            <div className="max-w-[680px]">
              <h1 className="mt-4 font-display text-[clamp(5rem,11vw,10.6rem)] uppercase italic leading-[.75] tracking-[-.065em] text-white">
                <span className="block">
                  <FoldText
                    text={content.hero_title}
                    splitBy="char"
                    foldStyle="paper"
                    hinge="top"
                    trigger="mount"
                    delay={0}
                    duration={FOLD_DURATION}
                    stagger={FOLD_STAGGER}
                    fontSize="inherit"
                    fontWeight={800}
                    style={{ lineHeight: 0.75, letterSpacing: "-0.065em" }}
                  />
                </span>
                <span className="block">
                  <FoldText
                    text={content.hero_accent}
                    splitBy="char"
                    foldStyle="paper"
                    hinge="top"
                    trigger="mount"
                    delay={accentFoldDelay}
                    duration={FOLD_DURATION}
                    stagger={FOLD_STAGGER}
                    fontSize="inherit"
                    fontWeight={800}
                    style={{ lineHeight: 0.75, letterSpacing: "-0.065em" }}
                  />
                </span>
                <span className="block">
                  <FoldText
                    text={content.hero_suffix}
                    splitBy="char"
                    foldStyle="paper"
                    hinge="top"
                    trigger="mount"
                    delay={suffixFoldDelay}
                    duration={FOLD_DURATION}
                    stagger={FOLD_STAGGER}
                    color="#ff5a36"
                    fontSize="inherit"
                    fontWeight={800}
                    style={{ lineHeight: 0.75, letterSpacing: "-0.065em" }}
                  />
                </span>
              </h1>
              <p className="reveal-up mt-7 max-w-sm text-sm leading-6 text-white/64 sm:text-base">{content.hero_description}</p>
              <div className="reveal-up mt-7 flex flex-wrap gap-3"><Link href="/shop" className="inline-flex items-center gap-3 bg-[#ff5a36] px-5 py-4 text-[10px] font-black uppercase tracking-[.16em] text-black transition hover:bg-white active:scale-[.98]">Shop now <ArrowRight size={15} /></Link><a href="#featured" className="inline-flex items-center gap-3 border border-white/35 px-5 py-4 text-[10px] font-bold uppercase tracking-[.16em] text-white transition hover:border-white hover:bg-white/10">Latest drop <ArrowDownRight size={15} /></a></div>
            </div>
          </div>
        </section>
      </SectionShell>

      <SectionShell id={null} label="The standard strip" editable={false} preview={preview}>
        <section className="border-y border-white/15 bg-[#111214]">
          <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-9">
            <div className="lg:grid lg:grid-cols-[150px_1fr]">
              <p className="flex items-center border-b border-white/10 py-4 text-[10px] font-bold uppercase tracking-[.2em] text-[#ff5a36] lg:border-b-0 lg:border-r lg:pr-6">The standard</p>
              <div className="grid divide-y divide-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                {standardNotes.map((note) => (
                  <div key={note} className="flex items-center py-4 sm:px-5">
                    <p className="font-display text-2xl uppercase leading-none text-white">{note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </SectionShell>

      <SectionShell id={null} label="Build index" editable={false} preview={preview}>
        <section className="bg-[#0c0d0e] px-4 py-16 sm:px-6 lg:px-9 lg:py-24"><div className="mx-auto max-w-[1440px]"><div className="mb-9"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#ff5a36]">Build index</p><h2 className="mt-3 font-display text-6xl uppercase leading-[.74] tracking-[-.05em] text-white sm:text-7xl">Every point of<br />contact.</h2></div><div className="grid border-l border-t border-white/15 sm:grid-cols-2 lg:grid-cols-5">
              {categories.map((category) => (
                <Link key={category.name} href={`/shop?category=${category.name}`} className="group relative flex min-h-40 flex-col border-b border-r border-white/15 p-5 transition hover:bg-[#151719] sm:min-h-44">
                  <div className="flex items-start justify-between">
                    <span className="text-[10px] font-bold tracking-[.16em] text-white/35">{category.index}</span>
                    <span className="grid size-7 place-items-center border border-white/20 text-white/55 transition group-hover:border-[#ff5a36] group-hover:bg-[#ff5a36] group-hover:text-black"><MoveUpRight size={14} /></span>
                  </div>
                  <p className="mt-auto pt-10 font-display text-3xl uppercase leading-none text-white group-hover:text-[#ff5a36] xl:text-4xl">{category.name}</p>
                  <span className="absolute bottom-0 left-0 h-1 w-0 bg-[#ff5a36] transition-all duration-300 group-hover:w-full" />
                </Link>
              ))}
            </div></div></section>
      </SectionShell>

      <SectionShell id="drop" label="Featured drop" editable preview={preview}>
        <section id="featured" className="border-t border-white/15 bg-[#111214] px-4 py-16 sm:px-6 lg:px-9 lg:py-24"><div className="mx-auto max-w-[1440px]"><div className="mb-9 flex items-end justify-between border-b border-white/15 pb-5"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#ff5a36]">{content.drop_label}</p><h2 className="mt-3 font-display text-6xl uppercase leading-[.75] tracking-[-.05em] text-white sm:text-7xl">{content.drop_title} <em className="text-[#ff5a36]">{content.drop_accent}</em></h2><p className="mt-4 max-w-sm text-sm leading-6 text-white/45">{content.drop_description}</p></div><span className="hidden text-[10px] font-bold uppercase tracking-[.16em] text-white/35 sm:block">{products.filter((product) => product.featured).length.toString().padStart(2, "0")} highlighted parts</span></div><div className="grid gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-5">{products.filter((product) => product.featured).map((product) => <ProductCard key={product.id} product={product} />)}</div></div></section>
      </SectionShell>

      <SectionShell id="story" label="Story image" editable preview={preview}>
        <section className="relative overflow-hidden bg-[#eae6df] text-[#0c0d0e]"><div className="mx-auto grid max-w-[1440px] lg:grid-cols-[.92fr_1.08fr]"><div className="flex min-h-[510px] flex-col justify-between px-4 py-12 sm:px-6 lg:min-h-[650px] lg:px-9 lg:py-16"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#ff5a36]">Why it matters</p><h2 className="mt-5 max-w-md font-display text-[clamp(4.6rem,8vw,8.2rem)] uppercase leading-[.68] tracking-[-.06em]">Details<br /><em className="text-[#ff5a36]">matter.</em></h2></div><div className="max-w-sm border-t border-black/25 pt-5"><p className="text-sm leading-6 text-black/65">The parts you reach for should earn their space. We make visual decisions feel physical: a sharper profile, a better grip, a color that finds the light.</p></div></div><div className="relative min-h-[460px] overflow-hidden bg-[#0c0d0e]"><img src={content.story_image_path} alt={content.story_alt} className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" /><p className="absolute bottom-7 left-6 max-w-[320px] font-display text-5xl uppercase leading-[.75] text-white sm:left-9 sm:text-6xl">{content.story_title}<br /><em className="text-[#ff5a36]">{content.story_accent}</em></p><span className="absolute right-6 top-6 text-[10px] font-bold uppercase tracking-[.18em] text-white/65">{content.story_label}</span></div></div></section>
      </SectionShell>

      <SectionShell id="journal" label="Notes from the bench" editable preview={preview}>
        <section id="journal" className="bg-[#0c0d0e] px-4 py-16 sm:px-6 lg:px-9 lg:py-24"><div className="mx-auto max-w-[1440px]"><div className="mb-9 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#ff5a36]">{content.journal_label}</p><h2 className="mt-3 font-display text-6xl uppercase leading-[.75] tracking-[-.05em] text-white sm:text-7xl">{content.journal_title}<br /><em className="text-[#ff5a36]">{content.journal_accent}</em></h2></div></div><div className="grid gap-3 md:grid-cols-3">{journalCards(content).map((post, index) => <article key={index} className={`group relative overflow-hidden bg-[#151719] ${index === 1 ? "md:translate-y-12" : ""}`}><div className="aspect-[4/5] overflow-hidden"><img src={post.image} alt={`${post.label} cycling imagery`} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" /></div><div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/35 to-transparent p-5 pt-16"><p className="font-display text-3xl uppercase text-white">{post.label}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[.14em] text-white/60">{post.place}</p></div></article>)}</div></div></section>
      </SectionShell>
    </>
  );
}
