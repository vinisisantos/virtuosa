'use client';
import { useState, useEffect, useMemo } from 'react';
import { DEFAULT_SETTINGS, formatBRL } from '@/lib/payroll-calc';
import type { SmartEmployee, PayrollSettings } from '@/lib/payroll-calc';
import { formatCurrency } from '@/hooks/useDashboard';

const STORAGE_KEY_EMP = 'virtuosa_smart_employees';
const STORAGE_KEY_SET = 'virtuosa_payroll_settings';
const STORAGE_KEY_VT = 'virtuosa_vt_history';

const cardS: React.CSSProperties = { background:'var(--card-bg)',backdropFilter:'blur(20px)',borderRadius:20,border:'1px solid var(--border)',boxShadow:'var(--shadow-sm)' };

interface VTEntry {
  id: string;
  empId: string;
  empName: string;
  month: number; // 0-11
  year: number;
  diasUteis: number;
  diasDescontados: number;
  valorDiario: number;
}

interface Props {
  selectedUnit: string;
}

export function VTSection({ selectedUnit }: Props) {
  const [employees, setEmployees] = useState<SmartEmployee[]>([]);
  const [settings, setSettings] = useState<PayrollSettings>(DEFAULT_SETTINGS);
  const [entries, setEntries] = useState<VTEntry[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_VT) || '[]'); } catch { return []; }
  });

  const [selMonth, setSelMonth] = useState(new Date().getMonth());
  const [selYear, setSelYear] = useState(new Date().getFullYear());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDias, setEditDias] = useState('22');
  const [editDesc, setEditDesc] = useState('0');
  const [editValor, setEditValor] = useState('');

  useEffect(() => {
    try {
      const e = localStorage.getItem(STORAGE_KEY_EMP);
      const s = localStorage.getItem(STORAGE_KEY_SET);
      if (e) setEmployees(JSON.parse(e));
      if (s) setSettings(JSON.parse(s));
    } catch {}
  }, []);

  const saveEntries = (data: VTEntry[]) => { setEntries(data); localStorage.setItem(STORAGE_KEY_VT, JSON.stringify(data)); };

  const filtered = useMemo(() =>
    employees
      .filter(e => e.status === 'ativo' && e.tipo === 'CLT' && (selectedUnit === 'all' || e.unidade === selectedUnit))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [employees, selectedUnit]
  );

  const monthEntries = useMemo(() =>
    entries.filter(e => e.month === selMonth && e.year === selYear),
    [entries, selMonth, selYear]
  );

  const getEntry = (empId: string) => monthEntries.find(e => e.empId === empId);

  const calcVT = (emp: SmartEmployee, diasUteis: number, diasDescontados: number, valorDiarioOverride?: number) => {
    const valorDiario = valorDiarioOverride || (emp.salarioBase * settings.percentualVT / 22);
    const diasEfetivos = Math.max(0, diasUteis - diasDescontados);
    return { valorDiario, diasEfetivos, total: valorDiario * diasEfetivos };
  };

  const handleSave = (emp: SmartEmployee) => {
    const dias = parseInt(editDias) || 22;
    const desc = parseInt(editDesc) || 0;
    const valorDigits = editValor.replace(/[^\d]/g, '');
    const valorDiario = valorDigits ? parseInt(valorDigits, 10) / 100 : (emp.salarioBase * settings.percentualVT / 22);

    const existing = entries.findIndex(e => e.empId === emp.id && e.month === selMonth && e.year === selYear);
    const entry: VTEntry = {
      id: existing >= 0 ? entries[existing].id : Date.now().toString(),
      empId: emp.id, empName: emp.nome,
      month: selMonth, year: selYear,
      diasUteis: dias, diasDescontados: desc, valorDiario,
    };
    const newEntries = [...entries];
    if (existing >= 0) newEntries[existing] = entry;
    else newEntries.push(entry);
    saveEntries(newEntries);
    setEditingId(null);
  };

  const autoGenerate = () => {
    const newEntries = [...entries];
    filtered.forEach(emp => {
      if (!getEntry(emp.id)) {
        const valorDiario = emp.salarioBase * settings.percentualVT / 22;
        newEntries.push({
          id: Date.now().toString() + emp.id,
          empId: emp.id, empName: emp.nome,
          month: selMonth, year: selYear,
          diasUteis: 22, diasDescontados: 0, valorDiario,
        });
      }
    });
    saveEntries(newEntries);
  };

  const totalVT = filtered.reduce((s, emp) => {
    const entry = getEntry(emp.id);
    if (entry) {
      const diasEfetivos = Math.max(0, entry.diasUteis - entry.diasDescontados);
      return s + entry.valorDiario * diasEfetivos;
    }
    return s + emp.salarioBase * settings.percentualVT;
  }, 0);

  const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  return (
    <div>
      {/* Month selector */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12,marginBottom:20}}>
        <button onClick={() => { if (selMonth === 0) { setSelMonth(11); setSelYear(selYear - 1); } else setSelMonth(selMonth - 1); }}
          style={{width:36,height:36,borderRadius:10,border:'1px solid var(--border)',background:'var(--bg)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <span className="material-symbols-outlined" style={{fontSize:18}}>chevron_left</span>
        </button>
        <span style={{fontSize:'1.1rem',fontWeight:800,minWidth:180,textAlign:'center'}}>{MONTHS[selMonth]} {selYear}</span>
        <button onClick={() => { if (selMonth === 11) { setSelMonth(0); setSelYear(selYear + 1); } else setSelMonth(selMonth + 1); }}
          style={{width:36,height:36,borderRadius:10,border:'1px solid var(--border)',background:'var(--bg)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <span className="material-symbols-outlined" style={{fontSize:18}}>chevron_right</span>
        </button>
      </div>

      {/* Actions */}
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        <button onClick={autoGenerate} style={{display:'flex',alignItems:'center',gap:6,padding:'10px 20px',borderRadius:12,border:'none',background:'linear-gradient(135deg,#0ea5e9,#38bdf8)',color:'#fff',fontWeight:700,fontSize:'0.85rem',cursor:'pointer',fontFamily:'inherit',boxShadow:'0 4px 12px rgba(14,165,233,0.25)'}}>
          <span className="material-symbols-outlined" style={{fontSize:18}}>auto_fix_high</span>Gerar VT Automático
        </button>
        <div style={{flex:1}} />
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 16px',borderRadius:12,background:'rgba(14,165,233,0.06)',border:'1px solid rgba(14,165,233,0.15)'}}>
          <span className="material-symbols-outlined" style={{fontSize:18,color:'#0ea5e9'}}>account_balance_wallet</span>
          <span style={{fontSize:'0.82rem',fontWeight:700,color:'var(--text-muted)'}}>Total VT:</span>
          <span style={{fontSize:'1rem',fontWeight:900,color:'#0ea5e9'}}>{formatBRL(totalVT)}</span>
        </div>
      </div>

      {/* Table */}
      <div style={{...cardS, padding:0, overflow:'hidden'}}>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.82rem'}}>
            <thead>
              <tr style={{background:'var(--bg)'}}>
                {['Nome','Unidade','Sal. Base','Dias Úteis','Desc. Dias','Valor/Dia','Total VT','Ações'].map(h => (
                  <th key={h} style={{padding:'12px 14px',textAlign:'left',fontWeight:700,color:'var(--text-muted)',whiteSpace:'nowrap',borderBottom:'2px solid var(--border)',fontSize:'0.72rem',textTransform:'uppercase',letterSpacing:'0.5px'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{padding:40,textAlign:'center',color:'var(--text-muted)'}}>
                  <span className="material-symbols-outlined" style={{fontSize:40,display:'block',marginBottom:8,opacity:0.3}}>commute</span>
                  Nenhum colaborador CLT ativo na unidade selecionada.
                </td></tr>
              ) : filtered.map(emp => {
                const entry = getEntry(emp.id);
                const isEditing = editingId === emp.id;
                const dias = entry?.diasUteis || 22;
                const desc = entry?.diasDescontados || 0;
                const valorDia = entry?.valorDiario || (emp.salarioBase * settings.percentualVT / 22);
                const diasEfetivos = Math.max(0, dias - desc);
                const total = valorDia * diasEfetivos;

                return (
                  <tr key={emp.id} style={{borderBottom:'1px solid var(--border)',transition:'background 0.15s'}}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(14,165,233,0.02)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <td style={{padding:'10px 14px',fontWeight:700}}>{emp.nome}</td>
                    <td style={{padding:'10px 14px'}}>
                      <span style={{padding:'2px 8px',borderRadius:6,background:'rgba(99,102,241,0.06)',color:'#6366f1',fontSize:'0.72rem',fontWeight:600}}>{emp.unidade}</span>
                    </td>
                    <td style={{padding:'10px 14px',fontWeight:600}}>{formatBRL(emp.salarioBase)}</td>
                    {isEditing ? (<>
                      <td style={{padding:'6px 8px'}}>
                        <input type="number" value={editDias} onChange={e => setEditDias(e.target.value)} min={0} max={31}
                          style={{width:60,padding:'6px 8px',borderRadius:8,border:'1px solid var(--border)',background:'var(--card-bg)',fontSize:'0.82rem',fontFamily:'inherit',fontWeight:600,textAlign:'center'}} />
                      </td>
                      <td style={{padding:'6px 8px'}}>
                        <input type="number" value={editDesc} onChange={e => setEditDesc(e.target.value)} min={0} max={31}
                          style={{width:60,padding:'6px 8px',borderRadius:8,border:'1px solid var(--border)',background:'var(--card-bg)',fontSize:'0.82rem',fontFamily:'inherit',fontWeight:600,textAlign:'center'}} />
                      </td>
                      <td style={{padding:'6px 8px'}}>
                        <input value={editValor} onChange={e => setEditValor(formatCurrency(e.target.value))} placeholder={valorDia.toFixed(2).replace('.',',')}
                          inputMode="numeric"
                          style={{width:90,padding:'6px 8px',borderRadius:8,border:'1px solid var(--border)',background:'var(--card-bg)',fontSize:'0.82rem',fontFamily:'inherit',fontWeight:600}} />
                      </td>
                      <td style={{padding:'10px 14px',fontWeight:800,color:'#0ea5e9'}}>—</td>
                      <td style={{padding:'6px 8px'}}>
                        <div style={{display:'flex',gap:4}}>
                          <button onClick={() => handleSave(emp)} style={{width:28,height:28,borderRadius:6,border:'none',background:'rgba(16,185,129,0.1)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                            <span className="material-symbols-outlined" style={{fontSize:16,color:'#10b981'}}>check</span>
                          </button>
                          <button onClick={() => setEditingId(null)} style={{width:28,height:28,borderRadius:6,border:'none',background:'rgba(239,68,68,0.1)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                            <span className="material-symbols-outlined" style={{fontSize:16,color:'#ef4444'}}>close</span>
                          </button>
                        </div>
                      </td>
                    </>) : (<>
                      <td style={{padding:'10px 14px',fontWeight:600}}>{dias}</td>
                      <td style={{padding:'10px 14px',fontWeight:600,color:desc > 0 ? '#ef4444' : 'var(--text-muted)'}}>
                        {desc > 0 ? `-${desc}` : '0'}
                      </td>
                      <td style={{padding:'10px 14px',fontWeight:600}}>{formatBRL(valorDia)}</td>
                      <td style={{padding:'10px 14px',fontWeight:800,color:'#0ea5e9'}}>{formatBRL(total)}</td>
                      <td style={{padding:'6px 8px'}}>
                        <button onClick={() => { setEditingId(emp.id); setEditDias(dias.toString()); setEditDesc(desc.toString()); setEditValor(''); }}
                          style={{width:28,height:28,borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                          <span className="material-symbols-outlined" style={{fontSize:14,color:'#f59e0b'}}>edit</span>
                        </button>
                      </td>
                    </>)}
                  </tr>
                );
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr style={{background:'rgba(14,165,233,0.04)',borderTop:'2px solid var(--border)'}}>
                  <td colSpan={6} style={{padding:'12px 14px',fontWeight:900,fontSize:'0.88rem',textAlign:'right'}}>TOTAL VT</td>
                  <td style={{padding:'12px 14px',fontWeight:900,fontSize:'1rem',color:'#0ea5e9'}}>{formatBRL(totalVT)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
