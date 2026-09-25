import type { DeliveryAddress } from "@/lib/deliveryAddress";
import { supabase } from "@/lib/supabase";
import type { Session, User } from "@supabase/supabase-js";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type AccountRole = "customer" | "staff" | "admin";

export type AccountProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: AccountRole;
  default_shipping_address: DeliveryAddress | null;
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: AccountProfile | null;
  loading: boolean;
  isConfigured: boolean;
  signInWithGoogle: (redirectTo?: string) => Promise<void>;
  saveDefaultAddress: (address: DeliveryAddress) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getProfilePayload(user: User) {
  return {
    id: user.id,
    email: user.email ?? null,
    full_name: (user.user_metadata?.full_name as string | undefined) ?? (user.user_metadata?.name as string | undefined) ?? null,
    avatar_url: (user.user_metadata?.avatar_url as string | undefined) ?? (user.user_metadata?.picture as string | undefined) ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const activeProfileUserId = useRef<string | null>(null);

  const syncProfile = useCallback(async (user: User | null) => {
    if (!supabase || !user) {
      if (activeProfileUserId.current === null) setProfile(null);
      return;
    }

    const userId = user.id;
    const payload = getProfilePayload(user);
    const { error: upsertError } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
    if (upsertError) throw upsertError;

    const { data, error } = await supabase.from("profiles").select("id,email,full_name,avatar_url,role,default_shipping_address").eq("id", userId).single();
    if (error) throw error;

    if (activeProfileUserId.current !== userId) return;
    setProfile(data as AccountProfile);
  }, []);

  const saveDefaultAddress = useCallback(async (address: DeliveryAddress) => {
    const userId = session?.user?.id;
    if (!supabase || !userId) throw new Error("You must be signed in to save a delivery address.");

    const { data, error } = await supabase
      .from("profiles")
      .update({ default_shipping_address: address })
      .eq("id", userId)
      .select("id,email,full_name,avatar_url,role,default_shipping_address")
      .single();

    if (error) throw error;
    if (activeProfileUserId.current === userId) setProfile(data as AccountProfile);
  }, [session?.user?.id]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      const nextUser = data.session?.user ?? null;
      const nextUserId = nextUser?.id ?? null;
      if (activeProfileUserId.current !== nextUserId) setProfile(null);
      activeProfileUserId.current = nextUserId;
      setSession(data.session);
      try {
        await syncProfile(nextUser);
      } finally {
        if (mounted) setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextUser = nextSession?.user ?? null;
      const nextUserId = nextUser?.id ?? null;
      if (activeProfileUserId.current !== nextUserId) setProfile(null);
      activeProfileUserId.current = nextUserId;
      setSession(nextSession);
      window.setTimeout(() => {
        if (!mounted || activeProfileUserId.current !== (nextUser?.id ?? null)) return;
        syncProfile(nextUser).catch(() => {
          if (activeProfileUserId.current === (nextUser?.id ?? null)) setProfile(null);
        });
      }, 0);
    });

    return () => {
      mounted = false;
      activeProfileUserId.current = null;
      subscription.unsubscribe();
    };
  }, [syncProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      profile,
      loading,
      isConfigured: Boolean(supabase),
      saveDefaultAddress,
      signInWithGoogle: async (redirectTo = window.location.origin) => {
        if (!supabase) return;
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo,
            queryParams: {
              access_type: "offline",
              prompt: "consent",
            },
          },
        });
        if (error) throw error;
      },
      signOut: async () => {
        if (!supabase) return;
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        activeProfileUserId.current = null;
        setProfile(null);
      },
    }),
    [loading, profile, saveDefaultAddress, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
