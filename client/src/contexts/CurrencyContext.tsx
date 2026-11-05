import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { money } from "@/data/products";

/**
 * The storefront sells in USD. The remaining codes stay listed so that orders
 * placed in another currency still render at the rate saved with the order.
 */
export const supportedCurrencies = [
  { code: "PHP", label: "PHP", name: " Philippine peso" },
  { code: "USD", label: "USD", name: " US dollar" },
  { code: "EUR", label: "EUR", name: " Euro" },
  { code: "GBP", label: "GBP", name: " British pound" },
  { code: "JPY", label: "JPY", name: " Japanese yen" },
  { code: "AUD", label: "AUD", name: " Australian dollar" },
  { code: "CAD", label: "CAD", name: " Canadian dollar" },
  { code: "SGD", label: "SGD", name: " Singapore dollar" },
] as const;

type SupportedCurrency = (typeof supportedCurrencies)[number]["code"];
type CurrencyContextValue = {
  currency: SupportedCurrency;
  rate: number;
  rateReady: boolean;
  formatMoney: (phpValue: number, snapshotCurrency?: string, snapshotRate?: number) => string;
};

const CurrencyContext = createContext<CurrencyContextValue | undefined>(undefined);
const DISPLAY_CURRENCY: SupportedCurrency = "USD";
const RATE_CACHE_KEY = "underrated-fx-cache";
// Keeps first paint in the right range while the live PHP → USD rate is in flight.
const FALLBACK_RATE = 0.017;
const currencyCodes = new Set<string>(supportedCurrencies.map((item) => item.code));

type RateCache = { rate: number; savedAt: number };

function isSupportedCurrency(value: string | null | undefined): value is SupportedCurrency {
  return Boolean(value && currencyCodes.has(value));
}

function readCachedRate() {
  try {
    const raw = window.localStorage.getItem(RATE_CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as Record<string, RateCache>;
    const value = cache[DISPLAY_CURRENCY];
    if (!value || !Number.isFinite(value.rate) || value.rate <= 0 || Date.now() - value.savedAt > 21600000) return null;
    return value.rate;
  } catch {
    return null;
  }
}

function cacheRate(rate: number) {
  try {
    const raw = window.localStorage.getItem(RATE_CACHE_KEY);
    const cache = raw ? JSON.parse(raw) as Record<string, RateCache> : {};
    cache[DISPLAY_CURRENCY] = { rate, savedAt: Date.now() };
    window.localStorage.setItem(RATE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    return;
  }
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [rate, setRate] = useState(FALLBACK_RATE);
  const [rateReady, setRateReady] = useState(false);

  useEffect(() => {
    let active = true;
    const cached = readCachedRate();
    if (cached !== null) {
      setRate(cached);
      setRateReady(true);
    }

    fetch(`https://api.frankfurter.dev/v2/rate/PHP/${DISPLAY_CURRENCY}`, { signal: AbortSignal.timeout(5000) })
      .then(async (response) => {
        if (!response.ok) throw new Error("FX rate unavailable");
        return (await response.json()) as { rate?: number };
      })
      .then((payload) => {
        const nextRate = Number(payload.rate);
        if (!Number.isFinite(nextRate) || nextRate <= 0) throw new Error("FX rate invalid");
        if (active) {
          setRate(nextRate);
          setRateReady(true);
          cacheRate(nextRate);
        }
      })
      .catch(() => {
        if (active) setRateReady(cached !== null);
      });

    return () => {
      active = false;
    };
  }, []);

  const formatMoney = useCallback((phpValue: number, snapshotCurrency?: string, snapshotRate?: number) => {
    const targetCurrency = isSupportedCurrency(snapshotCurrency) ? snapshotCurrency : DISPLAY_CURRENCY;
    const targetRate = targetCurrency === "PHP" ? 1 : Number(snapshotRate ?? rate);
    return money(phpValue, targetCurrency, Number.isFinite(targetRate) && targetRate > 0 ? targetRate : FALLBACK_RATE, "en-PH");
  }, [rate]);

  const value = useMemo<CurrencyContextValue>(() => ({ currency: DISPLAY_CURRENCY, rate, rateReady, formatMoney }), [formatMoney, rate, rateReady]);
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error("useCurrency must be used inside CurrencyProvider");
  return context;
}
