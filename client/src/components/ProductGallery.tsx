/**
 * Design direction: Technical Drop Editorial — the gallery treats each component as a collectible object with tactile, inspectable views.
 */
import ProductVisual from "@/components/ProductVisual";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { Product } from "@/data/products";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { useState } from "react";

type GalleryFrameItem = { label: string; index: string; src?: string; kind: "photo" };

const designedFrames: GalleryFrameItem[] = [];

/** Every real photo first. If no photos exist, the gallery will be empty. */
function galleryFrames(product: Product): GalleryFrameItem[] {
  const photos = [product.image, ...(product.images ?? [])].filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return photos.map((src, position) => ({ label: photos.length > 1 ? `Shop photo ${String(position + 1).padStart(2, "0")}` : "Object view", index: String(position + 1).padStart(2, "0"), src, kind: "photo" as const }));
}

function GalleryFrame({ product, frame, className = "" }: { product: Product; frame: GalleryFrameItem; className?: string }) {
  return <div className={`relative h-full w-full ${className}`}><ProductVisual product={product} src={frame.src} position={frame.src ? product.image_positions?.[frame.src] : undefined} /><div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" /></div>;
}

export default function ProductGallery({ product }: { product: Product }) {
  const [selected, setSelected] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const frames = galleryFrames(product);
  const frame = frames[Math.min(selected, frames.length - 1)];

  const selectNext = (direction: 1 | -1) => setSelected((current) => (current + direction + frames.length) % frames.length);

  return (
    <div>
      <div className="relative aspect-[4/5] overflow-hidden bg-[#141517] sm:aspect-[5/4] lg:aspect-[4/5]">
        <GalleryFrame product={product} frame={frame} />
        <span className="absolute left-4 top-4 text-[10px] font-bold uppercase tracking-[.16em] text-white/50">{frame.index} / {frame.label}</span>
        <span className="absolute -bottom-4 left-4 font-display text-9xl uppercase leading-none text-white/[.08]">{product.category}</span>
        <img src="/brand/ur-logo.png" alt="" className="absolute bottom-4 right-4 size-9 object-contain opacity-65" />
        <button onClick={() => setZoomOpen(true)} className="absolute bottom-4 right-16 inline-flex items-center gap-2 border border-white/30 bg-black/45 px-3 py-2 text-[10px] font-bold uppercase tracking-[.14em] text-white backdrop-blur-sm transition hover:border-[#ff5a36] hover:text-[#ff5a36]" aria-label={`Zoom ${product.name} ${frame.label}`}><Maximize2 size={14} />Inspect</button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3" aria-label="Product gallery views">
        {frames.map((item, index) => <button key={`${item.kind}-${item.src ?? item.index}`} onClick={() => setSelected(index)} className={`relative aspect-square overflow-hidden border bg-[#161719] text-left transition ${selected === index ? "border-[#ff5a36]" : "border-transparent hover:border-white/40"}`} aria-label={`Show ${item.label}`} aria-pressed={selected === index}><GalleryFrame product={product} frame={item} /><span className="absolute left-2 top-2 bg-black/60 px-1.5 py-1 text-[9px] font-bold tracking-[.15em] text-white/65">{item.index}</span></button>)}
      </div>

      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent showCloseButton className="w-[min(1100px,calc(100%-1.5rem))] max-w-[1100px] gap-0 border-white/15 bg-[#0c0d0e] p-0 text-white sm:max-w-[1100px]">
          <DialogTitle className="sr-only">{product.name} gallery zoom</DialogTitle>
          <div className="relative aspect-[4/5] max-h-[78vh] overflow-hidden sm:aspect-[16/10]"><GalleryFrame product={product} frame={frame} /><div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between p-5 text-[10px] font-bold uppercase tracking-[.16em] text-white/60"><span>{product.name}</span><span>{frame.index} / {frame.label}</span></div><button onClick={() => selectNext(-1)} className="absolute left-4 top-1/2 grid size-10 -translate-y-1/2 place-items-center border border-white/20 bg-black/45 text-white transition hover:border-[#ff5a36] hover:text-[#ff5a36]" aria-label="Previous gallery view"><ChevronLeft size={20} /></button><button onClick={() => selectNext(1)} className="absolute right-4 top-1/2 grid size-10 -translate-y-1/2 place-items-center border border-white/20 bg-black/45 text-white transition hover:border-[#ff5a36] hover:text-[#ff5a36]" aria-label="Next gallery view"><ChevronRight size={20} /></button></div>
          <div className="flex items-center justify-between border-t border-white/10 px-5 py-4"><p className="text-xs text-white/45">Use the arrows or gallery tiles to move between views.</p><span className="font-display text-3xl uppercase leading-none text-[#ff5a36]">Inspect</span></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
