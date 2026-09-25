/**
 * Design direction: Technical Drop Editorial — shared storefront chrome keeps every route inside the same dark technical world.
 */
import type { ReactNode } from "react";
import CartDrawer from "@/components/CartDrawer";
import StoreFooter from "@/components/StoreFooter";
import StoreHeader from "@/components/StoreHeader";

export default function StoreLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen overflow-x-clip bg-[#0c0d0e] text-white"><StoreHeader /><main>{children}</main><StoreFooter /><CartDrawer /></div>;
}
