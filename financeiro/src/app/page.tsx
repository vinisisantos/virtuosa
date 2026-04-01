'use client';

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
import { FolhaInteligente } from '@/components/folha-inteligente';
import { FinancialAnalysis } from '@/components/dashboard/financial-analysis';
import { CustosUnificado } from '@/components/dashboard/custos-unificado';
import AuthGuard from '@/components/auth-guard';
import { useFinanceiro, TABS } from '@/hooks/useFinanceiro';

export default function Home() {
  const f = useFinanceiro();
  const activeTabMeta = TABS.find(t => t.key === f.activeTab) || TABS[0];

  return (
    <AuthGuard allowedRoles={['ADMINISTRADOR', 'GERENTE']} requiredPermission="financeiro">
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
                onDelete={f.handleDeleteEntry} onEdit={f.handleEditEntry}
                competenceLabel={`${f.MONTH_NAMES[f.competenceMonth - 1]} ${f.competenceYear}`}
                searchQuery={f.searchQuery} bonusMap={f.bonusMap} adiantamentoMap={f.adiantamentoMap}
              />
              <div style={{ display:'flex', alignItems:'center', gap:12, margin:'40px 0 24px' }}>
                <div style={{ flex:1, height:1, background:'linear-gradient(90deg, transparent, var(--border), transparent)' }} />
                <span style={{ fontSize:'0.85rem', fontWeight:800, color:'var(--primary)', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:6 }}>
                  <span className="material-symbols-outlined" style={{fontSize:18,color:'#6366f1'}}>analytics</span>
                  Folha de Pagamento Inteligente
                </span>
                <div style={{ flex:1, height:1, background:'linear-gradient(90deg, transparent, var(--border), transparent)' }} />
              </div>
              <FolhaInteligente selectedUnit={f.selectedUnit} />
            </div>
          )}

          {/* 2. Adiantamento */}
          {f.activeTab === 'adiantamento' && (
            <div>
              <AdiantamentoSection selectedUnit={f.selectedUnit} />
            </div>
          )}

          {/* 3. Premiação */}
          {f.activeTab === 'premiacao' && (
            <div>
              <CompetencySelector month={f.competenceMonth} year={f.competenceYear} onChangeMonth={f.setCompetenceMonth} onChangeYear={f.setCompetenceYear} />
              <PremiacaoSection selectedUnit={f.selectedUnit} selectedMonth={f.competenceMonth - 1} selectedYear={f.competenceYear} />
            </div>
          )}

          {/* 4. Reembolso */}
          {f.activeTab === 'reembolso' && <ReembolsoSection />}

          {/* 5. Custos */}
          {f.activeTab === 'custos' && <CustosUnificado d={f.d} />}

          {/* 6. Análise */}
          {f.activeTab === 'analise' && (
            <FinancialAnalysis
              totalRev={f.d.totalRev} totalCost={f.d.totalCost}
              fixedExpenses={f.d.fixedExpenses} bills={f.d.bills} filteredLogs={f.d.filteredLogs}
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
