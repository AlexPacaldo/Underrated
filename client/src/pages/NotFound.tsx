/**
 * Design direction: Technical Drop Editorial — an invalid route becomes a stark, branded interruption with a direct return path.
 */
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return <section className="flex min-h-screen items-end px-4 pb-16 pt-28 sm:px-6 lg:px-9"><div><p className="text-[10px] font-bold uppercase tracking-[.17em] text-[#ff5a36]">Route not found / 404</p><h1 className="mt-4 font-display text-[clamp(5.5rem,15vw,14rem)] uppercase leading-[.64] tracking-[-.07em] text-white/12">Wrong<br />turn.</h1><p className="mt-8 max-w-sm text-sm leading-6 text-white/45">No part lives at this address. Return to the index and find a better line.</p><Link href="/shop" className="mt-7 inline-flex items-center gap-2 border border-[#ff5a36] px-4 py-3 text-[10px] font-bold uppercase tracking-[.15em] text-[#ff5a36] transition hover:bg-[#ff5a36] hover:text-black"><ArrowLeft size={14} />Shop the parts</Link></div></section>;
}
