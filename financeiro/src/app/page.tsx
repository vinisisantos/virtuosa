'use client';

import { useState, useEffect, useCallback } from 'react';
import { AppHeader } from '@/components/app-header';
import { UploadZone } from '@/components/upload-zone';
import { SummaryCards } from '@/components/summary-cards';
import { PayrollTable } from '@/components/payroll-table';
import { CompetencySelector } from '@/components/competency-selector';
import { ReviewModal } from '@/components/review-modal';
import { Filters } from '@/components/filters';
import { ManualEntryModal } from '@/components/manual-entry-modal';
import { ReembolsoSection } from '@/components/reembolso-section';
import { AdiantamentoSection } from '@/components/adiantamento-section';
import { PremiacaoSection } from '@/components/premiacao-section';
import { ImportHistory } from '@/components/import-history';
import { CostsSection } from '@/components/dashboard/costs-section';
import { FixedCostsSection } from '@/components/dashboard/fixed-costs-section';
import { FolhaInteligente } from '@/components/folha-inteligente';
import { FinancialAnalysis } from '@/components/dashboard/financial-analysis';
import { CustosUnificado } from '@/components/dashboard/custos-unificado';
import AuthGuard from '@/components/auth-guard';
import { UnitSelector, getUserUnit, isUserAdmin } from '@/components/unit-selector';
import { useDashboard } from '@/hooks/useDashboard';
import { toast } from '@/components/toast';
import type { PayrollEntryData, PayrollSummary, ExtractedEmployee, PaymentStatus } from '@/lib/types';

type FinanceiroTab = 'folha' | 'adiantamento' | 'premiacao' | 'reembolso' | 'custos' | 'analise';

const TABS: { key: FinanceiroTab; label: string; icon: string; color: string }[] = [
  { key: 'folha',        label: 'Folha de Pagamento', icon: 'payments',          color: '#6366f1' },
  { key: 'adiantamento', label: 'Adiantamento',       icon: 'account_balance_wallet', color: '#f59e0b' },
  { key: 'premiacao',    label: 'Premiação',          icon: 'emoji_events',      color: '#10b981' },
  { key: 'reembolso',    label: 'Reembolso',          icon: 'receipt_long',      color: '#f97316' },
  { key: 'custos',       label: 'Custos',             icon: 'account_balance',   color: '#8b5cf6' },
  { key: 'analise',      label: 'Análise',             icon: 'analytics',         color: '#3b82f6' },
];

export default function FinanceiroPage() {
  const [activeTab, setActiveTab] = useState<FinanceiroTab>(() => {
    if (typeof window !== 'undefined') {
      const urlTab = new URLSearchParams(window.location.search).get('tab');
      if (urlTab && TABS.some(t => t.key === urlTab)) return urlTab as FinanceiroTab;
      const saved = localStorage.getItem('virtuosa_financeiro_tab');
      if (saved && TABS.some(t => t.key === saved)) return saved as FinanceiroTab;
    }
    return 'folha';
  });

  // Sync tab from URL on mount/navigation
  useEffect(() => {
    const urlTab = new URLSearchParams(window.location.search).get('tab');
    if (urlTab && TABS.some(t => t.key === urlTab)) {
      setActiveTab(urlTab as FinanceiroTab);
    }
  }, []);

  // Persist tab selection
  useEffect(() => { localStorage.setItem('virtuosa_financeiro_tab', activeTab); }, [activeTab]);

  // ─── Folha de Pagamento state ───
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
  const [selectedUnit, setSelectedUnit] = useState(() => isUserAdmin() ? 'all' : getUserUnit());
  const [bonusMap, setBonusMap] = useState<Record<string, number>>({});
  const [adiantamentoMap, setAdiantamentoMap] = useState<Record<string, number>>({});

  // ─── useDashboard for Despesas & Custos Fixos ───
  const d = useDashboard();

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

  const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const activeTabMeta = TABS.find(t => t.key === activeTab)!;

  return (
    <AuthGuard allowedRoles={['ADMINISTRADOR', 'GERENTE']} requiredPermission="financeiro">
      <div style={{ width: '100%', maxWidth: 1400, margin: '0 auto', minHeight: '100vh', paddingBottom: 60 }}>
        <AppHeader activePage="financeiro" />

        <main style={{ padding: '0 20px' }}>
          {/* Hero */}
          <section style={{ background: 'transparent', margin: '40px 0 20px', textAlign: 'center' }}>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-1px', marginBottom: 8 }}>
              Gestão <span style={{ color: 'var(--primary)' }}>Financeira</span>
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: 0 }}>
              Centralize folha de pagamento, adiantamentos, premiações, reembolsos, custos fixos e despesas.
            </p>
          </section>

          {/* ─── Tab Navigation ─── */}
          <div style={{
            background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)',
            padding: '6px', marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            display: 'flex', gap: 4, overflowX: 'auto', WebkitOverflowScrolling: 'touch',
          }}>
            {TABS.map(tab => {
              const isActive = activeTab === tab.key;
              return (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  style={{
                    flex: '1 0 auto', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: 7, padding: '12px 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 700,
                    transition: 'all 0.25s ease',
                    background: isActive ? `linear-gradient(135deg, ${tab.color}15, ${tab.color}08)` : 'transparent',
                    color: isActive ? tab.color : 'var(--text-muted)',
                    boxShadow: isActive ? `0 2px 8px ${tab.color}20, inset 0 0 0 1.5px ${tab.color}30` : 'none',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg)'; }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: isActive ? tab.color : 'var(--text-muted)' }}>{tab.icon}</span>
                  <span className="fin-tab-label">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* ─── Tab Content ─── */}

          {/* 1. Folha de Pagamento */}
          {activeTab === 'folha' && (
            <div>
              <UnitSelector selectedUnit={selectedUnit} onUnitChange={setSelectedUnit} />
              <CompetencySelector month={competenceMonth} year={competenceYear} onChangeMonth={setCompetenceMonth} onChangeYear={setCompetenceYear} />
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, margin: '0 0 40px' }}>
                <button onClick={() => setShowUpload(true)} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'var(--primary)', color: 'white', border: 'none', padding: '12px 28px',
                  borderRadius: 'var(--radius-md)', fontWeight: 700, fontFamily: 'inherit', fontSize: '0.9rem',
                  cursor: 'pointer', boxShadow: '0 4px 12px rgba(230, 0, 126, 0.25)', transition: 'var(--transition)',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>upload_file</span>
                  Importar Folha
                </button>
              </div>
              <SummaryCards summary={summary} competenceMonth={competenceMonth} competenceYear={competenceYear} selectedUnit={selectedUnit} />
              <ImportHistory competenceMonth={competenceMonth} competenceYear={competenceYear} selectedUnit={selectedUnit} onRefresh={fetchEntries} />
              <Filters
                searchQuery={searchQuery} onSearchChange={setSearchQuery}
                statusFilter={statusFilter} onStatusFilterChange={setStatusFilter}
                onExportCSV={handleExportCSV} onAddManual={() => setShowManualEntry(true)}
                hasEntries={entries.length > 0}
                hasPending={entries.some(e => e.paymentStatus !== 'paid')}
                onPayAll={async () => {
                  try {
                    const unitParam = selectedUnit !== 'all' ? selectedUnit : undefined;
                    const res = await fetch('/api/payroll/payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ competenceMonth, competenceYear, unit: unitParam }) });
                    const data = await res.json();
                    if (data.success) { toast(`${data.updatedCount} pagamento(s) marcado(s) como pago`, 'success'); fetchEntries(); }
                    else toast(data.error || 'Erro ao pagar todos', 'error');
                  } catch { toast('Erro ao pagar todos', 'error'); }
                }}
              />
              <PayrollTable
                entries={filteredEntries} loading={loading}
                onTogglePayment={handleTogglePayment} onTogglePenalty={handleTogglePenalty}
                onDelete={handleDeleteEntry} onEdit={handleEditEntry}
                competenceLabel={`${monthNames[competenceMonth - 1]} ${competenceYear}`}
                searchQuery={searchQuery} bonusMap={bonusMap} adiantamentoMap={adiantamentoMap}
              />

              {/* Divider */}
              <div style={{ display:'flex', alignItems:'center', gap:12, margin:'40px 0 24px' }}>
                <div style={{ flex:1, height:1, background:'linear-gradient(90deg, transparent, var(--border), transparent)' }} />
                <span style={{ fontSize:'0.85rem', fontWeight:800, color:'var(--primary)', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:6 }}>
                  <span className="material-symbols-outlined" style={{fontSize:18,color:'#6366f1'}}>analytics</span>
                  Folha de Pagamento Inteligente
                </span>
                <div style={{ flex:1, height:1, background:'linear-gradient(90deg, transparent, var(--border), transparent)' }} />
              </div>

              <FolhaInteligente selectedUnit={selectedUnit} />
            </div>
          )}

          {/* 2. Adiantamento */}
          {activeTab === 'adiantamento' && (
            <div>
              <UnitSelector selectedUnit={selectedUnit} onUnitChange={setSelectedUnit} />
              <AdiantamentoSection selectedUnit={selectedUnit} />
            </div>
          )}

          {/* 3. Premiação */}
          {activeTab === 'premiacao' && (
            <div>
              <UnitSelector selectedUnit={selectedUnit} onUnitChange={setSelectedUnit} />
              <CompetencySelector month={competenceMonth} year={competenceYear} onChangeMonth={setCompetenceMonth} onChangeYear={setCompetenceYear} />
              <PremiacaoSection selectedUnit={selectedUnit} selectedMonth={competenceMonth - 1} selectedYear={competenceYear} />
            </div>
          )}

          {/* 4. Reembolso */}
          {activeTab === 'reembolso' && (
            <div>
              <ReembolsoSection />
            </div>
          )}

          {/* 5. Custos (Fixos + Variáveis + Despesas) */}
          {activeTab === 'custos' && (
            <CustosUnificado d={d} />
          )}

          {/* 6. Análise */}
          {activeTab === 'analise' && (
            <FinancialAnalysis
              totalRev={d.totalRev}
              totalCost={d.totalCost}
              fixedExpenses={d.fixedExpenses}
              bills={d.bills}
              filteredLogs={d.filteredLogs}
            />
          )}
        </main>

        {/* Modals */}
        {showUpload && <UploadZone onUpload={handleUploadPreview} onClose={() => setShowUpload(false)} />}
        {showReview && (
          <ReviewModal
            employees={previewData} fileName={previewFile?.name || ''}
            competence={`${monthNames[competenceMonth - 1]} ${competenceYear}`}
            onConfirm={handleConfirmImport} onCancel={() => { setShowReview(false); setPreviewData([]); }}
          />
        )}
        {showManualEntry && <ManualEntryModal onSave={handleManualAdd} onClose={() => setShowManualEntry(false)} />}

        <footer style={{ padding: '20px 24px', borderTop: '1px solid var(--border)', textAlign: 'center', marginTop: 40 }}>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>© 2024 Virtuosa Estética - Gestão Financeira Inteligente</p>
        </footer>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .fin-tab-label { display: none; }
        }
        @media (max-width: 480px) {
          .fin-tab-label { display: none; }
        }
      `}</style>
    </AuthGuard>
  );
}
