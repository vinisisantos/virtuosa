'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const ALL_UNITS = [ 'Osasco', 'SBC', 'SCS'];
// "Todas" is represented as an empty string so pages that do
// `if (unit) params.set('unit', unit)` simply send NO filter → all units.
// Only admins ever get this option (the API guard would leak other units
// otherwise), so non-admins switch between their permitted units one at a time.
const ALL_VALUE = '';
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
  globalUnit: 'Osasco',
  setGlobalUnit: () => {},
  units: ALL_UNITS,
  allUnits: ALL_UNITS,
});

function getAllowedUnits(): string[] {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('virtuosa_user') : null;
    if (!raw) return [ALL_VALUE, ...ALL_UNITS];
    const user = JSON.parse(raw);
    const perms = user.permissions || {};
    const isAdmin = perms.admin === true || user.role === 'ADMINISTRADOR';

    // Admins: "Todas" (no filter) + each unit
    if (isAdmin) return [ALL_VALUE, ...ALL_UNITS];

    // Build array from individual unit permissions (Barueri excluded — not selectable)
    const allowed: string[] = [];
    for (const [permKey, unitName] of Object.entries(UNIT_PERMISSION_MAP)) {
      if (perms[permKey] === true && ALL_UNITS.includes(unitName)) {
        allowed.push(unitName);
      }
    }

    // multiUnit flag → can browse every unit (one at a time; no "Todas" for non-admins)
    if (perms.multiUnit === true) return allowed.length ? allowed : [...ALL_UNITS];

    if (allowed.length > 0) return allowed;

    // Fallback: the user's assigned unit, else every unit (legacy)
    if (user.unit && ALL_UNITS.includes(user.unit)) return [user.unit];
    return [...ALL_UNITS];
  } catch {
    return [ALL_VALUE, ...ALL_UNITS];
  }
}

/** Compute initial values SYNCHRONOUSLY so the very first render has correct data */
function getInitialState(): { allowed: string[]; unit: string } {
  if (typeof window === 'undefined') {
    return { allowed: [ALL_VALUE, ...ALL_UNITS], unit: ALL_VALUE };
  }
  const allowed = getAllowedUnits();
  const saved = localStorage.getItem(STORAGE_KEY);
  // saved may legitimately be '' (Todas) — only reject when not in allowed
  if (saved !== null && allowed.includes(saved)) {
    return { allowed, unit: saved };
  }
  const fallback = allowed[0] ?? (ALL_UNITS[0] || 'SCS');
  localStorage.setItem(STORAGE_KEY, fallback);
  return { allowed, unit: fallback };
}

export function UnitProvider({ children }: { children: ReactNode }) {
  // Initialize synchronously — no race conditions
  const [initial] = useState(getInitialState);
  const [globalUnit, setGlobalUnitState] = useState(initial.unit);
  const [allowedUnits, setAllowedUnits] = useState<string[]>(initial.allowed);

  // Re-calculate allowed units when user data changes (e.g., after login)
  useEffect(() => {
    const handler = () => {
      const allowed = getAllowedUnits();
      setAllowedUnits(allowed);
      // If current unit is no longer allowed, reset
      setGlobalUnitState(prev => {
        if (!allowed.includes(prev)) {
          const fallback = allowed[0] ?? 'SCS';
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
