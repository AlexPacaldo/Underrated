import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Archive,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GripVertical,
  ImagePlus,
  LayoutDashboard,
  LogOut,
  Package,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Tags,
  Trash2,
  Undo2,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import PreviewStage from "@/components/admin/PreviewStage";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import OrderTimeline from "@/components/account/OrderTimeline";
import "./Admin.css";
import ProductVisual from "@/components/ProductVisual";
import { usePreviewScale } from "@/components/admin/usePreviewScale";
import { useAuth, type AccountRole } from "@/contexts/AuthContext";
import { useCatalog } from "@/contexts/CatalogContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { productImagePositions, productImageFrameRatio, formatProductImagePosition, productImagePositionCoordinates } from "@/data/products";
import type {
  CatalogCategory,
  Product,
  ProductImageFrame,
} from "@/data/products";
import {
  defaultHomepageContent,
  type HomepageContent,
  type HomepageSectionId,
} from "@/data/storefront";
import { formatDeliveryAddress } from "@/lib/deliveryAddress";
import { paymentMethodLabels } from "@/lib/accountOrders";
import {
  buildOrderTimeline,
  countOrdersByFilter,
  orderFilters,
  orderMatchesFilter,
  orderStatusLabels,
  orderStatusShortLabels,
  type OrderFilter,
} from "@/lib/orderStatus";
import {
  homepagePreviewPath,
  previewContentMessage,
  previewReadyMessage,
  previewRefreshMessage,
  readPreviewMetrics,
  readPreviewSection,
  type HomepagePreviewMetrics,
} from "@/lib/homepagePreview";
import {
  productPreviewFields,
  productPreviewPath,
  productPreviewProductMessage,
  productPreviewReadyMessage,
  productPreviewViewMessage,
  readPreviewField,
  readPreviewProductHeight,
  type ProductPreviewField,
  type ProductPreviewView,
} from "@/lib/productPreview";
import {
  deleteAdminCategory,
  deleteAdminProduct,
  fetchAdminCategories,
  fetchAdminHomepage,
  fetchAdminOrders,
  fetchAdminProducts,
  fetchAdminProfiles,
  moveAdminCategory,
  saveAdminCategory,
  saveAdminHomepage,
  saveAdminProduct,
  setAdminProductArchived,
  setAdminProductFeatured,
  setAdminProfileRole,
  updateAdminOrderStatus,
  uploadStorefrontAsset,
  type AdminOrder,
  type AdminOrderStatus,
  type AdminProfile,
} from "@/lib/admin";

type Section =
  | "overview"
  | "orders"
  | "products"
  | "categories"
  | "homepage"
  | "roles";

const navigation = [
  { id: "overview" as const, label: "Overview", icon: LayoutDashboard },
  { id: "orders" as const, label: "Orders", icon: Package },
  { id: "products" as const, label: "Shop items", icon: Archive },
  { id: "categories" as const, label: "Categories", icon: Tags },
  { id: "homepage" as const, label: "Homepage", icon: ImagePlus },
  { id: "roles" as const, label: "Team access", icon: Users },
];

const nextStatuses: Partial<Record<AdminOrderStatus, AdminOrderStatus[]>> = {
  pending_payment: ["cancelled"],
  payment_submitted: ["paid", "rejected", "cancelled"],
  paid: ["processing", "shipped", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  // A returned parcel goes back to processing so a replacement can be booked.
  // Catching it remains available from the general rule in the database.
  returned: ["processing", "cancelled"],
};

const inputClass =
  "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#ff5a36]";
const labelClass =
  "grid gap-2 text-xs font-semibold tracking-normal text-slate-600";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function StatusBadge({ status }: { status: AdminOrderStatus }) {
  return (
    <span className="inline-flex border border-[#ff5a36]/35 px-2 py-1 text-[10px] font-black uppercase tracking-[.12em] text-[#ff5a36]">
      {orderStatusShortLabels[status]}
    </span>
  );
}

function OrderCard({
  order,
  customer,
  onUpdated,
}: {
  order: AdminOrder;
  customer?: AdminProfile;
  onUpdated: () => Promise<void>;
}) {
  const { formatMoney } = useCurrency();
  const available = nextStatuses[order.status] ?? [];
  const statusOptions = available.includes(order.status)
    ? available
    : [order.status, ...available];
  const [status, setStatus] = useState<AdminOrderStatus>(order.status);
  const [trackingNumber, setTrackingNumber] = useState(
    order.tracking_number ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const paymentSubmissions = [...order.manual_payment_submissions].sort(
    (first, second) =>
      new Date(first.created_at).getTime() - new Date(second.created_at).getTime()
  );
  const latestPaymentSubmission = paymentSubmissions.at(-1);

  useEffect(() => {
    setStatus(order.status);
    setTrackingNumber(order.tracking_number ?? "");
  }, [
    order.id,
    order.status,
    order.tracking_number,
  ]);

  // The rider reads the same rail on the order page, so the desk shows exactly
  // what they will see after a status change is saved.
  const timeline = buildOrderTimeline({
    status: order.status,
    createdAt: order.created_at,
    paidAt: order.paid_at,
    shippedAt: order.shipped_at,
    deliveredAt: order.delivered_at,
    rejectedAt: order.rejected_at,
    trackingNumber: order.tracking_number,
  });

  const save = async () => {
    setSaving(true);
    try {
      await updateAdminOrderStatus(
        order.id,
        status,
        trackingNumber
      );
      toast.success("Order updated", {
        description:
          status === order.status
            ? `${order.order_number} details saved.`
            : `${order.order_number} is now ${orderStatusLabels[status].toLowerCase()}.`,
      });
      await onUpdated();
    } catch (error) {
      toast.error("Could not update order.", {
        description: error instanceof Error ? error.message : "Try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="overflow-hidden rounded-lg border border-white/15 bg-[#111214]">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(value => !value)}
        className="grid w-full gap-3 p-4 text-left transition hover:bg-white/[.025] sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_auto_auto_auto] sm:items-center sm:gap-5 sm:px-5"
      >
        <div className="flex min-w-0 items-center gap-3">
          <ChevronDown
            size={16}
            className={`shrink-0 text-white/35 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
          <div className="min-w-0">
            <p className="truncate font-display text-xl uppercase leading-none text-white">
              {order.order_number}
            </p>
            <p className="mt-1.5 truncate text-xs text-white/45">
              {customer?.full_name || "Unknown rider"} · {formatDate(order.created_at)}
            </p>
          </div>
        </div>
        {order.status === "payment_submitted" && latestPaymentSubmission ? (
          <div className="min-w-0 pl-[28px] sm:pl-0">
            <p className="text-[9px] font-black uppercase tracking-[.14em] text-[#ff9a79]">Verify payment reference</p>
            <p className="mt-1 truncate font-mono text-sm font-bold tracking-wide text-white">
              {latestPaymentSubmission.reference_number}
            </p>
          </div>
        ) : (
          <p className="truncate pl-[28px] text-xs text-white/55 sm:pl-0">
            {order.order_items.length} {order.order_items.length === 1 ? "item" : "items"}
            {order.order_items[0] ? ` · ${order.order_items[0].product_name}` : ""}
            {order.order_items.length > 1 ? ` +${order.order_items.length - 1} more` : ""}
          </p>
        )}
        <div className="flex items-center justify-between pl-[28px] sm:block sm:pl-0 sm:text-right">
          <StatusBadge status={order.status} />
        </div>
        <div className="flex items-center justify-between pl-[28px] sm:block sm:pl-0 sm:text-right">
          <span className="text-[10px] font-bold uppercase tracking-[.12em] text-white/35 sm:hidden">Total</span>
          <div>
            <p className="text-sm font-bold tabular-nums text-white">
              {formatMoney(
                order.total_cents / 100,
                order.display_currency,
                order.fx_rate
              )}
            </p>
            <p className="mt-0.5 text-[10px] text-white/40">
              Base {formatMoney(order.total_cents / 100, "PHP", 1)}
            </p>
          </div>
        </div>
        <span className="hidden text-[10px] font-bold uppercase tracking-[.12em] text-white/30 sm:block">
          {expanded ? "Close" : "Details"}
        </span>
      </button>

      {expanded ? (
      <div className="border-t border-white/10">
      {paymentSubmissions.length > 0 ? (
        <section className={`mx-4 mt-4 rounded-lg border p-4 sm:mx-5 sm:p-5 ${order.status === "payment_submitted" ? "border-[#ff5a36]/60 bg-[#ff5a36]/[.07] shadow-[inset_3px_0_0_0_#ff5a36]" : "border-white/10 bg-white/[.02]"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className={`text-[10px] font-black uppercase tracking-[.16em] ${order.status === "payment_submitted" ? "text-[#ff9a79]" : "text-white/45"}`}>
              {order.status === "payment_submitted" ? "Payment to verify" : "Payment reference"}
            </h3>
            {paymentSubmissions.length > 1 ? (
              <span className="text-[10px] text-white/40">{paymentSubmissions.length} submissions · latest first</span>
            ) : null}
          </div>
          <div className="mt-3 grid gap-2">
            {[...paymentSubmissions].reverse().map((submission, index) => (
              <div key={submission.id} className={`grid gap-3 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${index === 0 && order.status === "payment_submitted" ? "border-[#ff5a36]/25 bg-black/20" : "border-white/[.06] bg-black/10"}`}>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[.12em] text-white/45">
                    {paymentMethodLabels[submission.payment_method]}
                    {submission.payer_name ? ` · ${submission.payer_name}` : ""}
                  </p>
                  <p className="mt-1 break-all font-mono text-lg font-bold leading-snug tracking-wide text-white selection:bg-[#ff5a36]">
                    {submission.reference_number}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
                  {index === 0 && order.status === "payment_submitted" ? (
                    <span className="text-[9px] font-black uppercase tracking-[.12em] text-[#ff9a79]">Latest</span>
                  ) : null}
                  <p className="text-[10px] text-white/40">{formatDate(submission.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
          {order.status === "payment_submitted" ? (
            <p className="mt-3 text-xs leading-5 text-white/55">
              Match this reference with the transaction in your bank or payment account before approving.
            </p>
          ) : null}
        </section>
      ) : null}
      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
        <section className="min-w-0 rounded-lg border border-white/10 bg-white/[.02] p-4">
          <h3 className="text-[10px] font-black uppercase tracking-[.14em] text-white/40">Customer</h3>
          <p className="mt-2 text-sm font-semibold text-white/85">{customer?.full_name || "Unknown rider"}</p>
          <p className="mt-1 break-all text-xs text-white/50">{customer?.email || order.user_id}</p>
        </section>
        <section className="min-w-0 rounded-lg border border-white/10 bg-white/[.02] p-4">
          <h3 className="text-[10px] font-black uppercase tracking-[.14em] text-white/40">Delivery address</h3>
          {order.shipping_address ? (
            <>
              <p className="mt-2 text-sm font-semibold text-white/85">{order.shipping_address.recipient_name}</p>
              <p className="mt-1 text-xs leading-5 text-white/55">{formatDeliveryAddress(order.shipping_address)}</p>
              <p className="mt-1 text-xs text-white/40">{order.shipping_address.phone}</p>
            </>
          ) : (
            <p className="mt-2 text-xs text-white/45">No address provided</p>
          )}
        </section>
      </div>

      <section className="mx-4 mb-4 rounded-lg border border-white/10 sm:mx-5">
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="text-[10px] font-black uppercase tracking-[.14em] text-white/40">Items in this order</h3>
        </div>
        <div className="divide-y divide-white/[.06] px-4">
          {order.order_items.map(item => (
            <div key={item.id} className="flex items-center justify-between gap-4 py-3 text-sm">
              <div className="min-w-0 text-white/70">
                <span className="mr-2 text-xs font-bold text-white/40">{item.quantity}×</span>
                <span className="font-medium text-white/85">{item.product_name}</span>
                <span className="text-white/40"> / {item.finish}</span>
              </div>
              <span className="shrink-0 font-semibold tabular-nums text-white">
                {formatMoney(
                  item.line_total_cents / 100,
                  order.display_currency,
                  order.fx_rate
                )}
              </span>
            </div>
          ))}
        </div>
        <div className="border-t border-white/10 bg-white/[.02] px-4 py-3">
          <div className="ml-auto grid max-w-xs grid-cols-2 gap-x-8 gap-y-2 text-xs">
            <span className="text-white/45">Subtotal</span>
            <span className="text-right tabular-nums text-white/70">
              {formatMoney(
                order.subtotal_cents / 100,
                order.display_currency,
                order.fx_rate
              )}
            </span>
            <span className="text-white/45">Shipping</span>
            <span className="text-right tabular-nums text-white/70">
              {order.shipping_cents === 0
                ? "Included"
                : formatMoney(
                    order.shipping_cents / 100,
                    order.display_currency,
                    order.fx_rate
                  )}
            </span>
            <span className="border-t border-white/10 pt-2 font-bold text-white/75">Total</span>
            <span className="border-t border-white/10 pt-2 text-right font-bold tabular-nums text-white">
              {formatMoney(
                order.total_cents / 100,
                order.display_currency,
                order.fx_rate
              )}
            </span>
          </div>
        </div>
      </section>

      <section className="mx-4 mb-4 rounded-lg border border-white/10 bg-white/[.02] p-4 sm:mx-5 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[10px] font-black uppercase tracking-[.14em] text-white/45">Customer order progress</h3>
          <span className="text-[10px] text-white/30">Visible to the customer</span>
        </div>
        <OrderTimeline className="mt-4" timeline={timeline} />
      </section>

      <section className="border-t border-white/10 bg-black/10 p-4 sm:p-5">
        <div className="mb-3">
          <h3 className="text-[10px] font-black uppercase tracking-[.14em] text-white/45">Update fulfillment</h3>
          <p className="mt-1 text-xs text-white/35">Change the order status or save a tracking number.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <label className={labelClass}>
            Status
            <select
              value={status}
              onChange={event =>
                setStatus(event.target.value as AdminOrderStatus)
              }
              disabled={available.length === 0}
              className={`${inputClass} disabled:opacity-50`}
            >
              {statusOptions.map(item => (
                <option key={item} value={item} className="bg-[#111214]">
                  {item === "shipped"
                    ? "Shipped — handed to courier"
                    : orderStatusLabels[item]}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Tracking number
            <input
              value={trackingNumber}
              onChange={event => setTrackingNumber(event.target.value)}
              className={inputClass}
              placeholder="Optional"
            />
          </label>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex h-11 items-center justify-center gap-2 bg-[#ff5a36] px-5 text-[10px] font-black uppercase tracking-[.14em] text-black transition hover:bg-[#ff704f] disabled:opacity-50 sm:min-w-40"
          >
            {saving ? (
              "Saving..."
            ) : (
              <>
                <Save size={14} />
                {status === order.status
                  ? "Save details"
                  : `Mark ${orderStatusLabels[status].toLowerCase()}`}
              </>
            )}
          </button>
          <p className="text-[10px] leading-4 text-white/35 sm:col-span-3">
            {available.length === 0
              ? "This order is closed. You can still record its tracking number."
              : status === "shipped" && order.status !== "shipped"
                ? "Mark as shipped once the parcel has left the workshop. The customer timeline will update with the ship-out time."
                : "Leave the status unchanged to save the tracking number only."}
          </p>
        </div>
      </section>
      </div>
      ) : null}
    </article>
  );
}

function newProduct(categories: CatalogCategory[]): Product {
  return {
    id: `part-${Date.now()}`,
    slug: "",
    name: "",
    category: categories[0]?.name ?? "",
    price: 0,
    descriptor: "",
    description: "",
    finishes: ["Graphite"],
    visual: "hoods",
    specs: [],
    fitment: { headline: "", compatibility: [], checkBeforeRide: "" },
    featured: false,
    archived: false,
    sortOrder: 99,
  };
}

function withProductWeight(specs: Product["specs"], weight: string) {
  const otherSpecs = specs.filter(item => item.label.toLowerCase() !== "weight");
  const cleanWeight = weight.trim();
  return cleanWeight ? [...otherSpecs, { label: "Weight", value: cleanWeight }] : otherSpecs;
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

function withGalleryFrame(product: Product, frame: ProductImageFrame): Product {
  const photos = [product.image, ...(product.images ?? [])].filter(
    (value): value is string => Boolean(value)
  );
  return {
    ...product,
    image_frames: Object.fromEntries(photos.map(photo => [photo, frame])),
  };
}

/** Dropping the lead shot promotes the next gallery photo, so an item never shows a photo that is not its lead. */
function shiftLead(extras: string[]) {
  const [first, ...rest] = extras;
  return normalizeImages(first ?? "", rest);
}

/** Appending photos keeps the gallery in order; the first photo an item gets becomes the lead. */
function appendImages(product: Product, incoming: string[]) {
  const extras = [...(product.images ?? []), ...incoming]
    .map(item => item.trim())
    .filter(Boolean);
  return product.image?.trim()
    ? normalizeImages(product.image, extras)
    : shiftLead(extras);
}

function dropImage(product: Product, value: string) {
  const extras = (product.images ?? []).filter(item => item !== value);
  return product.image === value
    ? shiftLead(extras)
    : normalizeImages(product.image, extras);
}

function ProductEditor({
  product,
  categories,
  onSaved,
  onCancel,
}: {
  product: Product;
  categories: CatalogCategory[];
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() =>
    withGalleryFrame(
      product,
      product.image_frames?.[product.image ?? ""] ?? "wide"
    )
  );
  const [weight, setWeight] = useState(
    product.specs.find(item => item.label.toLowerCase() === "weight")?.value ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [draggedImage, setDraggedImage] = useState<string | null>(null);
  const [device, setDevice] = useState(previewDevices[0]);
  const [previewView, setPreviewView] = useState<ProductPreviewView>("page");
  const [previewHeight, setPreviewHeight] = useState(1500);
  const [focusRequest, setFocusRequest] = useState<{
    field: ProductPreviewField;
    id: number;
  } | null>(null);
  const focusId = useRef(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const { stageRef, scale } = usePreviewScale(device.width);
  const update = <K extends keyof Product>(key: K, value: Product[K]) =>
    setDraft(current => ({ ...current, [key]: value }));

  // The preview parses the same textareas the save writes, so the frame shows exactly what gets stored.
  const previewProduct = useMemo<Product>(
    () => ({
      ...draft,
      ...normalizeImages(draft.image, draft.images ?? []),
      image_positions: draft.image_positions,
      image_frames: draft.image_frames,
      finishes: draft.finishes.map(item => item.trim()).filter(Boolean),
      specs: withProductWeight(draft.specs, weight),
    }),
    [draft, weight]
  );

  const pushPreview = useCallback(() => {
    const previewWindow = frameRef.current?.contentWindow;
    previewWindow?.postMessage(
      { type: productPreviewProductMessage, product: previewProduct },
      window.location.origin
    );
    previewWindow?.postMessage(
      { type: productPreviewViewMessage, view: previewView },
      window.location.origin
    );
  }, [previewProduct, previewView]);

  useEffect(() => {
    pushPreview();
  }, [pushPreview]);

  const handlePreviewMessage = useCallback((data: unknown) => {
    const selected = readPreviewField(data);
    if (selected) {
      setFocusRequest({ field: selected, id: (focusId.current += 1) });
      return;
    }
    const next = readPreviewProductHeight(data);
    if (next) setPreviewHeight(next);
  }, []);

  // A click in the frame scrolls the matching field into view and puts the caret in it.
  useEffect(() => {
    if (!focusRequest) return;
    const node = document.querySelector<HTMLElement>(
      `[data-editor-field="${focusRequest.field}"]`
    );
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
    node?.focus({ preventScroll: true });
    const settle = window.setTimeout(() => setFocusRequest(null), 1600);
    return () => window.clearTimeout(settle);
  }, [focusRequest]);

  useEffect(() => {
    setDraft(
      withGalleryFrame(
        product,
        product.image_frames?.[product.image ?? ""] ?? "wide"
      )
    );
    setWeight(
      product.specs.find(item => item.label.toLowerCase() === "weight")?.value ?? ""
    );
  }, [product]);

  const save = async () => {
    if (!draft.name.trim()) {
      toast.error("Name required.", {
        description: "Give the shop item a name before saving.",
      });
      return;
    }
    const slug =
      draft.slug.trim() ||
      draft.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    if (!slug) {
      toast.error("Slug required.", {
        description: "Add a URL slug so the item can be linked.",
      });
      return;
    }
    if (!draft.category.trim()) {
      toast.error("Category required.", {
        description:
          "Add a category in the Categories section, then choose it here.",
      });
      return;
    }
    const cleanFinishes = draft.finishes
      .map(item => item.trim())
      .filter(Boolean);
    if (cleanFinishes.length === 0) {
      toast.error("At least one finish is required.", {
        description:
          "Customers must be able to choose a finish before checkout.",
      });
      return;
    }
    if (!Number.isFinite(draft.price) || draft.price < 0) {
      toast.error("Price is invalid.", {
        description: "Enter the PHP price as a positive number.",
      });
      return;
    }

    setSaving(true);
    try {
      await saveAdminProduct({
        ...draft,
        slug,
        finishes: cleanFinishes,
        specs: withProductWeight(draft.specs, weight),
      });
      toast.success("Shop item saved.");
      await onSaved();
    } catch (error) {
      toast.error("Could not save shop item.", {
        description: error instanceof Error ? error.message : "Try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const gallery = [draft.image, ...(draft.images ?? [])].filter(
    (item): item is string => Boolean(item)
  );
  const galleryFrame = gallery.length
    ? (draft.image_frames?.[gallery[0]] ?? "wide")
    : "wide";
  const updateGalleryFrame = (frame: ProductImageFrame) =>
    setDraft(current => withGalleryFrame(current, frame));

  const removeImage = (value: string) =>
    setDraft(current => ({ ...current, ...dropImage(current, value) }));
  const reorderImage = (source: string, target: string) => {
    if (source === target) return;
    setDraft(current => {
      const photos = [current.image, ...(current.images ?? [])].filter(
        (value): value is string => Boolean(value)
      );
      const from = photos.indexOf(source);
      const to = photos.indexOf(target);
      if (from < 0 || to < 0) return current;
      photos.splice(to, 0, ...photos.splice(from, 1));
      return { ...current, ...normalizeImages(photos[0], photos.slice(1)) };
    });
  };

  // Framing: pick a photo, then drag it inside the frame to set the crop.
  const [framing, setFraming] = useState<string | null>(null);
  const framingPhoto = framing && gallery.includes(framing) ? framing : gallery[0];
  const [dragStart, setDragStart] = useState<{
    x: number;
    y: number;
    posX: number;
    posY: number;
    overflowX: number;
    overflowY: number;
  } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [imageDimensions, setImageDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [cardImageDimensions, setCardImageDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [cardCropDrag, setCardCropDrag] = useState<{
    x: number;
    y: number;
    posX: number;
    posY: number;
    overflowX: number;
    overflowY: number;
  } | null>(null);
  const [cropX, cropY] = productImagePositionCoordinates(
    framingPhoto ? draft.image_positions?.[framingPhoto] : undefined
  );
  const frameRatio = productImageFrameRatio(galleryFrame);
  const photoRatio = imageDimensions
    ? imageDimensions.width / imageDimensions.height
    : null;
  const imageWidthScale =
    photoRatio === null ? 1 : Math.max(1, photoRatio / frameRatio) * zoom;
  const imageHeightScale =
    photoRatio === null ? 1 : Math.max(1, frameRatio / photoRatio) * zoom;
  const canAdjustCropX = imageWidthScale > 1;
  const canAdjustCropY = imageHeightScale > 1;

  useEffect(() => {
    setImageDimensions(null);
    setDragStart(null);
  }, [framingPhoto]);

  useEffect(() => {
    setCardImageDimensions(null);
    setCardCropDrag(null);
  }, [gallery[0]]);

  const [cardCropX, cardCropY] = productImagePositionCoordinates(
    draft.card_image_position
  );
  const cardZoom = draft.card_image_zoom ?? 1;
  const cardPhotoRatio = cardImageDimensions
    ? cardImageDimensions.width / cardImageDimensions.height
    : null;
  const cardImageWidthScale =
    cardPhotoRatio === null ? 1 : Math.max(1, cardPhotoRatio / (4 / 5)) * cardZoom;
  const cardImageHeightScale =
    cardPhotoRatio === null ? 1 : Math.max(1, (4 / 5) / cardPhotoRatio) * cardZoom;
  const canAdjustCardCropX = cardImageWidthScale > 1;
  const canAdjustCardCropY = cardImageHeightScale > 1;

  const handleDragStart = (event: React.PointerEvent) => {
    const photo = framingPhoto;
    if (!photo || !imageDimensions) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const frameRatio = bounds.width / bounds.height;
    const imageRatio = imageDimensions.width / imageDimensions.height;
    const overflowX =
      Math.max(bounds.width, bounds.height * imageRatio) * zoom - bounds.width;
    const overflowY =
      Math.max(bounds.height, bounds.width / imageRatio) * zoom - bounds.height;
    const [posX, posY] = productImagePositionCoordinates(
      draft.image_positions?.[photo]
    );
    setDragStart({
      x: event.clientX,
      y: event.clientY,
      posX,
      posY,
      overflowX,
      overflowY,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDragMove = (event: React.PointerEvent) => {
    if (!dragStart) return;
    const photo = framingPhoto;
    if (!photo) return;
    const dx = event.clientX - dragStart.x;
    const dy = event.clientY - dragStart.y;
    const nextX = Math.max(0, Math.min(100,
      dragStart.posX - (dragStart.overflowX > 0 ? (dx * 100) / dragStart.overflowX : 0)
    ));
    const nextY = Math.max(0, Math.min(100,
      dragStart.posY - (dragStart.overflowY > 0 ? (dy * 100) / dragStart.overflowY : 0)
    ));
    setDraft(cur => ({
      ...cur,
      image_positions: {
        ...(cur.image_positions ?? {}),
        [photo]: formatProductImagePosition(nextX, nextY),
      },
    }));
  };

  const handleDragEnd = () => setDragStart(null);
  const handleCardCropStart = (event: React.PointerEvent<HTMLDivElement>) => {
    const photo = gallery[0];
    if (!photo || !cardImageDimensions) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const imageRatio = cardImageDimensions.width / cardImageDimensions.height;
    const [posX, posY] = productImagePositionCoordinates(draft.card_image_position);
    setCardCropDrag({
      x: event.clientX,
      y: event.clientY,
      posX,
      posY,
      overflowX: Math.max(bounds.width, bounds.height * imageRatio) * cardZoom - bounds.width,
      overflowY: Math.max(bounds.height, bounds.width / imageRatio) * cardZoom - bounds.height,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleCardCropMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!cardCropDrag) return;
    const dx = event.clientX - cardCropDrag.x;
    const dy = event.clientY - cardCropDrag.y;
    const nextX = Math.max(0, Math.min(100, cardCropDrag.posX - (cardCropDrag.overflowX > 0 ? dx * 100 / cardCropDrag.overflowX : 0)));
    const nextY = Math.max(0, Math.min(100, cardCropDrag.posY - (cardCropDrag.overflowY > 0 ? dy * 100 / cardCropDrag.overflowY : 0)));
    setDraft(current => ({ ...current, card_image_position: formatProductImagePosition(nextX, nextY) }));
  };
  const handleCardCropEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    setCardCropDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const updateCardCropPosition = (axis: "x" | "y", value: number) => {
    const [x, y] = productImagePositionCoordinates(draft.card_image_position);
    setDraft(current => ({
      ...current,
      card_image_position: formatProductImagePosition(axis === "x" ? value : x, axis === "y" ? value : y),
    }));
  };
  const resetCardCropPosition = () => setDraft(current => ({ ...current, card_image_position: undefined, card_image_zoom: 1 }));
  const updateCropPosition = (axis: "x" | "y", value: number) => {
    if (!framingPhoto) return;
    const [x, y] = productImagePositionCoordinates(
      draft.image_positions?.[framingPhoto]
    );
    setDraft(current => ({
      ...current,
      image_positions: {
        ...(current.image_positions ?? {}),
        [framingPhoto]: formatProductImagePosition(
          axis === "x" ? value : x,
          axis === "y" ? value : y
        ),
      },
    }));
  };
  const resetCropPosition = () => {
    if (!framingPhoto) return;
    setDraft(current => {
      const imagePositions = { ...(current.image_positions ?? {}) };
      delete imagePositions[framingPhoto];
      return { ...current, image_positions: imagePositions };
    });
  };

  const upload = async (picked: File[]) => {
    if (picked.length === 0) return;
    setUploading(true);
    try {
      const paths: string[] = [];
      for (const file of picked)
        paths.push(await uploadStorefrontAsset(file, "products"));
      setDraft(current => {
        const updated = {
          ...current,
          ...appendImages(current, paths),
        };
        return withGalleryFrame(
          updated,
          updated.image_frames?.[current.image ?? ""] ?? galleryFrame
        );
      });
      toast.success(
        picked.length === 1
          ? "Photo uploaded."
          : `${picked.length} photos uploaded.`,
        {
          description:
            "The gallery is live in the preview. Save the item to publish it.",
        }
      );
    } catch (error) {
      toast.error("Could not upload photos.", {
        description: error instanceof Error ? error.message : "Try again.",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="border border-white/15 bg-[#111214]">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.14em] text-[#ff5a36]">
            Shop item details
          </p>
          <h2 className="mt-1 font-display text-3xl uppercase text-white">
            {draft.name || "New shop item"}
          </h2>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-[10px] font-black uppercase tracking-[.14em] text-white/35">
            {device.label} / {device.width}px / {Math.round(scale * 100)}%
          </p>
          <button
            onClick={onCancel}
            className="text-[10px] font-black uppercase tracking-[.14em] text-white/45 hover:text-white"
          >
            Close
          </button>
        </div>
      </div>
      <div className="grid gap-6 p-5 2xl:grid-cols-[minmax(0,1.1fr)_minmax(400px,.9fr)]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label="Preview content" className="flex items-center gap-1 rounded-md border border-white/10 bg-[#0d0e10] p-1">
              {([
                { id: "page", label: "Item page" },
                { id: "card", label: "Shop card" },
              ] as const).map(item => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setPreviewView(item.id)}
                  aria-pressed={previewView === item.id}
                  className={`rounded px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.1em] transition ${previewView === item.id ? "bg-white text-black" : "text-white/50 hover:text-white"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
            {previewDevices.map(item => (
              <button
                type="button"
                key={item.id}
                onClick={() => setDevice(item)}
                className={`border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[.12em] transition ${device.id === item.id ? "border-[#ff5a36] bg-[#ff5a36] text-black" : "border-white/15 text-white/50 hover:border-white/50 hover:text-white"}`}
              >
                {item.label}
              </button>
            ))}
            </div>
          </div>
          <PreviewStage
            src={productPreviewPath}
            title="Item preview"
            designWidth={device.width}
            height={previewHeight}
            scale={scale}
            stageRef={stageRef}
            frameRef={frameRef}
            readyType={productPreviewReadyMessage}
            onMessage={handlePreviewMessage}
            onReady={pushPreview}
          />
          <p className="mt-3 text-[10px] leading-4 text-white/35">
            Preview changes as you edit. Select a highlighted area to jump to
            its field.
          </p>
        </div>
        <div className="min-w-0 space-y-4">
          <section className="border border-white/10 bg-[#0d0e10] p-4">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-white">Item details</h3>
              <p className="mt-1 text-xs text-white/45">
                The name, category, price, and description customers see.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>
                Item name
                <input
                  data-editor-field="name"
                  value={draft.name}
                  onChange={event => update("name", event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Category
                <select
                  data-editor-field="category"
                  value={draft.category}
                  onChange={event => update("category", event.target.value)}
                  className={inputClass}
                >
                  {draft.category ? null : (
                    <option value="">Select a category</option>
                  )}
                  {draft.category &&
                  !categories.some(
                    category => category.name === draft.category
                  ) ? (
                    <option value={draft.category}>
                      {draft.category} (not in catalog)
                    </option>
                  ) : null}
                  {categories.map(category => (
                    <option key={category.id} value={category.name}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                Price (PHP)
                <input
                  data-editor-field="price"
                  type="number"
                  min="0"
                  step="1"
                  value={draft.price}
                  onChange={event =>
                    update("price", Number(event.target.value))
                  }
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Badge{" "}
                <span className="font-normal text-white/40">Optional</span>
                <input
                  data-editor-field="badge"
                  value={draft.badge ?? ""}
                  onChange={event => update("badge", event.target.value)}
                  className={inputClass}
                  placeholder="e.g. New drop"
                />
              </label>
              <label className={`${labelClass} sm:col-span-2`}>
                Description
                <textarea
                  data-editor-field="description"
                  value={draft.description}
                  onChange={event => update("description", event.target.value)}
                  className={`${inputClass} min-h-24 py-3`}
                />
              </label>
            </div>
          </section>

          <section className="border border-white/10 bg-[#0d0e10] p-4">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-white">
                Options and weight
              </h3>
              <p className="mt-1 text-xs text-white/45">
                Set the choices and weight shown on the item page.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>
                Finishes{" "}
                <span className="font-normal text-white/40">
                  Comma-separated
                </span>
                <input
                  data-editor-field="finishes"
                  value={draft.finishes.join(", ")}
                  onChange={event =>
                    update(
                      "finishes",
                      event.target.value
                        .split(",")
                        .map(value => value.trim())
                        .filter(Boolean)
                    )
                  }
                  className={inputClass}
                  placeholder="Graphite, Iced White"
                />
              </label>
              <label className={labelClass}>
                Weight{" "}
                <span className="font-normal text-white/40">Optional</span>
                <input
                  value={weight}
                  onChange={event => setWeight(event.target.value)}
                  className={inputClass}
                  placeholder="e.g. 118 g / pair"
                />
              </label>
            </div>
          </section>

          <section className="border border-white/10 bg-[#0d0e10] p-4">
            <div className="mb-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-white">Product photos</h3>
                <span className="text-xs tabular-nums text-white/45">
                  {gallery.length} {gallery.length === 1 ? "photo" : "photos"}
                </span>
              </div>
              <p className="mt-1 text-xs text-white/45">
                Drag photos to arrange their order. The first photo is the lead
                image.
              </p>
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              disabled={uploading}
              onChange={event => {
                const picked = Array.from(event.target.files ?? []);
                event.target.value = "";
                void upload(picked);
              }}
              className="sr-only"
              aria-label="Upload product photos"
            />
            {gallery.length > 0 ? (
              <div className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
                {gallery.map((value, index) => (
                  <div
                    key={value}
                    className={`group/photo relative cursor-grab active:cursor-grabbing ${draggedImage === value ? "opacity-40" : ""}`}
                    draggable
                    onDragStart={event => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", value);
                      setDraggedImage(value);
                    }}
                    onDragOver={event => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={event => {
                      event.preventDefault();
                      const source =
                        event.dataTransfer.getData("text/plain") ||
                        draggedImage;
                      if (source) reorderImage(source, value);
                      setDraggedImage(null);
                    }}
                    onDragEnd={() => setDraggedImage(null)}
                  >
                    <div
                      className={`relative block aspect-square w-full overflow-hidden border bg-[#17191c] transition ${index === 0 ? "border-[#ff5a36]" : "border-white/10"}`}
                    >
                      <img
                        src={value}
                        alt={`Product photo ${index + 1}`}
                        className="h-full w-full object-cover transition duration-300 group-hover/photo:scale-[1.03]"
                      />
                      <span className="absolute left-2 top-2 grid size-6 place-items-center bg-black/75 text-[10px] font-bold text-white">
                        {index + 1}
                      </span>
                      <span className="absolute right-9 top-2 grid size-6 place-items-center bg-black/65 text-white/80">
                        <GripVertical size={14} aria-hidden="true" />
                      </span>
                      {index === 0 ? (
                        <span className="absolute inset-x-0 bottom-0 bg-[#ff5a36] px-2 py-1 text-center text-[9px] font-bold uppercase tracking-[.12em] text-black">
                          Lead photo
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeImage(value)}
                      aria-label={`Remove photo ${index + 1}`}
                      title="Remove photo"
                      className="absolute right-2 top-2 grid size-6 place-items-center border border-white/20 bg-black/75 text-sm text-white transition hover:border-[#ff5a36] hover:bg-[#ff5a36] hover:text-black"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mb-4 flex flex-col items-center justify-center border border-dashed border-white/20 bg-white/[.02] px-5 py-8 text-center">
                <ImagePlus size={24} className="text-white/45" />
                <p className="mt-3 text-sm font-semibold text-white">
                  No product photos yet
                </p>
                <p className="mt-1 text-xs text-white/45">
                  Upload clear product images to create the shop gallery.
                </p>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
              <p className="text-xs text-white/45">
                Drag photos to change their order. The first photo is the lead
                image.
              </p>
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex h-10 items-center justify-center gap-2 border border-white/20 bg-white/[.04] px-4 text-xs font-semibold text-white transition hover:border-[#ff5a36] hover:bg-[#ff5a36] hover:text-black disabled:cursor-wait disabled:opacity-60"
              >
                <Upload size={15} />
                {uploading ? "Uploading photos…" : "Upload photos"}
              </button>
            </div>
          </section>

          <section className="border border-white/10 bg-[#0d0e10] p-4">
            <div className="mb-4">
              <p className="text-[10px] font-bold uppercase tracking-[.14em] text-white/45">
                Gallery frame
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(
                  [
                    ["wide", "Wide", "4:3"],
                    ["portrait", "Portrait", "4:5"],
                  ] as const
                ).map(([value, label, ratio]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => updateGalleryFrame(value)}
                    aria-pressed={galleryFrame === value}
                    className={`flex min-h-14 items-center justify-between border px-4 text-left transition ${
                      galleryFrame === value
                        ? "border-[#ff5a36] bg-[#ff5a36]/10 text-white"
                        : "border-white/10 bg-white/[.02] text-white/65 hover:border-white/30 hover:text-white"
                    }`}
                  >
                    <span>
                      <span className="block text-sm font-semibold">
                        {label}
                      </span>
                      <span className="mt-0.5 block text-xs text-white/45">
                        {ratio} aspect ratio
                      </span>
                    </span>
                    <span
                      className={`grid size-4 place-items-center rounded-full border ${
                        galleryFrame === value
                          ? "border-[#ff5a36] bg-[#ff5a36]"
                          : "border-white/30"
                      }`}
                    >
                      {galleryFrame === value ? (
                        <span className="size-1.5 rounded-full bg-black" />
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-white/40">
                Applies to all photos in this item’s gallery.
              </p>
            </div>
            <div className="border-t border-white/10 pt-4">
              <h3 className="text-sm font-bold text-white">
                Adjust photo crop
              </h3>
              <p className="mt-1 text-xs text-white/45">
                Choose a photo below, then drag it to reposition the crop.
              </p>
            </div>
            <div className="sm:col-span-2">
              <div className="mt-1.5 flex flex-wrap gap-2">
                {gallery.map((value, index) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFraming(value)}
                    className={`border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[.12em] transition ${framingPhoto === value ? "border-[#ff5a36] bg-[#ff5a36] text-black" : "border-white/15 text-white/50 hover:border-white/50 hover:text-white"}`}
                    title={`Adjust framing for photo ${index + 1}`}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid gap-4">
                <div
                  className="relative mx-auto w-full overflow-hidden border border-white/15 bg-[#161719]"
                  style={{
                    aspectRatio: productImageFrameRatio(galleryFrame),
                    maxWidth: `${Math.round(
                      520 * productImageFrameRatio(galleryFrame)
                    )}px`,
                  }}
                >
                  <div
                    className={`absolute inset-0 touch-none select-none ${dragStart ? "cursor-grabbing" : "cursor-grab"}`}
                    onPointerDown={handleDragStart}
                    onPointerMove={handleDragMove}
                    onPointerUp={handleDragEnd}
                    onPointerCancel={handleDragEnd}
                  >
                    {framingPhoto ? (
                      <img
                        src={framingPhoto}
                        alt={`Crop preview for ${draft.name || "product"}`}
                        draggable={false}
                        onLoad={event => {
                          const image = event.currentTarget;
                          if (
                            image.getAttribute("src") === framingPhoto &&
                            image.naturalWidth > 0 &&
                            image.naturalHeight > 0
                          ) {
                            setImageDimensions({
                              width: image.naturalWidth,
                              height: image.naturalHeight,
                            });
                          }
                        }}
                        style={{
                          position: "absolute",
                          width: `${imageWidthScale * 100}%`,
                          height: `${imageHeightScale * 100}%`,
                          maxWidth: "none",
                          maxHeight: "none",
                          left: `${(100 - imageWidthScale * 100) * (cropX / 100)}%`,
                          top: `${(100 - imageHeightScale * 100) * (cropY / 100)}%`,
                          objectFit: "fill",
                          pointerEvents: "none",
                        }}
                      />
                    ) : (
                      <ProductVisual product={draft} />
                    )}
                  </div>
                  <span className="absolute left-2 top-2 text-[10px] font-black uppercase tracking-[.14em] text-white/40">
                    Drag to reposition — storefront frame
                  </span>
                </div>
                <div className="grid gap-4 border border-white/10 bg-black/20 p-4 sm:grid-cols-2">
                  <label className="grid grid-cols-[auto_minmax(0,1fr)_3rem] items-center gap-3 text-[10px] font-bold uppercase tracking-[.12em] text-white/55 sm:col-span-2">
                    <span>Zoom</span>
                    <input
                      type="range"
                      min="1"
                      max="3"
                      step="0.01"
                      value={zoom}
                      onChange={event => setZoom(Number(event.target.value))}
                      aria-label="Photo zoom"
                      className="h-1.5 w-full cursor-pointer accent-[#ff5a36]"
                    />
                    <span className="text-right tabular-nums text-white/75">
                      {Math.round((zoom - 1) * 100)}%
                    </span>
                  </label>
                  <label className="grid grid-cols-[auto_minmax(0,1fr)_2.5rem] items-center gap-3 text-[10px] font-bold uppercase tracking-[.12em] text-white/55">
                    <span>Horizontal</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="0.1"
                      value={cropX}
                      onChange={event =>
                        updateCropPosition("x", Number(event.target.value))
                      }
                      disabled={!canAdjustCropX}
                      aria-label="Horizontal photo position"
                      className="h-1.5 w-full cursor-pointer accent-[#ff5a36] disabled:cursor-not-allowed disabled:opacity-30"
                    />
                    <span className="text-right tabular-nums text-white/75">
                      {Math.round(cropX)}%
                    </span>
                  </label>
                  <label className="grid grid-cols-[auto_minmax(0,1fr)_2.5rem] items-center gap-3 text-[10px] font-bold uppercase tracking-[.12em] text-white/55">
                    <span>Vertical</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="0.1"
                      value={cropY}
                      onChange={event =>
                        updateCropPosition("y", Number(event.target.value))
                      }
                      disabled={!canAdjustCropY}
                      aria-label="Vertical photo position"
                      className="h-1.5 w-full cursor-pointer accent-[#ff5a36] disabled:cursor-not-allowed disabled:opacity-30"
                    />
                    <span className="text-right tabular-nums text-white/75">
                      {Math.round(cropY)}%
                    </span>
                  </label>
                  <div className="flex items-center justify-between gap-3 sm:col-span-2">
                    <p className="text-xs text-white/40">
                      Drag the image or fine-tune its position with the sliders.
                    </p>
                    <button
                      type="button"
                      onClick={resetCropPosition}
                      disabled={!framingPhoto}
                      className="shrink-0 border border-white/15 px-3 py-2 text-xs font-semibold text-white/65 transition hover:border-white/35 hover:text-white disabled:opacity-35"
                    >
                      Reset crop
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {galleryFrame === "wide" ? (
            <section className="border border-white/10 bg-[#0d0e10] p-4">
              <div className="mb-4">
                <h3 className="text-sm font-bold text-white">Shop card crop</h3>
                <p className="mt-1 text-xs text-white/45">
                  Adjust the lead photo for product cards. This crop is separate from the item gallery.
                </p>
              </div>
              <div
                className={`relative mx-auto w-full max-w-[320px] overflow-hidden border border-white/15 bg-[#161719] ${gallery[0] && cardCropDrag ? "cursor-grabbing" : "cursor-grab"}`}
                style={{ aspectRatio: "4 / 5", touchAction: "none" }}
                onPointerDown={handleCardCropStart}
                onPointerMove={handleCardCropMove}
                onPointerUp={handleCardCropEnd}
                onPointerCancel={handleCardCropEnd}
              >
                {gallery[0] ? (
                  <img
                    src={gallery[0]}
                    alt={`Shop card crop preview for ${draft.name || "product"}`}
                    draggable={false}
                    onLoad={event => {
                      const image = event.currentTarget;
                      if (image.getAttribute("src") === gallery[0] && image.naturalWidth > 0 && image.naturalHeight > 0) {
                        setCardImageDimensions({ width: image.naturalWidth, height: image.naturalHeight });
                      }
                    }}
                    className="pointer-events-none absolute max-h-none max-w-none select-none"
                    style={{
                      width: `${cardImageWidthScale * 100}%`,
                      height: `${cardImageHeightScale * 100}%`,
                      left: `${(100 - cardImageWidthScale * 100) * (cardCropX / 100)}%`,
                      top: `${(100 - cardImageHeightScale * 100) * (cardCropY / 100)}%`,
                      objectFit: "fill",
                    }}
                  />
                ) : (
                  <ProductVisual product={draft} />
                )}
                <span className="pointer-events-none absolute left-2 top-2 border border-white/20 bg-black/60 px-2 py-1 text-[9px] font-bold uppercase tracking-[.12em] text-white/70">
                  Shop listing · 4:5
                </span>
              </div>
              {gallery[0] ? (
                <div className="mt-3 grid gap-4 border border-white/10 bg-black/20 p-4 sm:grid-cols-2">
                  <label className="grid grid-cols-[auto_minmax(0,1fr)_3rem] items-center gap-3 text-[10px] font-bold uppercase tracking-[.12em] text-white/55 sm:col-span-2">
                    <span>Zoom</span>
                    <input
                      type="range"
                      min="1"
                      max="3"
                      step="0.01"
                      value={cardZoom}
                      onChange={event => update("card_image_zoom", Number(event.target.value))}
                      aria-label="Shop card photo zoom"
                      className="h-1.5 w-full cursor-pointer accent-[#ff5a36]"
                    />
                    <span className="text-right tabular-nums text-white/75">{Math.round((cardZoom - 1) * 100)}%</span>
                  </label>
                  <label className="grid grid-cols-[auto_minmax(0,1fr)_2.5rem] items-center gap-3 text-[10px] font-bold uppercase tracking-[.12em] text-white/55">
                    <span>Horizontal</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="0.1"
                      value={cardCropX}
                      onChange={event => updateCardCropPosition("x", Number(event.target.value))}
                      disabled={!canAdjustCardCropX}
                      aria-label="Shop card horizontal photo position"
                      className="h-1.5 w-full cursor-pointer accent-[#ff5a36] disabled:cursor-not-allowed disabled:opacity-30"
                    />
                    <span className="text-right tabular-nums text-white/75">{Math.round(cardCropX)}%</span>
                  </label>
                  <label className="grid grid-cols-[auto_minmax(0,1fr)_2.5rem] items-center gap-3 text-[10px] font-bold uppercase tracking-[.12em] text-white/55">
                    <span>Vertical</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="0.1"
                      value={cardCropY}
                      onChange={event => updateCardCropPosition("y", Number(event.target.value))}
                      disabled={!canAdjustCardCropY}
                      aria-label="Shop card vertical photo position"
                      className="h-1.5 w-full cursor-pointer accent-[#ff5a36] disabled:cursor-not-allowed disabled:opacity-30"
                    />
                    <span className="text-right tabular-nums text-white/75">{Math.round(cardCropY)}%</span>
                  </label>
                  <div className="flex items-center justify-between gap-3 sm:col-span-2">
                    <p className="text-xs text-white/40">Drag the image or fine-tune its crop with the sliders.</p>
                    <button
                      type="button"
                      onClick={resetCardCropPosition}
                      className="shrink-0 border border-white/15 px-3 py-2 text-xs font-semibold text-white/65 transition hover:border-white/35 hover:text-white"
                    >
                      Reset crop
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-3 border border-white/10 bg-black/20 p-3 text-xs text-white/45">
                  Upload a lead photo to adjust the shop card crop.
                </p>
              )}
            </section>
          ) : null}

          <section className="border border-white/10 bg-[#0d0e10] p-4">
            <h3 className="text-sm font-bold text-white">Homepage placement</h3>
            <p className="mt-1 text-xs text-white/45">Choose whether this item is featured on the homepage.</p>
            <div className="mt-4">
              <label className="flex items-center gap-2 text-xs text-white/65">
                <input
                  type="checkbox"
                  checked={Boolean(draft.featured)}
                  onChange={event => update("featured", event.target.checked)}
                />
                Feature in homepage
              </label>
            </div>
          </section>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-white/10 bg-[#0d0e10] px-5 py-4">
        <p className="mr-auto text-xs text-white/40">
          The shop URL is generated automatically for new items.
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-10 items-center border border-white/15 px-4 text-xs font-semibold text-white/70 hover:border-white/40 hover:text-white"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !draft.name.trim()}
          className="inline-flex h-10 items-center gap-2 bg-[#ff5a36] px-5 text-xs font-bold text-black disabled:opacity-50"
        >
          {saving ? (
            "Saving..."
          ) : (
            <>
              <Save size={14} />
              Save item
            </>
          )}
        </button>
      </div>
    </div>
  );
}
function ProductManager({
  products,
  categories,
  reload,
  notify,
}: {
  products: Product[];
  categories: CatalogCategory[];
  reload: () => Promise<void>;
  notify: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Product | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState<
    "all" | "published" | "archived"
  >("all");
  const filteredProducts = products.filter(product => {
    const matchesQuery = `${product.name} ${product.category} ${product.slug}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
    const matchesVisibility =
      visibility === "all" ||
      (visibility === "archived" ? product.archived : !product.archived);
    return matchesQuery && matchesVisibility;
  });
  const toggleArchive = async (product: Product) => {
    try {
      await setAdminProductArchived(product.id, !product.archived);
      toast.success(product.archived ? "Item restored." : "Item archived.");
      await reload();
      await notify();
    } catch (error) {
      toast.error("Could not update item.", {
        description: error instanceof Error ? error.message : "Try again.",
      });
    }
  };
  const removeProduct = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteAdminProduct(pendingDelete.id);
      toast.success("Item deleted.");
      setPendingDelete(null);
      await reload();
      await notify();
    } catch (error) {
      toast.error("Could not delete item.", {
        description: error instanceof Error ? error.message : "Try again.",
      });
    } finally {
      setDeleting(false);
    }
  };
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.14em] text-[#ff5a36]">
            Catalog
          </p>
          <h1 className="mt-1 font-display text-5xl uppercase text-white">
            Shop items
          </h1>
          <p className="mt-2 text-sm text-white/50">
            Add products, update prices, and control what customers can see.
          </p>
        </div>
        <button
          onClick={() => setEditing(newProduct(categories))}
          className="bg-[#ff5a36] px-4 py-3 text-sm font-bold text-black"
        >
          + Add shop item
        </button>
      </div>
      {editing ? (
        <ProductEditor
          product={editing}
          categories={categories}
          onSaved={async () => {
            setEditing(null);
            await reload();
            await notify();
          }}
          onCancel={() => setEditing(null)}
        />
      ) : null}
      <div className="grid gap-4 rounded-xl border border-white/15 bg-[#111214] p-4 sm:grid-cols-[minmax(0,1fr)_180px]">
        <label className="relative">
          <span className="sr-only">Search shop items</span>
          <Search
            size={17}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search by item name or category"
            className={`${inputClass} pl-10`}
          />
        </label>
        <label>
          <span className="sr-only">Filter shop items</span>
          <select
            value={visibility}
            onChange={event =>
              setVisibility(event.target.value as typeof visibility)
            }
            className={inputClass}
          >
            <option value="all">All shop items</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </label>
      </div>
      <div className="grid gap-3">
        {filteredProducts.map(product => (
          <div
            key={product.id}
            className="flex flex-col gap-4 rounded-xl border border-white/15 bg-[#111214] p-4 sm:flex-row sm:items-center"
          >
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100">
                {product.image ? (
                  <img
                    src={product.image}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <Archive size={20} className="text-slate-400" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">
                  {product.name || "Untitled item"}
                </p>
                <p className="mt-1 truncate text-sm text-white/50">
                  {product.category}
                </p>
                <span
                  className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${product.archived ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}
                >
                  {product.archived
                    ? "Archived"
                    : product.featured
                      ? "Published · Featured"
                      : "Published"}
                </span>
              </div>
            </div>
            <p className="text-base font-bold text-white">
              ₱{product.price.toLocaleString("en-PH")}
            </p>
            <div className="flex gap-2 sm:justify-end">
              <button
                onClick={() => setEditing(product)}
                className="border border-white/20 px-4 py-2 text-sm font-semibold text-white/65 hover:border-[#ff5a36] hover:text-[#ff5a36]"
              >
                Edit item
              </button>
              <button
                onClick={() => void toggleArchive(product)}
                className="border border-white/20 px-4 py-2 text-sm font-semibold text-white/65 hover:border-[#ff5a36] hover:text-[#ff5a36]"
              >
                {product.archived ? "Restore item" : "Archive item"}
              </button>
              <button
                onClick={() => setPendingDelete(product)}
                className="border border-white/20 px-4 py-2 text-sm font-semibold text-white/45 hover:border-red-400 hover:text-red-400"
              >
                Delete item
              </button>
            </div>
          </div>
        ))}
        {filteredProducts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/20 bg-white p-8 text-center text-sm text-white/50">
            {products.length === 0
              ? "No shop items yet. Add your first item to get started."
              : "No items match this search. Try another name or filter."}
          </p>
        ) : null}
      </div>
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete item?"
        description={
          pendingDelete
            ? `Permanently delete "${pendingDelete.name.trim() || "this item"}"? This cannot be undone. Past orders keep their item name and price, but the catalog photo and link are removed.`
            : ""
        }
        confirmLabel="Delete item"
        busyLabel="Deleting..."
        busy={deleting}
        onConfirm={() => void removeProduct()}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}

function categoryIdFromName(name: string) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "category";
  return `${base}-${Date.now().toString(36)}`;
}

function CategoryRow({
  category,
  position,
  total,
  usage,
  reload,
  notify,
}: {
  category: CatalogCategory;
  position: number;
  total: number;
  usage: number;
  reload: () => Promise<void>;
  notify: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(category);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => setDraft(category), [category]);

  const update = (name: string) =>
    setDraft(current => ({ ...current, name }));

  const save = async () => {
    if (!draft.name.trim()) {
      toast.error("Category name required.", {
        description: "Give the category a name before saving.",
      });
      return;
    }
    setBusy(true);
    try {
      await saveAdminCategory({ ...draft, name: draft.name.trim() });
      toast.success("Category updated.");
      await reload();
      await notify();
    } catch (error) {
      toast.error("Could not update category.", {
        description: error instanceof Error ? error.message : "Try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  const move = async (direction: -1 | 1) => {
    setBusy(true);
    try {
      await moveAdminCategory(category.id, direction);
      await reload();
      await notify();
    } catch (error) {
      toast.error("Could not reorder categories.", {
        description: error instanceof Error ? error.message : "Try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (usage > 0) {
      toast.error("Category still in use.", {
        description: `Move ${usage} shop item${usage === 1 ? "" : "s"} to another category first.`,
      });
      return;
    }
    setConfirmingDelete(true);
  };

  const confirmRemove = async () => {
    setBusy(true);
    try {
      await deleteAdminCategory(category.id);
      toast.success("Category deleted.");
      setConfirmingDelete(false);
      await reload();
      await notify();
    } catch (error) {
      toast.error("Could not delete category.", {
        description: error instanceof Error ? error.message : "Try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/15 bg-[#111214] p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
        <div className="grid flex-1 gap-4">
          <label className={labelClass}>
            Name
            <input
              value={draft.name}
              onChange={event => update(event.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void move(-1)}
            disabled={busy || position === 0}
            className="grid size-10 place-items-center border border-white/20 text-white/65 transition hover:border-[#ff5a36] hover:text-[#ff5a36] disabled:cursor-not-allowed disabled:opacity-30"
            aria-label={`Move ${category.name} up`}
            title="Move up"
          >
            <ChevronUp size={16} />
          </button>
          <button
            type="button"
            onClick={() => void move(1)}
            disabled={busy || position === total - 1}
            className="grid size-10 place-items-center border border-white/20 text-white/65 transition hover:border-[#ff5a36] hover:text-[#ff5a36] disabled:cursor-not-allowed disabled:opacity-30"
            aria-label={`Move ${category.name} down`}
            title="Move down"
          >
            <ChevronDown size={16} />
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 bg-[#ff5a36] px-4 text-xs font-bold text-black disabled:opacity-50"
          >
            <Save size={14} />
            Save
          </button>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="grid size-10 place-items-center border border-white/20 text-white/45 transition hover:border-red-400 hover:text-red-400 disabled:opacity-30"
            aria-label={`Delete ${category.name}`}
            title={
              usage > 0
                ? "Move shop items out of this category before deleting it"
                : "Delete category"
            }
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[.12em] text-white/35">
        <span>
          Position {position + 1} of {total} · {usage} shop item
          {usage === 1 ? "" : "s"}
        </span>
        {usage > 0 ? <span>Move items out before deleting</span> : null}
      </div>
      <ConfirmDialog
        open={confirmingDelete}
        title="Delete category?"
        description={`Permanently delete "${category.name}"? This cannot be undone.`}
        confirmLabel="Delete category"
        busyLabel="Deleting..."
        busy={busy}
        onConfirm={() => void confirmRemove()}
        onClose={() => setConfirmingDelete(false)}
      />
    </div>
  );
}

function CategoryManager({
  categories,
  products,
  reload,
  notify,
}: {
  categories: CatalogCategory[];
  products: Product[];
  reload: () => Promise<void>;
  notify: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) {
      counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
    }
    return counts;
  }, [products]);

  const nextSortOrder =
    categories.reduce(
      (highest, category) => Math.max(highest, category.sortOrder),
      0
    ) + 10;

  const addCategory = async () => {
    const cleanName = name.trim();
    if (!cleanName) {
      toast.error("Category name required.", {
        description: "Enter a name such as Cockpit or Bar Tape.",
      });
      return;
    }
    if (
      categories.some(
        category => category.name.toLowerCase() === cleanName.toLowerCase()
      )
    ) {
      toast.error("Category already exists.", {
        description: "Choose a different name or edit the existing category.",
      });
      return;
    }
    setSaving(true);
    try {
      await saveAdminCategory({
        id: categoryIdFromName(cleanName),
        name: cleanName,
        sortOrder: nextSortOrder,
      });
      toast.success("Category added.");
      setName("");
      await reload();
      await notify();
    } catch (error) {
      toast.error("Could not add category.", {
        description: error instanceof Error ? error.message : "Try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[.14em] text-[#ff5a36]">
          Catalog structure
        </p>
        <h1 className="mt-1 font-display text-5xl uppercase text-white">
          Categories
        </h1>
        <p className="mt-2 text-sm text-white/50">
          Add categories, rename or reorder them, and control the options
          available when adding or editing a shop item.
        </p>
      </div>

      <div className="rounded-xl border border-white/15 bg-[#111214] p-4">
        <div className="mb-4">
          <h2 className="text-sm font-bold text-white">Add a category</h2>
          <p className="mt-1 text-xs text-white/45">
            New categories appear in the storefront navigation and the shop
            item editor.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className={labelClass}>
            Name
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              className={inputClass}
              placeholder="Bar Tape"
            />
          </label>
          <button
            type="button"
            onClick={() => void addCategory()}
            disabled={saving}
            className="inline-flex h-11 items-center justify-center gap-2 bg-[#ff5a36] px-5 text-xs font-bold text-black disabled:opacity-50"
          >
            <Plus size={15} />
            {saving ? "Adding..." : "Add category"}
          </button>
        </div>
      </div>

      <div className="grid gap-3">
        {categories.map((category, position) => (
          <CategoryRow
            key={category.id}
            category={category}
            position={position}
            total={categories.length}
            usage={usage.get(category.name) ?? 0}
            reload={reload}
            notify={notify}
          />
        ))}
        {categories.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/20 bg-white p-8 text-center text-sm text-white/50">
            No categories yet. Add your first category so shop items can be
            grouped.
          </p>
        ) : null}
      </div>

      <p className="text-xs leading-5 text-white/35">
        Renaming a category moves every shop item with it. A category that still
        has shop items cannot be deleted; reassign those items first.
      </p>
    </div>
  );
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
  {
    id: "hero",
    label: "Top section",
    summary:
      "The first section visitors see. Update the main heading, intro text, and background photo.",
    fields: [
      { key: "hero_title", label: "Main heading" },
      { key: "hero_accent", label: "Middle heading line" },
      {
        key: "hero_suffix",
        label: "Final heading line",
        hint: "Shown in orange",
      },
      { key: "hero_description", label: "Intro text", rows: 3 },
      { key: "hero_image_path", label: "Background photo", upload: true },
      {
        key: "hero_alt",
        label: "Photo description",
        hint: "Helps visitors using screen readers",
      },
    ],
  },
  {
    id: "drop",
    label: "Featured items",
    summary:
      "Choose the products to feature on your homepage and edit the section heading.",
    picksProducts: true,
    fields: [
      { key: "drop_label", label: "Small label" },
      { key: "drop_title", label: "Section heading" },
      {
        key: "drop_accent",
        label: "Highlighted heading",
        hint: "Shown in orange",
      },
      { key: "drop_description", label: "Intro text", rows: 3 },
    ],
  },
  {
    id: "story",
    label: "Our story",
    summary:
      "Tell visitors about the shop. Update the heading and the photo for this section.",
    fields: [
      { key: "story_label", label: "Small label" },
      { key: "story_title", label: "Section heading" },
      {
        key: "story_accent",
        label: "Highlighted heading",
        hint: "Shown in orange",
      },
      { key: "story_image_path", label: "Section photo", upload: true },
      {
        key: "story_alt",
        label: "Photo description",
        hint: "Helps visitors using screen readers",
      },
    ],
  },
  {
    id: "journal",
    label: "Journal stories",
    summary:
      "Update the journal heading and the photos, titles, and captions for its three stories.",
    fields: [
      { key: "journal_label", label: "Small label" },
      { key: "journal_title", label: "Section heading" },
      {
        key: "journal_accent",
        label: "Highlighted heading",
        hint: "Shown in orange",
      },
      {
        key: "journal_post_one_image_path",
        label: "Story 1 / photo",
        upload: true,
      },
      { key: "journal_post_one_label", label: "Story 1 / title" },
      { key: "journal_post_one_place", label: "Story 1 / caption" },
      {
        key: "journal_post_two_image_path",
        label: "Story 2 / photo",
        upload: true,
      },
      { key: "journal_post_two_label", label: "Story 2 / title" },
      { key: "journal_post_two_place", label: "Story 2 / caption" },
      {
        key: "journal_post_three_image_path",
        label: "Story 3 / photo",
        upload: true,
      },
      { key: "journal_post_three_label", label: "Story 3 / title" },
      { key: "journal_post_three_place", label: "Story 3 / caption" },
    ],
  },
];

const previewDevices = [
  { id: "desktop", label: "Desktop", width: 1440 },
  { id: "tablet", label: "Tablet", width: 834 },
  { id: "phone", label: "Phone", width: 390 },
];

function HomepageEditor({
  initial,
  products,
  reload,
  notify,
}: {
  initial: HomepageContent;
  products: Product[];
  reload: () => Promise<void>;
  notify: () => Promise<void>;
}) {
  const [content, setContent] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [section, setSection] = useState<HomepageSectionId>("hero");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<string | null>(null);
  const [device, setDevice] = useState(previewDevices[0]);
  const [metrics, setMetrics] = useState<HomepagePreviewMetrics>({
    height: 3400,
    offsets: {},
  });
  const frameRef = useRef<HTMLIFrameElement>(null);
  const draftRef = useRef(content);
  const { stageRef, scale } = usePreviewScale(device.width);

  const dirty = useMemo(
    () =>
      (Object.keys(saved) as (keyof HomepageContent)[]).some(
        key => saved[key] !== content[key]
      ),
    [content, saved]
  );
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
    draftRef.current = content;
  }, [content, dirty]);
  useEffect(() => {
    if (dirtyRef.current) return;
    setContent(initial);
    setSaved(initial);
  }, [initial]);

  const active =
    homepageSections.find(item => item.id === section) ?? homepageSections[0];
  const selectable = useMemo(
    () => products.filter(product => !product.archived),
    [products]
  );
  const inDrop = selectable.filter(product => product.featured).length;

  const pushDraft = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage(
      { type: previewContentMessage, content: draftRef.current },
      window.location.origin
    );
  }, []);

  useEffect(() => {
    pushDraft();
  }, [content, pushDraft]);

  const handlePreviewMessage = useCallback((data: unknown) => {
    const selected = readPreviewSection(data);
    if (selected) {
      setSection(selected);
      return;
    }
    const next = readPreviewMetrics(data);
    if (next) setMetrics(next);
  }, []);

  useEffect(() => {
    const top = metrics.offsets[section];
    if (top === undefined) return;
    stageRef.current?.scrollTo({
      top: Math.max(0, top * scale - 12),
      behavior: "smooth",
    });
  }, [metrics, scale, section]);

  const update = (key: keyof HomepageContent, value: string) =>
    setContent(current => ({ ...current, [key]: value }));

  const upload = async (file: File | undefined, key: keyof HomepageContent) => {
    if (!file) return;
    setUploading(true);
    try {
      update(key, await uploadStorefrontAsset(file, "homepage"));
      toast.success("Homepage image uploaded.", {
        description: "Save the homepage to publish it.",
      });
    } catch (error) {
      toast.error("Could not upload image.", {
        description: error instanceof Error ? error.message : "Try again.",
      });
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
      frameRef.current?.contentWindow?.postMessage(
        { type: previewRefreshMessage },
        window.location.origin
      );
    } catch (error) {
      toast.error("Could not update the drop.", {
        description: error instanceof Error ? error.message : "Try again.",
      });
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
      toast.error("Could not save homepage.", {
        description: error instanceof Error ? error.message : "Try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[.14em] text-[#ff5a36]">
          Homepage editor
        </p>
        <h1 className="mt-1 font-display text-5xl uppercase text-white">
          Homepage
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-6 text-white/45">
          See your changes in the preview as you edit. Choose a section on the
          right, or click a highlighted area in the preview. Save to publish
          your changes.
        </p>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border border-white/15 bg-[#101113] p-3">
            <div className="flex flex-wrap gap-1">
              {previewDevices.map(item => (
                <button
                  key={item.id}
                  onClick={() => setDevice(item)}
                  className={`border px-3 py-2 text-[10px] font-black uppercase tracking-[.12em] transition ${device.id === item.id ? "border-[#ff5a36] bg-[#ff5a36] text-black" : "border-white/15 text-white/50 hover:border-white/40 hover:text-white"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-black uppercase tracking-[.14em] text-white/35">
                {device.width}px / {Math.round(scale * 100)}%
              </span>
              <a
                href="/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 border border-white/15 px-3 py-2 text-[10px] font-black uppercase tracking-[.12em] text-white/60 transition hover:border-[#ff5a36] hover:text-[#ff5a36]"
              >
                Live page <ExternalLink size={13} />
              </a>
            </div>
          </div>
          <PreviewStage
            src={homepagePreviewPath}
            title="Homepage preview"
            designWidth={device.width}
            height={metrics.height}
            scale={scale}
            stageRef={stageRef}
            frameRef={frameRef}
            readyType={previewReadyMessage}
            onMessage={handlePreviewMessage}
            onReady={pushDraft}
          />
          <p className="text-[10px] leading-4 text-white/35">
            Some homepage areas are managed by the store and cannot be changed
            here.
          </p>
        </div>
        <div className="min-w-0 self-start border border-white/15 bg-[#111214]">
          <div className="flex border-b border-white/15">
            {homepageSections.map(item => (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={`flex-1 border-r border-white/15 px-2 py-3 text-[10px] font-black uppercase tracking-[.12em] transition last:border-r-0 ${section === item.id ? "bg-[#ff5a36] text-black" : "text-white/50 hover:text-white"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="p-5">
            <p className="text-xs leading-5 text-white/45">{active.summary}</p>
            {active.picksProducts ? (
              <div className="mt-5 border-t border-white/10 pt-5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[10px] font-black uppercase tracking-[.14em] text-white/45">
                    Shop items in this section
                  </p>
                  <span
                    className={`text-[10px] font-black uppercase tracking-[.14em] ${inDrop === 0 ? "text-[#ff5a36]" : "text-white/30"}`}
                  >
                    {inDrop} selected
                  </span>
                </div>
                <div className="mt-3 divide-y divide-white/10 border-y border-white/10">
                  {selectable.map(product => {
                    const on = Boolean(product.featured);
                    return (
                      <button
                        key={product.id}
                        onClick={() => void toggleDropItem(product)}
                        disabled={pendingProduct !== null}
                        className="flex w-full items-center gap-3 py-2.5 text-left transition hover:bg-white/[.03] disabled:opacity-50"
                      >
                        <span
                          className={`grid size-4 shrink-0 place-items-center border ${on ? "border-[#ff5a36] bg-[#ff5a36] text-black" : "border-white/30 text-transparent"}`}
                        >
                          <Check size={12} strokeWidth={3} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block truncate text-sm font-bold ${on ? "text-white" : "text-white/60"}`}
                          >
                            {product.name}
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] font-bold uppercase tracking-[.14em] text-white/30">
                            {product.category}
                          </span>
                        </span>
                        {pendingProduct === product.id ? (
                          <span className="shrink-0 text-[10px] font-black uppercase tracking-[.14em] text-[#ff5a36]">
                            Saving
                          </span>
                        ) : (
                          <span className="shrink-0 text-xs font-bold text-white/45">
                            ₱{product.price.toLocaleString("en-PH")}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-[10px] leading-4 text-white/35">
                  Select the items you want to feature. Changes save
                  automatically and appear in the preview; archived items are
                  not available to feature.
                </p>
              </div>
            ) : null}
            <div className="mt-5 grid gap-4">
              {active.fields.map(field => (
                <label key={field.key} className={labelClass}>
                  <span className="flex items-baseline justify-between gap-3">
                    {field.label}
                    {field.hint ? (
                      <span className="text-[9px] font-bold normal-case tracking-normal text-white/25">
                        {field.hint}
                      </span>
                    ) : null}
                  </span>
                  {field.rows ? (
                    <textarea
                      rows={field.rows}
                      value={content[field.key]}
                      onChange={event => update(field.key, event.target.value)}
                      className={`${inputClass} py-3`}
                    />
                  ) : (
                    <input
                      value={content[field.key]}
                      onChange={event => update(field.key, event.target.value)}
                      className={inputClass}
                    />
                  )}
                  {field.upload ? (
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploading}
                      onChange={event =>
                        void upload(event.target.files?.[0], field.key)
                      }
                      className="h-auto cursor-pointer border border-dashed border-white/20 bg-transparent px-3 py-2 text-[10px] font-black uppercase tracking-[.12em] text-white/50 file:mr-3 file:border-0 file:bg-[#ff5a36] file:px-3 file:py-2 file:text-[10px] file:font-black file:uppercase file:tracking-[.14em] file:text-black hover:border-white/40"
                    />
                  ) : null}
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-white/15 p-4">
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="inline-flex h-10 items-center gap-2 bg-[#ff5a36] px-5 text-[10px] font-black uppercase tracking-[.14em] text-black disabled:opacity-40"
            >
              {saving ? (
                "Saving..."
              ) : (
                <>
                  <Save size={14} />
                  Save homepage
                </>
              )}
            </button>
            <button
              onClick={() => setContent(saved)}
              disabled={!dirty || saving}
              className="inline-flex h-10 items-center gap-2 border border-white/20 px-4 text-[10px] font-black uppercase tracking-[.14em] text-white/60 transition hover:border-white/50 hover:text-white disabled:opacity-40"
            >
              <Undo2 size={14} />
              Revert
            </button>
            <span
              className={`ml-auto inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] ${dirty ? "text-[#ff5a36]" : "text-white/30"}`}
            >
              {dirty ? "Unsaved changes" : "Live on storefront"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoleManager({
  profiles,
  reload,
}: {
  profiles: AdminProfile[];
  reload: () => Promise<void>;
}) {
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
      toast.error("Could not update role.", {
        description: error instanceof Error ? error.message : "Try again.",
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[.14em] text-[#ff5a36]">
          Team access
        </p>
        <h1 className="mt-1 font-display text-5xl uppercase text-white">
          Manage access
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-6 text-white/45">
          Enter the email address of an existing account to change its access.
          The last administrator cannot be removed.
        </p>
      </div>
      <div className="grid gap-3 border border-white/15 bg-[#111214] p-5 sm:grid-cols-[1fr_180px_auto] sm:items-end">
        <label className={labelClass}>
          Account email
          <input
            type="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            className={inputClass}
            placeholder="rider@example.com"
          />
        </label>
        <label className={labelClass}>
          Access level
          <select
            value={role}
            onChange={event => setRole(event.target.value as AccountRole)}
            className={inputClass}
          >
            {(["customer", "staff", "admin"] as AccountRole[]).map(value => (
              <option key={value} value={value} className="bg-[#111214]">
                {value === "admin"
                  ? "Administrator"
                  : value === "staff"
                    ? "Staff"
                    : "Customer"}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={save}
          disabled={saving || !email.trim()}
          className="h-10 bg-[#ff5a36] px-5 text-[10px] font-black uppercase tracking-[.14em] text-black disabled:opacity-50"
        >
          {saving ? "Saving..." : "Update role"}
        </button>
      </div>
      <div className="divide-y divide-white/10 border-y border-white/10">
        {profiles.map(profile => (
          <div
            key={profile.id}
            className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-bold text-white">
                {profile.full_name || "Unnamed rider"}
              </p>
              <p className="mt-1 text-xs text-white/40">
                {profile.email || "No email"}
              </p>
            </div>
            <span className="w-fit border border-white/20 px-3 py-2 text-[10px] font-black uppercase tracking-[.14em] text-[#ff5a36]">
              {profile.role}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Admin() {
  const { user, profile, loading, isConfigured, signOut } = useAuth();
  const { refresh: refreshCatalog } = useCatalog();
  const [, navigate] = useLocation();
  const [section, setSection] = useState<Section>("overview");
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("all");
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [homepage, setHomepage] = useState<HomepageContent>(
    defaultHomepageContent
  );
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isConfigured) return;
    setLoadingData(true);
    const results = await Promise.allSettled([
      fetchAdminOrders(),
      fetchAdminProducts(),
      fetchAdminHomepage(),
      fetchAdminProfiles(),
      fetchAdminCategories(),
    ]);
    const [
      ordersResult,
      productsResult,
      homepageResult,
      profilesResult,
      categoriesResult,
    ] = results;
    if (ordersResult.status === "fulfilled") setOrders(ordersResult.value);
    if (productsResult.status === "fulfilled")
      setProducts(productsResult.value);
    if (homepageResult.status === "fulfilled")
      setHomepage(homepageResult.value);
    if (profilesResult.status === "fulfilled")
      setProfiles(profilesResult.value);
    if (categoriesResult.status === "fulfilled")
      setCategories(categoriesResult.value);
    const failed = results.find(result => result.status === "rejected");
    setDataError(
      failed?.status === "rejected"
        ? failed.reason instanceof Error
          ? failed.reason.message
          : "Could not load administration data."
        : null
    );
    setLoadingData(false);
  }, [isConfigured]);

  useEffect(() => {
    if (profile?.role === "admin") void load();
  }, [load, profile?.role]);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/sign-in", { replace: true });
    } catch (error) {
      toast.error("Sign-out failed.", {
        description: error instanceof Error ? error.message : "Try again in a moment.",
      });
    }
  };

  const counts = useMemo(
    () => ({
      open: orders.filter(
        order =>
          order.status === "pending_payment" ||
          order.status === "payment_submitted"
      ).length,
      fulfillment: orders.filter(order =>
        ["paid", "processing", "shipped"].includes(order.status)
      ).length,
      published: products.filter(product => !product.archived).length,
    }),
    [orders, products]
  );

  // Orders are read through the same status groups the rider sees, so the desk and
  // the account page can never disagree about what "To Ship" means.
  const orderCounts = useMemo(
    () => countOrdersByFilter(orders.map(order => order.status)),
    [orders]
  );
  const visibleOrders = useMemo(
    () => orders.filter(order => orderMatchesFilter(order.status, orderFilter)),
    [orders, orderFilter]
  );
  const customers = useMemo(
    () => new Map(profiles.map(item => [item.id, item] as const)),
    [profiles]
  );

  if (loading)
    return (
      <section className="flex min-h-screen items-center justify-center bg-[#0c0d0e] text-sm text-white/50">
        Loading administration...
      </section>
    );
  if (!user || profile?.role !== "admin")
    return (
      <section className="flex min-h-screen items-end bg-[#0c0d0e] px-4 pb-16 pt-16 sm:px-6 lg:px-9">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.16em] text-[#ff5a36]">
            <ShieldCheck size={14} />
            Restricted area
          </p>
          <h1 className="mt-5 font-display text-7xl uppercase leading-[.72] text-white">
            Admin
            <br />
            access.
          </h1>
          <p className="mt-5 max-w-sm text-sm leading-6 text-white/45">
            Sign in with an account assigned the administrator role.
          </p>
          <Link
            href="/account"
            className="mt-7 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[.16em] text-[#ff5a36]"
          >
            <ArrowLeft size={14} />
            Back to account
          </Link>
        </div>
      </section>
    );

  return (
    <section className="admin-shell min-h-screen">
      <div className="admin-topbar border-b px-4 py-6 sm:px-6 lg:px-9">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.12em] text-[#ff5a36]">
              Underrated Cycling Co.
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
              Store administration
            </h1>
            <p className="mt-1 text-sm text-white/55">
              Manage orders, shop items, categories, homepage content, and
              staff access.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-[#111214] px-4 py-3 shadow-sm">
              <ShieldCheck size={16} className="text-[#ff5a36]" />
              <div>
                <p className="text-sm font-bold text-white">
                  {profile.full_name || user.email}
                </p>
                <p className="mt-1 text-xs text-white/45">Administrator</p>
              </div>
            </div>
            <button
              onClick={() => void handleSignOut()}
              className="inline-flex items-center gap-2 border border-white/15 px-4 py-3 text-[10px] font-black uppercase tracking-[.14em] text-white/60 transition hover:border-[#ff5a36] hover:text-[#ff5a36]"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        </div>
      </div>
      <div className="grid gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[220px_1fr] lg:px-9">
        <aside
          className="admin-nav flex gap-2 overflow-x-auto lg:block lg:space-y-1"
          aria-label="Administration sections"
        >
          {navigation.map(item => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              aria-pressed={section === item.id}
              className={`admin-nav-item flex shrink-0 items-center gap-3 border px-3 py-3 text-left font-semibold transition lg:w-full ${section === item.id ? "border-[#ff5a36] bg-[#ff5a36] text-black" : "border-white/10 text-white/50 hover:border-white/30 hover:text-white"}`}
            >
              <item.icon size={15} />
              {item.label}
            </button>
          ))}
        </aside>
        <main className="min-w-0">
          {dataError ? (
            <p className="mb-5 border border-[#ff5a36]/30 bg-[#ff5a36]/5 p-4 text-sm text-[#ff5a36]">
              {dataError}. Apply the latest Supabase migrations before using
              administration.
            </p>
          ) : null}
          {loadingData ? (
            <p className="mb-5 text-sm text-white/45">
              Refreshing administration data...
            </p>
          ) : null}
          {section === "overview" ? (
            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.14em] text-[#ff5a36]">
                  At a glance
                </p>
                <h2 className="mt-1 font-display text-5xl uppercase text-white">
                  Store overview
                </h2>
                <p className="mt-2 text-sm text-white/50">
                  A quick look at what needs your attention.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-xl border border-white/15 bg-[#111214] p-5">
                  <p className="text-[10px] font-black uppercase tracking-[.14em] text-white/40">
                    Payments to review
                  </p>
                  <p className="mt-3 font-display text-6xl text-white">
                    {counts.open.toString().padStart(2, "0")}
                  </p>
                  <p className="mt-2 text-sm text-white/50">
                    Orders waiting for payment approval
                  </p>
                </div>
                <div className="rounded-xl border border-white/15 bg-[#111214] p-5">
                  <p className="text-[10px] font-black uppercase tracking-[.14em] text-white/40">
                    Orders to ship
                  </p>
                  <p className="mt-3 font-display text-6xl text-white">
                    {counts.fulfillment.toString().padStart(2, "0")}
                  </p>
                  <p className="mt-2 text-sm text-white/50">
                    Paid or in progress
                  </p>
                </div>
                <div className="rounded-xl border border-white/15 bg-[#111214] p-5">
                  <p className="text-[10px] font-black uppercase tracking-[.14em] text-white/40">
                    Live shop items
                  </p>
                  <p className="mt-3 font-display text-6xl text-white">
                    {counts.published.toString().padStart(2, "0")}
                  </p>
                  <p className="mt-2 text-sm text-white/50">
                    Visible in your online shop
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-white/15 bg-[#111214] p-5">
                <h3 className="text-lg font-bold text-white">
                  What would you like to do?
                </h3>
                <p className="mt-1 text-sm text-white/50">
                  Choose a task to get started.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    onClick={() => setSection("orders")}
                    className="border border-white/20 px-4 py-3 text-sm font-semibold text-white/70 hover:border-[#ff5a36] hover:text-[#ff5a36]"
                  >
                    Review orders and payments
                  </button>
                  <button
                    onClick={() => setSection("products")}
                    className="border border-white/20 px-4 py-3 text-sm font-semibold text-white/70 hover:border-[#ff5a36] hover:text-[#ff5a36]"
                  >
                    Add or edit a shop item
                  </button>
                  <button
                    onClick={() => setSection("categories")}
                    className="border border-white/20 px-4 py-3 text-sm font-semibold text-white/70 hover:border-[#ff5a36] hover:text-[#ff5a36]"
                  >
                    Manage categories
                  </button>
                  <button
                    onClick={() => setSection("homepage")}
                    className="border border-white/20 px-4 py-3 text-sm font-semibold text-white/70 hover:border-[#ff5a36] hover:text-[#ff5a36]"
                  >
                    Update the homepage
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {section === "orders" ? (
            <div className="space-y-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.14em] text-[#ff5a36]">
                  Orders and payments
                </p>
                <h1 className="mt-1 font-display text-5xl uppercase text-white">
                  Orders
                </h1>
                <p className="mt-3 text-sm text-white/45">
                  Approve submitted payments, then move paid orders through
                  processing, shipping, and delivery.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 border-y border-white/10 py-3">
                {orderFilters.map(filter => (
                  <button
                    key={filter.id}
                    onClick={() => setOrderFilter(filter.id)}
                    className={`border px-3 py-2 text-[10px] font-black uppercase tracking-[.14em] ${orderFilter === filter.id ? "border-[#ff5a36] bg-[#ff5a36] text-black" : "border-white/15 text-white/50 hover:border-white/40 hover:text-white"}`}
                  >
                    {filter.label}{" "}
                    <span className="ml-1 opacity-60">
                      {orderCounts[filter.id]}
                    </span>
                  </button>
                ))}
              </div>
              {visibleOrders.length ? (
                <div className="space-y-4">
                  {visibleOrders.map(order => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      customer={customers.get(order.user_id)}
                      onUpdated={load}
                    />
                  ))}
                </div>
              ) : (
                <p className="border-y border-white/10 py-10 text-sm text-white/45">
                  {orders.length ? "No orders in this view." : "No orders yet."}
                </p>
              )}
            </div>
          ) : null}
          {section === "products" ? (
            <ProductManager
              products={products}
              categories={categories}
              reload={load}
              notify={refreshCatalog}
            />
          ) : null}
          {section === "categories" ? (
            <CategoryManager
              categories={categories}
              products={products}
              reload={load}
              notify={refreshCatalog}
            />
          ) : null}
          {section === "homepage" ? (
            <HomepageEditor
              initial={homepage}
              products={products}
              reload={load}
              notify={refreshCatalog}
            />
          ) : null}
          {section === "roles" ? (
            <RoleManager profiles={profiles} reload={load} />
          ) : null}
        </main>
      </div>
    </section>
  );
}
