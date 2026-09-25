/**
 * Design direction: Technical Drop Editorial — the cart stays direct and machine-like, with no hidden commerce complexity.
 */
import { products } from "@/data/products";
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

export function StoreProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    const stored = window.sessionStorage.getItem("underrated-cart");
    if (stored) setCart(JSON.parse(stored));
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem("underrated-cart", JSON.stringify(cart));
  }, [cart]);

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
        setCart((lines) => {
          const existing = lines.find((line) => line.id === product.id && line.finish === finish);
          if (existing) return lines.map((line) => (line === existing ? { ...line, quantity: line.quantity + 1 } : line));
          return [...lines, { id: product.id, quantity: 1, finish }];
        });
        setCartOpen(true);
      },
      updateQuantity: (id, finish, quantity) => {
        setCart((lines) => lines.flatMap((line) => (line.id === id && line.finish === finish ? (quantity > 0 ? [{ ...line, quantity }] : []) : [line])));
      },
      removeLine: (id, finish) => setCart((lines) => lines.filter((line) => line.id !== id || line.finish !== finish)),
      clearCart: () => setCart([]),
    };
  }, [cart, cartOpen]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used inside StoreProvider");
  return context;
}
