import { useCallback, useEffect, useRef, useState } from 'react';
import { getUserUnit, isUserAdmin } from '@/components/unit-selector';
import { useVisiblePolling } from '@/hooks/use-visible-polling';
import {
  normalizePayrollSyncUnit,
  payrollSyncSignalAffectsScope,
  subscribePayrollSync,
} from '@/lib/payroll-client-sync';
import type { PayrollSyncSignal } from '@/lib/payroll-client-sync';
import { getInitialPayrollCompetence } from '@/lib/payroll-competence';
import type { PayrollEntryData, PayrollSummary } from '@/lib/types';

type FinanceiroTab = 'folha' | 'adiantamento' | 'premiacao' | 'reembolso' | 'custos' | 'analise' | 'vt' | 'vr';
type PayrollLoadMode = 'initial' | 'manual' | 'silent';

interface PayrollEntriesResponse {
  entries?: PayrollEntryData[];
  summary?: Partial<PayrollSummary>;
  revision?: string;
  error?: string;
}

interface PayrollRevisionResponse {
  revision?: string;
  competenceMonth?: number;
  competenceYear?: number;
  unit?: string;
  error?: string;
}

const PAYROLL_REVISION_INTERVAL_MS = 60_000;

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
  totalHazardPay: 0,
  totalGrossSalary: 0,
  totalInss: 0,
  totalFgts: 0,
  cltCount: 0,
  pjCount: 0,
  undefinedRegimeCount: 0,
};

function payrollScopeKey(month: number, year: number, unit: string) {
  return `${year}-${month}:${normalizePayrollSyncUnit(unit)}`;
}

function payrollQuery(month: number, year: number, unit: string) {
  const params = new URLSearchParams({ month: String(month), year: String(year) });
  const normalizedUnit = normalizePayrollSyncUnit(unit);
  if (normalizedUnit !== 'all') params.set('unit', normalizedUnit);
  return params.toString();
}

function revisionQuery(month: number, year: number, unit: string) {
  const params = new URLSearchParams({
    month: String(month),
    year: String(year),
    unit: normalizePayrollSyncUnit(unit),
  });
  return params.toString();
}

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
  const initialPayrollCompetence = getInitialPayrollCompetence();
  const [competenceMonthState, setCompetenceMonthState] = useState(initialPayrollCompetence.month);
  const [competenceYearState, setCompetenceYearState] = useState(initialPayrollCompetence.year);
  const [entries, setEntries] = useState<PayrollEntryData[]>([]);
  const [summary, setSummary] = useState<PayrollSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedUnitState, setSelectedUnitState] = useState(() => {
    if (typeof window !== 'undefined') {
      const globalUnit = localStorage.getItem('virtuosa_global_unit');
      if (globalUnit !== null) return normalizePayrollSyncUnit(globalUnit);
    }
    return isUserAdmin() ? 'all' : getUserUnit();
  });

  const competenceMonthRef = useRef(competenceMonthState);
  const competenceYearRef = useRef(competenceYearState);
  const selectedUnitRef = useRef(selectedUnitState);
  const activeTabRef = useRef(activeTab);
  const scopeKeyRef = useRef(payrollScopeKey(competenceMonthState, competenceYearState, selectedUnitState));
  const loadedScopeRef = useRef<string | null>(null);
  const revisionRef = useRef<string | null>(null);
  const pendingRevisionRef = useRef<string | null>(null);
  const entriesAbortRef = useRef<AbortController | null>(null);
  const entriesCompletionRef = useRef<Promise<void> | null>(null);
  const revisionAbortRef = useRef<AbortController | null>(null);
  const entriesRequestSequenceRef = useRef(0);
  const revisionRequestSequenceRef = useRef(0);
  const reconciliationSequenceRef = useRef(0);

  competenceMonthRef.current = competenceMonthState;
  competenceYearRef.current = competenceYearState;
  selectedUnitRef.current = selectedUnitState;
  activeTabRef.current = activeTab;
  const currentScopeKey = payrollScopeKey(competenceMonthState, competenceYearState, selectedUnitState);
  scopeKeyRef.current = currentScopeKey;

  const invalidateRequests = useCallback(() => {
    entriesRequestSequenceRef.current += 1;
    revisionRequestSequenceRef.current += 1;
    reconciliationSequenceRef.current += 1;
    entriesAbortRef.current?.abort();
    revisionAbortRef.current?.abort();
    entriesAbortRef.current = null;
    entriesCompletionRef.current = null;
    revisionAbortRef.current = null;
  }, []);

  const resetRevision = useCallback(() => {
    revisionRef.current = null;
    pendingRevisionRef.current = null;
    loadedScopeRef.current = null;
  }, []);

  const updatePendingScope = useCallback((month: number, year: number, unit: string) => {
    competenceMonthRef.current = month;
    competenceYearRef.current = year;
    selectedUnitRef.current = unit;
    scopeKeyRef.current = payrollScopeKey(month, year, unit);
    invalidateRequests();
    resetRevision();
    if (activeTabRef.current === 'folha') {
      setEntries([]);
      setSummary(EMPTY_SUMMARY);
      setLoadError('');
      setLoading(true);
    }
  }, [invalidateRequests, resetRevision]);

  const setCompetenceMonth = useCallback((month: number) => {
    if (month === competenceMonthRef.current) return;
    updatePendingScope(month, competenceYearRef.current, selectedUnitRef.current);
    setCompetenceMonthState(month);
  }, [updatePendingScope]);

  const setCompetenceYear = useCallback((year: number) => {
    if (year === competenceYearRef.current) return;
    updatePendingScope(competenceMonthRef.current, year, selectedUnitRef.current);
    setCompetenceYearState(year);
  }, [updatePendingScope]);

  const setSelectedUnit = useCallback((unit: string) => {
    const normalizedUnit = normalizePayrollSyncUnit(unit);
    if (normalizedUnit === selectedUnitRef.current) return;
    updatePendingScope(competenceMonthRef.current, competenceYearRef.current, normalizedUnit);
    setSelectedUnitState(normalizedUnit);
  }, [updatePendingScope]);

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
      if (typeof unit === 'string') setSelectedUnit(unit);
    };
    window.addEventListener('virtuosa-unit-change', handler);
    return () => window.removeEventListener('virtuosa-unit-change', handler);
  }, [setSelectedUnit]);

  const loadEntries = useCallback(async ({ mode }: { mode: PayrollLoadMode }) => {
    const month = competenceMonthState;
    const year = competenceYearState;
    const unit = selectedUnitState;
    const requestScope = payrollScopeKey(month, year, unit);

    if (mode === 'silent' && entriesAbortRef.current) return null;

    entriesAbortRef.current?.abort();
    const controller = new AbortController();
    entriesAbortRef.current = controller;
    let resolveCompletion: () => void = () => {};
    const completion = new Promise<void>(resolve => {
      resolveCompletion = resolve;
    });
    entriesCompletionRef.current = completion;
    const requestSequence = ++entriesRequestSequenceRef.current;
    const showLoading = mode !== 'silent';

    if (showLoading) {
      setLoading(true);
      setLoadError('');
    }

    try {
      const response = await fetch(`/api/payroll/entries?${payrollQuery(month, year, unit)}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({})) as PayrollEntriesResponse;
      if (!response.ok) throw new Error(data.error || 'Erro ao carregar a folha');
      if (
        controller.signal.aborted
        || requestSequence !== entriesRequestSequenceRef.current
        || requestScope !== scopeKeyRef.current
      ) {
        return null;
      }

      const nextRevision = typeof data.revision === 'string' ? data.revision : null;
      setEntries(data.entries || []);
      setSummary({ ...EMPTY_SUMMARY, ...(data.summary || {}) });
      setLoadError('');
      revisionRef.current = nextRevision;
      loadedScopeRef.current = requestScope;
      return nextRevision;
    } catch (error) {
      if (
        controller.signal.aborted
        || requestSequence !== entriesRequestSequenceRef.current
        || requestScope !== scopeKeyRef.current
      ) {
        return null;
      }

      if (mode !== 'silent') {
        if (mode === 'initial' || loadedScopeRef.current !== requestScope) {
          setEntries([]);
          setSummary(EMPTY_SUMMARY);
        }
        setLoadError(error instanceof Error ? error.message : 'Erro ao carregar a folha');
      }
      return null;
    } finally {
      if (entriesAbortRef.current === controller) {
        entriesAbortRef.current = null;
        if (entriesCompletionRef.current === completion) entriesCompletionRef.current = null;
      }
      resolveCompletion();
      if (
        showLoading
        && requestSequence === entriesRequestSequenceRef.current
        && requestScope === scopeKeyRef.current
      ) {
        setLoading(false);
      }
    }
  }, [competenceMonthState, competenceYearState, selectedUnitState]);

  const fetchEntries = useCallback(() => loadEntries({ mode: 'manual' }), [loadEntries]);

  const fetchPayrollRevision = useCallback(async () => {
    if (activeTab !== 'folha') return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    const month = competenceMonthState;
    const year = competenceYearState;
    const unit = normalizePayrollSyncUnit(selectedUnitState);
    const requestScope = payrollScopeKey(month, year, unit);

    revisionAbortRef.current?.abort();
    const controller = new AbortController();
    revisionAbortRef.current = controller;
    const requestSequence = ++revisionRequestSequenceRef.current;

    try {
      const response = await fetch(`/api/payroll/revision?${revisionQuery(month, year, unit)}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({})) as PayrollRevisionResponse;
      if (!response.ok) throw new Error(data.error || 'Erro ao verificar atualização da folha');
      const responseUnit = typeof data.unit === 'string'
        ? normalizePayrollSyncUnit(data.unit)
        : null;
      if (
        controller.signal.aborted
        || requestSequence !== revisionRequestSequenceRef.current
        || requestScope !== scopeKeyRef.current
        || data.competenceMonth !== month
        || data.competenceYear !== year
        || responseUnit === null
        || (unit !== 'all' && responseUnit !== unit)
        || typeof data.revision !== 'string'
      ) {
        return;
      }

      return data.revision;
    } catch {
      // A tela mantém a última fotografia válida; a próxima retomada tenta novamente.
    } finally {
      if (revisionAbortRef.current === controller) revisionAbortRef.current = null;
    }
  }, [activeTab, competenceMonthState, competenceYearState, selectedUnitState]);

  const refreshForRevision = useCallback(async (revision: string) => {
    if (
      activeTabRef.current !== 'folha'
      || revision === revisionRef.current
    ) {
      return;
    }

    const signalScope = scopeKeyRef.current;
    const reconciliationSequence = ++reconciliationSequenceRef.current;
    pendingRevisionRef.current = revision;
    let waitedForFullRequest = false;

    while (
      reconciliationSequence === reconciliationSequenceRef.current
      && pendingRevisionRef.current === revision
    ) {
      if (
        activeTabRef.current !== 'folha'
        || signalScope !== scopeKeyRef.current
        || (typeof document !== 'undefined' && document.visibilityState === 'hidden')
      ) {
        if (pendingRevisionRef.current === revision) pendingRevisionRef.current = null;
        return;
      }

      const runningRequest = entriesCompletionRef.current;
      if (runningRequest) {
        waitedForFullRequest = true;
        await runningRequest;
        continue;
      }

      if (waitedForFullRequest) {
        const confirmedRevision = await fetchPayrollRevision();
        if (
          reconciliationSequence !== reconciliationSequenceRef.current
          || pendingRevisionRef.current !== revision
        ) {
          return;
        }
        if (confirmedRevision === undefined || confirmedRevision === revisionRef.current) {
          pendingRevisionRef.current = null;
          return;
        }
        waitedForFullRequest = false;
        continue;
      }

      await loadEntries({ mode: 'silent' });
      // Esta leitura começou depois do sinal e passa a ser a fotografia
      // autoritativa, inclusive quando já contém uma revisão ainda mais nova.
      if (
        reconciliationSequence === reconciliationSequenceRef.current
        && pendingRevisionRef.current === revision
      ) {
        pendingRevisionRef.current = null;
      }
      return;
    }
  }, [fetchPayrollRevision, loadEntries]);

  const checkPayrollRevision = useCallback(async () => {
    const revision = await fetchPayrollRevision();
    if (revision !== undefined) await refreshForRevision(revision);
  }, [fetchPayrollRevision, refreshForRevision]);

  useEffect(() => {
    if (activeTab !== 'folha') {
      invalidateRequests();
      setLoading(false);
      return;
    }

    resetRevision();
    void loadEntries({ mode: 'initial' });
    return invalidateRequests;
  }, [activeTab, currentScopeKey, invalidateRequests, loadEntries, resetRevision]);

  useVisiblePolling(checkPayrollRevision, PAYROLL_REVISION_INTERVAL_MS, {
    enabled: activeTab === 'folha',
    runImmediately: false,
    runOnFocus: true,
    resumeThrottleMs: 0,
  });

  useEffect(() => {
    if (activeTab !== 'folha') return;
    const handlePageShow = () => {
      void checkPayrollRevision();
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, [activeTab, checkPayrollRevision]);

  useEffect(() => {
    if (activeTab !== 'folha') return;

    return subscribePayrollSync((signal: PayrollSyncSignal) => {
      const currentScope = {
        competenceMonth: competenceMonthRef.current,
        competenceYear: competenceYearRef.current,
        unit: selectedUnitRef.current,
      };
      if (!payrollSyncSignalAffectsScope(signal, currentScope)) return;
      if (document.visibilityState === 'hidden') return;

      const signalUnit = normalizePayrollSyncUnit(signal.unit);
      const currentUnit = normalizePayrollSyncUnit(currentScope.unit);
      if (signal.revision === null || signalUnit !== currentUnit) {
        void checkPayrollRevision();
        return;
      }
      void refreshForRevision(signal.revision);
    });
  }, [activeTab, checkPayrollRevision, refreshForRevision]);

  return {
    activeTab,
    setActiveTab,
    competenceMonth: competenceMonthState,
    setCompetenceMonth,
    competenceYear: competenceYearState,
    setCompetenceYear,
    entries,
    summary,
    loading,
    loadError,
    selectedUnit: selectedUnitState,
    setSelectedUnit,
    fetchEntries,
  };
}
