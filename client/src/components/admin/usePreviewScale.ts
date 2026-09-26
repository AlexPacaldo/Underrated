import { useEffect, useRef, useState } from "react";

/**
 * Design direction: Technical Drop Editorial — admin previews are scaled print proofs, never re-implementations of the storefront.
 * Measures the stage so a fixed-width storefront frame can be scaled to fit without faking any media queries.
 */
export function usePreviewScale(designWidth: number) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    // contentRect is the box left after the stage's border and padding, so a fitted frame never overflows its scroll area.
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { stageRef, scale: available > 0 ? Math.min(1, available / designWidth) : 1 };
}
