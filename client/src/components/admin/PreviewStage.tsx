import type { RefObject } from "react";
import { useEffect } from "react";

/**
 * Design direction: Technical Drop Editorial — admin previews are scaled print proofs, never re-implementations of the storefront.
 * Frames a real route at a fixed design width and scales it, so the frame's own media queries decide the layout.
 */
export default function PreviewStage({ src, title, designWidth, height, scale, stageRef, frameRef, readyType, onMessage, onReady }: {
  src: string;
  title: string;
  designWidth: number;
  height: number;
  scale: number;
  stageRef: RefObject<HTMLDivElement | null>;
  frameRef: RefObject<HTMLIFrameElement | null>;
  readyType: string;
  onMessage: (data: unknown) => void;
  onReady: () => void;
}) {
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const type = event.data && typeof event.data === "object" ? (event.data as { type?: string }).type : undefined;
      if (type === readyType) {
        onReady();
        return;
      }
      onMessage(event.data);
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onMessage, onReady, readyType]);

  return <div ref={stageRef} className="max-h-[88vh] overflow-auto border border-white/15 bg-[#08090a] p-2">
    {/* Auto margins rather than justify-center, so a frame wider than the column stays reachable by scrolling. */}
    <div className="relative mx-auto shrink-0 overflow-hidden" style={{ width: Math.round(designWidth * scale), height: Math.round(height * scale) }}>
      <iframe ref={frameRef} src={src} title={title} className="absolute left-0 top-0 origin-top-left border-0 bg-[#0c0d0e]" style={{ width: designWidth, height, transform: `scale(${scale})` }} />
    </div>
  </div>;
}
