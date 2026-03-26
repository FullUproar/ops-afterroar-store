"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Store, Staff } from "@/lib/types";

interface StoreContextValue {
  store: Store | null;
  staff: Staff | null;
  loading: boolean;
}

const StoreContext = createContext<StoreContextValue>({
  store: null,
  staff: null,
  loading: true,
});

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [store, setStore] = useState<Store | null>(null);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data: staffRow } = await supabase
        .from("staff")
        .select("*, stores(*)")
        .eq("user_id", user.id)
        .eq("active", true)
        .single();

      if (staffRow) {
        const { stores: storeData, ...staffData } = staffRow as Record<string, unknown>;
        setStaff(staffData as unknown as Staff);
        setStore(storeData as unknown as Store);
      }

      setLoading(false);
    }

    load();
  }, []);

  return (
    <StoreContext.Provider value={{ store, staff, loading }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}
