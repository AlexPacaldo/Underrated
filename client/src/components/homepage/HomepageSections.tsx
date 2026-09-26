/**
 * Design direction: Technical Drop Editorial — the homepage is an asymmetric release-sheet built from campaign art, hard seams, and oversized type.
 * The whole stack lives in one component so the storefront and the admin preview can never drift apart.
 */
import ProductCard from "@/components/ProductCard";
import type { CatalogCategory, Product } from "@/data/products";
import type { HomepageContent, HomepageSectionId } from "@/data/storefront";
import { ArrowDownRight, ArrowRight, Check, MoveUpRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

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
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const submitNewsletter = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !email.includes("@")) { toast.error("Enter an email address to join the list."); return; }
    setSubscribed(true);
    toast.success("You’re on the release list.", { description: "Release notes land when the next part does." });
  };

  return (
    <>
      <SectionShell id="hero" label="Hero campaign" editable preview={preview}>
        <section className="relative min-h-[790px] overflow-hidden bg-[#090a0b] pt-[68px] sm:min-h-[850px]">
          <img src={content.hero_image_path} alt={content.hero_alt} className="absolute inset-0 h-full w-full object-cover object-[62%_center]" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,4,4,.95)_0%,rgba(3,4,4,.72)_34%,rgba(3,4,4,.22)_65%,rgba(3,4,4,.25)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(3,4,4,.7)_0%,transparent_32%)]" />
          <div className="relative mx-auto flex min-h-[722px] max-w-[1440px] flex-col justify-end px-4 pb-8 pt-20 sm:px-6 sm:pb-10 lg:min-h-[782px] lg:px-9">
            <div className="max-w-[680px]">
              <p className="reveal-up text-[10px] font-bold uppercase tracking-[.2em] text-[#ff5a36]">{content.hero_kicker}</p>
              <h1 className="reveal-up mt-4 font-display text-[clamp(5rem,11vw,10.6rem)] uppercase leading-[.68] tracking-[-.065em] text-white">{content.hero_title}<br /><em className="text-[#ff5a36]">{content.hero_accent}</em><br />{content.hero_suffix}</h1>
              <p className="reveal-up mt-7 max-w-sm text-sm leading-6 text-white/64 sm:text-base">{content.hero_description}</p>
              <div className="reveal-up mt-7 flex flex-wrap gap-3"><Link href="/shop" className="inline-flex items-center gap-3 bg-[#ff5a36] px-5 py-4 text-[10px] font-black uppercase tracking-[.16em] text-black transition hover:bg-white active:scale-[.98]">Shop the drop <ArrowRight size={15} /></Link><a href="#featured" className="inline-flex items-center gap-3 border border-white/35 px-5 py-4 text-[10px] font-bold uppercase tracking-[.16em] text-white transition hover:border-white hover:bg-white/10">See the details <ArrowDownRight size={15} /></a></div>
            </div>
            <div className="mt-12 grid grid-cols-3 border-t border-white/20 pt-3 text-[9px] font-bold uppercase tracking-[.15em] text-white/50 sm:mt-16 sm:max-w-xl"><span>01 / Grip</span><span>02 / Control</span><span>03 / Signal</span></div>
          </div>
        </section>
      </SectionShell>

      <SectionShell id={null} label="Field notes strip" editable={false} preview={preview}>
        <section className="border-y border-white/15 bg-[#111214] py-4"><div className="mx-auto flex max-w-[1440px] items-center gap-7 overflow-hidden px-4 sm:px-6 lg:px-9"><span className="shrink-0 text-[10px] font-bold uppercase tracking-[.2em] text-[#ff5a36]">Field notes</span><p className="shrink-0 font-display text-2xl uppercase text-white">Built for the details.</p><span className="size-1 shrink-0 bg-[#ff5a36]" /><p className="shrink-0 font-display text-2xl uppercase text-white/45">Ride it like you mean it.</p><span className="size-1 shrink-0 bg-[#ff5a36]" /><p className="shrink-0 font-display text-2xl uppercase text-white/45">No wasted surface.</p></div></section>
      </SectionShell>

      <SectionShell id={null} label="Build index" editable={false} preview={preview}>
        <section className="bg-[#0c0d0e] px-4 py-16 sm:px-6 lg:px-9 lg:py-24"><div className="mx-auto max-w-[1440px]"><div className="mb-9 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#ff5a36]">Build index</p><h2 className="mt-3 font-display text-6xl uppercase leading-[.74] tracking-[-.05em] text-white sm:text-7xl">Start at the<br />touchpoints.</h2></div><Link href="/shop" className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em] text-white/55 hover:text-[#ff5a36]">All components <ArrowRight size={14} /></Link></div><div className="grid border-l border-t border-white/15 sm:grid-cols-2 lg:grid-cols-4">{categories.map((category, index) => <Link key={category.name} href={`/shop?category=${category.name}`} className="group relative min-h-52 border-b border-r border-white/15 p-5 transition hover:bg-[#151719]"><span className="text-[10px] font-bold tracking-[.16em] text-white/35">{category.index}</span><span className="absolute right-5 top-5 grid size-7 place-items-center border border-white/20 text-white/55 transition group-hover:border-[#ff5a36] group-hover:bg-[#ff5a36] group-hover:text-black"><MoveUpRight size={14} /></span><p className="mt-12 font-display text-4xl uppercase leading-none text-white group-hover:text-[#ff5a36]">{category.name}</p><p className="mt-2 max-w-[180px] text-xs leading-5 text-white/45">{category.note}</p><span className="absolute bottom-0 left-0 h-1 w-0 bg-[#ff5a36] transition-all duration-300 group-hover:w-full" /></Link>)}</div></div></section>
      </SectionShell>

      <SectionShell id="drop" label="Featured drop" editable preview={preview}>
        <section id="featured" className="border-t border-white/15 bg-[#111214] px-4 py-16 sm:px-6 lg:px-9 lg:py-24"><div className="mx-auto max-w-[1440px]"><div className="mb-9 flex items-end justify-between border-b border-white/15 pb-5"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#ff5a36]">{content.drop_label}</p><h2 className="mt-3 font-display text-6xl uppercase leading-[.75] tracking-[-.05em] text-white sm:text-7xl">{content.drop_title} <em className="text-[#ff5a36]">{content.drop_accent}</em></h2><p className="mt-4 max-w-sm text-sm leading-6 text-white/45">{content.drop_description}</p></div><span className="hidden text-[10px] font-bold uppercase tracking-[.16em] text-white/35 sm:block">{products.filter((product) => product.featured).length.toString().padStart(2, "0")} highlighted parts</span></div><div className="grid gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-5">{products.filter((product) => product.featured).map((product) => <ProductCard key={product.id} product={product} />)}</div></div></section>
      </SectionShell>

      <SectionShell id="story" label="Story image" editable preview={preview}>
        <section className="relative overflow-hidden bg-[#eae6df] text-[#0c0d0e]"><div className="mx-auto grid max-w-[1440px] lg:grid-cols-[.92fr_1.08fr]"><div className="flex min-h-[510px] flex-col justify-between px-4 py-12 sm:px-6 lg:min-h-[650px] lg:px-9 lg:py-16"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#ff5a36]">Why it matters</p><h2 className="mt-5 max-w-md font-display text-[clamp(4.6rem,8vw,8.2rem)] uppercase leading-[.68] tracking-[-.06em]">Ride the<br /><em>details.</em></h2></div><div className="max-w-sm border-t border-black/25 pt-5"><p className="text-sm leading-6 text-black/65">The parts you reach for should earn their space. We make visual decisions feel physical: a sharper profile, a better grip, a color that finds the light.</p><Link href="/about" className="mt-6 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em] text-black hover:text-[#ff5a36]">Our design attitude <ArrowRight size={14} /></Link></div></div><div className="relative min-h-[460px] overflow-hidden bg-[#0c0d0e]"><img src={content.story_image_path} alt={content.story_alt} className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" /><p className="absolute bottom-7 left-6 max-w-[320px] font-display text-5xl uppercase leading-[.75] text-white sm:left-9 sm:text-6xl">{content.story_title}<br /><em className="text-[#ff5a36]">{content.story_accent}</em></p><span className="absolute right-6 top-6 text-[10px] font-bold uppercase tracking-[.18em] text-white/65">{content.story_label}</span></div></div></section>
      </SectionShell>

      <SectionShell id="journal" label="Notes from the bench" editable preview={preview}>
        <section id="journal" className="bg-[#0c0d0e] px-4 py-16 sm:px-6 lg:px-9 lg:py-24"><div className="mx-auto max-w-[1440px]"><div className="mb-9 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#ff5a36]">{content.journal_label}</p><h2 className="mt-3 font-display text-6xl uppercase leading-[.75] tracking-[-.05em] text-white sm:text-7xl">{content.journal_title}<br /><em className="text-[#ff5a36]">{content.journal_accent}</em></h2></div><p className="max-w-xs text-sm leading-6 text-white/45">{content.journal_description}</p></div><div className="grid gap-3 md:grid-cols-3">{journalCards(content).map((post, index) => <article key={index} className={`group relative overflow-hidden bg-[#151719] ${index === 1 ? "md:translate-y-12" : ""}`}><div className="aspect-[4/5] overflow-hidden"><img src={post.image} alt={`${post.label} cycling imagery`} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" /></div><div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/35 to-transparent p-5 pt-16"><p className="font-display text-3xl uppercase text-white">{post.label}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[.14em] text-white/60">{post.place}</p></div></article>)}</div></div></section>
      </SectionShell>

      <SectionShell id={null} label="Release list" editable={false} preview={preview}>
        <section className="border-t border-white/15 bg-[#ff5a36] px-4 py-14 text-black sm:px-6 lg:px-9 lg:py-20"><div className="mx-auto grid max-w-[1440px] gap-8 lg:grid-cols-[1fr_.72fr] lg:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-black/60">Release list</p><h2 className="mt-4 max-w-xl font-display text-[clamp(4.8rem,8vw,8rem)] uppercase leading-[.68] tracking-[-.06em]">Know before<br />the <em>drop.</em></h2></div><form onSubmit={submitNewsletter} className="border-t border-black/40 pt-5">{subscribed ? <div className="flex items-center gap-3 text-sm font-bold"><span className="grid size-8 place-items-center rounded-full bg-black text-[#ff5a36]"><Check size={16} /></span>Release notes are on their way.</div> : <><label className="text-[10px] font-bold uppercase tracking-[.16em] text-black/60" htmlFor="email">Email address</label><div className="mt-2 flex border-b-2 border-black"><input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@ride.example" className="h-12 min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:text-black/40" /><button className="px-3 text-[10px] font-black uppercase tracking-[.16em] transition hover:bg-black hover:text-[#ff5a36]">Join <ArrowRight className="ml-1 inline" size={15} /></button></div><p className="mt-3 text-[10px] leading-4 text-black/55">Release notes only. No filler.</p></>}</form></div></section>
      </SectionShell>
    </>
  );
}
