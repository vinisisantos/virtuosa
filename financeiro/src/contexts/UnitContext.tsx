'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const UNITS = ['Barueri', 'Osasco', 'SBC', 'SCS'];
const STORAGE_KEY = 'virtuosa_global_unit';

interface UnitContextType {
  globalUnit: string;
  setGlobalUnit: (u: string) => void;
  units: string[];
}

const UnitContext = createContext<UnitContextType>({
  globalUnit: 'Barueri',
  setGlobalUnit: () => {},
  units: UNITS,
});

export function UnitProvider({ children }: { children: ReactNode }) {
  const [globalUnit, setGlobalUnitState] = useState('Barueri');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && UNITS.includes(saved)) {
      setGlobalUnitState(saved);
    } else {
      // Fallback to user's assigned unit
      try {
        const raw = localStorage.getItem('virtuosa_user');
        if (raw) {
          const user = JSON.parse(raw);
          if (user.unit && UNITS.includes(user.unit)) {
            setGlobalUnitState(user.unit);
          }
        }
      } catch {}
    }
  }, []);

  const setGlobalUnit = (u: string) => {
    setGlobalUnitState(u);
    localStorage.setItem(STORAGE_KEY, u);
    // Dispatch a custom event so other components (useDashboard, etc.) can react
    window.dispatchEvent(new CustomEvent('virtuosa-unit-change', { detail: u }));
  };

  return (
    <UnitContext.Provider value={{ globalUnit, setGlobalUnit, units: UNITS }}>
      {children}
    </UnitContext.Provider>
  );
}

export function useGlobalUnit() {
  return useContext(UnitContext);
}
