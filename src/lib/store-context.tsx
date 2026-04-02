"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  type Role,
  type Permission,
  type RolePermissionOverrides,
  type StorePlan,
  type FeatureModule,
  hasPermission,
  hasFeature,
} from "@/lib/permissions";

const GOD_ADMIN_EMAIL = "info@fulluproar.com";

interface StoreData {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
}

interface StaffData {
  id: string;
  role: string;
  name: string;
  store_id: string;
}

interface ActiveStaffData {
  id: string;
  name: string;
  role: string;
}

interface StoreContextValue {
  store: StoreData | null;
  staff: StaffData | null;
  loading: boolean;
  effectiveRole: Role | null;
  actualRole: Role | null;
  isGodAdmin: boolean;
  isTestMode: boolean;
  setTestRole: (role: Role | null) => void;
  can: (permission: Permission) => boolean;
  hasModule: (feature: FeatureModule) => boolean;
  userEmail: string | null;
  // Layer 2: active staff
  activeStaff: ActiveStaffData | null;
  staffLocked: boolean;
  setActiveStaff: (staff: ActiveStaffData) => void;
  endShift: () => void;
}

const StoreContext = createContext<StoreContextValue>({
  store: null,
  staff: null,
  loading: true,
  effectiveRole: null,
  actualRole: null,
  isGodAdmin: false,
  isTestMode: false,
  setTestRole: () => {},
  can: () => false,
  hasModule: () => true,
  userEmail: null,
  activeStaff: null,
  staffLocked: false,
  setActiveStaff: () => {},
  endShift: () => {},
});

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [store, setStore] = useState<StoreData | null>(null);
  const [staff, setStaff] = useState<StaffData | null>(null);
  const [loading, setLoading] = useState(true);
  const [testRole, setTestRole] = useState<Role | null>(null);
  const [activeStaff, setActiveStaffState] = useState<ActiveStaffData | null>(null);
  const [activeStaffChecked, setActiveStaffChecked] = useState(false);

  useEffect(() => {
    if (status === "loading") return;

    if (!session?.user?.id) {
      setLoading(false);
      return;
    }

    async function loadStoreData() {
      try {
        const [meRes, authRes] = await Promise.all([
          fetch("/api/me"),
          fetch("/api/staff-auth"),
        ]);

        if (meRes.ok) {
          const data = await meRes.json();
          setStaff(data.staff);
          setStore(data.store);
        }

        if (authRes.ok) {
          const data = await authRes.json();
          if (data.staff) {
            setActiveStaffState(data.staff);
          }
        }
      } catch {
        // silently fail
      }
      setActiveStaffChecked(true);
      setLoading(false);
    }

    loadStoreData();
  }, [session, status]);

  const userEmail = session?.user?.email ?? null;
  const isGodAdmin = userEmail === GOD_ADMIN_EMAIL;
  const actualRole = (staff?.role as Role) ?? null;
  const isTestMode = isGodAdmin && testRole !== null;

  // If staff lock is enabled, use active staff's role. Otherwise use session staff.
  const staffLockEnabled = !!(store?.settings?.staff_lock_enabled);
  const staffLocked = staffLockEnabled && !activeStaff && activeStaffChecked;

  // Effective role: test mode > active staff > session staff
  const effectiveRole = isTestMode
    ? testRole
    : activeStaff
      ? (activeStaff.role as Role)
      : actualRole;

  // Permission overrides from store settings
  const roleOverrides = (store?.settings?.role_permissions ?? null) as RolePermissionOverrides | null;
  const plan = ((store?.settings?.plan as string) || "enterprise") as StorePlan;
  const addons = ((store?.settings?.addons as string[]) || []) as FeatureModule[];

  const can = useCallback(
    (permission: Permission) => {
      if (!effectiveRole) return false;
      if (isGodAdmin && !isTestMode) return true;
      return hasPermission(effectiveRole, permission, roleOverrides);
    },
    [effectiveRole, roleOverrides, isGodAdmin, isTestMode]
  );

  const hasModuleFn = useCallback(
    (feature: FeatureModule) => {
      if (isGodAdmin && !isTestMode) return true;
      return hasFeature(plan, addons, feature);
    },
    [plan, addons, isGodAdmin, isTestMode]
  );

  const setActiveStaff = useCallback((staffData: ActiveStaffData) => {
    setActiveStaffState(staffData);
  }, []);

  const endShift = useCallback(async () => {
    setActiveStaffState(null);
    try {
      await fetch("/api/staff-auth", { method: "DELETE" });
    } catch {
      // non-critical
    }
  }, []);

  return (
    <StoreContext.Provider
      value={{
        store,
        staff,
        loading,
        effectiveRole,
        actualRole,
        isGodAdmin,
        isTestMode,
        setTestRole,
        can,
        hasModule: hasModuleFn,
        userEmail,
        activeStaff,
        staffLocked,
        setActiveStaff,
        endShift,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}
