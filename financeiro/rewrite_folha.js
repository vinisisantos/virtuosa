const fs = require('fs');

const content = `"use client";
import { useState, useEffect, useMemo } from 'react';
import { calcularFolha, formatBRL, formatPercent, DEFAULT_SETTINGS, calcularLiquido } from '@/lib/payroll-calc';
import type { SmartEmployee, PayrollSettings, PayrollCalcResult, LiquidoResult } from '@/lib/payroll-calc';
import { EmployeeFormModal } from './employee-form';
import { EmployeeDetailModal } from './employee-detail';
import { PayrollSettingsModal } from './payroll-settings';
import { confirmDialog } from '@/components/ui/confirm-dialog';

const cardS: React.CSSProperties = { background:'var(--card-bg)',backdropFilter:'blur(20px)',borderRadius:20,border:'1px solid var(--border)',boxShadow:'var(--shadow-sm)' };

const STORAGE_KEY_PREMIACOES = 'virtuosa_holerite_premiacoes';
const STORAGE_KEY_VR_OVERRIDES = 'virtuosa_holerite_vr_overrides';
const STORAGE_KEY_ADIANT = 'virtuosa_holerite_adiantamentos';

function loadMap(key: string): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : {}; } catch { return {}; }
}
function loadBoolMap(key: string): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : {}; } catch { return {}; }
}

interface FolhaInteligenteProps {
  selectedUnit?: string;
}

export function FolhaInteligente({ selectedUnit: parentUnit }: FolhaInteligenteProps) {
  const [employees, setEmployees] = useState<SmartEmployee[]>([]);
  const [settings, setSettings] = useState<PayrollSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editEmp, setEditEmp] = useState<SmartEmployee | undefined>();
  const [detailEmp, setDetailEmp] = useState<SmartEmployee | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [filterUnit, setFilterUnit] = useState(parentUnit || 'all');
  const [searchQ, setSearchQ] = useState('');
  
  // States for Holerite details
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);
  const [premiacoes, setPremiacoes] = useState<Record<string, number>>(() => loadMap(STORAGE_KEY_PREMIACOES));
  const [vrOverrides, setVrOverrides] = useState<Record<string, number>>(() => loadMap(STORAGE_KEY_VR_OVERRIDES));
  const [adiantamentos, setAdiantamentos] = useState<Record<string, boolean>>(() => loadBoolMap(STORAGE_KEY_ADIANT));
  const [premInput, setPremInput] = useState<Record<string, string>>({});
  const [vrInput, setVrInput] = useState<Record<string, string>>({});

  const savePrem = (map: Record<string, number>) => { setPremiacoes(map); localStorage.setItem(STORAGE_KEY_PREMIACOES, JSON.stringify(map)); };
  const saveVr = (map: Record<string, number>) => { setVrOverrides(map); localStorage.setItem(STORAGE_KEY_VR_OVERRIDES, JSON.stringify(map)); };
  const saveAdiant = (map: Record<string, boolean>) => { setAdiantamentos(map); localStorage.setItem(STORAGE_KEY_ADIANT, JSON.stringify(map)); };

  // Load from database on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [empRes, setRes] = await Promise.all([
          fetch(\`/api/folha-inteligente/employees?unit=\${parentUnit || 'all'}\`),
          fetch('/api/folha-inteligente/settings')
        ]);
        if (empRes.ok) setEmployees(await empRes.json());
        if (setRes.ok) {
          const s = await setRes.json();
          if (s.salarioMinimo === 1518) s.salarioMinimo = DEFAULT_SETTINGS.salarioMinimo;
          setSettings(s);
        }
      } catch (err) { console.error('Error loading data:', err); } finally { setIsLoaded(true); }
    };
    loadData();
  }, [parentUnit]);

  useEffect(() => {
    if (parentUnit !== undefined) setFilterUnit(parentUnit);
  }, [parentUnit]);

  // Calculations (Only Standard / Real scenario)
  const calcResults = useMemo(() => {
    const map = new Map<string, { folha: PayrollCalcResult, holerite: LiquidoResult }>();
    employees.forEach(emp => {
      const folha = calcularFolha(emp, settings);
      const prem = premiacoes[emp.id] || 0;
      const vrOvr = emp.tipo === 'PJ' && vrOverrides[emp.id] !== undefined ? vrOverrides[emp.id] : undefined;
      const temAdiant = !!adiantamentos[emp.id];
      const holerite = calcularLiquido(emp, settings, prem, vrOvr, temAdiant);
      map.set(emp.id, { folha, holerite });
    });
    return map;
  }, [employees, settings, premiacoes, vrOverrides, adiantamentos]);

  const activeEmps = employees.filter(e => e.status === 'ativo' && (filterUnit === 'all' || e.unidade === filterUnit));
  
  const filtered = employees.filter(e => {
    if (filterUnit !== 'all' && e.unidade !== filterUnit) return false;
    if (searchQ && !e.nome.toLowerCase().includes(searchQ.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    // Ativos primeiro
    if (a.status === 'ativo' && b.status !== 'ativo') return -1;
    if (a.status !== 'ativo' && b.status === 'ativo') return 1;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });

  const totalFolha = activeEmps.reduce((s, e) => s + (calcResults.get(e.id)?.folha.custoTotal || 0), 0);
  const totalLiquido = activeEmps.reduce((s, e) => s + (calcResults.get(e.id)?.holerite.liquido || 0), 0);
  const avgCost = activeEmps.length > 0 ? totalFolha / activeEmps.length : 0;

  // Handlers
  const saveEmployee = async (emp: SmartEmployee) => {
    setEmployees(prev => { const idx = prev.findIndex(e => e.id === emp.id); if (idx >= 0) { const n = [...prev]; n[idx] = emp; return n; } return [...prev, emp]; });
    setShowForm(false); setEditEmp(undefined);
    try {
      const isNew = !employees.find(e => e.id === emp.id);
      await fetch('/api/folha-inteligente/employees', { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(emp) });
    } catch (err) { console.error('Error saving:', err); }
  };

  const deleteEmployee = async (id: string) => { 
    const ok = await confirmDialog({ title: 'Remover Colaborador', message: 'Tem certeza que deseja remover este colaborador? Esta ação não pode ser desfeita.', confirmText: 'Sim, remover', variant: 'danger' }); 
    if (ok) {
      setEmployees(prev => prev.filter(e => e.id !== id));
      try { await fetch(\`/api/folha-inteligente/employees?id=\${id}\`, { method: 'DELETE' }); } catch (err) { console.error(err); }
    }
  };

  const toggleStatus = async (id: string, e: React.MouseEvent) => { 
    e.stopPropagation();
    const emp = employees.find(emp => emp.id === id);
    if (!emp) return;
    const newStatus = emp.status === 'ativo' ? 'inativo' : 'ativo';
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, status: newStatus } : e));
    try { await fetch('/api/folha-inteligente/employees', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: newStatus }) }); } catch (err) { console.error(err); }
  };

  const handleSaveSettings = async (newSettings: PayrollSettings) => {
    setSettings(newSettings);
    setShowSettings(false);
    try { await fetch('/api/folha-inteligente/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSettings) }); } catch (err) { console.error(err); }
  };

  const exportCSV = () => {
    let csv = '\\uFEFF';
    csv += 'FOLHA DE PAGAMENTO INTELIGENTE - VIRTUOSA\\n\\n';
    csv += 'Nome;Unidade;Cargo;Tipo;Sal.Base;Insalub.;RT;Base INSS;INSS;FGTS;INSS Pat.;Prov.13º;Prov.Férias;VR;VT;Custo Total Empresa;Líquido a Receber;Status\\n';
    filtered.forEach(e => {
      const c = calcResults.get(e.id)?.folha;
      const h = calcResults.get(e.id)?.holerite;
      if (!c || !h) return;
      csv += \`\${e.nome};\${e.unidade};\${e.cargo};\${e.tipo};\${c.salarioBase.toFixed(2)};\${c.insalubridadeValor.toFixed(2)};\${c.rtValor.toFixed(2)};\${c.baseINSS.toFixed(2)};\${c.inssTotal.toFixed(2)};\${c.fgts.toFixed(2)};\${c.inssPatronal.toFixed(2)};\${c.provisao13.toFixed(2)};\${c.provisaoFerias.toFixed(2)};\${c.vr.toFixed(2)};\${c.vt.toFixed(2)};\${c.custoTotal.toFixed(2)};\${h.liquido.toFixed(2)};\${e.status}\\n\`;
    });
    csv += \`\\nCusto Total Empresa:;\${totalFolha.toFixed(2)}\\nLíquido Total a Pagar:;\${totalLiquido.toFixed(2)}\\nColaboradores Ativos:;\${activeEmps.length}\\n\`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = \`folha_\${new Date().toISOString().slice(0, 10)}.csv\`; a.click(); URL.revokeObjectURL(url);
  };

  const formatCurrency = (val: string) => {
    const digits = val.replace(/\\D/g, '');
    const num = parseInt(digits, 10) / 100 || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  if (!isLoaded) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Carregando folha...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
      
      {/* HEADER E AÇÕES */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)' }}>Folha de Pagamento</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Gerencie os colaboradores, adicione premiações e veja os demonstrativos claros.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => { setEditEmp(undefined); setShowForm(true); }} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>person_add</span> Novo Colaborador
          </button>
          <button onClick={() => setShowSettings(true)} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-main)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>settings</span> Ajustes
          </button>
          <button onClick={exportCSV} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-main)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span> Exportar CSV
          </button>
        </div>
      </div>

      {/* KPIs SIMPLIFICADOS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {[
          { label: 'Custo Total (Empresa)', value: formatBRL(totalFolha), color: '#ef4444', icon: 'account_balance' },
          { label: 'Líquido Total (Pagar)', value: formatBRL(totalLiquido), color: '#10b981', icon: 'payments' },
          { label: 'Colaboradores Ativos', value: \`\${activeEmps.length} pessoas\`, color: '#6366f1', icon: 'group' },
          { label: 'Custo Médio p/ Colab.', value: formatBRL(avgCost), color: '#f59e0b', icon: 'analytics' },
        ].map((kpi, i) => (
          <div key={i} style={{ ...cardS, padding: '16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{kpi.label}</span>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: kpi.color }}>{kpi.icon}</span>
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* BUSCA */}
      <div style={{ display: 'flex', gap: 10 }}>
        <input 
          value={searchQ} onChange={e => setSearchQ(e.target.value)} 
          placeholder="Buscar colaborador por nome..." 
          style={{ flex: 1, padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card)', fontSize: '0.9rem', outline: 'none', color: 'var(--text-main)' }} 
        />
      </div>

      {/* LISTA EXPANSÍVEL (Substituindo a Tabela Antiga) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, display: 'block', marginBottom: 12, opacity: 0.3 }}>badge</span>
            <p style={{ fontSize: '1rem', fontWeight: 600 }}>Nenhum colaborador encontrado.</p>
          </div>
        ) : (
          filtered.map(emp => {
            const result = calcResults.get(emp.id);
            if (!result) return null;
            const { folha, holerite } = result;
            const isExpanded = expandedEmp === emp.id;
            const isInactive = emp.status !== 'ativo';
            const hasPrem = (premiacoes[emp.id] || 0) > 0;
            const hasAdiant = !!adiantamentos[emp.id];

            return (
              <div key={emp.id} style={{ borderRadius: 16, border: '1px solid var(--border)', background: 'var(--card)', overflow: 'hidden', opacity: isInactive ? 0.6 : 1, transition: 'all 0.2s' }}>
                
                {/* Linha Resumo (Sempre visível) */}
                <div 
                  onClick={() => setExpandedEmp(isExpanded ? null : emp.id)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', cursor: 'pointer', userSelect: 'none', gap: 16 }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(128,128,128,0.03)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      background: emp.tipo === 'CLT' ? 'rgba(99,102,241,0.1)' : 'rgba(245,158,11,0.1)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 24, color: emp.tipo === 'CLT' ? '#6366f1' : '#f59e0b' }}>
                        {emp.tipo === 'CLT' ? 'badge' : 'description'}
                      </span>
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.nome}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>{emp.cargo}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>•</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: emp.tipo === 'CLT' ? '#6366f1' : '#f59e0b' }}>{emp.tipo}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>•</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>{emp.unidade}</span>
                        
                        {hasPrem && <span style={{ padding: '2px 6px', borderRadius: 6, fontSize: '0.65rem', fontWeight: 800, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', marginLeft: 4 }}>🏆 Prêmio</span>}
                        {hasAdiant && <span style={{ padding: '2px 6px', borderRadius: 6, fontSize: '0.65rem', fontWeight: 800, background: 'rgba(249,115,22,0.1)', color: '#f97316', marginLeft: 4 }}>Adiant.</span>}
                        {isInactive && <span style={{ padding: '2px 6px', borderRadius: 6, fontSize: '0.65rem', fontWeight: 800, background: 'rgba(239,68,68,0.1)', color: '#ef4444', marginLeft: 4 }}>Inativo</span>}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexShrink: 0 }}>
                    {/* Salário Base */}
                    <div style={{ textAlign: 'right', display: 'none', '@media (min-width: 600px)': { display: 'block' } } as any}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Salário Base</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-main)' }}>{formatBRL(emp.salarioBase)}</div>
                    </div>
                    {/* Custo Empresa */}
                    <div style={{ textAlign: 'right', display: 'none', '@media (min-width: 800px)': { display: 'block' } } as any}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase' }}>Custo Empresa</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ef4444' }}>{formatBRL(folha.custoTotal)}</div>
                    </div>
                    {/* Líquido (Destaque Principal) */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#10b981', textTransform: 'uppercase' }}>Líquido a Pagar</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#10b981' }}>{formatBRL(holerite.liquido)}</div>
                    </div>
                    <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--text-muted)', transition: 'transform 0.3s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
                  </div>
                </div>

                {/* Área Expandida (Detalhes) */}
                <div style={{ maxHeight: isExpanded ? 1000 : 0, opacity: isExpanded ? 1 : 0, overflow: 'hidden', transition: 'all 0.3s ease' }}>
                  <div style={{ padding: '20px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
                    
                    {/* Botões de Ação do Funcionário */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 24, justifyContent: 'flex-end' }}>
                      <button onClick={(e) => { e.stopPropagation(); setEditEmp(emp); setShowForm(true); }} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-main)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit</span> Editar Cadastro
                      </button>
                      <button onClick={(e) => toggleStatus(emp.id, e)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: isInactive ? '#10b981' : '#ef4444', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{isInactive ? 'person' : 'person_off'}</span> {isInactive ? 'Ativar' : 'Inativar'}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteEmployee(emp.id); }} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
                      
                      {/* Lado Esquerdo: Demonstrativo Recebimento (Holerite) */}
                      <div style={{ background: 'var(--card)', padding: '16px', borderRadius: 12, border: '1px solid var(--border)' }}>
                        <h4 style={{ margin: '0 0 16px', fontSize: '0.85rem', fontWeight: 800, color: '#10b981', display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>receipt_long</span> Demonstrativo do Colaborador
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Salário {emp.tipo === 'CLT' ? 'Base' : 'Contratado'}</span> <span style={{ fontWeight: 800 }}>{formatBRL(emp.salarioBase)}</span></div>
                          {emp.tipo === 'CLT' && emp.insalubridade && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Insalubridade</span> <span style={{ fontWeight: 700, color: '#10b981' }}>+{formatBRL(settings.salarioMinimo * 0.20)}</span></div>}
                          {emp.tipo === 'CLT' && emp.rt && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>RT</span> <span style={{ fontWeight: 700, color: '#10b981' }}>+{formatBRL(settings.valorRT)}</span></div>}
                          {holerite.bruto !== emp.salarioBase && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '6px 0', borderTop: '1px dashed var(--border)', borderBottom: '1px dashed var(--border)' }}><span style={{ color: 'var(--text-main)', fontWeight: 800 }}>Bruto a Receber</span> <span style={{ fontWeight: 900 }}>{formatBRL(holerite.bruto)}</span></div>}
                          
                          {/* Descontos Legais */}
                          {emp.tipo === 'CLT' && (<>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginTop: 4 }}><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>INSS</span> <span style={{ fontWeight: 700, color: '#ef4444' }}>-{formatBRL(holerite.inss)}</span></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>IRRF</span> <span style={{ fontWeight: 700, color: holerite.irrf > 0 ? '#ef4444' : 'var(--text-muted)' }}>{holerite.irrf > 0 ? \`-\${formatBRL(holerite.irrf)}\` : 'R$ 0,00'}</span></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>VT (6%)</span> <span style={{ fontWeight: 700, color: '#ef4444' }}>-{formatBRL(holerite.vt)}</span></div>
                          </>)}

                          {/* Lançamentos Extras (Adiantamento, VR, Prêmio) */}
                          {holerite.adiantamento > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginTop: 4 }}><span style={{ color: '#f97316', fontWeight: 700 }}>Adiantamento (40%)</span> <span style={{ fontWeight: 800, color: '#f97316' }}>-{formatBRL(holerite.adiantamento)}</span></div>}
                          {holerite.vr > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginTop: 4 }}><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>VR (Vale Refeição)</span> <span style={{ fontWeight: 700, color: '#10b981' }}>+{formatBRL(holerite.vr)}</span></div>}
                          {holerite.premiacao > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginTop: 4 }}><span style={{ color: '#f59e0b', fontWeight: 800 }}>🏆 Premiação</span> <span style={{ fontWeight: 900, color: '#f59e0b' }}>+{formatBRL(holerite.premiacao)}</span></div>}

                          {/* Total Líquido */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(16,185,129,0.1)', borderRadius: 8, marginTop: 12 }}>
                            <span style={{ fontSize: '0.9rem', fontWeight: 900, color: '#10b981' }}>TOTAL LÍQUIDO</span>
                            <span style={{ fontSize: '1.3rem', fontWeight: 900, color: '#10b981' }}>{formatBRL(holerite.liquido)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Lado Direito: Custo Empresa + Inputs Dinâmicos */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        
                        {/* Box de Custo Empresa */}
                        <div style={{ background: 'rgba(239,68,68,0.03)', padding: '16px', borderRadius: 12, border: '1px solid rgba(239,68,68,0.2)' }}>
                          <h4 style={{ margin: '0 0 12px', fontSize: '0.85rem', fontWeight: 800, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>business</span> Custo Total p/ Empresa
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Proventos & Salário</span> <span style={{ fontWeight: 700 }}>{formatBRL(folha.bruto)}</span></div>
                            {emp.tipo === 'CLT' && (
                              <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Encargos (INSS/FGTS)</span> <span style={{ fontWeight: 700, color: '#ef4444' }}>+{formatBRL(folha.inssPatronal + folha.fgts)}</span></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Provisões (Férias/13º)</span> <span style={{ fontWeight: 700, color: '#ef4444' }}>+{formatBRL(folha.provisao13 + folha.provisaoFerias)}</span></div>
                              </>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Benefícios Ofertados</span> <span style={{ fontWeight: 700, color: '#ef4444' }}>+{formatBRL(folha.vr + folha.vt)}</span></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid rgba(239,68,68,0.2)', marginTop: 4 }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#ef4444' }}>CUSTO FINAL</span>
                              <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#ef4444' }}>{formatBRL(folha.custoTotal)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Lançamento de Adiantamento e Prêmio */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          {/* Adiantamento Toggle */}
                          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', padding: '12px', borderRadius: 10 }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#f97316', marginBottom: 8, textTransform: 'uppercase' }}>Adiantamento (40%)</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div
                                onClick={(e) => { e.stopPropagation(); saveAdiant({...adiantamentos, [emp.id]: !hasAdiant}); }}
                                style={{ width: 44, height: 24, borderRadius: 12, cursor: 'pointer', transition: 'all 0.3s', position: 'relative',
                                  background: hasAdiant ? '#f97316' : 'var(--border)' }}
                              >
                                <div style={{ width: 18, height: 18, borderRadius: 9, background: '#fff', position: 'absolute', top: 3, transition: 'all 0.3s', left: hasAdiant ? 23 : 3 }} />
                              </div>
                              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: hasAdiant ? '#f97316' : 'var(--text-muted)' }}>{hasAdiant ? 'Ativo' : 'Não'}</span>
                            </div>
                          </div>

                          {/* Premiação Input */}
                          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', padding: '12px', borderRadius: 10 }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#f59e0b', marginBottom: 8, textTransform: 'uppercase' }}>Adicionar Prêmio</div>
                            <input
                              value={premInput[emp.id] || ''}
                              onChange={e => setPremInput({...premInput, [emp.id]: formatCurrency(e.target.value)})}
                              placeholder={premiacoes[emp.id] ? formatBRL(premiacoes[emp.id]) : 'R$ 0,00'}
                              inputMode="numeric"
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  const raw = premInput[emp.id] || '';
                                  const val = parseInt(raw.replace(/\\D/g, ''), 10) / 100 || 0;
                                  savePrem({ ...premiacoes, [emp.id]: val });
                                  setPremInput({ ...premInput, [emp.id]: '' });
                                }
                              }}
                              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: '0.85rem', outline: 'none', color: 'var(--text-main)', fontWeight: 600 }}
                            />
                          </div>
                        </div>

                      </div>

                    </div>
                  </div>
                </div>

              </div>
            );
          })
        )}
      </div>

      {/* Modals Extras */}
      {showForm && <EmployeeFormModal employee={editEmp} settings={settings} onSave={saveEmployee} onClose={() => { setShowForm(false); setEditEmp(undefined); }} />}
      {detailEmp && <EmployeeDetailModal employee={detailEmp} calc={calcResults.get(detailEmp.id)?.folha!} onClose={() => setDetailEmp(null)} />}
      {showSettings && <PayrollSettingsModal settings={settings} onSave={handleSaveSettings} onClose={() => setShowSettings(false)} />}
    </div>
  );
}
`;

fs.writeFileSync('/Users/viniciussantos/Downloads/virtuosa-main/financeiro/src/components/folha-inteligente/index.tsx', content);
