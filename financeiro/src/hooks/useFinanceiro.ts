import { useState, useEffect, useCallback } from 'react';
import { isUserAdmin, getUserUnit } from '@/components/unit-selector';
import { useDashboard } from '@/hooks/useDashboard';
import { toast } from '@/components/toast';
import type { PayrollEntryData, PayrollSummary, ExtractedEmployee, PaymentStatus } from '@/lib/types';

type FinanceiroTab = 'folha' | 'premiacao' | 'reembolso' | 'custos' | 'analise' | 'vt' | 'vr';

const TABS: { key: FinanceiroTab; label: string; icon: string; color: string }[] = [
  { key: 'folha',        label: 'Folha de Pagamento', icon: 'payments',          color: '#6366f1' },
  { key: 'vt',           label: 'Vale Transporte',    icon: 'commute',           color: '#0ea5e9' },
  { key: 'vr',           label: 'Vale Refeição',      icon: 'restaurant',        color: '#10b981' },
  { key: 'premiacao',    label: 'Premiação',          icon: 'emoji_events',      color: '#10b981' },
  { key: 'reembolso',    label: 'Reembolso',          icon: 'receipt_long',      color: '#f97316' },
  { key: 'custos',       label: 'Custos',             icon: 'account_balance',   color: '#8b5cf6' },
  { key: 'analise',      label: 'Análise',             icon: 'analytics',         color: '#3b82f6' },
];

export { TABS };
export type { FinanceiroTab };

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function useFinanceiro() {
  const [activeTab, setActiveTab] = useState<FinanceiroTab>(() => {
    if (typeof window !== 'undefined') {
      const urlTab = new URLSearchParams(window.location.search).get('tab');
      if (urlTab && TABS.some(t => t.key === urlTab)) return urlTab as FinanceiroTab;
      const saved = localStorage.getItem('virtuosa_financeiro_tab');
      if (saved && TABS.some(t => t.key === saved)) return saved as FinanceiroTab;
    }
    return 'folha';
  });

  // Sync tab from URL on mount
  useEffect(() => {
    const urlTab = new URLSearchParams(window.location.search).get('tab');
    if (urlTab && TABS.some(t => t.key === urlTab)) {
      setActiveTab(urlTab as FinanceiroTab);
    }
  }, []);

  // Persist tab
  useEffect(() => { localStorage.setItem('virtuosa_financeiro_tab', activeTab); }, [activeTab]);

  // ─── Folha state ───
  const [competenceMonth, setCompetenceMonth] = useState(new Date().getMonth() + 1);
  const [competenceYear, setCompetenceYear] = useState(new Date().getFullYear());
  const [entries, setEntries] = useState<PayrollEntryData[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<PayrollEntryData[]>([]);
  const [summary, setSummary] = useState<PayrollSummary>({
    totalPayroll: 0, totalPaid: 0, totalPending: 0,
    totalEmployees: 0, paidCount: 0, pendingCount: 0, reviewCount: 0,
  });
  const [loading, setLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [previewData, setPreviewData] = useState<ExtractedEmployee[]>([]);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [importId, setImportId] = useState<string | null>(null);
  const [importUnit, setImportUnit] = useState<string>('Barueri');
  const [selectedUnit, setSelectedUnit] = useState(() => {
    if (typeof window !== 'undefined') {
      const globalUnit = localStorage.getItem('virtuosa_global_unit');
      if (globalUnit) return globalUnit;
    }
    return isUserAdmin() ? 'all' : getUserUnit();
  });
  const [bonusMap, setBonusMap] = useState<Record<string, number>>({});
  const [adiantamentoMap, setAdiantamentoMap] = useState<Record<string, number>>({});

  // Sync with global unit selector (from header)
  useEffect(() => {
    const handler = (e: Event) => {
      const unit = (e as CustomEvent).detail;
      if (unit) setSelectedUnit(unit);
    };
    window.addEventListener('virtuosa-unit-change', handler);
    return () => window.removeEventListener('virtuosa-unit-change', handler);
  }, []);

  const d = useDashboard();

  // Fetch entries
  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const unitParam = selectedUnit !== 'all' ? `&unit=${encodeURIComponent(selectedUnit)}` : '';
      const res = await fetch(`/api/payroll/entries?month=${competenceMonth}&year=${competenceYear}${unitParam}`);
      const data = await res.json();
      if (res.ok) {
        setEntries(data.entries || []);
        setSummary(data.summary || { totalPayroll: 0, totalPaid: 0, totalPending: 0, totalEmployees: 0, paidCount: 0, pendingCount: 0, reviewCount: 0 });
        if (data.imports?.[0]?.id) setImportId(data.imports[0].id);
      }
    } catch (err) { console.error('Fetch error:', err); }
    setLoading(false);
  }, [competenceMonth, competenceYear, selectedUnit]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  // Bonus map
  useEffect(() => {
    try {
      const raw = localStorage.getItem('virtuosa_finance_logs_v2');
      const logs: any[] = raw ? JSON.parse(raw) : [];
      const manualRaw = localStorage.getItem('virtuosa_premiacoes_manual');
      const manualOverrides: Record<string, number> = manualRaw ? JSON.parse(manualRaw) : {};
      const sales = logs.filter((l: any) => {
        if (l.type !== 'sale' || !l.date) return false;
        const dd = new Date(l.date);
        return dd.getUTCMonth() === competenceMonth - 1 && dd.getUTCFullYear() === competenceYear && (selectedUnit === 'all' || (l.unit || '') === selectedUnit);
      });
      const sellerTotals: Record<string, number> = {};
      sales.forEach((s: any) => { const seller = (s.seller || '').trim(); if (seller) sellerTotals[seller] = (sellerTotals[seller] || 0) + s.value; });
      fetch('/api/users').then(r => r.json()).then(users => {
        const map: Record<string, number> = {};
        Object.entries(sellerTotals).forEach(([name, total]) => {
          const user = (Array.isArray(users) ? users : []).find((u: any) => u.name.toLowerCase().trim() === name.toLowerCase().trim());
          const role = (user?.role || 'VENDEDOR').toUpperCase();
          let autoP = 1;
          if (role === 'GERENTE') autoP = 1;
          else if (role === 'VENDEDOR' || role === 'VENDEDORA') autoP = total > 50000 ? 2 : 1;
          const effectiveP = manualOverrides[name] ?? autoP;
          map[name.toLowerCase().trim()] = total * (effectiveP / 100);
        });
        setBonusMap(map);
      }).catch(() => {});
    } catch {}
  }, [competenceMonth, competenceYear, selectedUnit]);

  // Adiantamento map
  useEffect(() => {
    fetch('/api/adiantamentos')
      .then(r => r.json())
      .then(data => {
        const map: Record<string, number> = {};
        (Array.isArray(data) ? data : []).forEach((a: any) => {
          if (a.status !== 'pendente') return;
          if (selectedUnit !== 'all' && (a.unit || '') !== selectedUnit) return;
          const name = (a.recipient || '').toLowerCase().trim();
          if (name) map[name] = (map[name] || 0) + a.value;
        });
        setAdiantamentoMap(map);
      }).catch(() => {});
  }, [selectedUnit]);

  // Filter entries
  useEffect(() => {
    let filtered = [...entries];
    if (searchQuery) filtered = filtered.filter(e => e.employeeName.toLowerCase().includes(searchQuery.toLowerCase()));
    if (statusFilter !== 'all') filtered = filtered.filter(e => e.paymentStatus === statusFilter);
    setFilteredEntries(filtered);
  }, [entries, searchQuery, statusFilter]);

  // Handlers
  const handleUploadPreview = async (file: File, unit: string) => {
    setPreviewFile(file); setImportUnit(unit);
    const formData = new FormData();
    formData.append('file', file); formData.append('competenceMonth', competenceMonth.toString());
    formData.append('competenceYear', competenceYear.toString()); formData.append('unit', unit);
    try {
      const res = await fetch('/api/payroll/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Erro ao processar PDF', 'error'); return; }
      if (data.preview && data.employees) { setPreviewData(data.employees); setShowUpload(false); setShowReview(true); }
    } catch (err) { toast('Erro de conexão ao processar o arquivo', 'error'); console.error(err); }
  };

  const handleConfirmImport = async () => {
    if (!previewFile) return;
    const formData = new FormData();
    formData.append('file', previewFile); formData.append('competenceMonth', competenceMonth.toString());
    formData.append('competenceYear', competenceYear.toString()); formData.append('unit', importUnit);
    formData.append('confirmImport', 'true');
    try {
      const res = await fetch('/api/payroll/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) { setShowReview(false); setPreviewData([]); setPreviewFile(null); fetchEntries(); }
      else toast(data.error || 'Erro ao importar', 'error');
    } catch (err) { toast('Erro de conexão', 'error'); console.error(err); }
  };

  const handleTogglePayment = async (id: string, currentStatus: PaymentStatus) => {
    const newStatus = currentStatus === 'paid' ? 'unpaid' : 'paid';
    try { const res = await fetch('/api/payroll/payment', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, paymentStatus: newStatus }) }); if (res.ok) fetchEntries(); }
    catch (err) { console.error('Payment toggle error:', err); }
  };

  const handleTogglePenalty = async (id: string, currentPenalty: boolean) => {
    try { const res = await fetch('/api/payroll/penalty', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, hasPenalty: !currentPenalty }) }); if (res.ok) fetchEntries(); }
    catch (err) { console.error('Penalty toggle error:', err); }
  };

  const handleDeleteEntry = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este colaborador?')) return;
    try { const res = await fetch(`/api/payroll/entries?id=${id}`, { method: 'DELETE' }); if (res.ok) fetchEntries(); }
    catch (err) { console.error('Delete error:', err); }
  };

  const handleEditEntry = async (id: string, data: { employeeName?: string; netSalary?: number; notes?: string }) => {
    try { const res = await fetch('/api/payroll/entries', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...data }) }); if (res.ok) fetchEntries(); }
    catch (err) { console.error('Edit error:', err); }
  };

  const handleManualAdd = async (data: { employeeName: string; netSalary: number; unit: string; notes?: string }) => {
    try {
      const payload: any = { ...data, competenceMonth, competenceYear };
      if (importId) payload.payrollImportId = importId;
      const res = await fetch('/api/payroll/entries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) { setShowManualEntry(false); fetchEntries(); }
      else { const dd = await res.json(); toast(dd.error || 'Erro ao adicionar manualmente', 'error'); }
    } catch (err) { console.error('Manual add error:', err); }
  };

  const handleExportCSV = () => {
    const headers = ['Nome', 'Salário Líquido', 'Status', 'Data Pagamento', 'Observações'];
    const rows = entries.map(e => [
      e.employeeName, e.netSalary.toFixed(2).replace('.', ','),
      e.paymentStatus === 'paid' ? 'Pago' : e.paymentStatus === 'review' ? 'Revisão' : 'Não Pago',
      e.paymentDate ? new Date(e.paymentDate).toLocaleDateString('pt-BR') : '', e.notes || '',
    ]);
    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `folha_${competenceMonth}_${competenceYear}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handlePayAll = async () => {
    try {
      const unitParam = selectedUnit !== 'all' ? selectedUnit : undefined;
      const res = await fetch('/api/payroll/payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ competenceMonth, competenceYear, unit: unitParam }) });
      const data = await res.json();
      if (data.success) { toast(`${data.updatedCount} pagamento(s) marcado(s) como pago`, 'success'); fetchEntries(); }
      else toast(data.error || 'Erro ao pagar todos', 'error');
    } catch { toast('Erro ao pagar todos', 'error'); }
  };

  return {
    activeTab, setActiveTab, TABS, MONTH_NAMES,
    // Folha
    competenceMonth, setCompetenceMonth, competenceYear, setCompetenceYear,
    entries, filteredEntries, summary, loading,
    showUpload, setShowUpload, showReview, setShowReview, showManualEntry, setShowManualEntry,
    previewData, setPreviewData, previewFile,
    searchQuery, setSearchQuery, statusFilter, setStatusFilter,
    selectedUnit, setSelectedUnit, bonusMap, adiantamentoMap,
    // Dashboard
    d,
    // Handlers
    fetchEntries, handleUploadPreview, handleConfirmImport,
    handleTogglePayment, handleTogglePenalty, handleDeleteEntry, handleEditEntry,
    handleManualAdd, handleExportCSV, handlePayAll,
  };
}
