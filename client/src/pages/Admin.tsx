import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Archive, ArrowLeft, Check, ExternalLink, ImagePlus, LayoutDashboard, Package, Save, ShieldCheck, Undo2, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import PreviewStage from "@/components/admin/PreviewStage";
import ProductVisual from "@/components/ProductVisual";
import type { ProductVisual as ProductVisualType } from "@/data/products";
import { usePreviewScale } from "@/components/admin/usePreviewScale";
import { useAuth, type AccountRole } from "@/contexts/AuthContext";
import { useCatalog } from "@/contexts/CatalogContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { productImagePositions } from "@/data/products";
import type { Product, ProductImagePosition } from "@/data/products";
import { defaultHomepageContent, type HomepageContent, type HomepageSectionId } from "@/data/storefront";
import { formatDeliveryAddress } from "@/lib/deliveryAddress";
import { homepagePreviewPath, previewContentMessage, previewReadyMessage, previewRefreshMessage, readPreviewMetrics, readPreviewSection, type HomepagePreviewMetrics } from "@/lib/homepagePreview";
import { productPreviewFields, productPreviewPath, productPreviewProductMessage, productPreviewReadyMessage, readPreviewField, readPreviewProductHeight, type ProductPreviewField } from "@/lib/productPreview";
import { fetchAdminHomepage, fetchAdminOrders, fetchAdminProducts, fetchAdminProfiles, saveAdminHomepage, saveAdminProduct, setAdminProductArchived, setAdminProductFeatured, setAdminProfileRole, updateAdminOrderStatus, uploadStorefrontAsset, type AdminOrder, type AdminOrderStatus, type AdminProfile } from "@/lib/admin";

type Section = "overview" | "orders" | "products" | "homepage" | "roles";

const navigation = [
  { id: "overview" as const, label: "Overview", icon: LayoutDashboard },
  { id: "orders" as const, label: "Orders", icon: Package },
  { id: "products" as const, label: "Shop items", icon: Archive },
  { id: "homepage" as const, label: "Homepage", icon: ImagePlus },
  { id: "roles" as const, label: "Roles", icon: Users },
];

const statusLabels: Record<AdminOrderStatus, string> = {
  pending_payment: "Pending payment",
  payment_submitted: "Payment submitted",
  paid: "Paid",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const nextStatuses: Partial<Record<AdminOrderStatus, AdminOrderStatus[]>> = {
  pending_payment: ["cancelled"],
  payment_submitted: ["paid", "rejected", "cancelled"],
  paid: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
};

const inputClass = "h-10 w-full rounded-none border border-white/15 bg-[#101113] px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#ff5a36]";
const labelClass = "grid gap-1.5 text-[10px] font-black uppercase tracking-[.14em] text-white/45";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function StatusBadge({ status }: { status: AdminOrderStatus }) {
  return <span className="inline-flex border border-[#ff5a36]/35 px-2 py-1 text-[10px] font-black uppercase tracking-[.12em] text-[#ff5a36]">{statusLabels[status]}</span>;
}

function OrderCard({ order, onUpdated }: { order: AdminOrder; onUpdated: () => Promise<void> }) {
  const { formatMoney } = useCurrency();
  const available = nextStatuses[order.status] ?? [];
  const statusOptions = available.includes(order.status) ? available : [order.status, ...available];
  const [status, setStatus] = useState<AdminOrderStatus>(order.status);
  const [fulfillmentNote, setFulfillmentNote] = useState(order.fulfillment_note ?? "");
  const [trackingNumber, setTrackingNumber] = useState(order.tracking_number ?? "");
  const [adminNote, setAdminNote] = useState(order.admin_note ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStatus(order.status);
    setFulfillmentNote(order.fulfillment_note ?? "");
    setTrackingNumber(order.tracking_number ?? "");
    setAdminNote(order.admin_note ?? "");
  }, [order.id, order.status, order.fulfillment_note, order.tracking_number, order.admin_note]);

  const save = async () => {
    setSaving(true);
    try {
      await updateAdminOrderStatus(order.id, status, fulfillmentNote, trackingNumber, adminNote);
      toast.success("Order updated", { description: status === order.status ? `${order.order_number} details saved.` : `${order.order_number} is now ${statusLabels[status].toLowerCase()}.` });
      await onUpdated();
    } catch (error) {
      toast.error("Could not update order.", { description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setSaving(false);
    }
  };

  return <article className="border border-white/15 bg-[#111214] p-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div><p className="font-display text-3xl uppercase leading-none text-white">{order.order_number}</p><p className="mt-2 text-xs text-white/40">{formatDate(order.created_at)} · {order.shipping_region}</p></div>
      <div className="sm:text-right"><StatusBadge status={order.status} /><p className="mt-2 font-bold text-white">{formatMoney(order.total_cents / 100, order.display_currency, order.fx_rate)}</p><p className="mt-1 text-[10px] text-white/35">Base: {formatMoney(order.total_cents / 100, "PHP", 1)}</p></div>
    </div>
    <div className="mt-5 grid gap-3 border-y border-white/10 py-4 text-xs text-white/55 sm:grid-cols-2">
      <div><p className="text-[10px] font-black uppercase tracking-[.14em] text-white/35">Customer</p><p className="mt-1 break-all text-white/75">{order.user_id}</p></div>
      <div><p className="text-[10px] font-black uppercase tracking-[.14em] text-white/35">Deliver to</p>{order.shipping_address ? <><p className="mt-1 text-white/75">{order.shipping_address.recipient_name}</p><p>{formatDeliveryAddress(order.shipping_address)}</p></> : <p className="mt-1">No address</p>}</div>
    </div>
    <div className="mt-4 grid gap-2">{order.order_items.map((item) => <div key={item.id} className="flex justify-between gap-3 bg-white/[.03] px-3 py-2 text-xs text-white/60"><span>{item.quantity}× {item.product_name} / {item.finish}</span><span className="font-bold text-white">{formatMoney(item.line_total_cents / 100, order.display_currency, order.fx_rate)}</span></div>)}</div>
    {order.manual_payment_submissions.length > 0 ? <div className="mt-4 border border-white/10 p-3 text-xs text-white/55"><p className="text-[10px] font-black uppercase tracking-[.14em] text-white/35">Payment references</p>{order.manual_payment_submissions.map((submission) => <p key={submission.id} className="mt-2">{submission.payment_method.replace("_", " ")} · <span className="font-bold text-white">{submission.reference_number}</span> · {formatDate(submission.created_at)}</p>)}</div> : null}
    <div className="mt-5 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-2"><label className={labelClass}>Status<select value={status} onChange={(event) => setStatus(event.target.value as AdminOrderStatus)} disabled={available.length === 0} className={`${inputClass} disabled:opacity-50`}>{statusOptions.map((item) => <option key={item} value={item} className="bg-[#111214]">{statusLabels[item]}</option>)}</select></label><label className={labelClass}>Tracking number<input value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} className={inputClass} placeholder="Optional" /></label><label className={labelClass}>Fulfillment note<input value={fulfillmentNote} onChange={(event) => setFulfillmentNote(event.target.value)} className={inputClass} placeholder="Optional" /></label><label className={labelClass}>Admin note<input value={adminNote} onChange={(event) => setAdminNote(event.target.value)} className={inputClass} placeholder="Internal only" /></label><button onClick={save} disabled={saving} className="inline-flex h-10 items-center justify-center gap-2 bg-[#ff5a36] px-4 text-[10px] font-black uppercase tracking-[.14em] text-black disabled:opacity-50 sm:col-span-2">{saving ? "Saving..." : <><Save size={14} />{status === order.status ? "Save details" : `Mark ${statusLabels[status].toLowerCase()}`}</>}</button><p className="text-[10px] leading-4 text-white/35 sm:col-span-2">{available.length === 0 ? "This order is closed. You can still record tracking and internal notes." : "Leave the status unchanged to save tracking or notes only."}</p></div>
  </article>;
}

function newProduct(): Product {
  return { id: `part-${Date.now()}`, slug: "", name: "", category: "Accessories", price: 0, descriptor: "", description: "", finishes: ["Graphite"], visual: "hoods", specs: [], fitment: { headline: "", compatibility: [], checkBeforeRide: "" }, featured: false, archived: false, sortOrder: 99 };
}

function parseSpecText(value: string) {
  return value.split("\n").flatMap((line) => {
    const separator = line.indexOf(":");
    if (separator < 1) return [];
    const label = line.slice(0, separator).trim();
    const specValue = line.slice(separator + 1).trim();
    return label && specValue ? [{ label, value: specValue }] : [];
  });
}

function parseLineList(value: string) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

/** The lead photo stays in image and every extra photo stays in gallery order, with no duplicates. */
function normalizeImages(image: string | undefined, images: string[]) {
  const lead = image?.trim() ?? "";
  const extras: string[] = [];
  for (const value of images) {
    const item = value.trim();
    if (item && item !== lead && !extras.includes(item)) extras.push(item);
  }
  return { image: lead || undefined, images: extras };
}

/** Dropping the lead shot promotes the next gallery photo, so an item never shows a photo that is not its lead. */
function shiftLead(extras: string[]) {
  const [first, ...rest] = extras;
  return normalizeImages(first ?? "", rest);
}

/** Appending photos keeps the gallery in order; the first photo an item gets becomes the lead. */
function appendImages(product: Product, incoming: string[]) {
  const extras = [...(product.images ?? []), ...incoming].map((item) => item.trim()).filter(Boolean);
  return product.image?.trim() ? normalizeImages(product.image, extras) : shiftLead(extras);
}

/** Re-typing the lead field behaves exactly like promoting that photo, so a retyped URL never drops the old lead. */
function setLeadImage(product: Product, value: string) {
  const lead = value.trim();
  return lead ? promoteImage(product, lead) : shiftLead(product.images ?? []);
}

function dropImage(product: Product, value: string) {
  const extras = (product.images ?? []).filter((item) => item !== value);
  return product.image === value ? shiftLead(extras) : normalizeImages(product.image, extras);
}

function promoteImage(product: Product, value: string) {
  return normalizeImages(value, [product.image ?? "", ...(product.images ?? [])]);
}

function ProductEditor({ product, onSaved, onCancel }: { product: Product; onSaved: () => Promise<void>; onCancel: () => void }) {
  const [draft, setDraft] = useState(product);
  const [specText, setSpecText] = useState(product.specs.map((item) => `${item.label}: ${item.value}`).join("\n"));
  const [fitmentText, setFitmentText] = useState(product.fitment.compatibility.join("\n"));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [device, setDevice] = useState(previewDevices[1]);
  const [previewHeight, setPreviewHeight] = useState(1500);
  const [focusRequest, setFocusRequest] = useState<{ field: ProductPreviewField; id: number } | null>(null);
  const focusId = useRef(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const previewRef = useRef<Product>(product);
  const { stageRef, scale } = usePreviewScale(device.width);
  const update = <K extends keyof Product>(key: K, value: Product[K]) => setDraft((current) => ({ ...current, [key]: value }));

  // The preview parses the same textareas the save writes, so the frame shows exactly what gets stored.
  const previewProduct = useMemo<Product>(() => ({ ...draft, ...normalizeImages(draft.image, draft.images ?? []), finishes: draft.finishes.map((item) => item.trim()).filter(Boolean), specs: parseSpecText(specText), fitment: { ...draft.fitment, compatibility: parseLineList(fitmentText) } }), [draft, specText, fitmentText]);
  useEffect(() => { previewRef.current = previewProduct; }, [previewProduct]);

  const pushPreview = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage({ type: productPreviewProductMessage, product: previewRef.current }, window.location.origin);
  }, []);

  useEffect(() => { pushPreview(); }, [previewProduct, pushPreview]);

  const handlePreviewMessage = useCallback((data: unknown) => {
    const selected = readPreviewField(data);
    if (selected) { setFocusRequest({ field: selected, id: focusId.current += 1 }); return; }
    const next = readPreviewProductHeight(data);
    if (next) setPreviewHeight(next);
  }, []);

  // A click in the frame scrolls the matching field into view and puts the caret in it.
  useEffect(() => {
    if (!focusRequest) return;
    const node = document.querySelector<HTMLElement>(`[data-editor-field="${focusRequest.field}"]`);
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
    node?.focus({ preventScroll: true });
    const settle = window.setTimeout(() => setFocusRequest(null), 1600);
    return () => window.clearTimeout(settle);
  }, [focusRequest]);

  useEffect(() => {
    setDraft(product);
    setSpecText(product.specs.map((item) => `${item.label}: ${item.value}`).join("\n"));
    setFitmentText(product.fitment.compatibility.join("\n"));
  }, [product]);

  const save = async () => {
    if (!draft.name.trim()) {
      toast.error("Name required.", { description: "Give the shop item a name before saving." });
      return;
    }
    const slug = draft.slug.trim() || draft.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!slug) {
      toast.error("Slug required.", { description: "Add a URL slug so the item can be linked." });
      return;
    }
    if (!draft.category.trim()) {
      toast.error("Category required.", { description: "Choose a category so the item appears in the shop index." });
      return;
    }
    const cleanFinishes = draft.finishes.map((item) => item.trim()).filter(Boolean);
    if (cleanFinishes.length === 0) {
      toast.error("At least one finish is required.", { description: "Customers must be able to choose a finish before checkout." });
      return;
    }
    if (!Number.isFinite(draft.price) || draft.price < 0) {
      toast.error("Price is invalid.", { description: "Enter the PHP price as a positive number." });
      return;
    }

    setSaving(true);
    try {
      await saveAdminProduct({ ...draft, slug, finishes: cleanFinishes, specs: parseSpecText(specText), fitment: { ...draft.fitment, compatibility: parseLineList(fitmentText) } });
      toast.success("Shop item saved.");
      await onSaved();
    } catch (error) {
      toast.error("Could not save shop item.", { description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setSaving(false);
    }
  };

  const gallery = [draft.image, ...(draft.images ?? [])].filter((item): item is string => Boolean(item));

  const addImage = (value: string) => setDraft((current) => ({ ...current, ...appendImages(current, [value]) }));
  const removeImage = (value: string) => setDraft((current) => ({ ...current, ...dropImage(current, value) }));
  const makeLead = (value: string) => setDraft((current) => ({ ...current, ...promoteImage(current, value) }));

// Framing: pick a photo, then drag it inside the frame to set the crop.
  const [framing, setFraming] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; posX: number; posY: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const framingPhotoRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    framingPhotoRef.current = framing && gallery.includes(framing) ? framing : gallery[0];
  }, [framing, gallery]);

  const handleDragStart = (event: React.PointerEvent) => {
    const photo = framingPhotoRef.current;
    if (!photo) return;
    event.preventDefault();
    const pos = draft.image_positions?.[photo];
    const current = pos ? pos.split("%").map((v) => Number(v.replace("%", ""))) : [50, 50];
    const cx = current[0] ?? 50;
    const cy = current[1] ?? 50;
    setDragStart({ x: event.clientX, y: event.clientY, posX: cx, posY: cy });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDragMove = (event: React.PointerEvent) => {
    if (!dragStart) return;
    const photo = framingPhotoRef.current;
    if (!photo) return;
    const dx = event.clientX - dragStart.x;
    const dy = event.clientY - dragStart.y;
    // 1px drag ≈ 0.5% position change
    const nextX = Math.max(0, Math.min(100, dragStart.posX + dx * 0.5));
    const nextY = Math.max(0, Math.min(100, dragStart.posY + dy * 0.5));
    setDraft((cur) => ({ ...cur, image_positions: { ...(cur.image_positions ?? {}), [photo]: `${Math.round(nextX)}% ${Math.round(nextY)}%` } }));
  };

  const handleDragEnd = () => setDragStart(null);

  const upload = async (picked: File[]) => {
    if (picked.length === 0) return;
    setUploading(true);
    try {
      const paths: string[] = [];
      for (const file of picked) paths.push(await uploadStorefrontAsset(file, "products"));
      setDraft((current) => ({ ...current, ...appendImages(current, paths) }));
      toast.success(picked.length === 1 ? "Photo uploaded." : `${picked.length} photos uploaded.`, { description: "The gallery is live in the preview. Save the item to publish it." });
    } catch (error) {
      toast.error("Could not upload photos.", { description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setUploading(false);
    }
  };

  return <div className="border border-white/15 bg-[#111214]"><div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-[#ff5a36]">Catalog editor</p><h2 className="mt-1 font-display text-3xl uppercase text-white">{draft.name || "New shop item"}</h2></div><div className="flex items-center gap-4"><p className="text-[10px] font-black uppercase tracking-[.14em] text-white/35">{device.label} / {device.width}px / {Math.round(scale * 100)}%</p><button onClick={onCancel} className="text-[10px] font-black uppercase tracking-[.14em] text-white/45 hover:text-white">Close</button></div></div><div className="grid gap-6 p-5 2xl:grid-cols-[minmax(0,1.25fr)_minmax(380px,1fr)]"><div className="min-w-0"><div className="mb-3 flex flex-wrap items-center gap-1.5">{previewDevices.map((item) => <button key={item.id} onClick={() => setDevice(item)} className={`border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[.12em] transition ${device.id === item.id ? "border-[#ff5a36] bg-[#ff5a36] text-black" : "border-white/15 text-white/50 hover:border-white/50 hover:text-white"}`}>{item.label}</button>)}</div><PreviewStage src={productPreviewPath} title="Item preview" designWidth={device.width} height={previewHeight} scale={scale} stageRef={stageRef} frameRef={frameRef} readyType={productPreviewReadyMessage} onMessage={handlePreviewMessage} onReady={pushPreview} /><p className="mt-3 text-[10px] leading-4 text-white/35">The frame runs the real shop card and item view, so the editor cannot drift from the storefront. Click any outlined part of the frame to jump to that field; links and cart actions stay inert here.</p></div><div className="min-w-0"><div className="grid gap-4 sm:grid-cols-2"><label className={labelClass}>Name<input data-editor-field="name" value={draft.name} onChange={(event) => update("name", event.target.value)} className={inputClass} /></label><label className={labelClass}>Slug<input value={draft.slug} onChange={(event) => update("slug", event.target.value)} className={inputClass} placeholder="product-slug" /></label><label className={labelClass}>Category<input data-editor-field="category" value={draft.category} onChange={(event) => update("category", event.target.value)} className={inputClass} /></label><label className={labelClass}>Price in PHP<input data-editor-field="price" type="number" min="0" step="1" value={draft.price} onChange={(event) => update("price", Number(event.target.value))} className={inputClass} /></label><label className={labelClass}>Badge<input data-editor-field="badge" value={draft.badge ?? ""} onChange={(event) => update("badge", event.target.value)} className={inputClass} placeholder="Optional" /></label><label className={labelClass}>Visual<select value={draft.visual} onChange={(event) => update("visual", event.target.value as ProductVisualType)} className={inputClass}>{(["hoods", "valve", "saddle", "tape", "stem", "stand"] as const).map((value) => <option key={value} value={value} className="bg-[#111214]">{value}</option>)}</select></label><label className={`${labelClass} sm:col-span-2`}>Descriptor<input data-editor-field="descriptor" value={draft.descriptor} onChange={(event) => update("descriptor", event.target.value)} className={inputClass} /></label><label className={`${labelClass} sm:col-span-2`}>Description<textarea data-editor-field="description" value={draft.description} onChange={(event) => update("description", event.target.value)} className={`${inputClass} min-h-24 py-3`} /></label><label className={labelClass}>Finishes, comma separated<input data-editor-field="finishes" value={draft.finishes.join(", ")} onChange={(event) => update("finishes", event.target.value.split(",").map((value) => value.trim()).filter(Boolean))} className={inputClass} /></label><div className="sm:col-span-2"><p className={labelClass}>Photos {gallery.length ? <span className="text-white/40">({gallery.length})</span> : null}</p><div className="mt-1.5 grid grid-cols-4 gap-2 sm:grid-cols-6">{gallery.length === 0 ? <p className="col-span-full border border-dashed border-white/15 px-3 py-4 text-[10px] font-bold uppercase tracking-[.14em] text-white/30">No photos yet. The storefront falls back to the illustrated visual below.</p> : gallery.map((value, index) => <div key={value} className="relative"><button type="button" onClick={() => makeLead(value)} title={index === 0 ? "Photo 1 is the lead shot" : `Make photo ${index + 1} the lead shot`} className={`block aspect-square w-full overflow-hidden border bg-[#161719] transition ${index === 0 ? "border-[#ff5a36]" : "border-white/10 hover:border-white/50"}`}><img src={value} alt="" className="h-full w-full object-cover" /></button>{index === 0 ? <span className="pointer-events-none absolute inset-x-0 bottom-0 block bg-[#ff5a36] py-0.5 text-center text-[9px] font-black uppercase tracking-[.1em] text-black">Lead shot</span> : null}<span className="pointer-events-none absolute left-1 top-1 grid size-5 place-items-center bg-black/80 text-[10px] font-black text-white">{index + 1}</span><button type="button" onClick={() => removeImage(value)} aria-label={`Remove photo ${index + 1}`} title={`Remove photo ${index + 1}`} className="absolute right-1 top-1 grid size-5 place-items-center border border-white/50 bg-black/80 text-[12px] leading-none text-white transition hover:border-[#ff5a36] hover:bg-[#ff5a36] hover:text-black">&times;</button></div>)}</div><div className="mt-3 grid gap-4 sm:grid-cols-2"><label className={labelClass}>Lead photo URL<input data-editor-field="image" value={draft.image ?? ""} onChange={(event) => setDraft((current) => ({ ...current, ...setLeadImage(current, event.target.value) }))} className={inputClass} placeholder="/path/image.jpg" /><span className="mt-1 flex items-center gap-2 text-[10px] normal-case tracking-normal text-white/35"><Upload size={12} />{uploading ? "Uploading..." : "Same as photo 1 in the strip above"}</span></label><div className={labelClass}>Add photos<input type="file" accept="image/*" multiple onChange={(event) => { const picked = Array.from(event.target.files ?? []); event.target.value = ""; void upload(picked); }} className="file:mr-3 file:rounded-none file:border-0 file:bg-[#ff5a36] file:px-3 file:py-2 file:text-[10px] file:font-black file:uppercase file:text-black" /><span className="mt-1 text-[10px] normal-case tracking-normal text-white/35">Photos run left to right, and photo 1 is the lead shot used on cards and in the drop. Tap a photo to promote it, or press its x to remove it. You can also paste a URL instead of uploading.</span></div></div></div><div className="sm:col-span-2"><p className={labelClass}>Frame <span className="text-white/40">(pick a photo, then drag it inside the frame to set the crop)</span></p><div className="mt-1.5 flex flex-wrap gap-2">{gallery.map((value, index) => <button key={value} type="button" onClick={() => setFraming(value)} className={`border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[.12em] transition ${framing === value ? "border-[#ff5a36] bg-[#ff5a36] text-black" : "border-white/15 text-white/50 hover:border-white/50 hover:text-white"}`} title={`Adjust framing for photo ${index + 1}`}>{index + 1}</button>)}</div><div className="mt-3 grid gap-4"><div className="relative aspect-[4/5] overflow-hidden bg-[#161719] border border-white/15"><div onPointerDown={handleDragStart} onPointerMove={handleDragMove} onPointerUp={handleDragEnd} onPointerLeave={handleDragEnd} onPointerUpCapture={handleDragEnd} style={{ touchAction: "none" }}><ProductVisual product={draft} src={framingPhotoRef.current} position={framingPhotoRef.current ? draft.image_positions?.[framingPhotoRef.current] : undefined} style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }} /></div><span className="absolute left-2 top-2 text-[10px] font-black uppercase tracking-[.14em] text-white/40">Drag to reposition — preview at card aspect</span></div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-white/40"><span>Zoom</span><button onClick={() => setZoom(Math.max(0.5, zoom - 0.25))} className="border border-white/15 px-2 py-1 text-white/50 hover:text-white">−</button><span className="w-8 text-center">{Math.round(zoom * 100)}%</span><button onClick={() => setZoom(Math.min(3, zoom + 0.25))} className="border border-white/15 px-2 py-1 text-white/50 hover:text-white">+</button></div><p className="text-[10px] font-black uppercase tracking-[.14em] text-white/40">Current: {framingPhotoRef.current ? draft.image_positions?.[framingPhotoRef.current] ?? "50% 50%" : "50% 50%"}</p></div></div><label className={`${labelClass} sm:col-span-2`}>Specs, one per line<input data-editor-field="specs" value={specText} onChange={(event) => setSpecText(event.target.value)} className={`${inputClass} min-h-24 py-3`} placeholder="Fit: Road STI" /></label><label className={`${labelClass} sm:col-span-2`}>Fitment compatibility, one per line<textarea data-editor-field="fitment" value={fitmentText} onChange={(event) => setFitmentText(event.target.value)} className={`${inputClass} min-h-24 py-3`} /></label><label className={`${labelClass} sm:col-span-2`}>Fitment headline<input data-editor-field="fitment" value={draft.fitment.headline} onChange={(event) => update("fitment", { ...draft.fitment, headline: event.target.value })} className={inputClass} /></label><label className={`${labelClass} sm:col-span-2`}>Before you ride<input data-editor-field="fitment" value={draft.fitment.checkBeforeRide} onChange={(event) => update("fitment", { ...draft.fitment, checkBeforeRide: event.target.value })} className={inputClass} /></label></div></div></div><div className="flex flex-wrap items-center gap-5 border-t border-white/10 px-5 py-4"><label className="flex items-center gap-2 text-xs text-white/65"><input type="checkbox" checked={Boolean(draft.featured)} onChange={(event) => update("featured", event.target.checked)} />Featured in the drop</label><label className="flex items-center gap-2 text-xs text-white/65"><input type="checkbox" checked={Boolean(draft.archived)} onChange={(event) => update("archived", event.target.checked)} />Archived</label><button onClick={save} disabled={saving || !draft.name.trim()} className="ml-auto inline-flex h-10 items-center gap-2 bg-[#ff5a36] px-5 text-[10px] font-black uppercase tracking-[.14em] text-black disabled:opacity-50">{saving ? "Saving..." : <><Save size={14} />Save item</>}</button></div></div>;
}function ProductManager({ products, reload, notify }: { products: Product[]; reload: () => Promise<void>; notify: () => Promise<void> }) {
  const [editing, setEditing] = useState<Product | null>(null);
  const toggleArchive = async (product: Product) => {
    try {
      await setAdminProductArchived(product.id, !product.archived);
      toast.success(product.archived ? "Item restored." : "Item archived.");
      await reload();
      await notify();
    } catch (error) {
      toast.error("Could not update item.", { description: error instanceof Error ? error.message : "Try again." });
    }
  };
  return <div className="space-y-5"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-[#ff5a36]">Catalog</p><h1 className="mt-1 font-display text-5xl uppercase text-white">Shop items</h1></div><button onClick={() => setEditing(newProduct())} className="bg-[#ff5a36] px-4 py-3 text-[10px] font-black uppercase tracking-[.14em] text-black">Add item</button></div>{editing ? <ProductEditor product={editing} onSaved={async () => { setEditing(null); await reload(); await notify(); }} onCancel={() => setEditing(null)} /> : null}<div className="divide-y divide-white/10 border-y border-white/10">{products.map((product) => <div key={product.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-bold text-white">{product.name}</p><p className="mt-1 text-xs text-white/40">{product.category} · {product.slug} · {product.archived ? "Archived" : product.featured ? "Featured" : "Published"}</p></div><p className="text-sm font-bold text-white">₱{product.price.toLocaleString("en-PH")}</p><div className="flex gap-2"><button onClick={() => setEditing(product)} className="border border-white/20 px-3 py-2 text-[10px] font-black uppercase tracking-[.12em] text-white/65 hover:border-[#ff5a36] hover:text-[#ff5a36]">Edit</button><button onClick={() => void toggleArchive(product)} className="border border-white/20 px-3 py-2 text-[10px] font-black uppercase tracking-[.12em] text-white/65 hover:border-[#ff5a36] hover:text-[#ff5a36]">{product.archived ? "Restore" : "Archive"}</button></div></div>)}</div></div>;
}

type HomepageField = {
  key: keyof HomepageContent;
  label: string;
  hint?: string;
  rows?: number;
  upload?: boolean;
};

type HomepageSection = {
  id: HomepageSectionId;
  label: string;
  summary: string;
  fields: HomepageField[];
  picksProducts?: boolean;
};

const homepageSections: HomepageSection[] = [
  { id: "hero", label: "Hero", summary: "The full-bleed opening frame and the oversized display type that sits on top of it.", fields: [
    { key: "hero_kicker", label: "Kicker" },
    { key: "hero_title", label: "Title / first line" },
    { key: "hero_accent", label: "Accent / second line", hint: "Signal tangerine" },
    { key: "hero_suffix", label: "Title / third line" },
    { key: "hero_description", label: "Description", rows: 3 },
    { key: "hero_image_path", label: "Image URL", upload: true },
    { key: "hero_alt", label: "Image alt text", hint: "For screen readers" },
  ] },
  { id: "drop", label: "Drop", summary: "The heading that introduces the highlighted shop items further down the page, and the items themselves.", picksProducts: true, fields: [
    { key: "drop_label", label: "Label" },
    { key: "drop_title", label: "Title" },
    { key: "drop_accent", label: "Accent", hint: "Signal tangerine" },
    { key: "drop_description", label: "Description", rows: 3 },
  ] },
  { id: "story", label: "Story", summary: "The editorial split panel with the light background and its overlay type.", fields: [
    { key: "story_label", label: "Overlay label" },
    { key: "story_title", label: "Title" },
    { key: "story_accent", label: "Accent", hint: "Signal tangerine" },
    { key: "story_image_path", label: "Image URL", upload: true },
    { key: "story_alt", label: "Image alt text", hint: "For screen readers" },
  ] },
  { id: "journal", label: "Journal", summary: "The “Notes from the bench” heading and the three cards beneath it. The middle card sits lower on purpose.", fields: [
    { key: "journal_label", label: "Label" },
    { key: "journal_title", label: "Title" },
    { key: "journal_accent", label: "Accent", hint: "Signal tangerine" },
    { key: "journal_description", label: "Intro paragraph", rows: 3 },
    { key: "journal_post_one_image_path", label: "Card 1 / image URL", upload: true },
    { key: "journal_post_one_label", label: "Card 1 / heading" },
    { key: "journal_post_one_place", label: "Card 1 / caption" },
    { key: "journal_post_two_image_path", label: "Card 2 / image URL", upload: true },
    { key: "journal_post_two_label", label: "Card 2 / heading" },
    { key: "journal_post_two_place", label: "Card 2 / caption" },
    { key: "journal_post_three_image_path", label: "Card 3 / image URL", upload: true },
    { key: "journal_post_three_label", label: "Card 3 / heading" },
    { key: "journal_post_three_place", label: "Card 3 / caption" },
  ] },
];

const previewDevices = [
  { id: "desktop", label: "Desktop", width: 1440 },
  { id: "laptop", label: "Laptop", width: 1280 },
  { id: "tablet", label: "Tablet", width: 834 },
  { id: "phone", label: "Phone", width: 390 },
];

function HomepageEditor({ initial, products, reload, notify }: { initial: HomepageContent; products: Product[]; reload: () => Promise<void>; notify: () => Promise<void> }) {
  const [content, setContent] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [section, setSection] = useState<HomepageSectionId>("hero");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<string | null>(null);
  const [device, setDevice] = useState(previewDevices[0]);
  const [metrics, setMetrics] = useState<HomepagePreviewMetrics>({ height: 3400, offsets: {} });
  const frameRef = useRef<HTMLIFrameElement>(null);
  const draftRef = useRef(content);
  const { stageRef, scale } = usePreviewScale(device.width);

  const dirty = useMemo(() => (Object.keys(saved) as (keyof HomepageContent)[]).some((key) => saved[key] !== content[key]), [content, saved]);
  const dirtyRef = useRef(false);
  useEffect(() => { dirtyRef.current = dirty; draftRef.current = content; }, [content, dirty]);
  useEffect(() => { if (dirtyRef.current) return; setContent(initial); setSaved(initial); }, [initial]);

  const active = homepageSections.find((item) => item.id === section) ?? homepageSections[0];
  const selectable = useMemo(() => products.filter((product) => !product.archived), [products]);
  const inDrop = selectable.filter((product) => product.featured).length;

  const pushDraft = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage({ type: previewContentMessage, content: draftRef.current }, window.location.origin);
  }, []);

  useEffect(() => { pushDraft(); }, [content, pushDraft]);

  const handlePreviewMessage = useCallback((data: unknown) => {
    const selected = readPreviewSection(data);
    if (selected) { setSection(selected); return; }
    const next = readPreviewMetrics(data);
    if (next) setMetrics(next);
  }, []);

  useEffect(() => {
    const top = metrics.offsets[section];
    if (top === undefined) return;
    stageRef.current?.scrollTo({ top: Math.max(0, top * scale - 12), behavior: "smooth" });
  }, [metrics, scale, section]);

  const update = (key: keyof HomepageContent, value: string) => setContent((current) => ({ ...current, [key]: value }));

  const upload = async (file: File | undefined, key: keyof HomepageContent) => {
    if (!file) return;
    setUploading(true);
    try {
      update(key, await uploadStorefrontAsset(file, "homepage"));
      toast.success("Homepage image uploaded.", { description: "Save the homepage to publish it." });
    } catch (error) {
      toast.error("Could not upload image.", { description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setUploading(false);
    }
  };

  const toggleDropItem = async (product: Product) => {
    setPendingProduct(product.id);
    try {
      await setAdminProductFeatured(product.id, !product.featured);
      await reload();
      await notify();
      frameRef.current?.contentWindow?.postMessage({ type: previewRefreshMessage }, window.location.origin);
    } catch (error) {
      toast.error("Could not update the drop.", { description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setPendingProduct(null);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const next = await saveAdminHomepage(content);
      setSaved(next);
      toast.success("Homepage content saved.");
      await reload();
      await notify();
    } catch (error) {
      toast.error("Could not save homepage.", { description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setSaving(false);
    }
  };

  return <div className="space-y-5">
    <div><p className="text-[10px] font-black uppercase tracking-[.14em] text-[#ff5a36]">Storefront content</p><h1 className="mt-1 font-display text-5xl uppercase text-white">Homepage</h1><p className="mt-3 max-w-lg text-sm leading-6 text-white/45">The frame on the left is the live homepage. Click an outlined section to edit it, or use the tabs on the right. The preview shows unsaved drafts; saving publishes them to the storefront.</p></div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border border-white/15 bg-[#101113] p-3">
          <div className="flex flex-wrap gap-1">{previewDevices.map((item) => <button key={item.id} onClick={() => setDevice(item)} className={`border px-3 py-2 text-[10px] font-black uppercase tracking-[.12em] transition ${device.id === item.id ? "border-[#ff5a36] bg-[#ff5a36] text-black" : "border-white/15 text-white/50 hover:border-white/40 hover:text-white"}`}>{item.label}</button>)}</div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black uppercase tracking-[.14em] text-white/35">{device.width}px / {Math.round(scale * 100)}%</span>
            <a href="/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 border border-white/15 px-3 py-2 text-[10px] font-black uppercase tracking-[.12em] text-white/60 transition hover:border-[#ff5a36] hover:text-[#ff5a36]">Live page <ExternalLink size={13} /></a>
          </div>
        </div>
        <PreviewStage src={homepagePreviewPath} title="Homepage preview" designWidth={device.width} height={metrics.height} scale={scale} stageRef={stageRef} frameRef={frameRef} readyType={previewReadyMessage} onMessage={handlePreviewMessage} onReady={pushDraft} />
        <p className="text-[10px] leading-4 text-white/35">Outlined sections are editable. Dashed outlines and “fixed section” tags are built into the storefront code.</p>
      </div>
      <div className="min-w-0 self-start border border-white/15 bg-[#111214]">
        <div className="flex border-b border-white/15">{homepageSections.map((item) => <button key={item.id} onClick={() => setSection(item.id)} className={`flex-1 border-r border-white/15 px-2 py-3 text-[10px] font-black uppercase tracking-[.12em] transition last:border-r-0 ${section === item.id ? "bg-[#ff5a36] text-black" : "text-white/50 hover:text-white"}`}>{item.label}</button>)}</div>
        <div className="p-5">
          <p className="text-xs leading-5 text-white/45">{active.summary}</p>
          {active.picksProducts ? <div className="mt-5 border-t border-white/10 pt-5">
            <div className="flex items-baseline justify-between gap-3"><p className="text-[10px] font-black uppercase tracking-[.14em] text-white/45">Shop items in this section</p><span className={`text-[10px] font-black uppercase tracking-[.14em] ${inDrop === 0 ? "text-[#ff5a36]" : "text-white/30"}`}>{inDrop} selected</span></div>
            <div className="mt-3 divide-y divide-white/10 border-y border-white/10">{selectable.map((product) => { const on = Boolean(product.featured); return <button key={product.id} onClick={() => void toggleDropItem(product)} disabled={pendingProduct !== null} className="flex w-full items-center gap-3 py-2.5 text-left transition hover:bg-white/[.03] disabled:opacity-50">
              <span className={`grid size-4 shrink-0 place-items-center border ${on ? "border-[#ff5a36] bg-[#ff5a36] text-black" : "border-white/30 text-transparent"}`}><Check size={12} strokeWidth={3} /></span>
              <span className="min-w-0 flex-1"><span className={`block truncate text-sm font-bold ${on ? "text-white" : "text-white/60"}`}>{product.name}</span><span className="mt-0.5 block truncate text-[10px] font-bold uppercase tracking-[.14em] text-white/30">{product.category}</span></span>
              {pendingProduct === product.id ? <span className="shrink-0 text-[10px] font-black uppercase tracking-[.14em] text-[#ff5a36]">Saving</span> : <span className="shrink-0 text-xs font-bold text-white/45">₱{product.price.toLocaleString("en-PH")}</span>}
            </button>; })}</div>
            <p className="mt-3 text-[10px] leading-4 text-white/35">Ticks save straight to the catalog and show up in the preview at once, no need to save the homepage. The grid runs four across, so a fifth item wraps onto a new row. Archived items are hidden.</p>
          </div> : null}
          <div className="mt-5 grid gap-4">{active.fields.map((field) => <label key={field.key} className={labelClass}>
            <span className="flex items-baseline justify-between gap-3">{field.label}{field.hint ? <span className="text-[9px] font-bold normal-case tracking-normal text-white/25">{field.hint}</span> : null}</span>
            {field.rows ? <textarea rows={field.rows} value={content[field.key]} onChange={(event) => update(field.key, event.target.value)} className={`${inputClass} py-3`} /> : <input value={content[field.key]} onChange={(event) => update(field.key, event.target.value)} className={inputClass} />}
            {field.upload ? <input type="file" accept="image/*" disabled={uploading} onChange={(event) => void upload(event.target.files?.[0], field.key)} className="h-auto cursor-pointer border border-dashed border-white/20 bg-transparent px-3 py-2 text-[10px] font-black uppercase tracking-[.12em] text-white/50 file:mr-3 file:border-0 file:bg-[#ff5a36] file:px-3 file:py-2 file:text-[10px] file:font-black file:uppercase file:tracking-[.14em] file:text-black hover:border-white/40" /> : null}
          </label>)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-white/15 p-4">
          <button onClick={save} disabled={saving || !dirty} className="inline-flex h-10 items-center gap-2 bg-[#ff5a36] px-5 text-[10px] font-black uppercase tracking-[.14em] text-black disabled:opacity-40">{saving ? "Saving..." : <><Save size={14} />Save homepage</>}</button>
          <button onClick={() => setContent(saved)} disabled={!dirty || saving} className="inline-flex h-10 items-center gap-2 border border-white/20 px-4 text-[10px] font-black uppercase tracking-[.14em] text-white/60 transition hover:border-white/50 hover:text-white disabled:opacity-40"><Undo2 size={14} />Revert</button>
          <span className={`ml-auto inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] ${dirty ? "text-[#ff5a36]" : "text-white/30"}`}>{dirty ? "Unsaved changes" : "Live on storefront"}</span>
        </div>
      </div>
    </div>
  </div>;
}

function RoleManager({ profiles, reload }: { profiles: AdminProfile[]; reload: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AccountRole>("staff");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await setAdminProfileRole(email, role);
      toast.success("Role updated.");
      setEmail("");
      await reload();
    } catch (error) {
      toast.error("Could not update role.", { description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setSaving(false);
    }
  };
  return <div className="space-y-5"><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-[#ff5a36]">Access control</p><h1 className="mt-1 font-display text-5xl uppercase text-white">Roles</h1><p className="mt-3 max-w-lg text-sm leading-6 text-white/45">Enter the exact email of a signed-in user. The server verifies the account and protects the last administrator.</p></div><div className="grid gap-3 border border-white/15 bg-[#111214] p-5 sm:grid-cols-[1fr_180px_auto] sm:items-end"><label className={labelClass}>User email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} placeholder="rider@example.com" /></label><label className={labelClass}>Role<select value={role} onChange={(event) => setRole(event.target.value as AccountRole)} className={inputClass}>{(["customer", "staff", "admin"] as AccountRole[]).map((value) => <option key={value} value={value} className="bg-[#111214]">{value}</option>)}</select></label><button onClick={save} disabled={saving || !email.trim()} className="h-10 bg-[#ff5a36] px-5 text-[10px] font-black uppercase tracking-[.14em] text-black disabled:opacity-50">{saving ? "Saving..." : "Update role"}</button></div><div className="divide-y divide-white/10 border-y border-white/10">{profiles.map((profile) => <div key={profile.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-white">{profile.full_name || "Unnamed rider"}</p><p className="mt-1 text-xs text-white/40">{profile.email || "No email"}</p></div><span className="w-fit border border-white/20 px-3 py-2 text-[10px] font-black uppercase tracking-[.14em] text-[#ff5a36]">{profile.role}</span></div>)}</div></div>;
}

export default function Admin() {
  const { user, profile, loading, isConfigured } = useAuth();
  const { refresh: refreshCatalog } = useCatalog();
  const [section, setSection] = useState<Section>("overview");
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [homepage, setHomepage] = useState<HomepageContent>(defaultHomepageContent);
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isConfigured) return;
    setLoadingData(true);
    const results = await Promise.allSettled([fetchAdminOrders(), fetchAdminProducts(), fetchAdminHomepage(), fetchAdminProfiles()]);
    const [ordersResult, productsResult, homepageResult, profilesResult] = results;
    if (ordersResult.status === "fulfilled") setOrders(ordersResult.value);
    if (productsResult.status === "fulfilled") setProducts(productsResult.value);
    if (homepageResult.status === "fulfilled") setHomepage(homepageResult.value);
    if (profilesResult.status === "fulfilled") setProfiles(profilesResult.value);
    const failed = results.find((result) => result.status === "rejected");
    setDataError(failed?.status === "rejected" ? failed.reason instanceof Error ? failed.reason.message : "Could not load administration data." : null);
    setLoadingData(false);
  }, [isConfigured]);

  useEffect(() => {
    if (profile?.role === "admin") void load();
  }, [load, profile?.role]);

  const counts = useMemo(() => ({ open: orders.filter((order) => order.status === "pending_payment" || order.status === "payment_submitted").length, fulfillment: orders.filter((order) => ["paid", "processing", "shipped"].includes(order.status)).length, published: products.filter((product) => !product.archived).length }), [orders, products]);

  if (loading) return <section className="flex min-h-screen items-center justify-center bg-[#0c0d0e] pt-[68px] text-sm text-white/50">Loading administration...</section>;
  if (!user || profile?.role !== "admin") return <section className="flex min-h-screen items-end bg-[#0c0d0e] px-4 pb-16 pt-28 sm:px-6 lg:px-9"><div><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.16em] text-[#ff5a36]"><ShieldCheck size={14} />Restricted area</p><h1 className="mt-5 font-display text-7xl uppercase leading-[.72] text-white">Admin<br />access.</h1><p className="mt-5 max-w-sm text-sm leading-6 text-white/45">Sign in with an account assigned the administrator role.</p><Link href="/account" className="mt-7 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[.16em] text-[#ff5a36]"><ArrowLeft size={14} />Back to account</Link></div></section>;

  return <section className="min-h-screen bg-[#0c0d0e] pt-[68px]"><div className="border-b border-white/15 bg-[#101113] px-4 py-10 sm:px-6 lg:px-9"><div className="mx-auto flex max-w-[1440px] flex-col justify-between gap-6 lg:flex-row lg:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#ff5a36]">Underrated control room</p><h1 className="mt-3 font-display text-6xl uppercase leading-[.75] tracking-[-.05em] text-white sm:text-8xl">Store<br /><em className="text-[#ff5a36]">admin.</em></h1></div><div className="flex items-center gap-3 border border-white/15 px-4 py-3"><ShieldCheck size={16} className="text-[#ff5a36]" /><div><p className="text-xs font-bold text-white">{profile.full_name || user.email}</p><p className="mt-1 text-[10px] font-black uppercase tracking-[.14em] text-white/40">Administrator</p></div></div></div></div><div className="mx-auto grid max-w-[1440px] gap-6 px-4 py-7 sm:px-6 lg:grid-cols-[220px_1fr] lg:px-9"><aside className="flex gap-2 overflow-x-auto lg:block lg:space-y-1">{navigation.map((item) => <button key={item.id} onClick={() => setSection(item.id)} className={`flex shrink-0 items-center gap-3 border px-3 py-3 text-left text-[10px] font-black uppercase tracking-[.14em] transition lg:w-full ${section === item.id ? "border-[#ff5a36] bg-[#ff5a36] text-black" : "border-white/10 text-white/50 hover:border-white/30 hover:text-white"}`}><item.icon size={15} />{item.label}</button>)}</aside><main className="min-w-0">{dataError ? <p className="mb-5 border border-[#ff5a36]/30 bg-[#ff5a36]/5 p-4 text-sm text-[#ff5a36]">{dataError}. Apply the latest Supabase migrations before using administration.</p> : null}{loadingData ? <p className="mb-5 text-sm text-white/45">Refreshing administration data...</p> : null}{section === "overview" ? <div className="space-y-6"><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-[#ff5a36]">At a glance</p><h2 className="mt-1 font-display text-5xl uppercase text-white">Control room</h2></div><div className="grid gap-4 sm:grid-cols-3"><div className="border border-white/15 bg-[#111214] p-5"><p className="text-[10px] font-black uppercase tracking-[.14em] text-white/40">Payment review</p><p className="mt-3 font-display text-6xl text-white">{counts.open.toString().padStart(2, "0")}</p><p className="mt-2 text-xs text-white/40">orders waiting</p></div><div className="border border-white/15 bg-[#111214] p-5"><p className="text-[10px] font-black uppercase tracking-[.14em] text-white/40">Fulfillment</p><p className="mt-3 font-display text-6xl text-white">{counts.fulfillment.toString().padStart(2, "0")}</p><p className="mt-2 text-xs text-white/40">active orders</p></div><div className="border border-white/15 bg-[#111214] p-5"><p className="text-[10px] font-black uppercase tracking-[.14em] text-white/40">Published catalog</p><p className="mt-3 font-display text-6xl text-white">{counts.published.toString().padStart(2, "0")}</p><p className="mt-2 text-xs text-white/40">live items</p></div></div><div className="border border-white/15 bg-[#111214] p-5"><p className="text-[10px] font-black uppercase tracking-[.14em] text-white/40">Quick actions</p><div className="mt-4 flex flex-wrap gap-3"><button onClick={() => setSection("orders")} className="border border-white/20 px-4 py-3 text-[10px] font-black uppercase tracking-[.14em] text-white/70 hover:border-[#ff5a36] hover:text-[#ff5a36]">Review orders</button><button onClick={() => setSection("products")} className="border border-white/20 px-4 py-3 text-[10px] font-black uppercase tracking-[.14em] text-white/70 hover:border-[#ff5a36] hover:text-[#ff5a36]">Manage shop</button><button onClick={() => setSection("homepage")} className="border border-white/20 px-4 py-3 text-[10px] font-black uppercase tracking-[.14em] text-white/70 hover:border-[#ff5a36] hover:text-[#ff5a36]">Edit homepage</button></div></div></div> : null}{section === "orders" ? <div className="space-y-5"><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-[#ff5a36]">Fulfillment desk</p><h1 className="mt-1 font-display text-5xl uppercase text-white">Orders</h1><p className="mt-3 text-sm text-white/45">Approve submitted payments, then move paid orders through processing, shipping, and delivery.</p></div>{orders.length ? <div className="space-y-4">{orders.map((order) => <OrderCard key={order.id} order={order} onUpdated={load} />)}</div> : <p className="border-y border-white/10 py-10 text-sm text-white/45">No orders yet.</p>}</div> : null}{section === "products" ? <ProductManager products={products} reload={load} notify={refreshCatalog} /> : null}{section === "homepage" ? <HomepageEditor initial={homepage} products={products} reload={load} notify={refreshCatalog} /> : null}{section === "roles" ? <RoleManager profiles={profiles} reload={load} /> : null}</main></div></section>;
}
