'use client';
import { useState, useEffect, useMemo } from 'react';
import { calcularFolha, calcularCenario, formatBRL, formatPercent, DEFAULT_SETTINGS } from '@/lib/payroll-calc';
import type { SmartEmployee, PayrollSettings, PayrollCalcResult, Scenario } from '@/lib/payroll-calc';
import { EmployeeFormModal } from './employee-form';
import { EmployeeDetailModal } from './employee-detail';
import { PayrollSettingsModal } from './payroll-settings';
import { HoleriteSection } from './holerite-section';
import { confirmDialog } from '@/components/ui/confirm-dialog';

const STORAGE_KEY = 'virtuosa_smart_employees';
const SETTINGS_KEY = 'virtuosa_payroll_settings';
const cardS: React.CSSProperties = { background:'var(--card-bg)',backdropFilter:'blur(20px)',borderRadius:20,border:'1px solid var(--border)',boxShadow:'var(--shadow-sm)' };

interface FolhaInteligenteProps {
  selectedUnit?: string;
}

export function FolhaInteligente({ selectedUnit: parentUnit }: FolhaInteligenteProps) {
  const [employees, setEmployees] = useState<SmartEmployee[]>(() => {
    if (typeof window !== 'undefined') { try { const s = localStorage.getItem(STORAGE_KEY); if (s) return JSON.parse(s); } catch {} }
    return [];
  });
  const [settings, setSettings] = useState<PayrollSettings>(() => {
    if (typeof window !== 'undefined') {
      try {
        const s = localStorage.getItem(SETTINGS_KEY);
        if (s) {
          const parsed = JSON.parse(s);
          // Migration: fix old default salarioMinimo
          if (parsed.salarioMinimo === 1518) parsed.salarioMinimo = DEFAULT_SETTINGS.salarioMinimo;
          return parsed;
        }
      } catch {}
    }
    return DEFAULT_SETTINGS;
  });
  const [showForm, setShowForm] = useState(false);
  const [editEmp, setEditEmp] = useState<SmartEmployee | undefined>();
  const [detailEmp, setDetailEmp] = useState<SmartEmployee | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [filterUnit, setFilterUnit] = useState(parentUnit || 'all');

  // Sync with parent unit selector
  useEffect(() => {
    if (parentUnit !== undefined) setFilterUnit(parentUnit);
  }, [parentUnit]);
  const [filterType, setFilterType] = useState('all');
  const [searchQ, setSearchQ] = useState('');
  const [faturamento, setFaturamento] = useState(0);
  const [scenario, setScenario] = useState<Scenario>('padrao');

  // Persist
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(employees)); }, [employees]);
  useEffect(() => { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }, [settings]);

  // Load faturamento from sales logs
  useEffect(() => {
    try {
      const raw = localStorage.getItem('virtuosa_finance_logs_v2');
      const logs: any[] = raw ? JSON.parse(raw) : [];
      const now = new Date();
      const rev = logs.filter(l => l.type === 'sale' && l.date).reduce((s, l) => {
        const d = new Date(l.date);
        return d.getUTCMonth() === now.getMonth() && d.getUTCFullYear() === now.getFullYear() ? s + l.value : s;
      }, 0);
      setFaturamento(rev);
    } catch {}
  }, []);

  // Calculations — scenario-aware
  const calcResults = useMemo(() => {
    const map = new Map<string, PayrollCalcResult>();
    employees.forEach(emp => map.set(emp.id, calcularCenario(emp, settings, scenario)));
    return map;
  }, [employees, settings, scenario]);

  // Real (padrão) for comparison
  const realResults = useMemo(() => {
    if (scenario === 'padrao') return calcResults;
    const map = new Map<string, PayrollCalcResult>();
    employees.forEach(emp => map.set(emp.id, calcularFolha(emp, settings)));
    return map;
  }, [employees, settings, scenario, calcResults]);

  const activeEmps = employees.filter(e => {
    if (e.status !== 'ativo') return false;
    if (filterUnit !== 'all' && e.unidade !== filterUnit) return false;
    if (filterType !== 'all' && e.tipo !== filterType) return false;
    return true;
  });
  const filtered = employees.filter(e => {
    if (filterUnit !== 'all' && e.unidade !== filterUnit) return false;
    if (filterType !== 'all' && e.tipo !== filterType) return false;
    if (searchQ && !e.nome.toLowerCase().includes(searchQ.toLowerCase())) return false;
    return true;
  });

  const totalFolha = activeEmps.reduce((s, e) => s + (calcResults.get(e.id)?.custoTotal || 0), 0);
  const totalReal = activeEmps.reduce((s, e) => s + (realResults.get(e.id)?.custoTotal || 0), 0);
  const economia = totalReal - totalFolha;
  const economiaPct = totalReal > 0 ? (economia / totalReal) * 100 : 0;
  const totalCLT = activeEmps.filter(e => e.tipo === 'CLT').reduce((s, e) => s + (calcResults.get(e.id)?.custoTotal || 0), 0);
  const totalPJ = activeEmps.filter(e => e.tipo === 'PJ').reduce((s, e) => s + (calcResults.get(e.id)?.custoTotal || 0), 0);
  const avgCost = activeEmps.length > 0 ? totalFolha / activeEmps.length : 0;
  const pctFaturamento = faturamento > 0 ? (totalFolha / faturamento) * 100 : 0;

  // Unit breakdown
  const unitTotals: Record<string, number> = {};
  activeEmps.forEach(e => { unitTotals[e.unidade] = (unitTotals[e.unidade] || 0) + (calcResults.get(e.id)?.custoTotal || 0); });

  // Alerts
  const alerts: { icon: string; text: string; color: string }[] = [];
  if (faturamento > 0 && pctFaturamento > 30) alerts.push({ icon: 'warning', text: `Folha representa ${formatPercent(pctFaturamento)} do faturamento (acima de 30%)`, color: '#ef4444' });
  const topEmp = [...activeEmps].sort((a, b) => (calcResults.get(b.id)?.custoTotal || 0) - (calcResults.get(a.id)?.custoTotal || 0))[0];
  if (topEmp && (calcResults.get(topEmp.id)?.custoTotal || 0) > avgCost * 2) alerts.push({ icon: 'person_alert', text: `${topEmp.nome} tem custo ${formatBRL(calcResults.get(topEmp.id)?.custoTotal || 0)} — mais que 2x a média`, color: '#f59e0b' });

  // Handlers
  const saveEmployee = (emp: SmartEmployee) => {
    setEmployees(prev => { const idx = prev.findIndex(e => e.id === emp.id); if (idx >= 0) { const n = [...prev]; n[idx] = emp; return n; } return [...prev, emp]; });
    setShowForm(false); setEditEmp(undefined);
  };
  const deleteEmployee = async (id: string) => { const ok = await confirmDialog({ title: 'Remover Colaborador', message: 'Tem certeza que deseja remover este colaborador? Esta ação não pode ser desfeita.', confirmText: 'Sim, remover', variant: 'danger' }); if (ok) setEmployees(prev => prev.filter(e => e.id !== id)); };
  const toggleStatus = (id: string) => { setEmployees(prev => prev.map(e => e.id === id ? { ...e, status: e.status === 'ativo' ? 'inativo' : 'ativo' } : e)); };

  // Export CSV
  const exportCSV = () => {
    let csv = '\uFEFF';
    csv += 'FOLHA DE PAGAMENTO INTELIGENTE - VIRTUOSA\n\n';
    csv += 'Nome;Unidade;Cargo;Tipo;Sal.Base;Insalub.;RT;Base INSS;INSS;FGTS;INSS Pat.;Prov.13º;Prov.Férias;VR;VT;Custo Total;Status\n';
    filtered.forEach(e => {
      const c = calcResults.get(e.id)!;
      csv += `${e.nome};${e.unidade};${e.cargo};${e.tipo};${c.salarioBase.toFixed(2)};${c.insalubridadeValor.toFixed(2)};${c.rtValor.toFixed(2)};${c.baseINSS.toFixed(2)};${c.inssTotal.toFixed(2)};${c.fgts.toFixed(2)};${c.inssPatronal.toFixed(2)};${c.provisao13.toFixed(2)};${c.provisaoFerias.toFixed(2)};${c.vr.toFixed(2)};${c.vt.toFixed(2)};${c.custoTotal.toFixed(2)};${e.status}\n`;
    });
    csv += `\nTotal Folha:;${totalFolha.toFixed(2)}\nColaboradores Ativos:;${activeEmps.length}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `folha_inteligente_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const units = Array.from(new Set(employees.map(e => e.unidade)));

  return (
    <div>
      {/* ─── Scenario Toggle Buttons ─── */}
      <div style={{...cardS, padding:'12px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
        <span className="material-symbols-outlined" style={{fontSize:18, color:'var(--text-muted)'}}>science</span>
        <span style={{fontSize:'0.78rem', fontWeight:700, color:'var(--text-muted)', marginRight:4}}>Simulação:</span>
        {([
          {key:'padrao' as Scenario, label:'Padrão CLT', icon:'verified', color:'#10b981'},
          {key:'sem-provisoes' as Scenario, label:'Sem 13º e Férias', icon:'event_busy', color:'#f59e0b'},
          {key:'cenario-pj' as Scenario, label:'Cenário 100% PJ', icon:'description', color:'#ef4444'},
        ]).map(s => (
          <button key={s.key} onClick={() => setScenario(s.key)} style={{
            display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:10,
            border:`2px solid ${scenario===s.key ? s.color : 'var(--border)'}`,
            background: scenario===s.key ? `${s.color}10` : 'var(--bg)',
            color: scenario===s.key ? s.color : 'var(--text-muted)',
            fontWeight:700, fontSize:'0.8rem', cursor:'pointer', fontFamily:'inherit', transition:'all 0.2s',
          }}>
            <span className="material-symbols-outlined" style={{fontSize:16}}>{s.icon}</span>{s.label}
          </button>
        ))}
      </div>

      {/* ─── Simulation Banner + Comparison ─── */}
      {scenario !== 'padrao' && activeEmps.length > 0 && (
        <div style={{...cardS, padding:'16px 20px', marginBottom:16, borderLeft:`4px solid ${scenario === 'sem-provisoes' ? '#f59e0b' : '#ef4444'}`, background: scenario === 'sem-provisoes' ? 'rgba(245,158,11,0.03)' : 'rgba(239,68,68,0.03)'}}>
          <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:12}}>
            <span className="material-symbols-outlined" style={{fontSize:20, color: scenario === 'sem-provisoes' ? '#f59e0b' : '#ef4444'}}>science</span>
            <span style={{fontSize:'0.9rem', fontWeight:800, color: scenario === 'sem-provisoes' ? '#f59e0b' : '#ef4444'}}>
              Modo Simulação: {scenario === 'sem-provisoes' ? 'Sem 13º e Férias' : 'Cenário 100% PJ'}
            </span>
            <span style={{fontSize:'0.72rem', fontWeight:600, color:'var(--text-muted)', marginLeft:'auto'}}>Dados não alterados</span>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12}}>
            {[
              {label:'CLT Completo (Real)', value: formatBRL(totalReal), color:'#6366f1', icon:'payments'},
              {label: scenario === 'sem-provisoes' ? 'Sem Provisões' : '100% PJ', value: formatBRL(totalFolha), color: scenario === 'sem-provisoes' ? '#f59e0b' : '#ef4444', icon: scenario === 'sem-provisoes' ? 'event_busy' : 'description'},
              {label:'Economia Total', value: formatBRL(economia), color:'#10b981', icon:'savings'},
              {label:'Redução', value: formatPercent(economiaPct), color:'#10b981', icon:'trending_down'},
            ].map((c, i) => (
              <div key={i} style={{padding:'10px 14px', borderRadius:12, background:'var(--bg)', border:'1px solid var(--border)'}}>
                <div style={{fontSize:'0.65rem', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:2, display:'flex', alignItems:'center', gap:4}}>
                  <span className="material-symbols-outlined" style={{fontSize:13, color:c.color}}>{c.icon}</span>{c.label}
                </div>
                <div style={{fontSize:'1.1rem', fontWeight:900, color:c.color}}>{c.value}</div>
              </div>
            ))}
          </div>
          <div style={{fontSize:'0.72rem', color:'var(--text-muted)', marginTop:10, fontWeight:600}}>
            Economia por colaborador: {formatBRL(activeEmps.length > 0 ? economia / activeEmps.length : 0)} | Custo médio no cenário: {formatBRL(avgCost)}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Total Folha', value: formatBRL(totalFolha), icon: 'payments', color: '#6366f1', sub: `${activeEmps.length} colaboradores ativos` },
          { label: 'Custo Médio', value: formatBRL(avgCost), icon: 'person', color: '#8b5cf6', sub: 'por colaborador' },
          { label: 'CLT', value: formatBRL(totalCLT), icon: 'badge', color: '#3b82f6', sub: `${activeEmps.filter(e => e.tipo === 'CLT').length} colaboradores` },
          { label: 'PJ', value: formatBRL(totalPJ), icon: 'description', color: '#f59e0b', sub: `${activeEmps.filter(e => e.tipo === 'PJ').length} colaboradores` },
        ].map((kpi, i) => (
          <div key={i} style={{ ...cardS, padding: 14, position: 'relative', overflow: 'hidden', transition: 'all 0.2s' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${kpi.color},${kpi.color}66)` }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{kpi.label}</span>
              <div style={{ width: 30, height: 30, borderRadius: 10, background: `${kpi.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: kpi.color }}>{kpi.icon}</span>
              </div>
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: kpi.color, lineHeight: 1.1 }}>{kpi.value}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2, fontWeight: 600 }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* % Faturamento + Unit Breakdown */}
      {(faturamento > 0 || Object.keys(unitTotals).length > 1) && (
        <div style={{ display: 'grid', gridTemplateColumns: faturamento > 0 ? '1fr 1fr' : '1fr', gap: 12, marginBottom: 16 }}>
          {faturamento > 0 && (
            <div style={{ ...cardS, padding: 14 }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>% Folha / Faturamento</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: pctFaturamento > 30 ? '#ef4444' : '#10b981', marginTop: 4 }}>{formatPercent(pctFaturamento)}</div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', marginTop: 8, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(pctFaturamento, 100)}%`, borderRadius: 3, background: pctFaturamento > 30 ? '#ef4444' : '#10b981', transition: 'width 0.5s' }} />
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 4 }}>Faturamento: {formatBRL(faturamento)}</div>
            </div>
          )}
          {Object.keys(unitTotals).length > 1 && (
            <div style={{ ...cardS, padding: 14 }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Custo por Unidade</span>
              {Object.entries(unitTotals).sort((a, b) => b[1] - a[1]).map(([unit, total]) => (
                <div key={unit} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{unit}</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#6366f1' }}>{formatBRL(total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alerts.map((a, i) => (
            <div key={i} style={{ ...cardS, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, borderLeft: `4px solid ${a.color}` }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: a.color }}>{a.icon}</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: a.color }}>{a.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Actions Bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => { setEditEmp(undefined); setShowForm(true); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 12px rgba(99,102,241,0.25)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>person_add</span>Novo Colaborador
        </button>
        <button onClick={() => setShowSettings(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 12, border: '1px solid rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.06)', color: '#8b5cf6', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>settings</span>Configurações
        </button>
        {employees.length > 0 && (
          <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 12, border: '1px solid rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.06)', color: '#10b981', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>Exportar CSV
          </button>
        )}
        <div style={{ flex: 1 }} />
        <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Buscar colaborador..." style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: '0.82rem', fontFamily: 'inherit', fontWeight: 600, color: 'var(--text-main)', outline: 'none', minWidth: 160 }} />
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: '0.82rem', fontFamily: 'inherit', fontWeight: 600, color: 'var(--text-main)' }}>
          <option value="all">CLT + PJ</option>
          <option value="CLT">CLT</option>
          <option value="PJ">PJ</option>
        </select>
      </div>

      {/* ─── Holerite — Cálculo Líquido ─── */}
      <HoleriteSection employees={employees} settings={settings} selectedUnit={filterUnit} />

      {/* Table */}
      <div style={{ ...cardS, padding: 0, overflow: 'hidden', borderRadius: 20 }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: 1200, borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg)' }}>
                {['Nome', 'Unidade', 'Cargo', 'Tipo', 'Sal.Base', 'Insalub.', 'RT', 'FGTS', 'INSS Pat.', 'Prov.13º', 'Prov.Fér.', 'VR', 'VT', 'Custo Total', 'Status', 'Ações'].map(h => (
                  <th key={h} style={{ padding: '12px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap', borderBottom: '2px solid var(--border)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={16} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 40, display: 'block', marginBottom: 8, opacity: 0.3 }}>group</span>
                  Nenhum colaborador cadastrado. Clique em "Novo Colaborador" para começar.
                </td></tr>
              ) : filtered.map(emp => {
                const c = calcResults.get(emp.id)!;
                const isInactive = emp.status === 'inativo';
                return (
                  <tr key={emp.id} style={{ borderBottom: '1px solid var(--border)', opacity: isInactive ? 0.5 : 1, transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.02)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <td style={{ padding: '10px', fontWeight: 700 }}>{emp.nome}</td>
                    <td style={{ padding: '10px' }}><span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(99,102,241,0.06)', color: '#6366f1', fontSize: '0.72rem', fontWeight: 600 }}>{emp.unidade}</span></td>
                    <td style={{ padding: '10px', color: 'var(--text-muted)' }}>{emp.cargo}</td>
                    <td style={{ padding: '10px' }}><span style={{ padding: '2px 8px', borderRadius: 6, background: emp.tipo === 'CLT' ? 'rgba(99,102,241,0.08)' : 'rgba(245,158,11,0.08)', color: emp.tipo === 'CLT' ? '#6366f1' : '#f59e0b', fontSize: '0.72rem', fontWeight: 700 }}>{emp.tipo}</span></td>
                    <td style={{ padding: '10px', fontWeight: 700 }}>{formatBRL(c.salarioBase)}</td>
                    <td style={{ padding: '10px', color: c.insalubridadeValor > 0 ? '#f59e0b' : 'var(--text-muted)' }}>{c.insalubridadeValor > 0 ? formatBRL(c.insalubridadeValor) : '—'}</td>
                    <td style={{ padding: '10px', color: c.rtValor > 0 ? '#f59e0b' : 'var(--text-muted)' }}>{c.rtValor > 0 ? formatBRL(c.rtValor) : '—'}</td>
                    <td style={{ padding: '10px' }}>{c.fgts > 0 ? formatBRL(c.fgts) : '—'}</td>
                    <td style={{ padding: '10px' }}>{c.inssPatronal > 0 ? formatBRL(c.inssPatronal) : '—'}</td>
                    <td style={{ padding: '10px' }}>{c.provisao13 > 0 ? formatBRL(c.provisao13) : '—'}</td>
                    <td style={{ padding: '10px' }}>{c.provisaoFerias > 0 ? formatBRL(c.provisaoFerias) : '—'}</td>
                    <td style={{ padding: '10px', color: '#10b981' }}>{c.vr > 0 ? formatBRL(c.vr) : '—'}</td>
                    <td style={{ padding: '10px', color: '#10b981' }}>{c.vt > 0 ? formatBRL(c.vt) : '—'}</td>
                    <td style={{ padding: '10px', fontWeight: 900, color: '#6366f1', fontSize: '0.85rem' }}>{formatBRL(c.custoTotal)}</td>
                    <td style={{ padding: '10px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 6, background: emp.status === 'ativo' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', color: emp.status === 'ativo' ? '#10b981' : '#ef4444', fontSize: '0.72rem', fontWeight: 700 }}>
                        {emp.status === 'ativo' ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => setDetailEmp(emp)} title="Detalhes" style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#3b82f6' }}>visibility</span>
                        </button>
                        <button onClick={() => { setEditEmp(emp); setShowForm(true); }} title="Editar" style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#f97316' }}>edit</span>
                        </button>
                        <button onClick={() => toggleStatus(emp.id)} title={emp.status === 'ativo' ? 'Inativar' : 'Ativar'} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14, color: emp.status === 'ativo' ? '#ef4444' : '#10b981' }}>{emp.status === 'ativo' ? 'person_off' : 'person'}</span>
                        </button>
                        <button onClick={() => deleteEmployee(emp.id)} title="Excluir" style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#ef4444' }}>delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showForm && <EmployeeFormModal employee={editEmp} settings={settings} onSave={saveEmployee} onClose={() => { setShowForm(false); setEditEmp(undefined); }} />}
      {detailEmp && <EmployeeDetailModal employee={detailEmp} calc={calcResults.get(detailEmp.id)!} onClose={() => setDetailEmp(null)} />}
      {showSettings && <PayrollSettingsModal settings={settings} onSave={setSettings} onClose={() => setShowSettings(false)} />}
    </div>
  );
}
