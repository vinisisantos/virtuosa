'use client';

import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { useFinanceiro, TABS } from '@/hooks/useFinanceiro';
import dynamic from 'next/dynamic';

// Light components — keep static
import { CompetencySelector } from '@/components/competency-selector';

// Heavy components — load on demand per tab
const UploadZone = dynamic(() => import('@/components/upload-zone').then(m => ({ default: m.UploadZone })));
const SummaryCards = dynamic(() => import('@/components/summary-cards').then(m => ({ default: m.SummaryCards })));
const PayrollTable = dynamic(() => import('@/components/payroll-table').then(m => ({ default: m.PayrollTable })));
const ReviewModal = dynamic(() => import('@/components/review-modal').then(m => ({ default: m.ReviewModal })));
const Filters = dynamic(() => import('@/components/filters').then(m => ({ default: m.Filters })));
const ManualEntryModal = dynamic(() => import('@/components/manual-entry-modal').then(m => ({ default: m.ManualEntryModal })));
const ReembolsoSection = dynamic(() => import('@/components/reembolso-section').then(m => ({ default: m.ReembolsoSection })));
const AdiantamentoToggle = dynamic(() => import('@/components/adiantamento-toggle').then(m => ({ default: m.AdiantamentoToggle })));
const PremiacaoSection = dynamic(() => import('@/components/premiacao-section').then(m => ({ default: m.PremiacaoSection })));
const ImportHistory = dynamic(() => import('@/components/import-history').then(m => ({ default: m.ImportHistory })));
const FinancialAnalysis = dynamic(() => import('@/components/dashboard/financial-analysis').then(m => ({ default: m.FinancialAnalysis })));
const CustosUnificado = dynamic(() => import('@/components/dashboard/custos-unificado').then(m => ({ default: m.CustosUnificado })));
const VTSection = dynamic(() => import('@/components/vt-section').then(m => ({ default: m.VTSection })));
const VRSection = dynamic(() => import('@/components/vr-section').then(m => ({ default: m.VRSection })));

export default function Home() {
  const f = useFinanceiro();
  const activeTabMeta = TABS.find(t => t.key === f.activeTab) || TABS[0];

  return (
    <AuthGuard allowedRoles={['ADMINISTRADOR', 'GERENTE']} requiredPermission="financeiro" alternativePermissions={['finReembolso', 'finAdiantamento', 'finPremiacao', 'finCustos', 'finAnalise']}>
      <div style={{ width: '100%', maxWidth: 1400, margin: '0 auto', minHeight: '100vh', paddingBottom: 60 }}>
        <AppHeader activePage="financeiro" />

        <main style={{ padding: '0 20px' }}>
          {/* Section Header */}
          <section style={{ margin: '32px 0 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: `${activeTabMeta.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: activeTabMeta.color }}>{activeTabMeta.icon}</span>
            </div>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0, color: 'var(--text-main)' }}>{activeTabMeta.label}</h1>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>Gestão Financeira Virtuosa</p>
            </div>
          </section>

          {/* ─── Tab Content ─── */}

          {/* 1. Folha de Pagamento */}
          {f.activeTab === 'folha' && (
            <div>
              <CompetencySelector month={f.competenceMonth} year={f.competenceYear} onChangeMonth={f.setCompetenceMonth} onChangeYear={f.setCompetenceYear} />
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, margin: '0 0 40px' }}>
                <button onClick={() => f.setShowUpload(true)} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'var(--primary)', color: 'white', border: 'none', padding: '12px 28px',
                  borderRadius: 'var(--radius-md)', fontWeight: 700, fontFamily: 'inherit', fontSize: '0.9rem',
                  cursor: 'pointer', boxShadow: '0 4px 12px rgba(230, 0, 126, 0.25)', transition: 'var(--transition)',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>upload_file</span>
                  Importar Folha
                </button>
              </div>
              <SummaryCards summary={f.summary} competenceMonth={f.competenceMonth} competenceYear={f.competenceYear} selectedUnit={f.selectedUnit} />
              <ImportHistory competenceMonth={f.competenceMonth} competenceYear={f.competenceYear} selectedUnit={f.selectedUnit} onRefresh={f.fetchEntries} />
              <Filters
                searchQuery={f.searchQuery} onSearchChange={f.setSearchQuery}
                statusFilter={f.statusFilter} onStatusFilterChange={f.setStatusFilter}
                onExportCSV={f.handleExportCSV} onAddManual={() => f.setShowManualEntry(true)}
                hasEntries={f.entries.length > 0}
                hasPending={f.entries.some(e => e.paymentStatus !== 'paid')}
                onPayAll={f.handlePayAll}
              />
              <PayrollTable
                entries={f.filteredEntries} loading={f.loading}
                onTogglePayment={f.handleTogglePayment} onTogglePenalty={f.handleTogglePenalty}
                onToggleAdiantamento={f.handleToggleAdiantamento} onToggleRecurring={f.handleToggleRecurring}
                onToggleFgts={f.handleToggleFgts} onPaySelected={f.handlePaySelected}
                onDelete={f.handleDeleteEntry} onEdit={f.handleEditEntry}
                competenceLabel={`${f.MONTH_NAMES[f.competenceMonth - 1]} ${f.competenceYear}`}
                searchQuery={f.searchQuery} bonusMap={f.bonusMap} adiantamentoMap={f.adiantamentoMap}
                prevMonthMap={f.prevMonthMap}
              />
              {/* Adiantamentos Toggle Section */}
              <AdiantamentoToggle selectedUnit={f.selectedUnit} />
            </div>
          )}

          {/* 2. Vale Transporte */}
          {f.activeTab === 'vt' && <VTSection selectedUnit={f.selectedUnit} />}

          {/* 3. Vale Refeição */}
          {f.activeTab === 'vr' && <VRSection selectedUnit={f.selectedUnit} />}

          {/* 3. Premiação */}
          {f.activeTab === 'premiacao' && (
            <div>
              <CompetencySelector month={f.competenceMonth} year={f.competenceYear} onChangeMonth={f.setCompetenceMonth} onChangeYear={f.setCompetenceYear} />
              <PremiacaoSection selectedUnit={f.selectedUnit} selectedMonth={f.competenceMonth - 1} selectedYear={f.competenceYear} />
            </div>
          )}

          {/* 4. Reembolso */}
          {f.activeTab === 'reembolso' && <ReembolsoSection selectedUnit={f.selectedUnit} />}

          {/* 5. Custos */}
          {f.activeTab === 'custos' && <CustosUnificado d={f.d} />}

          {/* 6. Análise */}
          {f.activeTab === 'analise' && (
            <FinancialAnalysis
              totalRev={f.d.totalRev} totalCost={f.d.totalCost}
              fixedExpenses={f.d.fixedExpenses} bills={f.d.bills} filteredLogs={f.d.filteredLogs}
              allLogs={f.d.logs} selectedMonth={f.d.selectedMonth} selectedYear={f.d.selectedYear} selectedUnit={f.d.selectedUnit}
            />
          )}
        </main>

        {/* Modals */}
        {f.showUpload && <UploadZone onUpload={f.handleUploadPreview} onClose={() => f.setShowUpload(false)} />}
        {f.showReview && (
          <ReviewModal
            employees={f.previewData} fileName={f.previewFile?.name || ''}
            competence={`${f.MONTH_NAMES[f.competenceMonth - 1]} ${f.competenceYear}`}
            onConfirm={f.handleConfirmImport} onCancel={() => { f.setShowReview(false); f.setPreviewData([]); }}
          />
        )}
        {f.showManualEntry && <ManualEntryModal onSave={f.handleManualAdd} onClose={() => f.setShowManualEntry(false)} />}

        <footer style={{ padding: '20px 24px', borderTop: '1px solid var(--border)', textAlign: 'center', marginTop: 40 }}>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>© 2024 Virtuosa Estética - Gestão Financeira Inteligente</p>
        </footer>
      </div>
    </AuthGuard>
  );
}
