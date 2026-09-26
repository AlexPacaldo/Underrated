/**
 * Design direction: Technical Drop Editorial — the admin homepage editor and its preview frame talk over one small typed message protocol.
 */
import { defaultHomepageContent, type HomepageContent, type HomepageSectionId } from "@/data/storefront";

export const homepagePreviewPath = "/admin/homepage-preview";

export const previewContentMessage = "homepage-preview:content";
export const previewReadyMessage = "homepage-preview:ready";
export const previewSelectMessage = "homepage-preview:select";
export const previewMetricsMessage = "homepage-preview:metrics";
export const previewRefreshMessage = "homepage-preview:refresh";

export type HomepagePreviewMetrics = {
  height: number;
  offsets: Partial<Record<HomepageSectionId, number>>;
};

const sections: HomepageSectionId[] = ["hero", "drop", "story", "journal"];

export function postToParent(message: Record<string, unknown>) {
  if (typeof window === "undefined" || window.parent === window) return;
  window.parent.postMessage(message, window.location.origin);
}

export function isSameOriginMessage(event: MessageEvent) {
  return event.origin === window.location.origin;
}

export function readPreviewContent(data: unknown): HomepageContent | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as { type?: string; content?: unknown };
  if (payload.type !== previewContentMessage || !payload.content || typeof payload.content !== "object") return null;
  return { ...defaultHomepageContent, ...(payload.content as Partial<HomepageContent>) };
}

export function readPreviewSection(data: unknown): HomepageSectionId | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as { type?: string; section?: unknown };
  if (payload.type !== previewSelectMessage) return null;
  return sections.includes(payload.section as HomepageSectionId) ? (payload.section as HomepageSectionId) : null;
}

export function readPreviewMetrics(data: unknown): HomepagePreviewMetrics | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as { type?: string; height?: unknown; offsets?: unknown };
  if (payload.type !== previewMetricsMessage || typeof payload.height !== "number" || !Number.isFinite(payload.height)) return null;
  const offsets: Partial<Record<HomepageSectionId, number>> = {};
  if (payload.offsets && typeof payload.offsets === "object") {
    for (const id of sections) {
      const value = (payload.offsets as Record<string, unknown>)[id];
      if (typeof value === "number" && Number.isFinite(value)) offsets[id] = value;
    }
  }
  return { height: Math.ceil(payload.height), offsets };
}

export function isPreviewType(data: unknown, type: string) {
  return Boolean(data && typeof data === "object" && (data as { type?: string }).type === type);
}
