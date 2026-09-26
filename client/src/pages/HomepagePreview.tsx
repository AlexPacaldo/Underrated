/**
 * Design direction: Technical Drop Editorial — the admin preview renders the real storefront chrome so every edit is judged in context.
 */
import HomepageSections from "@/components/homepage/HomepageSections";
import { useCatalog } from "@/contexts/CatalogContext";
import { defaultHomepageContent, type HomepageContent, type HomepageSectionId } from "@/data/storefront";
import { isSameOriginMessage, postToParent, previewMetricsMessage, previewReadyMessage, previewSelectMessage, readPreviewContent } from "@/lib/homepagePreview";
import { useCallback, useEffect, useState } from "react";

const editableSections: HomepageSectionId[] = ["hero", "drop", "story"];

export default function HomepagePreview() {
  const { products, categories } = useCatalog();
  const [content, setContent] = useState<HomepageContent>(defaultHomepageContent);
  const [section, setSection] = useState<HomepageSectionId>("hero");

  const select = useCallback((next: HomepageSectionId) => {
    setSection(next);
    postToParent({ type: previewSelectMessage, section: next });
  }, []);

  useEffect(() => {
    document.documentElement.style.overflow = "hidden";

    const report = () => {
      const offsets: Partial<Record<HomepageSectionId, number>> = {};
      for (const id of editableSections) {
        const node = document.querySelector(`[data-homepage-section="${id}"]`);
        if (node) offsets[id] = Math.max(0, node.getBoundingClientRect().top);
      }
      postToParent({ type: previewMetricsMessage, height: document.documentElement.scrollHeight, offsets });
    };

    const handleMessage = (event: MessageEvent) => {
      if (!isSameOriginMessage(event)) return;
      const next = readPreviewContent(event.data);
      if (next) setContent(next);
    };

    const swallowChromeClicks = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("header, footer")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const observer = new ResizeObserver(report);
    observer.observe(document.body);
    window.addEventListener("resize", report);
    window.addEventListener("message", handleMessage);
    document.addEventListener("click", swallowChromeClicks, true);

    postToParent({ type: previewReadyMessage });
    const settle = window.setTimeout(report, 500);

    return () => {
      observer.disconnect();
      window.clearTimeout(settle);
      window.removeEventListener("resize", report);
      window.removeEventListener("message", handleMessage);
      document.removeEventListener("click", swallowChromeClicks, true);
      document.documentElement.style.overflow = "";
    };
  }, []);

  return <HomepageSections content={content} products={products} categories={categories} preview={{ active: section, onSelect: select }} />;
}
