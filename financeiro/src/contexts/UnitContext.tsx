'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const ALL_UNITS = ['Barueri', 'Osasco', 'SBC', 'SCS'];
const STORAGE_KEY = 'virtuosa_global_unit';

// Maps permission keys to unit names
const UNIT_PERMISSION_MAP: Record<string, string> = {
  unitBarueri: 'Barueri',
  unitOsasco: 'Osasco',
  unitSBC: 'SBC',
  unitSCS: 'SCS',
};

interface UnitContextType {
  globalUnit: string;
  setGlobalUnit: (u: string) => void;
  /** Only the units this user is allowed to access */
  units: string[];
  /** All units in the system (for admin forms, etc.) */
  allUnits: string[];
}

const UnitContext = createContext<UnitContextType>({
  globalUnit: 'Barueri',
  setGlobalUnit: () => {},
  units: ALL_UNITS,
  allUnits: ALL_UNITS,
});

function getAllowedUnits(): string[] {
  try {
    const raw = localStorage.getItem('virtuosa_user');
    if (!raw) return ALL_UNITS;
    const user = JSON.parse(raw);
    const perms = user.permissions || {};
    const isAdmin = perms.admin === true || user.role === 'ADMINISTRADOR';

    // Admins see everything
    if (isAdmin) return ALL_UNITS;

    // Build array from individual unit permissions
    const allowed: string[] = [];
    for (const [permKey, unitName] of Object.entries(UNIT_PERMISSION_MAP)) {
      if (perms[permKey] === true) {
        allowed.push(unitName);
      }
    }

    // Fallback: if no unit permissions set at all, use the user's assigned unit
    if (allowed.length === 0) {
      if (user.unit && ALL_UNITS.includes(user.unit)) {
        return [user.unit];
      }
      // Last resort — show all (legacy users without unit perms)
      return ALL_UNITS;
    }

    return allowed;
  } catch {
    return ALL_UNITS;
  }
}

export function UnitProvider({ children }: { children: ReactNode }) {
  const [globalUnit, setGlobalUnitState] = useState('Barueri');
  const [allowedUnits, setAllowedUnits] = useState<string[]>(ALL_UNITS);

  useEffect(() => {
    const allowed = getAllowedUnits();
    setAllowedUnits(allowed);

    // Load saved unit preference
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && allowed.includes(saved)) {
      setGlobalUnitState(saved);
    } else {
      // Saved unit is not allowed — reset to first allowed unit
      const fallback = allowed[0] || 'Barueri';
      setGlobalUnitState(fallback);
      localStorage.setItem(STORAGE_KEY, fallback);
    }
  }, []);

  // Re-calculate allowed units when user data changes (e.g., after login)
  useEffect(() => {
    const handler = () => {
      const allowed = getAllowedUnits();
      setAllowedUnits(allowed);
      // If current unit is no longer allowed, reset
      setGlobalUnitState(prev => {
        if (!allowed.includes(prev)) {
          const fallback = allowed[0] || 'Barueri';
          localStorage.setItem(STORAGE_KEY, fallback);
          window.dispatchEvent(new CustomEvent('virtuosa-unit-change', { detail: fallback }));
          return fallback;
        }
        return prev;
      });
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const setGlobalUnit = (u: string) => {
    // Security: block setting a unit the user doesn't have access to
    if (!allowedUnits.includes(u)) {
      console.warn(`[UnitContext] Blocked attempt to switch to unauthorized unit: ${u}`);
      return;
    }
    setGlobalUnitState(u);
    localStorage.setItem(STORAGE_KEY, u);
    window.dispatchEvent(new CustomEvent('virtuosa-unit-change', { detail: u }));
  };

  return (
    <UnitContext.Provider value={{ globalUnit, setGlobalUnit, units: allowedUnits, allUnits: ALL_UNITS }}>
      {children}
    </UnitContext.Provider>
  );
}

export function useGlobalUnit() {
  return useContext(UnitContext);
}
