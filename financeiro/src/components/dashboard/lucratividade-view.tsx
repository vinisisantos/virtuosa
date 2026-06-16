import { useMemo } from 'react';
import { fmt, FixedExpense, Bill } from '@/hooks/useDashboard';

export function LucratividadeView({ d }: { d: any }) {
  const { totalRev, fixedExpenses, bills, selectedUnit, selectedYear, selectedMonth } = d;

  const data = useMemo(() => {
    const receita = totalRev || 0;
    
    // Custos Fixos (competência do mês selecionado por padrão)
    const fixed = fixedExpenses.filter((e: FixedExpense) => e.value > 0 && (!e.unit || e.unit === selectedUnit));
    const totalFixed = fixed.reduce((sum: number, e: FixedExpense) => sum + e.value, 0);

    // Custos Variáveis do Mês de Competência
    const refKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
    
    const variaveis = bills.filter((b: Bill) => {
      if (b.unit && b.unit !== selectedUnit) return false;
      if (b.refMonth) {
        return b.refMonth === refKey;
      } else {
        // Fallback para data de vencimento
        const dateStr = b.type === 'fixo' ? null : b.dueDateManual;
        if (!dateStr) return false;
        if (b.type === 'fixo') return true; // Parcela
        const dt = new Date(dateStr + 'T12:00:00');
        return dt.getUTCFullYear() === selectedYear && dt.getUTCMonth() === selectedMonth;
      }
    });

    const totalVariaveis = variaveis.reduce((sum: number, b: Bill) => sum + b.value, 0);
    const totalCustos = totalFixed + totalVariaveis;
    const lucro = receita - totalCustos;
    const margem = receita > 0 ? (lucro / receita) * 100 : 0;

    return { receita, totalFixed, totalVariaveis, totalCustos, lucro, margem };
  }, [totalRev, fixedExpenses, bills, selectedUnit, selectedYear, selectedMonth]);

  return (
    <div style={{ animation: 'fadeSlide 0.3s ease-out' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><span className="material-symbols-outlined" style={{ fontSize: 18, color: '#3b82f6' }}>trending_up</span> RECEITA BRUTA</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-0.5px' }}>{fmt(data.receita)}</div>
        </div>

        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ef4444' }}>trending_down</span> CUSTOS OPERACIONAIS</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-0.5px' }}>{fmt(data.totalCustos)}</div>
        </div>

        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><span className="material-symbols-outlined" style={{ fontSize: 18, color: data.lucro >= 0 ? '#22c55e' : '#ef4444' }}>account_balance</span> LUCRO (EBITDA)</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: data.lucro >= 0 ? '#22c55e' : '#ef4444', letterSpacing: '-0.5px' }}>{fmt(data.lucro)}</div>
        </div>
      </div>

      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 16, padding: 32, boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 24px' }}>DRE Resumido</h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 16, borderBottom: '1px dashed var(--border)' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>(+) Receita de Serviços</span>
            <span style={{ fontWeight: 800, color: '#3b82f6' }}>{fmt(data.receita)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 16, borderBottom: '1px dashed var(--border)' }}>
            <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>(-) Custos Fixos</span>
            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{fmt(data.totalFixed)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>(-) Custos Variáveis</span>
            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{fmt(data.totalVariaveis)}</span>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, alignItems: 'center' }}>
            <span style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '1.1rem' }}>(=) Lucro Líquido Operacional</span>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 900, color: data.lucro >= 0 ? '#22c55e' : '#ef4444', fontSize: '1.4rem' }}>{fmt(data.lucro)}</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginTop: 4 }}>
                Margem: <span style={{ color: data.margem >= 15 ? '#22c55e' : data.margem > 0 ? '#f59e0b' : '#ef4444' }}>{data.margem.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Bar Visual */}
        <div style={{ marginTop: 32, width: '100%', height: 12, borderRadius: 6, background: '#ef4444', display: 'flex', overflow: 'hidden' }}>
          <div style={{ width: `${Math.max(0, Math.min(100, 100 - data.margem))}%`, background: 'var(--border)', opacity: 0.5 }}></div>
          <div style={{ width: `${Math.max(0, Math.min(100, data.margem))}%`, background: '#22c55e' }}></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
          <span>CUSTOS CONSUMIDOS</span>
          <span>LUCRO GERADO</span>
        </div>
      </div>
    </div>
  );
}
