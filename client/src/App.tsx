/** Design direction: Technical Drop Editorial - route composition stays inside a dark, high-contrast storefront shell. */
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import StoreLayout from "@/components/StoreLayout";
import { AddressBookProvider } from "@/contexts/AddressBookContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CatalogProvider } from "@/contexts/CatalogContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { StoreProvider } from "@/contexts/StoreContext";
import Account from "@/pages/Account";
import AccountOrder from "@/pages/AccountOrder";
import Admin from "@/pages/Admin";
import Home from "@/pages/Home";
import HomepagePreview from "@/pages/HomepagePreview";
import NotFound from "@/pages/NotFound";
import ProductDetail from "@/pages/ProductDetail";
import ProductPreview from "@/pages/ProductPreview";
import Shop from "@/pages/Shop";
import SignIn from "@/pages/SignIn";
import { useLocation, Route, Switch } from "wouter";
import { homepagePreviewPath } from "@/lib/homepagePreview";
import { productPreviewPath } from "@/lib/productPreview";
import ErrorBoundary from "./components/ErrorBoundary";

function StorefrontRoutes() {
  const { profile, loading } = useAuth();
  const [location, navigate] = useLocation();
  // The admin preview routes stay renderable so the editor's iframe can load them.
  const isPreview = location === homepagePreviewPath || location === productPreviewPath;

  useEffect(() => {
    if (!loading && profile?.role === "admin" && !isPreview) navigate("/admin", { replace: true });
  }, [isPreview, loading, navigate, profile?.role]);

  if (!loading && profile?.role === "admin" && !isPreview) return null;

  return <StoreLayout><Switch><Route path="/" component={Home} /><Route path="/shop" component={Shop} /><Route path="/product/:slug" component={ProductDetail} /><Route path="/sign-in" component={SignIn} /><Route path="/account" component={Account} /><Route path="/account/orders/:orderNumber" component={AccountOrder} /><Route path={homepagePreviewPath} component={HomepagePreview} /><Route path={productPreviewPath} component={ProductPreview} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch></StoreLayout>;
}

function Router() {
  return <Switch><Route path="/admin" component={Admin} /><Route component={StorefrontRoutes} /></Switch>;
}

function App() {
  return <ErrorBoundary><TooltipProvider><AuthProvider><AddressBookProvider><CurrencyProvider><CatalogProvider><StoreProvider><Toaster /><Router /></StoreProvider></CatalogProvider></CurrencyProvider></AddressBookProvider></AuthProvider></TooltipProvider></ErrorBoundary>;
}

export default App;