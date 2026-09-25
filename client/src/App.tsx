/** Design direction: Technical Drop Editorial — route composition stays inside a dark, high-contrast storefront shell. */
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import StoreLayout from "@/components/StoreLayout";
import { AuthProvider } from "@/contexts/AuthContext";
import { StoreProvider } from "@/contexts/StoreContext";
import About from "@/pages/About";
import Home from "@/pages/Home";
import NotFound from "@/pages/NotFound";
import ProductDetail from "@/pages/ProductDetail";
import Shop from "@/pages/Shop";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

function Router() {
  return <StoreLayout><Switch><Route path="/" component={Home} /><Route path="/shop" component={Shop} /><Route path="/product/:slug" component={ProductDetail} /><Route path="/about" component={About} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch></StoreLayout>;
}

function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="dark"><TooltipProvider><AuthProvider><StoreProvider><Toaster theme="dark" /><Router /></StoreProvider></AuthProvider></TooltipProvider></ThemeProvider></ErrorBoundary>;
}

export default App;
