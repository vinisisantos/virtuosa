'use client';

import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { useFinanceiro, TABS } from '@/hooks/useFinanceiro';
import { useDashboard } from '@/hooks/useDashboard';
import dynamic from 'next/dynamic';

// Light components — keep static
import { CompetencySelector } from '@/components/competency-selector';

// Heavy components — load on demand per tab
const PayrollControl = dynamic(() => import('@/components/payroll-control').then(m => ({ default: m.PayrollControl })));
const ReembolsoSection = dynamic(() => import('@/components/reembolso-section').then(m => ({ default: m.ReembolsoSection })));
const AdiantamentoToggle = dynamic(() => import('@/components/adiantamento-toggle').then(m => ({ default: m.AdiantamentoToggle })));
const PremiacaoSection = dynamic(() => import('@/components/premiacao-section').then(m => ({ default: m.PremiacaoSection })));
const FinancialAnalysis = dynamic(() => import('@/components/dashboard/financial-analysis').then(m => ({ default: m.FinancialAnalysis })));
const CustosUnificado = dynamic(() => import('@/components/dashboard/custos-unificado').then(m => ({ default: m.CustosUnificado })));
const VTSection = dynamic(() => import('@/components/vt-section').then(m => ({ default: m.VTSection })));
const VRSection = dynamic(() => import('@/components/vr-section').then(m => ({ default: m.VRSection })));

function DashboardBackedFinanceTab({ type }: { type: 'custos' | 'analise' }) {
  const d = useDashboard();
  if (type === 'custos') return <CustosUnificado d={d} />;

  return (
    <FinancialAnalysis
      totalRev={d.totalRev} totalCost={d.totalCost}
      fixedExpenses={d.fixedExpenses} bills={d.bills} filteredLogs={d.filteredLogs}
      allLogs={d.logs} selectedMonth={d.selectedMonth} selectedYear={d.selectedYear} selectedUnit={d.selectedUnit}
    />
  );
}

export default function Home() {
  const f = useFinanceiro();
  const activeTabMeta = TABS.find(t => t.key === f.activeTab) || TABS[0];

  return (
    <AuthGuard allowedRoles={['ADMINISTRADOR', 'GERENTE']} requiredPermission="financeiro" alternativePermissions={['finReembolso', 'finAdiantamento', 'finPremiacao', 'finCustos', 'finAnalise']}>
      <div style={{ width: '100%', minHeight: '100vh', paddingBottom: 60 }}>
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
              <PayrollControl
                entries={f.entries}
                summary={f.summary}
                loading={f.loading}
                loadError={f.loadError}
                competenceMonth={f.competenceMonth}
                competenceYear={f.competenceYear}
                selectedUnit={f.selectedUnit}
                onRefresh={f.fetchEntries}
              />
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

          {/* 5. Adiantamento */}
          {f.activeTab === 'adiantamento' && <AdiantamentoToggle selectedUnit={f.selectedUnit} />}

          {/* 6. Custos */}
          {f.activeTab === 'custos' && <DashboardBackedFinanceTab type="custos" />}

          {/* 7. Análise */}
          {f.activeTab === 'analise' && <DashboardBackedFinanceTab type="analise" />}
        </main>

        <footer style={{ padding: '20px 24px', borderTop: '1px solid var(--border)', textAlign: 'center', marginTop: 40 }}>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>© 2024 Virtuosa Estética - Gestão Financeira Inteligente</p>
        </footer>
      </div>
    </AuthGuard>
  );
}
