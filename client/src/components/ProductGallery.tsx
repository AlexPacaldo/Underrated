/**
 * Design direction: Technical Drop Editorial — the gallery treats each component as a collectible object with tactile, inspectable views.
 */
import ProductVisual from "@/components/ProductVisual";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { productImageFrameRatio, type Product } from "@/data/products";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { useState } from "react";

type GalleryFrameItem = { label: string; index: string; src?: string; kind: "photo"; ratio: number };

const designedFrames: GalleryFrameItem[] = [];

/** Every real photo first. If no photos exist, the gallery will be empty. */
function galleryFrames(product: Product): GalleryFrameItem[] {
  const photos = [product.image, ...(product.images ?? [])].filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return photos.map((src, position) => ({ label: photos.length > 1 ? `Shop photo ${String(position + 1).padStart(2, "0")}` : "Object view", index: String(position + 1).padStart(2, "0"), src, kind: "photo" as const, ratio: productImageFrameRatio(product.image_frames?.[src]) }));
}

function GalleryFrame({ product, frame, className = "" }: { product: Product; frame: GalleryFrameItem; className?: string }) {
  return <div className={`relative h-full w-full ${className}`}><ProductVisual product={product} src={frame.src} position={frame.src ? product.image_positions?.[frame.src] : undefined} /><div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" /></div>;
}

export default function ProductGallery({ product }: { product: Product }) {
  const [selected, setSelected] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const frames = galleryFrames(product);
  const frame = frames.length > 0 ? frames[Math.min(selected, frames.length - 1)] : null;

  const selectNext = (direction: 1 | -1) => setSelected((current) => (current + direction + frames.length) % frames.length);

  return (
    <div>
      {frame ? (
        <>
          <div className="relative mx-auto w-full overflow-hidden border border-white/10 bg-[#141517]" style={{ aspectRatio: frame.ratio, maxWidth: `min(100%, ${Math.round(520 * frame.ratio)}px)` }}>
            <GalleryFrame product={product} frame={frame} />
            <button onClick={() => setZoomOpen(true)} className="absolute bottom-4 right-4 grid size-10 place-items-center border border-white/25 bg-black/55 text-white backdrop-blur-sm transition hover:border-[#ff5a36] hover:text-[#ff5a36]" aria-label={`View ${product.name} ${frame.label} full screen`} title="View full screen"><Maximize2 size={15} /></button>
          </div>

          {frames.length > 1 ? (
            <div
              className="mx-auto mt-3 grid w-full gap-2"
              style={{
                gridTemplateColumns: `repeat(${Math.min(frames.length, 5)}, minmax(0, 1fr))`,
                maxWidth: `min(100%, ${Math.round(520 * frame.ratio)}px)`,
              }}
              aria-label="Product gallery views"
            >
              {frames.map((item, index) => <button key={`${item.kind}-${item.src ?? item.index}`} onClick={() => setSelected(index)} className={`relative aspect-[4/3] min-w-0 overflow-hidden border bg-[#161719] text-left transition ${selected === index ? "border-[#ff5a36] opacity-100" : "border-white/10 opacity-60 hover:border-white/35 hover:opacity-100"}`} aria-label={`Show ${item.label}`} aria-pressed={selected === index}><GalleryFrame product={product} frame={item} /></button>)}
            </div>
          ) : null}

          <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
            <DialogContent showCloseButton className="w-[min(1100px,calc(100%-1.5rem))] max-w-[1100px] gap-0 border-white/15 bg-[#0c0d0e] p-0 text-white sm:max-w-[1100px]">
              <DialogTitle className="sr-only">{product.name} gallery zoom</DialogTitle>
              <div className="relative mx-auto overflow-hidden" style={{ aspectRatio: frame.ratio, maxHeight: "78vh", maxWidth: "100%", width: `${78 * frame.ratio}vh` }}><GalleryFrame product={product} frame={frame} /><div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between p-5 text-[10px] font-bold uppercase tracking-[.16em] text-white/60"><span>{product.name}</span><span>{frame.index} / {frame.label}</span></div><button onClick={() => selectNext(-1)} className="absolute left-4 top-1/2 grid size-10 -translate-y-1/2 place-items-center border border-white/20 bg-black/45 text-white transition hover:border-[#ff5a36] hover:text-[#ff5a36]" aria-label="Previous gallery view"><ChevronLeft size={20} /></button><button onClick={() => selectNext(1)} className="absolute right-4 top-1/2 grid size-10 -translate-y-1/2 place-items-center border border-white/20 bg-black/45 text-white transition hover:border-[#ff5a36] hover:text-[#ff5a36]" aria-label="Next gallery view"><ChevronRight size={20} /></button></div>
              <div className="flex items-center justify-between border-t border-white/10 px-5 py-4"><p className="text-xs text-white/45">Use the arrows or gallery tiles to move between views.</p></div>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <div className="relative mx-auto aspect-[4/3] max-w-[560px] overflow-hidden border border-white/10 bg-[#141517]">
          <ProductVisual product={product} />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
        </div>
      )}
    </div>
  );
}
