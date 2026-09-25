/**
 * Design direction: Technical Drop Editorial — navigation is a compact printed masthead with an equipment-drawer mobile treatment.
 */
import { Menu, Search, ShoppingBag, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import AccountMenu from "@/components/AccountMenu";
import { supportedCurrencies, useCurrency } from "@/contexts/CurrencyContext";
import { useStore } from "@/contexts/StoreContext";

const navItems = [
  { href: "/shop", label: "Shop" },
  { href: "/about", label: "About" },
];

export default function StoreHeader() {
  const { totalItems, openCart } = useStore();
  const { currency, setCurrency } = useCurrency();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [location] = useLocation();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 28);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => setOpen(false), [location]);

  return (
    <>
      <header className={`fixed inset-x-0 top-0 z-40 transition-colors duration-200 ${scrolled || location !== "/" ? "border-b border-white/10 bg-[#0c0d0e]/95 backdrop-blur-md" : "bg-gradient-to-b from-black/80 to-transparent"}`}>
        <div className="mx-auto flex h-[68px] max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-9">
          <Link href="/" className="flex items-center gap-3 text-white" aria-label="Underrated Cycling home">
            <img src="/brand/ur-logo.png" alt="" className="size-9 object-contain sm:size-10" />
            <img src="/brand/underrated-wordmark.png" alt="Underrated Cycling Co." className="block h-7 w-auto object-contain sm:h-8" />
          </Link>

          <nav className="hidden items-center gap-7 lg:flex" aria-label="Main navigation">
            {navItems.map((item) => (
              <Link key={item.label} href={item.href} className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/70 transition hover:text-[#ff5a36]">
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/shop" className="grid size-9 place-items-center text-white/85 transition hover:text-[#ff5a36]" aria-label="Search the shop">
              <Search size={18} />
            </Link>
            <label className="border border-white/15 bg-transparent text-[10px] font-bold uppercase tracking-[.12em] text-white/65">
              <span className="sr-only">Display currency</span>
              <select value={currency} onChange={(event) => setCurrency(event.target.value as (typeof supportedCurrencies)[number]["code"])} className="h-9 bg-transparent px-1 text-[10px] text-white outline-none sm:px-2">
                {supportedCurrencies.map((item) => <option key={item.code} value={item.code} className="bg-[#111214]">{item.code}</option>)}
              </select>
            </label>
            <AccountMenu />
            <button onClick={openCart} className="relative grid size-9 place-items-center text-white/85 transition hover:text-[#ff5a36]" aria-label={`Open cart with ${totalItems} items`}>
              <ShoppingBag size={18} />
              {totalItems > 0 ? <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-[#ff5a36] text-[9px] font-bold text-black">{totalItems}</span> : null}
            </button>
            <button onClick={() => setOpen((value) => !value)} className="grid size-9 place-items-center text-white lg:hidden" aria-label={open ? "Close navigation" : "Open navigation"}>
              {open ? <X size={20} /> : <Menu size={21} />}
            </button>
          </div>
        </div>
      </header>

      <div className={`fixed inset-0 z-30 bg-[#0c0d0e] px-6 pt-28 transition duration-300 lg:hidden ${open ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-full opacity-0"}`}>
        <nav className="flex flex-col border-t border-white/15" aria-label="Mobile navigation">
          {navItems.map((item, index) => (
            <Link key={item.label} href={item.href} className="flex items-center justify-between border-b border-white/15 py-5 font-display text-4xl uppercase text-white">
              <span>{item.label}</span><span className="text-xs font-sans text-[#ff5a36]">0{index + 1}</span>
            </Link>
          ))}
        </nav>
        <p className="mt-10 max-w-xs text-sm leading-relaxed text-white/45">Parts for the riders who know a build is never just a build.</p>
      </div>
    </>
  );
}
