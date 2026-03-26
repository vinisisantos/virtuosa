'use client';
import type { SmartEmployee, PayrollCalcResult } from '@/lib/payroll-calc';
import { formatBRL, formatPercent } from '@/lib/payroll-calc';

const cardS: React.CSSProperties = { background:'var(--card-bg)',backdropFilter:'blur(20px)',borderRadius:20,border:'1px solid var(--border)',boxShadow:'var(--shadow-sm)',padding:'20px 24px' };

interface Props { employee: SmartEmployee; calc: PayrollCalcResult; onClose: () => void; }

export function EmployeeDetailModal({ employee, calc, onClose }: Props) {
  const Row = ({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: '0.88rem', fontWeight: bold ? 900 : 700, color: color || 'var(--text-main)' }}>{value}</span>
    </div>
  );

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...cardS, maxWidth: 650, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ color: '#6366f1' }}>person</span>
              {employee.nome}
            </h2>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <span style={{ padding: '2px 10px', borderRadius: 6, background: employee.tipo === 'CLT' ? 'rgba(99,102,241,0.08)' : 'rgba(245,158,11,0.08)', color: employee.tipo === 'CLT' ? '#6366f1' : '#f59e0b', fontSize: '0.75rem', fontWeight: 700 }}>{employee.tipo}</span>
              <span style={{ padding: '2px 10px', borderRadius: 6, background: 'rgba(16,185,129,0.06)', color: '#6b7280', fontSize: '0.75rem', fontWeight: 600 }}>{employee.cargo}</span>
              <span style={{ padding: '2px 10px', borderRadius: 6, background: 'rgba(99,102,241,0.06)', color: '#6366f1', fontSize: '0.75rem', fontWeight: 600 }}>{employee.unidade}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>

        {/* Custo Total Card */}
        <div style={{ padding: '16px 20px', borderRadius: 14, background: 'linear-gradient(135deg,rgba(99,102,241,0.08),rgba(139,92,246,0.04))', border: '1px solid rgba(99,102,241,0.15)', marginBottom: 20, textAlign: 'center' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Custo Total Real</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#6366f1' }}>{formatBRL(calc.custoTotal)}</div>
        </div>

        {/* Dados Cadastrais */}
        <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#6366f1', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>badge</span>Dados Cadastrais
        </h3>
        <Row label="Salário Base" value={formatBRL(calc.salarioBase)} />
        {calc.tipo === 'CLT' && (
          <>
            <Row label="Insalubridade" value={calc.insalubridadeValor > 0 ? formatBRL(calc.insalubridadeValor) : 'Não'} color={calc.insalubridadeValor > 0 ? '#f59e0b' : undefined} />
            <Row label="RT" value={calc.rtValor > 0 ? formatBRL(calc.rtValor) : 'Não'} color={calc.rtValor > 0 ? '#f59e0b' : undefined} />
            <Row label="Base INSS" value={formatBRL(calc.baseINSS)} bold />
          </>
        )}

        {/* INSS Progressivo */}
        {calc.tipo === 'CLT' && calc.inssDetalhes.length > 0 && (
          <>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#ef4444', marginTop: 16, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>receipt</span>INSS do Colaborador (Desconto)
            </h3>
            {calc.inssDetalhes.map((f, i) => (
              <Row key={i} label={`Faixa ${f.faixa}: ${formatBRL(f.base)} × ${formatPercent(f.aliquota * 100)}`} value={formatBRL(f.valor)} color="#ef4444" />
            ))}
            <Row label={`Total INSS (alíquota efetiva: ${formatPercent(calc.inssAliquotaEfetiva)})`} value={formatBRL(calc.inssTotal)} color="#ef4444" bold />
          </>
        )}

        {/* Encargos */}
        {calc.tipo === 'CLT' && (
          <>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#8b5cf6', marginTop: 16, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>account_balance</span>Encargos (Custo Empresa)
            </h3>
            <Row label="FGTS (8%)" value={formatBRL(calc.fgts)} color="#8b5cf6" />
            <Row label="INSS Patronal (20%)" value={formatBRL(calc.inssPatronal)} color="#8b5cf6" />
          </>
        )}

        {/* Provisões */}
        {calc.tipo === 'CLT' && (
          <>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f97316', marginTop: 16, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>event_upcoming</span>Provisões
            </h3>
            <Row label="Provisão 13º (1/12)" value={formatBRL(calc.provisao13)} color="#f97316" />
            <Row label="Provisão Férias + 1/3" value={formatBRL(calc.provisaoFerias)} color="#f97316" />
          </>
        )}

        {/* Benefícios */}
        <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#10b981', marginTop: 16, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>card_giftcard</span>Benefícios
        </h3>
        <Row label="VR" value={formatBRL(calc.vr)} color="#10b981" />
        {calc.tipo === 'CLT' && <Row label="VT (6%)" value={formatBRL(calc.vt)} color="#10b981" />}

        {/* Composição % */}
        {calc.breakdown.length > 0 && (
          <>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#3b82f6', marginTop: 16, marginBottom: 8, display:'flex',alignItems:'center',gap:6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>donut_large</span>Composição do Custo
            </h3>
            <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', height: 24, marginBottom: 8 }}>
              {calc.breakdown.map((b, i) => {
                const colors = ['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#3b82f6'];
                return <div key={i} title={`${b.label}: ${formatPercent(b.percent)}`} style={{ width: `${b.percent}%`, background: colors[i % colors.length], minWidth: b.percent > 2 ? 2 : 0 }} />;
              })}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {calc.breakdown.map((b, i) => {
                const colors = ['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#3b82f6'];
                return (
                  <span key={i} style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: `${colors[i % colors.length]}10`, color: colors[i % colors.length] }}>
                    {b.label}: {formatPercent(b.percent)}
                  </span>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
