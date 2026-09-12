'use client';

import dynamic from 'next/dynamic';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { useDashboard } from '@/hooks/useDashboard';

const CustosUnificado = dynamic(() => import('@/components/dashboard/custos-unificado').then(module => ({
  default: module.CustosUnificado,
})));

function DreContent() {
  const dashboard = useDashboard({ syncPayroll: false, readOnly: true });
  return <CustosUnificado d={dashboard} initialView="lucratividade" dreOnly />;
}

export default function DrePage() {
  return (
    <AuthGuard
      allowedRoles={['ADMINISTRADOR', 'GERENTE']}
      requiredPermission="financeiro"
      alternativePermissions={['finCustos', 'finAnalise']}
    >
      <div style={{ width: '100%', minHeight: '100vh', paddingBottom: 60 }}>
        <AppHeader activePage="financeiro" />

        <main className="dre-page">
          <section className="dre-page-heading">
            <div className="dre-page-icon" aria-hidden="true">
              <span className="material-symbols-outlined">query_stats</span>
            </div>
            <div>
              <h1>DRE gerencial</h1>
              <p>Demonstrativo de resultado atualizado pelas receitas e despesas do Financeiro</p>
            </div>
          </section>

          <DreContent />
        </main>

        <footer style={{ padding: '20px 24px', borderTop: '1px solid var(--border)', textAlign: 'center', marginTop: 40 }}>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>© 2024 Virtuosa Estética - Gestão Financeira Inteligente</p>
        </footer>
      </div>

      <style jsx>{`
        .dre-page {
          min-width: 0;
          padding: 0 20px;
        }
        .dre-page-heading {
          display: flex;
          align-items: center;
          gap: 14px;
          max-width: 1200px;
          min-width: 0;
          margin: 32px auto 24px;
        }
        .dre-page-icon {
          display: grid;
          width: 44px;
          height: 44px;
          flex: 0 0 44px;
          place-items: center;
          border-radius: 14px;
          background: rgba(16, 185, 129, 0.1);
          color: #10b981;
        }
        .dre-page-icon span { font-size: 24px; }
        h1 {
          margin: 0;
          color: var(--text-main);
          font-size: 1.5rem;
          font-weight: 900;
        }
        p {
          margin: 2px 0 0;
          color: var(--text-muted);
          font-size: 0.82rem;
          line-height: 1.45;
        }
        @media (max-width: 768px) {
          .dre-page { padding: 0 16px; }
          .dre-page-heading { align-items: flex-start; margin: 22px auto 18px; }
          h1 { font-size: 1.3rem; }
        }
      `}</style>
    </AuthGuard>
  );
}
