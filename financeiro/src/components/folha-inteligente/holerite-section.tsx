'use client';
import { useState, useMemo } from 'react';
import { calcularLiquido, formatBRL, DEFAULT_SETTINGS } from '@/lib/payroll-calc';
import type { SmartEmployee, PayrollSettings, LiquidoResult } from '@/lib/payroll-calc';
import { formatCurrency } from '@/hooks/useDashboard';

const cardS: React.CSSProperties = { background:'var(--card-bg)',backdropFilter:'blur(20px)',borderRadius:20,border:'1px solid var(--border)',boxShadow:'var(--shadow-sm)',padding:'14px 14px' };

interface Props {
  employees: SmartEmployee[];
  settings: PayrollSettings;
  selectedUnit: string;
}

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

export function HoleriteSection({ employees, settings, selectedUnit }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);
  const [premiacoes, setPremiacoes] = useState<Record<string, number>>(() => loadMap(STORAGE_KEY_PREMIACOES));
  const [vrOverrides, setVrOverrides] = useState<Record<string, number>>(() => loadMap(STORAGE_KEY_VR_OVERRIDES));
  const [adiantamentos, setAdiantamentos] = useState<Record<string, boolean>>(() => loadBoolMap(STORAGE_KEY_ADIANT));
  const [premInput, setPremInput] = useState<Record<string, string>>({});
  const [vrInput, setVrInput] = useState<Record<string, string>>({});

  const savePrem = (map: Record<string, number>) => { setPremiacoes(map); localStorage.setItem(STORAGE_KEY_PREMIACOES, JSON.stringify(map)); };
  const saveVr = (map: Record<string, number>) => { setVrOverrides(map); localStorage.setItem(STORAGE_KEY_VR_OVERRIDES, JSON.stringify(map)); };
  const saveAdiant = (map: Record<string, boolean>) => { setAdiantamentos(map); localStorage.setItem(STORAGE_KEY_ADIANT, JSON.stringify(map)); };

  // Filter by unit and sort alphabetically
  const filtered = useMemo(() =>
    employees
      .filter(e => e.status === 'ativo' && (selectedUnit === 'all' || e.unidade === selectedUnit))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [employees, selectedUnit]
  );

  // Calculate all liquido results
  const results = useMemo(() => {
    const map = new Map<string, LiquidoResult>();
    filtered.forEach(emp => {
      const prem = premiacoes[emp.id] || 0;
      const vrOvr = emp.tipo === 'PJ' && vrOverrides[emp.id] !== undefined ? vrOverrides[emp.id] : undefined;
      const temAdiant = !!adiantamentos[emp.id];
      map.set(emp.id, calcularLiquido(emp, settings, prem, vrOvr, temAdiant));
    });
    return map;
  }, [filtered, settings, premiacoes, vrOverrides, adiantamentos]);

  const totalLiquido = filtered.reduce((s, e) => s + (results.get(e.id)?.liquido || 0), 0);
  const totalBruto = filtered.reduce((s, e) => s + (results.get(e.id)?.bruto || 0), 0);
  const totalDescontos = filtered.reduce((s, e) => s + (results.get(e.id)?.totalDescontos || 0), 0);
  const totalPrem = filtered.reduce((s, e) => s + (results.get(e.id)?.premiacao || 0), 0);
  const totalAdiant = filtered.reduce((s, e) => s + (results.get(e.id)?.adiantamento || 0), 0);

  const handleSetPrem = (empId: string) => {
    const raw = premInput[empId] || '';
    const digits = raw.replace(/[^\d]/g, '');
    const val = parseInt(digits, 10) / 100 || 0;
    savePrem({ ...premiacoes, [empId]: val });
    setPremInput({ ...premInput, [empId]: '' });
  };

  const handleSetVr = (empId: string) => {
    const raw = vrInput[empId] || '';
    const digits = raw.replace(/[^\d]/g, '');
    const val = parseInt(digits, 10) / 100 || 0;
    saveVr({ ...vrOverrides, [empId]: val });
    setVrInput({ ...vrInput, [empId]: '' });
  };

  return (
    <div style={{...cardS, marginBottom: 16}}>
      {/* Header */}
      <div onClick={() => setCollapsed(!collapsed)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',userSelect:'none',gap:8}}>
        <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0,flex:1}}>
          <div style={{ width:38, height:38, borderRadius:12, background:'linear-gradient(135deg,#10b981,#34d399)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 3px 10px rgba(16,185,129,0.3)', flexShrink:0 }}>
            <span className="material-symbols-outlined" style={{fontSize:18,color:'#fff'}}>receipt_long</span>
          </div>
          <div style={{minWidth:0}}>
            <h2 style={{margin:0,fontSize:'0.95rem',fontWeight:800,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>Holerite — Cálculo Líquido</h2>
            <p style={{margin:0,fontSize:'0.68rem',color:'var(--text-muted)',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {collapsed ? 'Clique para expandir' : `${filtered.length} colaboradores • Descontos legais + Premiação`}
            </p>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
          {totalLiquido > 0 && <span style={{fontSize:'0.72rem',fontWeight:800,padding:'3px 10px',borderRadius:7,background:'rgba(16,185,129,0.08)',color:'#10b981',whiteSpace:'nowrap'}}>{formatBRL(totalLiquido)}</span>}
          <span className="material-symbols-outlined" style={{fontSize:20,color:'var(--text-muted)',transition:'transform 0.3s',transform:collapsed?'rotate(0deg)':'rotate(180deg)'}}>expand_more</span>
        </div>
      </div>

      {/* Content */}
      <div style={{maxHeight:collapsed?0:100000,opacity:collapsed?0:1,overflow:'hidden',transition:'max-height 0.4s ease, opacity 0.3s ease, margin 0.3s ease',marginTop:collapsed?0:20}}>
        {/* Summary KPIs — auto-fit, 2~3 colunas em mobile */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(110px, 1fr))',gap:8,marginBottom:14}}>
          {[
            {label:'Total Bruto',value:formatBRL(totalBruto),color:'#6366f1',icon:'payments'},
            {label:'Descontos',value:formatBRL(totalDescontos),color:'#ef4444',icon:'remove_circle'},
            {label:'Premiações',value:formatBRL(totalPrem),color:'#f59e0b',icon:'emoji_events'},
            {label:'Adiantamentos',value:formatBRL(totalAdiant),color:'#f97316',icon:'speed'},
            {label:'Total Líquido',value:formatBRL(totalLiquido),color:'#10b981',icon:'account_balance_wallet'},
          ].map((kpi,i) => (
            <div key={i} style={{padding:'10px 10px 8px',borderRadius:12,background:'var(--bg)',border:'1px solid var(--border)',position:'relative',overflow:'hidden'}}>
              <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${kpi.color},${kpi.color}66)`}} />
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:2}}>
                <span style={{fontSize:'0.57rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase' as const,letterSpacing:'0.3px',lineHeight:1.3}}>{kpi.label}</span>
                <span className="material-symbols-outlined" style={{fontSize:14,color:kpi.color,flexShrink:0,marginLeft:2}}>{kpi.icon}</span>
              </div>
              <div style={{fontSize:'0.88rem',fontWeight:900,color:kpi.color,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{kpi.value}</div>
            </div>
          ))}
        </div>

        {/* Employee Cards */}
        {filtered.length === 0 ? (
          <div style={{textAlign:'center',padding:40,color:'var(--text-muted)'}}>
            <span className="material-symbols-outlined" style={{fontSize:40,display:'block',marginBottom:8,opacity:0.3}}>group</span>
            <p style={{fontSize:'0.85rem',fontWeight:600}}>Nenhum colaborador ativo na unidade selecionada.</p>
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {filtered.map((emp, idx) => {
              const r = results.get(emp.id)!;
              const isExpanded = expandedEmp === emp.id;
              const hasPrem = (premiacoes[emp.id] || 0) > 0;
              const hasAdiant = !!adiantamentos[emp.id];
              const adiantValor = hasAdiant ? emp.salarioBase * 0.40 : 0;

              return (
                <div key={emp.id} style={{
                  borderRadius:14,border:'1px solid var(--border)',background:'var(--bg)',overflow:'hidden',
                  transition:'all 0.2s',
                }}>
                  {/* Employee row — always visible */}
                  <div
                    onClick={() => setExpandedEmp(isExpanded ? null : emp.id)}
                    style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 12px',cursor:'pointer',userSelect:'none',gap:8}}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(16,185,129,0.02)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                  >
                    <div style={{display:'flex',alignItems:'center',gap:8,minWidth:0,flex:1}}>
                      <div style={{
                        width:32,height:32,borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,
                        background: emp.tipo === 'CLT' ? 'rgba(99,102,241,0.08)' : 'rgba(245,158,11,0.08)',
                      }}>
                        <span className="material-symbols-outlined" style={{fontSize:16,color:emp.tipo==='CLT'?'#6366f1':'#f59e0b'}}>
                          {emp.tipo === 'CLT' ? 'badge' : 'description'}
                        </span>
                      </div>
                      <div style={{minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:'0.85rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{emp.nome}</div>
                        <div style={{display:'flex',gap:4,marginTop:2,flexWrap:'wrap'}}>
                          <span style={{padding:'1px 6px',borderRadius:5,fontSize:'0.6rem',fontWeight:700,flexShrink:0,
                            background: emp.tipo === 'CLT' ? 'rgba(99,102,241,0.08)' : 'rgba(245,158,11,0.08)',
                            color: emp.tipo === 'CLT' ? '#6366f1' : '#f59e0b',
                          }}>{emp.tipo}</span>
                          <span style={{padding:'1px 6px',borderRadius:5,fontSize:'0.6rem',fontWeight:600,flexShrink:0,
                            background:'rgba(99,102,241,0.04)',color:'var(--text-muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:80,
                          }}>{emp.cargo}</span>
                          {hasPrem && <span style={{padding:'1px 6px',borderRadius:5,fontSize:'0.6rem',fontWeight:700,flexShrink:0,
                            background:'rgba(245,158,11,0.08)',color:'#f59e0b',
                          }}>🏆{formatBRL(premiacoes[emp.id])}</span>}
                          {hasAdiant && <span style={{padding:'1px 6px',borderRadius:5,fontSize:'0.6rem',fontWeight:700,flexShrink:0,
                            background:'rgba(249,115,22,0.08)',color:'#f97316',
                          }}>Adiant.</span>}
                        </div>
                      </div>
                    </div>

                    <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                      {emp.tipo === 'CLT' && r.totalDescontos > 0 && (
                        <span style={{fontSize:'0.68rem',fontWeight:700,color:'#ef4444',whiteSpace:'nowrap'}}>
                          -{formatBRL(r.totalDescontos)}
                        </span>
                      )}
                      <div style={{textAlign:'right'}}>
                        <div style={{fontSize:'0.95rem',fontWeight:900,color:'#10b981',whiteSpace:'nowrap'}}>{formatBRL(r.liquido)}</div>
                        <div style={{fontSize:'0.58rem',color:'var(--text-muted)',fontWeight:600}}>líquido</div>
                      </div>
                      <span className="material-symbols-outlined" style={{fontSize:18,color:'var(--text-muted)',transition:'transform 0.3s',transform:isExpanded?'rotate(180deg)':'rotate(0deg)'}}>expand_more</span>
                    </div>
                  </div>

                  {/* Expanded details */}
                  <div style={{maxHeight:isExpanded?600:0,opacity:isExpanded?1:0,overflow:'hidden',transition:'max-height 0.3s ease, opacity 0.25s ease'}}>
                    <div style={{padding:'0 12px 14px',borderTop:'1px solid var(--border)'}}>
                      {/* Expanded: single column on mobile, 2 cols on wider screens */}
                      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))',gap:14,marginTop:12}}>
                        {/* Left Column — Breakdown */}
                        <div>
                          <h4 style={{margin:'0 0 8px',fontSize:'0.78rem',fontWeight:800,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.5px',display:'flex',alignItems:'center',gap:4}}>
                            <span className="material-symbols-outlined" style={{fontSize:14}}>receipt</span>
                            {emp.tipo === 'CLT' ? 'Demonstrativo CLT' : 'Demonstrativo PJ'}
                          </h4>
                          <div style={{display:'flex',flexDirection:'column',gap:4}}>
                            {/* Proventos */}
                            <div style={{padding:'6px 10px',borderRadius:8,background:'rgba(16,185,129,0.04)',display:'flex',justifyContent:'space-between'}}>
                              <span style={{fontSize:'0.78rem',fontWeight:700,color:'#10b981'}}>Salário {emp.tipo === 'CLT' ? 'Base' : 'Contratado'}</span>
                              <span style={{fontSize:'0.78rem',fontWeight:800,color:'#10b981'}}>{formatBRL(emp.salarioBase)}</span>
                            </div>
                            {emp.tipo === 'CLT' && emp.insalubridade && (
                              <div style={{padding:'6px 10px',borderRadius:8,display:'flex',justifyContent:'space-between'}}>
                                <span style={{fontSize:'0.78rem',fontWeight:600,color:'var(--text-main)'}}>Insalubridade (20%)</span>
                                <span style={{fontSize:'0.78rem',fontWeight:700,color:'#10b981'}}>+{formatBRL(settings.salarioMinimo * 0.20)}</span>
                              </div>
                            )}
                            {emp.tipo === 'CLT' && emp.rt && (
                              <div style={{padding:'6px 10px',borderRadius:8,display:'flex',justifyContent:'space-between'}}>
                                <span style={{fontSize:'0.78rem',fontWeight:600,color:'var(--text-main)'}}>RT</span>
                                <span style={{fontSize:'0.78rem',fontWeight:700,color:'#10b981'}}>+{formatBRL(settings.valorRT)}</span>
                              </div>
                            )}
                            {r.bruto !== emp.salarioBase && (
                              <div style={{padding:'6px 10px',borderRadius:8,background:'rgba(99,102,241,0.04)',display:'flex',justifyContent:'space-between',borderTop:'1px dashed var(--border)'}}>
                                <span style={{fontSize:'0.78rem',fontWeight:800,color:'#6366f1'}}>Bruto</span>
                                <span style={{fontSize:'0.78rem',fontWeight:900,color:'#6366f1'}}>{formatBRL(r.bruto)}</span>
                              </div>
                            )}

                            {/* Descontos CLT */}
                            {emp.tipo === 'CLT' && (<>
                              <div style={{height:1,background:'var(--border)',margin:'4px 0'}} />
                              <div style={{padding:'6px 10px',borderRadius:8,display:'flex',justifyContent:'space-between'}}>
                                <span style={{fontSize:'0.78rem',fontWeight:600,color:'var(--text-main)'}}>INSS ({r.inss > 0 ? ((r.inss/r.bruto)*100).toFixed(1) + '%' : '0%'})</span>
                                <span style={{fontSize:'0.78rem',fontWeight:700,color:'#ef4444'}}>-{formatBRL(r.inss)}</span>
                              </div>
                              <div style={{padding:'6px 10px',borderRadius:8,display:'flex',justifyContent:'space-between'}}>
                                <span style={{fontSize:'0.78rem',fontWeight:600,color:'var(--text-main)'}}>IRRF ({r.irrfAliquota > 0 ? r.irrfAliquota.toFixed(1) + '%' : 'Isento'})</span>
                                <span style={{fontSize:'0.78rem',fontWeight:700,color: r.irrf > 0 ? '#ef4444' : 'var(--text-muted)'}}>{r.irrf > 0 ? `-${formatBRL(r.irrf)}` : 'R$ 0,00'}</span>
                              </div>
                              <div style={{padding:'6px 10px',borderRadius:8,display:'flex',justifyContent:'space-between'}}>
                                <span style={{fontSize:'0.78rem',fontWeight:600,color:'var(--text-main)'}}>VT (6%)</span>
                                <span style={{fontSize:'0.78rem',fontWeight:700,color:'#ef4444'}}>-{formatBRL(r.vt)}</span>
                              </div>
                            </>)}

                            {/* Adiantamento */}
                            {r.adiantamento > 0 && (
                              <div style={{padding:'6px 10px',borderRadius:8,background:'rgba(249,115,22,0.04)',display:'flex',justifyContent:'space-between'}}>
                                <span style={{fontSize:'0.78rem',fontWeight:700,color:'#f97316',display:'flex',alignItems:'center',gap:4}}>
                                  <span className="material-symbols-outlined" style={{fontSize:14}}>speed</span>Adiantamento (40%)
                                </span>
                                <span style={{fontSize:'0.78rem',fontWeight:800,color:'#f97316'}}>-{formatBRL(r.adiantamento)}</span>
                              </div>
                            )}

                            {/* Total descontos */}
                            {r.totalDescontos > 0 && (
                              <div style={{padding:'6px 10px',borderRadius:8,background:'rgba(239,68,68,0.04)',display:'flex',justifyContent:'space-between',borderTop:'1px dashed var(--border)'}}>
                                <span style={{fontSize:'0.78rem',fontWeight:800,color:'#ef4444'}}>Total Descontos</span>
                                <span style={{fontSize:'0.78rem',fontWeight:900,color:'#ef4444'}}>-{formatBRL(r.totalDescontos)}</span>
                              </div>
                            )}

                            {/* VR */}
                            {r.vr > 0 && (
                              <>
                                <div style={{height:1,background:'var(--border)',margin:'4px 0'}} />
                                <div style={{padding:'6px 10px',borderRadius:8,display:'flex',justifyContent:'space-between'}}>
                                  <span style={{fontSize:'0.78rem',fontWeight:600,color:'var(--text-main)'}}>VR (Vale Refeição)</span>
                                  <span style={{fontSize:'0.78rem',fontWeight:700,color:'#10b981'}}>+{formatBRL(r.vr)}</span>
                                </div>
                              </>
                            )}

                            {/* Premiação */}
                            {r.premiacao > 0 && (
                              <div style={{padding:'6px 10px',borderRadius:8,background:'rgba(245,158,11,0.04)',display:'flex',justifyContent:'space-between'}}>
                                <span style={{fontSize:'0.78rem',fontWeight:700,color:'#f59e0b',display:'flex',alignItems:'center',gap:4}}>
                                  <span className="material-symbols-outlined" style={{fontSize:14}}>emoji_events</span>Premiação
                                </span>
                                <span style={{fontSize:'0.78rem',fontWeight:800,color:'#f59e0b'}}>+{formatBRL(r.premiacao)}</span>
                              </div>
                            )}

                            {/* Líquido */}
                            <div style={{height:2,background:'linear-gradient(90deg,#10b981,#34d399)',margin:'4px 0',borderRadius:1}} />
                            <div style={{padding:'8px 10px',borderRadius:10,background:'rgba(16,185,129,0.06)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                              <span style={{fontSize:'0.85rem',fontWeight:900,color:'#10b981'}}>LÍQUIDO A RECEBER</span>
                              <span style={{fontSize:'1.1rem',fontWeight:900,color:'#10b981'}}>{formatBRL(r.liquido)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Right Column — Actions */}
                        <div>
                          {/* Premiação Input */}
                          <div style={{marginBottom:16}}>
                            <h4 style={{margin:'0 0 8px',fontSize:'0.78rem',fontWeight:800,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.5px',display:'flex',alignItems:'center',gap:4}}>
                              <span className="material-symbols-outlined" style={{fontSize:14,color:'#f59e0b'}}>emoji_events</span>Premiação
                            </h4>
                            <div style={{display:'flex',gap:6}}>
                              <input
                                value={premInput[emp.id] || ''}
                                onChange={e => setPremInput({...premInput, [emp.id]: formatCurrency(e.target.value)})}
                                placeholder={premiacoes[emp.id] ? formatBRL(premiacoes[emp.id]) : '0,00'}
                                inputMode="numeric"
                                style={{flex:1,padding:'8px 12px',borderRadius:10,border:'1px solid var(--border)',background:'var(--card-bg)',fontSize:'0.82rem',fontFamily:'inherit',fontWeight:600,color:'var(--text-main)',outline:'none'}}
                                onKeyDown={e => e.key === 'Enter' && handleSetPrem(emp.id)}
                              />
                              <button onClick={() => handleSetPrem(emp.id)} style={{padding:'8px 14px',borderRadius:10,border:'none',background:'linear-gradient(135deg,#f59e0b,#fbbf24)',color:'#fff',fontWeight:700,fontSize:'0.78rem',cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:4}}>
                                <span className="material-symbols-outlined" style={{fontSize:14}}>check</span>Salvar
                              </button>
                            </div>
                            {premiacoes[emp.id] > 0 && (
                              <button onClick={() => { const m = {...premiacoes}; delete m[emp.id]; savePrem(m); }} style={{marginTop:6,padding:'4px 10px',borderRadius:6,border:'1px solid rgba(239,68,68,0.2)',background:'rgba(239,68,68,0.04)',color:'#ef4444',fontSize:'0.7rem',fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
                                Remover Premiação
                              </button>
                            )}
                          </div>

                          {/* Adiantamento Toggle */}
                          <div style={{marginBottom:16}}>
                            <h4 style={{margin:'0 0 8px',fontSize:'0.78rem',fontWeight:800,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.5px',display:'flex',alignItems:'center',gap:4}}>
                              <span className="material-symbols-outlined" style={{fontSize:14,color:'#f97316'}}>speed</span>Adiantamento (40%)
                            </h4>
                            <div style={{display:'flex',alignItems:'center',gap:10}}>
                              <div
                                onClick={(e) => { e.stopPropagation(); saveAdiant({...adiantamentos, [emp.id]: !adiantamentos[emp.id]}); }}
                                style={{width:46,height:26,borderRadius:13,cursor:'pointer',transition:'all 0.3s',position:'relative',
                                  background: hasAdiant ? 'linear-gradient(135deg,#f97316,#fb923c)' : 'var(--border)',
                                  boxShadow: hasAdiant ? '0 2px 8px rgba(249,115,22,0.3)' : 'none',
                                }}
                              >
                                <div style={{width:20,height:20,borderRadius:10,background:'#fff',position:'absolute',top:3,transition:'all 0.3s',
                                  left: hasAdiant ? 23 : 3,
                                  boxShadow:'0 1px 3px rgba(0,0,0,0.2)',
                                }} />
                              </div>
                              <div>
                                <span style={{fontSize:'0.82rem',fontWeight:700,color: hasAdiant ? '#f97316' : 'var(--text-muted)'}}>
                                  {hasAdiant ? 'Ativado' : 'Desativado'}
                                </span>
                                {hasAdiant && (
                                  <div style={{fontSize:'0.7rem',fontWeight:600,color:'#f97316'}}>
                                    {formatBRL(emp.salarioBase * 0.40)} adiantado
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* VR Override for PJ */}
                          {emp.tipo === 'PJ' && (
                            <div>
                              <h4 style={{margin:'0 0 8px',fontSize:'0.78rem',fontWeight:800,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.5px',display:'flex',alignItems:'center',gap:4}}>
                                <span className="material-symbols-outlined" style={{fontSize:14,color:'#10b981'}}>restaurant</span>VR (Vale Refeição)
                              </h4>
                              <div style={{display:'flex',gap:6}}>
                                <input
                                  value={vrInput[emp.id] || ''}
                                  onChange={e => setVrInput({...vrInput, [emp.id]: formatCurrency(e.target.value)})}
                                  placeholder={vrOverrides[emp.id] !== undefined ? formatBRL(vrOverrides[emp.id]) : formatBRL(emp.vr)}
                                  inputMode="numeric"
                                  style={{flex:1,padding:'8px 12px',borderRadius:10,border:'1px solid var(--border)',background:'var(--card-bg)',fontSize:'0.82rem',fontFamily:'inherit',fontWeight:600,color:'var(--text-main)',outline:'none'}}
                                  onKeyDown={e => e.key === 'Enter' && handleSetVr(emp.id)}
                                />
                                <button onClick={() => handleSetVr(emp.id)} style={{padding:'8px 14px',borderRadius:10,border:'none',background:'linear-gradient(135deg,#10b981,#34d399)',color:'#fff',fontWeight:700,fontSize:'0.78rem',cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:4}}>
                                  <span className="material-symbols-outlined" style={{fontSize:14}}>check</span>Salvar
                                </button>
                              </div>
                              <p style={{margin:'4px 0 0',fontSize:'0.68rem',color:'var(--text-muted)',fontWeight:600}}>
                                Padrão: {formatBRL(emp.vr)} {vrOverrides[emp.id] !== undefined && `• Atual: ${formatBRL(vrOverrides[emp.id])}`}
                              </p>
                              {vrOverrides[emp.id] !== undefined && (
                                <button onClick={() => { const m = {...vrOverrides}; delete m[emp.id]; saveVr(m); }} style={{marginTop:4,padding:'4px 10px',borderRadius:6,border:'1px solid rgba(99,102,241,0.2)',background:'rgba(99,102,241,0.04)',color:'#6366f1',fontSize:'0.7rem',fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
                                  Restaurar VR Padrão
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
