import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Archive, ArrowLeft, Check, ImagePlus, LayoutDashboard, Package, Save, ShieldCheck, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth, type AccountRole } from "@/contexts/AuthContext";
import { useCatalog } from "@/contexts/CatalogContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { Product, ProductVisual } from "@/data/products";
import { defaultHomepageContent, type HomepageContent } from "@/data/storefront";
import { formatDeliveryAddress } from "@/lib/deliveryAddress";
import { fetchAdminHomepage, fetchAdminOrders, fetchAdminProducts, fetchAdminProfiles, saveAdminHomepage, saveAdminProduct, setAdminProductArchived, setAdminProfileRole, updateAdminOrderStatus, uploadStorefrontAsset, type AdminOrder, type AdminOrderStatus, type AdminProfile } from "@/lib/admin";

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

function ProductEditor({ product, onSaved, onCancel }: { product: Product; onSaved: () => Promise<void>; onCancel: () => void }) {
  const [draft, setDraft] = useState(product);
  const [specText, setSpecText] = useState(product.specs.map((item) => `${item.label}: ${item.value}`).join("\n"));
  const [fitmentText, setFitmentText] = useState(product.fitment.compatibility.join("\n"));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const update = <K extends keyof Product>(key: K, value: Product[K]) => setDraft((current) => ({ ...current, [key]: value }));

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
      const specs = specText.split("\n").flatMap((line) => {
        const separator = line.indexOf(":");
        if (separator < 1) return [];
        const label = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();
        return label && value ? [{ label, value }] : [];
      });
      await saveAdminProduct({ ...draft, slug, finishes: cleanFinishes, specs, fitment: { ...draft.fitment, compatibility: fitmentText.split("\n").map((line) => line.trim()).filter(Boolean) } });
      toast.success("Shop item saved.");
      await onSaved();
    } catch (error) {
      toast.error("Could not save shop item.", { description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      update("image", await uploadStorefrontAsset(file, "products"));
      toast.success("Image uploaded.");
    } catch (error) {
      toast.error("Could not upload image.", { description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setUploading(false);
    }
  };

  return <div className="border border-white/15 bg-[#111214] p-5"><div className="flex items-center justify-between border-b border-white/10 pb-4"><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-[#ff5a36]">Catalog editor</p><h2 className="mt-1 font-display text-3xl uppercase text-white">{draft.name || "New shop item"}</h2></div><button onClick={onCancel} className="text-[10px] font-black uppercase tracking-[.14em] text-white/45 hover:text-white">Close</button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className={labelClass}>Name<input value={draft.name} onChange={(event) => update("name", event.target.value)} className={inputClass} /></label><label className={labelClass}>Slug<input value={draft.slug} onChange={(event) => update("slug", event.target.value)} className={inputClass} placeholder="product-slug" /></label><label className={labelClass}>Category<input value={draft.category} onChange={(event) => update("category", event.target.value)} className={inputClass} /></label><label className={labelClass}>Price in PHP<input type="number" min="0" step="1" value={draft.price} onChange={(event) => update("price", Number(event.target.value))} className={inputClass} /></label><label className={labelClass}>Badge<input value={draft.badge ?? ""} onChange={(event) => update("badge", event.target.value)} className={inputClass} placeholder="Optional" /></label><label className={labelClass}>Visual<select value={draft.visual} onChange={(event) => update("visual", event.target.value as ProductVisual)} className={inputClass}>{(["hoods", "valve", "saddle", "tape", "stem", "stand"] as ProductVisual[]).map((value) => <option key={value} value={value} className="bg-[#111214]">{value}</option>)}</select></label><label className={`${labelClass} sm:col-span-2`}>Descriptor<input value={draft.descriptor} onChange={(event) => update("descriptor", event.target.value)} className={inputClass} /></label><label className={`${labelClass} sm:col-span-2`}>Description<textarea value={draft.description} onChange={(event) => update("description", event.target.value)} className={`${inputClass} min-h-24 py-3`} /></label><label className={labelClass}>Finishes, comma separated<input value={draft.finishes.join(", ")} onChange={(event) => update("finishes", event.target.value.split(",").map((value) => value.trim()).filter(Boolean))} className={inputClass} /></label><label className={labelClass}>Image URL or upload<input value={draft.image ?? ""} onChange={(event) => update("image", event.target.value)} className={inputClass} placeholder="/path/image.jpg" /><span className="mt-1 flex items-center gap-2 text-[10px] normal-case tracking-normal text-white/35"><Upload size={12} />{uploading ? "Uploading..." : "Use a Supabase asset URL or upload below"}</span></label><label className={`${labelClass} sm:col-span-2`}>Upload image<input type="file" accept="image/*" onChange={(event) => void upload(event.target.files?.[0])} className="file:mr-3 file:rounded-none file:border-0 file:bg-[#ff5a36] file:px-3 file:py-2 file:text-[10px] file:font-black file:uppercase file:text-black" /></label><label className={`${labelClass} sm:col-span-2`}>Specs, one per line<input value={specText} onChange={(event) => setSpecText(event.target.value)} className={`${inputClass} min-h-24 py-3`} placeholder="Fit: Road STI" /></label><label className={`${labelClass} sm:col-span-2`}>Fitment compatibility, one per line<textarea value={fitmentText} onChange={(event) => setFitmentText(event.target.value)} className={`${inputClass} min-h-24 py-3`} /></label><label className={`${labelClass} sm:col-span-2`}>Fitment headline<input value={draft.fitment.headline} onChange={(event) => update("fitment", { ...draft.fitment, headline: event.target.value })} className={inputClass} /></label><label className={`${labelClass} sm:col-span-2`}>Before you ride<input value={draft.fitment.checkBeforeRide} onChange={(event) => update("fitment", { ...draft.fitment, checkBeforeRide: event.target.value })} className={inputClass} /></label></div><div className="mt-5 flex flex-wrap items-center gap-5 border-t border-white/10 pt-5"><label className="flex items-center gap-2 text-xs text-white/65"><input type="checkbox" checked={Boolean(draft.featured)} onChange={(event) => update("featured", event.target.checked)} />Featured in the drop</label><label className="flex items-center gap-2 text-xs text-white/65"><input type="checkbox" checked={Boolean(draft.archived)} onChange={(event) => update("archived", event.target.checked)} />Archived</label><button onClick={save} disabled={saving || !draft.name.trim()} className="ml-auto inline-flex h-10 items-center gap-2 bg-[#ff5a36] px-5 text-[10px] font-black uppercase tracking-[.14em] text-black disabled:opacity-50">{saving ? "Saving..." : <><Save size={14} />Save item</>}</button></div></div>;
}

function ProductManager({ products, reload, notify }: { products: Product[]; reload: () => Promise<void>; notify: () => Promise<void> }) {
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

function HomepageEditor({ initial, reload, notify }: { initial: HomepageContent; reload: () => Promise<void>; notify: () => Promise<void> }) {
  const [content, setContent] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => setContent(initial), [initial]);
  const update = (key: keyof HomepageContent, value: string) => setContent((current) => ({ ...current, [key]: value }));
  const upload = async (file: File | undefined, key: "hero_image_path" | "story_image_path") => {
    if (!file) return;
    setUploading(true);
    try {
      update(key, await uploadStorefrontAsset(file, "homepage"));
      toast.success("Homepage image uploaded.");
    } catch (error) {
      toast.error("Could not upload image.", { description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setUploading(false);
    }
  };
  const save = async () => {
    setSaving(true);
    try {
      await saveAdminHomepage(content);
      toast.success("Homepage content saved.");
      await reload();
      await notify();
    } catch (error) {
      toast.error("Could not save homepage.", { description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setSaving(false);
    }
  };
  return <div className="space-y-5"><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-[#ff5a36]">Storefront content</p><h1 className="mt-1 font-display text-5xl uppercase text-white">Homepage</h1><p className="mt-3 max-w-lg text-sm leading-6 text-white/45">Edit the hero campaign, drop introduction, and the main editorial image without changing the storefront code.</p></div><div className="grid gap-4 sm:grid-cols-2"><label className={labelClass}>Hero image URL<input value={content.hero_image_path} onChange={(event) => update("hero_image_path", event.target.value)} className={inputClass} /></label><label className={labelClass}>Hero image alt<input value={content.hero_alt} onChange={(event) => update("hero_alt", event.target.value)} className={inputClass} /></label><label className={labelClass}>Hero kicker<input value={content.hero_kicker} onChange={(event) => update("hero_kicker", event.target.value)} className={inputClass} /></label><label className={labelClass}>Hero title<input value={content.hero_title} onChange={(event) => update("hero_title", event.target.value)} className={inputClass} /></label><label className={labelClass}>Hero accent<input value={content.hero_accent} onChange={(event) => update("hero_accent", event.target.value)} className={inputClass} /></label><label className={labelClass}>Hero suffix<input value={content.hero_suffix} onChange={(event) => update("hero_suffix", event.target.value)} className={inputClass} /></label><label className={`${labelClass} sm:col-span-2`}>Hero description<textarea value={content.hero_description} onChange={(event) => update("hero_description", event.target.value)} className={`${inputClass} min-h-24 py-3`} /></label><label className={`${labelClass} sm:col-span-2`}>Upload hero image<input type="file" accept="image/*" onChange={(event) => void upload(event.target.files?.[0], "hero_image_path")} className="file:mr-3 file:rounded-none file:border-0 file:bg-[#ff5a36] file:px-3 file:py-2 file:text-[10px] file:font-black file:uppercase file:text-black" />{uploading ? <span className="mt-1 text-[10px] normal-case tracking-normal text-white/35">Uploading...</span> : null}</label><label className={labelClass}>Drop label<input value={content.drop_label} onChange={(event) => update("drop_label", event.target.value)} className={inputClass} /></label><label className={labelClass}>Drop title<input value={content.drop_title} onChange={(event) => update("drop_title", event.target.value)} className={inputClass} /></label><label className={labelClass}>Drop accent<input value={content.drop_accent} onChange={(event) => update("drop_accent", event.target.value)} className={inputClass} /></label><label className={`${labelClass} sm:col-span-2`}>Drop description<textarea value={content.drop_description} onChange={(event) => update("drop_description", event.target.value)} className={`${inputClass} min-h-20 py-3`} /></label><label className={labelClass}>Story image URL<input value={content.story_image_path} onChange={(event) => update("story_image_path", event.target.value)} className={inputClass} /></label><label className={labelClass}>Story image alt<input value={content.story_alt} onChange={(event) => update("story_alt", event.target.value)} className={inputClass} /></label><label className={labelClass}>Story label<input value={content.story_label} onChange={(event) => update("story_label", event.target.value)} className={inputClass} /></label><label className={labelClass}>Story title<input value={content.story_title} onChange={(event) => update("story_title", event.target.value)} className={inputClass} /></label><label className={labelClass}>Story accent<input value={content.story_accent} onChange={(event) => update("story_accent", event.target.value)} className={inputClass} /></label><label className={`${labelClass} sm:col-span-2`}>Upload story image<input type="file" accept="image/*" onChange={(event) => void upload(event.target.files?.[0], "story_image_path")} className="file:mr-3 file:rounded-none file:border-0 file:bg-[#ff5a36] file:px-3 file:py-2 file:text-[10px] file:font-black file:uppercase file:text-black" /></label></div><button onClick={save} disabled={saving} className="inline-flex h-11 items-center gap-2 bg-[#ff5a36] px-5 text-[10px] font-black uppercase tracking-[.14em] text-black disabled:opacity-50">{saving ? "Saving..." : <><Save size={14} />Save homepage</>}</button></div>;
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

  return <section className="min-h-screen bg-[#0c0d0e] pt-[68px]"><div className="border-b border-white/15 bg-[#101113] px-4 py-10 sm:px-6 lg:px-9"><div className="mx-auto flex max-w-[1440px] flex-col justify-between gap-6 lg:flex-row lg:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#ff5a36]">Underrated control room</p><h1 className="mt-3 font-display text-6xl uppercase leading-[.75] tracking-[-.05em] text-white sm:text-8xl">Store<br /><em className="text-[#ff5a36]">admin.</em></h1></div><div className="flex items-center gap-3 border border-white/15 px-4 py-3"><ShieldCheck size={16} className="text-[#ff5a36]" /><div><p className="text-xs font-bold text-white">{profile.full_name || user.email}</p><p className="mt-1 text-[10px] font-black uppercase tracking-[.14em] text-white/40">Administrator</p></div></div></div></div><div className="mx-auto grid max-w-[1440px] gap-6 px-4 py-7 sm:px-6 lg:grid-cols-[220px_1fr] lg:px-9"><aside className="flex gap-2 overflow-x-auto lg:block lg:space-y-1">{navigation.map((item) => <button key={item.id} onClick={() => setSection(item.id)} className={`flex shrink-0 items-center gap-3 border px-3 py-3 text-left text-[10px] font-black uppercase tracking-[.14em] transition lg:w-full ${section === item.id ? "border-[#ff5a36] bg-[#ff5a36] text-black" : "border-white/10 text-white/50 hover:border-white/30 hover:text-white"}`}><item.icon size={15} />{item.label}</button>)}</aside><main className="min-w-0">{dataError ? <p className="mb-5 border border-[#ff5a36]/30 bg-[#ff5a36]/5 p-4 text-sm text-[#ff5a36]">{dataError}. Apply the latest Supabase migrations before using administration.</p> : null}{loadingData ? <p className="mb-5 text-sm text-white/45">Refreshing administration data...</p> : null}{section === "overview" ? <div className="space-y-6"><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-[#ff5a36]">At a glance</p><h2 className="mt-1 font-display text-5xl uppercase text-white">Control room</h2></div><div className="grid gap-4 sm:grid-cols-3"><div className="border border-white/15 bg-[#111214] p-5"><p className="text-[10px] font-black uppercase tracking-[.14em] text-white/40">Payment review</p><p className="mt-3 font-display text-6xl text-white">{counts.open.toString().padStart(2, "0")}</p><p className="mt-2 text-xs text-white/40">orders waiting</p></div><div className="border border-white/15 bg-[#111214] p-5"><p className="text-[10px] font-black uppercase tracking-[.14em] text-white/40">Fulfillment</p><p className="mt-3 font-display text-6xl text-white">{counts.fulfillment.toString().padStart(2, "0")}</p><p className="mt-2 text-xs text-white/40">active orders</p></div><div className="border border-white/15 bg-[#111214] p-5"><p className="text-[10px] font-black uppercase tracking-[.14em] text-white/40">Published catalog</p><p className="mt-3 font-display text-6xl text-white">{counts.published.toString().padStart(2, "0")}</p><p className="mt-2 text-xs text-white/40">live items</p></div></div><div className="border border-white/15 bg-[#111214] p-5"><p className="text-[10px] font-black uppercase tracking-[.14em] text-white/40">Quick actions</p><div className="mt-4 flex flex-wrap gap-3"><button onClick={() => setSection("orders")} className="border border-white/20 px-4 py-3 text-[10px] font-black uppercase tracking-[.14em] text-white/70 hover:border-[#ff5a36] hover:text-[#ff5a36]">Review orders</button><button onClick={() => setSection("products")} className="border border-white/20 px-4 py-3 text-[10px] font-black uppercase tracking-[.14em] text-white/70 hover:border-[#ff5a36] hover:text-[#ff5a36]">Manage shop</button><button onClick={() => setSection("homepage")} className="border border-white/20 px-4 py-3 text-[10px] font-black uppercase tracking-[.14em] text-white/70 hover:border-[#ff5a36] hover:text-[#ff5a36]">Edit homepage</button></div></div></div> : null}{section === "orders" ? <div className="space-y-5"><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-[#ff5a36]">Fulfillment desk</p><h1 className="mt-1 font-display text-5xl uppercase text-white">Orders</h1><p className="mt-3 text-sm text-white/45">Approve submitted payments, then move paid orders through processing, shipping, and delivery.</p></div>{orders.length ? <div className="space-y-4">{orders.map((order) => <OrderCard key={order.id} order={order} onUpdated={load} />)}</div> : <p className="border-y border-white/10 py-10 text-sm text-white/45">No orders yet.</p>}</div> : null}{section === "products" ? <ProductManager products={products} reload={load} notify={refreshCatalog} /> : null}{section === "homepage" ? <HomepageEditor initial={homepage} reload={load} notify={refreshCatalog} /> : null}{section === "roles" ? <RoleManager profiles={profiles} reload={load} /> : null}</main></div></section>;
}
