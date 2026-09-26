/** Design direction: Technical Drop Editorial - route composition stays inside a dark, high-contrast storefront shell. */
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import StoreLayout from "@/components/StoreLayout";
import { AuthProvider } from "@/contexts/AuthContext";
import { CatalogProvider } from "@/contexts/CatalogContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { StoreProvider } from "@/contexts/StoreContext";
import About from "@/pages/About";
import Account from "@/pages/Account";
import Admin from "@/pages/Admin";
import Home from "@/pages/Home";
import HomepagePreview from "@/pages/HomepagePreview";
import NotFound from "@/pages/NotFound";
import ProductDetail from "@/pages/ProductDetail";
import Shop from "@/pages/Shop";
import SignIn from "@/pages/SignIn";
import { Route, Switch } from "wouter";
import { homepagePreviewPath } from "@/lib/homepagePreview";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

function Router() {
  return <StoreLayout><Switch><Route path="/" component={Home} /><Route path="/shop" component={Shop} /><Route path="/product/:slug" component={ProductDetail} /><Route path="/about" component={About} /><Route path="/sign-in" component={SignIn} /><Route path="/account" component={Account} /><Route path="/admin" component={Admin} /><Route path={homepagePreviewPath} component={HomepagePreview} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch></StoreLayout>;
}

function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="dark"><TooltipProvider><AuthProvider><CurrencyProvider><CatalogProvider><StoreProvider><Toaster theme="dark" /><Router /></StoreProvider></CatalogProvider></CurrencyProvider></AuthProvider></TooltipProvider></ThemeProvider></ErrorBoundary>;
}

export default App;