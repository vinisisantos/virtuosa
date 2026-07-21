import { useCallback, useEffect, useState } from 'react';
import { getUserUnit, isUserAdmin } from '@/components/unit-selector';
import type { PayrollEntryData, PayrollSummary } from '@/lib/types';

type FinanceiroTab = 'folha' | 'adiantamento' | 'premiacao' | 'reembolso' | 'custos' | 'analise' | 'vt' | 'vr';

const TABS: { key: FinanceiroTab; label: string; icon: string; color: string }[] = [
  { key: 'folha', label: 'Folha de Pagamento', icon: 'payments', color: '#6366f1' },
  { key: 'adiantamento', label: 'Adiantamento', icon: 'account_balance_wallet', color: '#14b8a6' },
  { key: 'reembolso', label: 'Reembolso', icon: 'receipt_long', color: '#f97316' },
  { key: 'custos', label: 'Custos', icon: 'account_balance', color: '#8b5cf6' },
];

const EMPTY_SUMMARY: PayrollSummary = {
  totalPayroll: 0,
  totalPaid: 0,
  totalPending: 0,
  totalEmployees: 0,
  paidCount: 0,
  pendingCount: 0,
  reviewCount: 0,
  totalBaseSalary: 0,
  totalBonus: 0,
  totalCredits: 0,
  totalDebits: 0,
  cltCount: 0,
  pjCount: 0,
  undefinedRegimeCount: 0,
};

export { TABS };
export type { FinanceiroTab };

export function useFinanceiro() {
  const [activeTab, setActiveTab] = useState<FinanceiroTab>(() => {
    if (typeof window !== 'undefined') {
      const urlTab = new URLSearchParams(window.location.search).get('tab');
      if (urlTab && TABS.some(tab => tab.key === urlTab)) return urlTab as FinanceiroTab;
      const saved = localStorage.getItem('virtuosa_financeiro_tab');
      if (saved && TABS.some(tab => tab.key === saved)) return saved as FinanceiroTab;
    }
    return 'folha';
  });
  const [competenceMonth, setCompetenceMonth] = useState(new Date().getMonth() + 1);
  const [competenceYear, setCompetenceYear] = useState(new Date().getFullYear());
  const [entries, setEntries] = useState<PayrollEntryData[]>([]);
  const [summary, setSummary] = useState<PayrollSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedUnit, setSelectedUnit] = useState(() => {
    if (typeof window !== 'undefined') {
      const globalUnit = localStorage.getItem('virtuosa_global_unit');
      if (globalUnit) return globalUnit;
    }
    return isUserAdmin() ? 'all' : getUserUnit();
  });

  useEffect(() => {
    const urlTab = new URLSearchParams(window.location.search).get('tab');
    if (urlTab && TABS.some(tab => tab.key === urlTab)) setActiveTab(urlTab as FinanceiroTab);
  }, []);

  useEffect(() => {
    localStorage.setItem('virtuosa_financeiro_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    const handler = (event: Event) => {
      const unit = (event as CustomEvent).detail;
      if (unit) setSelectedUnit(unit);
    };
    window.addEventListener('virtuosa-unit-change', handler);
    return () => window.removeEventListener('virtuosa-unit-change', handler);
  }, []);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const unitParam = selectedUnit !== 'all' ? `&unit=${encodeURIComponent(selectedUnit)}` : '';
      const response = await fetch(`/api/payroll/entries?month=${competenceMonth}&year=${competenceYear}${unitParam}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao carregar a folha');

      setEntries(data.entries || []);
      setSummary({ ...EMPTY_SUMMARY, ...(data.summary || {}) });
    } catch (error) {
      setEntries([]);
      setSummary(EMPTY_SUMMARY);
      setLoadError(error instanceof Error ? error.message : 'Erro ao carregar a folha');
    } finally {
      setLoading(false);
    }
  }, [competenceMonth, competenceYear, selectedUnit]);

  useEffect(() => {
    if (activeTab === 'folha') void fetchEntries();
  }, [activeTab, fetchEntries]);

  return {
    activeTab,
    setActiveTab,
    competenceMonth,
    setCompetenceMonth,
    competenceYear,
    setCompetenceYear,
    entries,
    summary,
    loading,
    loadError,
    selectedUnit,
    setSelectedUnit,
    fetchEntries,
  };
}
