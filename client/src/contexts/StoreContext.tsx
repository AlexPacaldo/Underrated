import { useAuth } from "@/contexts/AuthContext";
import { useCatalog } from "@/contexts/CatalogContext";
import type { Product } from "@/data/products";
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

export type CartLine = { id: string; quantity: number; finish: string };

type StoreContextValue = {
  cart: CartLine[];
  cartOpen: boolean;
  totalItems: number;
  subtotal: number;
  openCart: () => void;
  closeCart: () => void;
  addToCart: (product: Product, finish?: string) => void;
  updateQuantity: (id: string, finish: string, quantity: number) => void;
  removeLine: (id: string, finish: string) => void;
  clearCart: () => void;
};

const StoreContext = createContext<StoreContextValue | undefined>(undefined);
const LEGACY_CART_KEY = "underrated-cart";
const GUEST_CART_KEY = "underrated-cart:guest";
const MAX_LINE_QUANTITY = 99;

function mergeCartLines(...carts: CartLine[][]) {
  const merged = new Map<string, CartLine>();
  for (const cart of carts) {
    for (const line of cart) {
      if (!line.id || !line.finish || line.quantity <= 0) continue;
      const key = `${line.id}-${line.finish}`;
      const existing = merged.get(key);
      merged.set(key, existing ? { ...existing, quantity: Math.min(MAX_LINE_QUANTITY, existing.quantity + line.quantity) } : { ...line, quantity: Math.min(MAX_LINE_QUANTITY, line.quantity) });
    }
  }
  return Array.from(merged.values());
}

function readCart(storageKey: string) {
  const stored = window.localStorage.getItem(storageKey) ?? window.sessionStorage.getItem(storageKey);
  if (!stored) return [] as CartLine[];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as CartLine[]) : [];
  } catch {
    return [];
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const { products } = useCatalog();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [loadedCartKey, setLoadedCartKey] = useState<string | null>(null);
  const cartStorageKey = user ? `underrated-cart:user:${user.id}` : GUEST_CART_KEY;

  useEffect(() => {
    if (authLoading) return;

    if (user) {
      const userCart = readCart(cartStorageKey);
      const guestCart = readCart(GUEST_CART_KEY);
      const mergedCart = mergeCartLines(userCart, guestCart);
      setCart(mergedCart);

      if (guestCart.length > 0) {
        window.localStorage.setItem(cartStorageKey, JSON.stringify(mergedCart));
        window.localStorage.removeItem(GUEST_CART_KEY);
        window.sessionStorage.removeItem(GUEST_CART_KEY);
      }

      setLoadedCartKey(cartStorageKey);
      return;
    }

    const guestCart = readCart(GUEST_CART_KEY);
    const legacyGuestCart = readCart(LEGACY_CART_KEY);
    setCart(guestCart.length > 0 ? guestCart : legacyGuestCart);

    if (legacyGuestCart.length > 0 && guestCart.length === 0) {
      window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify(legacyGuestCart));
      window.sessionStorage.removeItem(LEGACY_CART_KEY);
    }

    setLoadedCartKey(cartStorageKey);
  }, [authLoading, cartStorageKey, user]);

  useEffect(() => {
    if (authLoading || loadedCartKey !== cartStorageKey) return;
    window.localStorage.setItem(cartStorageKey, JSON.stringify(cart));
  }, [authLoading, cart, cartStorageKey, loadedCartKey]);

  const value = useMemo<StoreContextValue>(() => {
    const totalItems = cart.reduce((count, line) => count + line.quantity, 0);
    const subtotal = cart.reduce((sum, line) => {
      const item = products.find((product) => product.id === line.id);
      return sum + (item?.price ?? 0) * line.quantity;
    }, 0);

    return {
      cart,
      cartOpen,
      totalItems,
      subtotal,
      openCart: () => setCartOpen(true),
      closeCart: () => setCartOpen(false),
      addToCart: (product, finish = product.finishes[0]) => {
        if (!finish) return;
        setCart((lines) => {
          const existing = lines.find((line) => line.id === product.id && line.finish === finish);
          if (existing) return lines.map((line) => (line === existing ? { ...line, quantity: Math.min(MAX_LINE_QUANTITY, line.quantity + 1) } : line));
          return [...lines, { id: product.id, quantity: 1, finish }];
        });
        setCartOpen(true);
      },
      updateQuantity: (id, finish, quantity) => {
        setCart((lines) => lines.flatMap((line) => (line.id === id && line.finish === finish ? (quantity > 0 ? [{ ...line, quantity: Math.min(MAX_LINE_QUANTITY, Math.floor(quantity)) }] : []) : [line])));
      },
      removeLine: (id, finish) => setCart((lines) => lines.filter((line) => line.id !== id || line.finish !== finish)),
      clearCart: () => setCart([]),
    };
  }, [cart, cartOpen, products]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used inside StoreProvider");
  return context;
}
