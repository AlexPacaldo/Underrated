import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { money } from "@/data/products";

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
  countryCode: string;
  loading: boolean;
  setCurrency: (currency: SupportedCurrency) => void;
  formatMoney: (phpValue: number, snapshotCurrency?: string, snapshotRate?: number) => string;
};

const CurrencyContext = createContext<CurrencyContextValue | undefined>(undefined);
const CURRENCY_KEY = "underrated-currency";
const RATE_CACHE_KEY = "underrated-fx-cache";
const currencyCodes = new Set<string>(supportedCurrencies.map((item) => item.code));

type RateCache = { rate: number; savedAt: number };
type IpLocation = { country_code?: string; currency?: string };

function isSupportedCurrency(value: string | null | undefined): value is SupportedCurrency {
  return Boolean(value && currencyCodes.has(value));
}

function localeRegion() {
  const locale = typeof navigator === "undefined" ? "" : navigator.language;
  const match = locale.match(/[-_]([A-Za-z]{2})$/);
  return match?.[1]?.toUpperCase() ?? "";
}

function currencyForRegion(region: string): SupportedCurrency {
  const values: Record<string, SupportedCurrency> = { PH: "PHP", US: "USD", CA: "CAD", GB: "GBP", JP: "JPY", AU: "AUD", SG: "SGD" };
  return values[region] ?? "PHP";
}

function readCachedRate(currency: SupportedCurrency) {
  try {
    const raw = window.localStorage.getItem(RATE_CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as Record<string, RateCache>;
    const value = cache[currency];
    if (!value || !Number.isFinite(value.rate) || value.rate <= 0 || Date.now() - value.savedAt > 21600000) return null;
    return value.rate;
  } catch {
    return null;
  }
}

function cacheRate(currency: SupportedCurrency, rate: number) {
  try {
    const raw = window.localStorage.getItem(RATE_CACHE_KEY);
    const cache = raw ? JSON.parse(raw) as Record<string, RateCache> : {};
    cache[currency] = { rate, savedAt: Date.now() };
    window.localStorage.setItem(RATE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    return;
  }
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<SupportedCurrency>("PHP");
  const [rate, setRate] = useState(1);
  const [rateReady, setRateReady] = useState(true);
  const [countryCode, setCountryCode] = useState("PH");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = window.localStorage.getItem(CURRENCY_KEY);
    const savedCurrency = isSupportedCurrency(saved) ? saved : null;
    if (savedCurrency) setCurrencyState(savedCurrency);

    let active = true;
    const detect = async () => {
      if (!savedCurrency) {
        const localeCurrency = currencyForRegion(localeRegion());
        setCurrencyState(localeCurrency);
        try {
          const response = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(3500) });
          if (response.ok) {
            const location = (await response.json()) as IpLocation;
            const detectedCurrency = isSupportedCurrency(location.currency) ? location.currency : null;
            if (active && detectedCurrency) setCurrencyState(detectedCurrency);
            if (active && typeof location.country_code === "string") setCountryCode(location.country_code.toUpperCase());
          }
        } catch {
          return;
        }
      }
    };

    void detect().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (currency === "PHP") {
      setRate(1);
      setRateReady(true);
      return () => {
        active = false;
      };
    }

    const cached = readCachedRate(currency);
    setRate(cached ?? 1);
    setRateReady(cached !== null);

    fetch(`https://api.frankfurter.dev/v2/rate/PHP/${currency}`, { signal: AbortSignal.timeout(5000) })
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
          cacheRate(currency, nextRate);
        }
      })
      .catch(() => {
        if (active) setRateReady(cached !== null);
      });

    return () => {
      active = false;
    };
  }, [currency]);

  const setCurrency = useCallback((nextCurrency: SupportedCurrency) => {
    setCurrencyState(nextCurrency);
    window.localStorage.setItem(CURRENCY_KEY, nextCurrency);
  }, []);

  const formatMoney = useCallback((phpValue: number, snapshotCurrency?: string, snapshotRate?: number) => {
    const targetCurrency = isSupportedCurrency(snapshotCurrency) ? snapshotCurrency : currency;
    const targetRate = targetCurrency === "PHP" ? 1 : Number(snapshotRate ?? rate);
    return money(phpValue, targetCurrency, Number.isFinite(targetRate) && targetRate > 0 ? targetRate : 1, "en-PH");
  }, [currency, rate]);

  const value = useMemo<CurrencyContextValue>(() => ({ currency, rate, rateReady, countryCode, loading, setCurrency, formatMoney }), [countryCode, currency, formatMoney, loading, rate, rateReady, setCurrency]);
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error("useCurrency must be used inside CurrencyProvider");
  return context;
}
