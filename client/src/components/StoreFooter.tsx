/**
 * Design direction: Technical Drop Editorial — the footer finishes as a printed colophon, dense with structure and no soft marketing chrome.
 */
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import { useCatalog } from "@/contexts/CatalogContext";

const socials = [
  { label: "Instagram", href: "https://www.instagram.com/underrated_cycling_co/" },
  { label: "Facebook", href: "https://www.facebook.com/profile.php?id=61575686366341" },
  { label: "TikTok", href: "https://www.tiktok.com/@underratedcyclingco" },
];

const linkClass = "w-fit text-sm text-white/70 transition hover:text-[#ff5a36]";

function Column({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">{label}</p>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

export default function StoreFooter() {
  const { categories } = useCatalog();

  return (
    <footer className="border-t border-white/15 bg-[#090a0b] text-white">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.4fr_.65fr_.65fr_.65fr] lg:gap-8 lg:px-9">
        <div>
          <div className="flex items-center gap-3">
            <img src="/brand/ur-logo.png" alt="" className="size-12 object-contain" />
            <img src="/brand/underrated-wordmark.png" alt="Underrated Cycling Co." className="h-9 w-auto object-contain sm:h-10" />
          </div>
          <p className="mt-7 font-display max-w-lg text-5xl uppercase leading-[0.82] tracking-[-0.045em] sm:text-6xl">Small parts.<br /><em className="text-[#ff5a36]">Sharper builds.</em></p>
        </div>

        <Column label="Shop">
          <Link href="/shop" className={linkClass}>Shop all parts</Link>
          {categories.map((category) => (
            <Link key={category.name} href={`/shop?category=${encodeURIComponent(category.name)}`} className={linkClass}>
              {category.name}
            </Link>
          ))}
        </Column>

        <Column label="Account">
          <Link href="/account" className={linkClass}>Track your order</Link>
          <Link href="/sign-in" className={linkClass}>Sign in</Link>
        </Column>

        <Column label="Follow">
          {socials.map((social) => (
            <a key={social.label} href={social.href} target="_blank" rel="noreferrer" className={`${linkClass} group inline-flex items-center gap-2`}>
              {social.label}
              <ArrowUpRight size={15} className="text-white/40 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#ff5a36]" />
            </a>
          ))}
        </Column>
      </div>

      <div className="border-t border-white/10 px-4 py-4 text-[9px] font-bold uppercase tracking-[0.16em] text-white/35 sm:px-6 lg:px-9">
        <div className="mx-auto flex max-w-[1440px] justify-between">
          <span>© 2026 Underrated Cycling Co.</span>
          <span>Make the build yours</span>
        </div>
      </div>
    </footer>
  );
}
