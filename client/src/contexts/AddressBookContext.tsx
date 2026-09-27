/**
 * Design direction: Technical Drop Editorial - the address book is a workshop drawer: flat rows, hard edges, no rounding.
 * The book is shared so the account page and the checkout always read the same list.
 */
import { createAccountAddress, deleteAccountAddress, fetchAccountAddresses, setDefaultAccountAddress, toDeliveryAddress, updateAccountAddress, type AccountAddress, type AccountAddressInput } from "@/lib/accountAddresses";
import type { DeliveryAddress } from "@/lib/deliveryAddress";
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

type AddressBookContextValue = {
  addresses: AccountAddress[];
  loading: boolean;
  error: string | null;
  /** The address flagged as the default, in the shape the checkout expects. */
  defaultAddress: DeliveryAddress | null;
  refresh: () => Promise<void>;
  addAddress: (input: AccountAddressInput) => Promise<AccountAddress>;
  editAddress: (id: string, input: AccountAddressInput) => Promise<AccountAddress>;
  removeAddress: (id: string) => Promise<void>;
  promoteAddress: (id: string) => Promise<AccountAddress>;
};

const AddressBookContext = createContext<AddressBookContextValue | undefined>(undefined);

function message(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function AddressBookProvider({ children }: { children: ReactNode }) {
  const { user, isConfigured } = useAuth();
  const [addresses, setAddresses] = useState<AccountAddress[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isConfigured || !user) {
      setAddresses([]);
      setError(null);
      return;
    }

    setLoading(true);
    try {
      setAddresses(await fetchAccountAddresses());
      setError(null);
    } catch (loadError) {
      setError(message(loadError));
    } finally {
      setLoading(false);
    }
  }, [isConfigured, user?.id]);

  useEffect(() => {
    setAddresses([]);
    void refresh();
  }, [refresh]);

  // A write returns the settled row, but a default change touches the row that
  // lost the flag too, so the list is read back rather than patched in place.
  const run = useCallback(async (write: () => Promise<AccountAddress | void>) => {
    try {
      await write();
      await refresh();
    } catch (writeError) {
      setError(message(writeError));
      throw writeError;
    }
  }, [refresh]);

  const defaultAddress = useMemo(() => {
    const row = addresses.find((item) => item.is_default) ?? addresses[0];
    return row ? toDeliveryAddress(row) : null;
  }, [addresses]);

  const value = useMemo<AddressBookContextValue>(
    () => ({
      addresses,
      loading,
      error,
      defaultAddress,
      refresh,
      addAddress: async (input) => {
        const created = await createAccountAddress(input);
        await run(async () => created);
        return created;
      },
      editAddress: async (id, input) => {
        const updated = await updateAccountAddress(id, input);
        await run(async () => updated);
        return updated;
      },
      removeAddress: async (id) => {
        await deleteAccountAddress(id);
        await run(async () => undefined);
      },
      promoteAddress: async (id) => {
        const updated = await setDefaultAccountAddress(id);
        await run(async () => updated);
        return updated;
      },
    }),
    [addresses, defaultAddress, error, loading, refresh, run],
  );

  return <AddressBookContext.Provider value={value}>{children}</AddressBookContext.Provider>;
}

export function useAddressBook() {
  const context = useContext(AddressBookContext);
  if (!context) throw new Error("useAddressBook must be used inside AddressBookProvider");
  return context;
}
