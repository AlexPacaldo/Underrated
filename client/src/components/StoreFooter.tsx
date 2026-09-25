/**
 * Design direction: Technical Drop Editorial — the footer finishes as a printed colophon, dense with structure and no soft marketing chrome.
 */
import { ArrowUpRight } from "lucide-react";
import { Link } from "wouter";

export default function StoreFooter() {
  return (
    <footer className="border-t border-white/15 bg-[#090a0b] text-white">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.25fr_.75fr_.75fr] lg:px-9">
        <div><div className="flex items-center gap-3"><img src="/brand/ur-logo.png" alt="" className="size-12 object-contain" /><img src="/brand/underrated-wordmark.png" alt="Underrated Cycling Co." className="h-9 w-auto object-contain sm:h-10" /></div><p className="mt-7 font-display max-w-lg text-5xl uppercase leading-[0.82] tracking-[-0.045em] sm:text-6xl">Make the build<br /><em className="text-[#ff5a36]">yours.</em></p><p className="mt-7 max-w-xs text-sm leading-relaxed text-white/45">Independent parts for the riders who notice every touchpoint.</p></div>
        <div><p className="mb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Navigate</p><div className="flex flex-col gap-2 text-sm"><Link href="/shop" className="hover:text-[#ff5a36]">Shop all parts</Link><Link href="/about" className="hover:text-[#ff5a36]">Our story</Link><a href="#journal" className="hover:text-[#ff5a36]">Build journal</a></div></div>
        <div><p className="mb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Notes from the shop</p><a href="mailto:parts@underrated.example" className="group flex items-center gap-2 text-sm hover:text-[#ff5a36]">parts@underrated.example <ArrowUpRight size={15} className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></a><p className="mt-5 text-xs text-white/35">Release dates, workshop notes, and the hardware worth a second look.</p></div>
      </div>
      <div className="border-t border-white/10 px-4 py-4 text-[9px] font-bold uppercase tracking-[0.16em] text-white/35 sm:px-6 lg:px-9"><div className="mx-auto flex max-w-[1440px] justify-between"><span>© 2026 Underrated Cycling Co.</span><span>Build with intention</span></div></div>
    </footer>
  );
}
