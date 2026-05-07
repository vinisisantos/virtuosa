'use client';
import { useState, useEffect } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { useCancelamento, fmt, parseCurrency, cardStyle } from '@/hooks/useCancelamento';

export default function CancelamentoPage() {
  const c = useCancelamento();
  const [showHistory, setShowHistory] = useState(false);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [historyUnitFilter, setHistoryUnitFilter] = useState('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<any>(null);

  useEffect(() => {
    if (showHistory) {
      setIsLoadingHistory(true);
      const url = historyUnitFilter ? `/api/cancelamentos?unit=${historyUnitFilter}` : '/api/cancelamentos';
      fetch(url)
        .then(res => res.json())
        .then(data => { setHistoryData(Array.isArray(data) ? data : []); setIsLoadingHistory(false); })
        .catch(() => { setHistoryData([]); setIsLoadingHistory(false); });
    }
  }, [showHistory, historyUnitFilter]);

  return (
    <AuthGuard requiredPermission="cancelamento">
      <div className="app-container" style={{ width: '100%', maxWidth: 1400, margin: '0 auto', minHeight: '100vh', paddingBottom: 60 }}>
        <AppHeader activePage="cancelamentos" />
        <main className="main-content" style={{ padding: '0 20px' }}>
          {/* Hero */}
          <section style={{ background: 'transparent', margin: '40px 0', textAlign: 'center' }}>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-1px', marginBottom: 8 }}>Calculadora de <span style={{ color: 'var(--primary)' }}>Cancelamento</span></h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '1rem', maxWidth: 600, margin: '0 auto 24px' }}>Simule o valor consumido, multa contratual e o valor a devolver em segundos com total transparência para suas clientes.</p>
            <div data-tour="canc-acoes" style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={() => setShowHistory(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12, border: '1px solid var(--primary)', color: 'var(--primary)', background: 'rgba(99,102,241,0.05)', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', fontFamily: 'inherit' }}><span className="material-symbols-outlined">history</span> Ver Histórico</button>
              <button onClick={() => c.resultRef.current?.scrollIntoView({ behavior: 'smooth' })} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card-bg)', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', fontFamily: 'inherit' }}><span className="material-symbols-outlined">analytics</span> Ver Resumo</button>
              <button onClick={() => c.setShowClearModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12, border: '1px solid #ef4444', color: '#ef4444', background: 'var(--card-bg)', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', fontFamily: 'inherit' }}><span className="material-symbols-outlined">delete_sweep</span> Limpar Tudo</button>
            </div>
          </section>

          {/* Client Name */}
          <section style={{ paddingBottom: 0, marginBottom: 24 }}>
            <div style={{ ...cardStyle, padding: 20 }}>
              <div>
                <div style={{ marginBottom: 10, fontWeight: 700, color: 'var(--text-main)', fontSize: '0.9rem' }}><span className="material-symbols-outlined" style={{ verticalAlign: 'middle', color: 'var(--primary)', fontSize: '1.2rem', marginRight: 5 }}>person</span> Nome da Cliente</div>
                <input type="text" value={c.clientName} onChange={e => c.setClientName(e.target.value)} placeholder="Digite o nome completo da cliente..." style={{ width: '100%', height: 48, fontSize: '1.1rem', padding: '0 12px', borderRadius: 12, border: '1px solid var(--border)', outline: 'none', background: 'var(--bg)', color: 'var(--text-main)', boxSizing: 'border-box' }} />
              </div>
            </div>
          </section>

          {/* Procedures Table */}
          <section data-tour="canc-procedimentos" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}><span className="material-symbols-outlined" style={{ color: 'var(--primary)' }}>list_alt</span> Procedimentos</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ background: 'rgba(99,102,241,0.08)', color: 'var(--primary)', padding: '4px 14px', borderRadius: 20, fontSize: '0.82rem', fontWeight: 700 }}>{c.procedures.length} {c.procedures.length === 1 ? 'item adicionado' : 'itens adicionados'}</span>
                <button onClick={c.addProcedure} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: '0.85rem', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 12px rgba(230,0,126,0.2)' }}><span className="material-symbols-outlined" style={{ fontSize: '1.2rem' }}>add_circle</span> Adicionar Novo</button>
              </div>
            </div>
            <div style={{ ...cardStyle, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: 'rgba(99,102,241,0.04)' }}>
                  {['Procedimento', 'Sessões (D/T)', 'Subtotal', 'Desconto', 'Cortesia', 'Ações'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: h === 'Sessões (D/T)' || h === 'Cortesia' || h === 'Ações' ? 'center' : 'left', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>{c.procedures.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', opacity: p.isCortesia ? 0.6 : 1 }}>
                    <td style={{ padding: '12px 16px' }}><input type="text" value={p.name} onChange={e => c.updateProcedure(p.id, 'name', e.target.value)} placeholder="Nome..." style={{ width: '100%', padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', outline: 'none', fontSize: '0.9rem', background: 'transparent', boxSizing: 'border-box' }} /></td>
                    <td style={{ padding: '12px 16px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}><input type="number" value={p.doneSessions} onChange={e => c.updateProcedure(p.id, 'doneSessions', parseInt(e.target.value) || 0)} min={0} style={{ width: 52, padding: 8, borderRadius: 8, border: '1px solid var(--border)', textAlign: 'center', outline: 'none', fontSize: '0.9rem', background: 'transparent' }} /><span style={{ color: 'var(--text-muted)' }}>/</span><input type="number" value={p.totalSessions} onChange={e => c.updateProcedure(p.id, 'totalSessions', parseInt(e.target.value) || 1)} min={1} style={{ width: 52, padding: 8, borderRadius: 8, border: '1px solid var(--border)', textAlign: 'center', outline: 'none', fontSize: '0.9rem', background: 'transparent' }} /></div></td>
                    <td style={{ padding: '12px 16px' }}><input type="text" value={fmt(p.subtotal).replace('R$\u00A0', '')} onChange={e => c.updateProcedure(p.id, 'subtotal', parseCurrency(e.target.value))} style={{ width: 100, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', outline: 'none', fontSize: '0.9rem', background: 'transparent' }} /></td>
                    <td style={{ padding: '12px 16px' }}><input type="text" value={fmt(p.discount).replace('R$\u00A0', '')} onChange={e => c.updateProcedure(p.id, 'discount', parseCurrency(e.target.value))} style={{ width: 100, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', outline: 'none', fontSize: '0.9rem', background: 'transparent' }} /></td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}><input type="checkbox" checked={p.isCortesia} onChange={e => c.updateProcedure(p.id, 'isCortesia', e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--primary)', cursor: 'pointer' }} /></td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}><button onClick={() => c.removeProcedure(p.id)} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}><span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ef4444' }}>delete</span></button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>

          {/* Scenario Toggle */}
          <div data-tour="canc-cenarios" style={{ display: 'flex', justifyContent: 'center', margin: '24px 0' }}>
            <div style={{ display: 'flex', background: 'var(--card-bg)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {(['sem-multa', 'com-multa'] as const).map(s => (
                <button key={s} onClick={() => c.setScenario(s)} style={{ padding: '12px 28px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', border: 'none', background: c.scenario === s ? 'linear-gradient(135deg, var(--primary), #ff4db1)' : 'transparent', color: c.scenario === s ? '#fff' : 'var(--text-muted)', transition: 'all 0.3s ease', fontFamily: 'inherit' }}>{s === 'sem-multa' ? 'Sem Multa' : 'Com Multa'}</button>
              ))}
            </div>
          </div>

          {/* Result Card */}
          <div data-tour="canc-resultado" ref={c.resultRef} style={{ ...cardStyle, padding: '28px 32px', marginBottom: 24 }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: 800 }}>Resumo: Cenário {c.scenario === 'sem-multa' ? 'Sem Multa' : 'Com Multa'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem' }}><span style={{ color: 'var(--text-muted)' }}>Total Pago</span><span style={{ fontWeight: 700 }}>{fmt(c.displayTotalPago)}</span></div>
              {c.scenario === 'com-multa' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', padding: '8px 14px', background: 'rgba(99,102,241,0.05)', borderRadius: 10, border: '1px dashed var(--border)' }}><span style={{ color: 'var(--text-muted)' }}>Valor sem desconto</span><span style={{ fontWeight: 600, color: '#888' }}>{fmt(c.valorSemDesconto)}</span></div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem' }}><span style={{ color: 'var(--text-muted)' }}>Total Consumido</span><span style={{ fontWeight: 700, color: '#e91e63' }}>{fmt(c.totalConsumidoGlobal)}</span></div>
              {c.scenario === 'com-multa' ? (
                <>
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem' }}><span style={{ color: '#f59e0b', fontWeight: 600 }}>⚠️ Multa (10%)</span><span style={{ fontWeight: 700, color: '#f59e0b' }}>{fmt(c.multaTotal)}</span></div>
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.15rem' }}><span style={{ fontWeight: 800 }}>Valor a Devolver <strong>(com multa)</strong></span><span style={{ fontWeight: 900, color: '#e91e63', fontSize: '1.4rem' }}>{fmt(c.totalDevolverFinal)}</span></div>
                </>
              ) : (
                <>
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.15rem' }}><span style={{ fontWeight: 800 }}>Total a Devolver</span><span style={{ fontWeight: 900, color: '#e91e63', fontSize: '1.4rem' }}>{fmt(c.totalDevolverFinal)}</span></div>
                </>
              )}
              {c.totalAPagarEmpresaGlobal > 0 && (
                <>
                  <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
                  <div style={{ padding: '14px 18px', background: 'rgba(239,68,68,0.08)', border: '1.5px solid rgba(239,68,68,0.25)', borderRadius: 12, marginTop: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1.1rem' }}>
                      <span style={{ fontWeight: 800, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>warning</span>
                        Valor a Ressarcir à Empresa
                      </span>
                      <span style={{ fontWeight: 900, color: '#dc2626', fontSize: '1.4rem' }}>{fmt(c.totalAPagarEmpresaGlobal)}</span>
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: '#b91c1c', fontStyle: 'italic' }}>O cliente consumiu sessões acima do valor efetivamente pago. O valor acima deve ser ressarcido à empresa.</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Detail Breakdown */}
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.1rem', fontWeight: 800, marginBottom: 16 }}><span className="material-symbols-outlined" style={{ color: 'var(--primary)' }}>receipt_long</span> Detalhamento por Item</h2>
            <div style={{ ...cardStyle, padding: 24 }}>
              {c.scenario === 'com-multa' && c.multaTotal > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'rgba(245,158,11,0.08)', borderRadius: 12, marginBottom: 16, fontSize: '0.9rem', fontWeight: 600, color: '#b45309' }}><span className="material-symbols-outlined" style={{ fontSize: 20 }}>warning</span><span>Multa 10% aplicada no total (global): <strong>{fmt(c.multaTotal)}</strong></span></div>
              )}
              {c.results.map((p, i) => {
                const pago = p.isCortesia ? 0 : Math.max(0, p.subtotal - p.discount);
                const base = c.scenario === 'sem-multa' ? pago : p.subtotal;
                const vSessao = base / (p.totalSessions || 1);
                const sessoesDone = Math.min(p.doneSessions, p.totalSessions);
                const cons = vSessao * sessoesDone;
                const saldoBruto = pago - cons;
                const saldo = p.isCortesia ? 0 : Math.max(0, saldoBruto);
                const itemAPagar = (!p.isCortesia && saldoBruto < 0) ? Math.abs(saldoBruto) : 0;
                const stepStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: '0.88rem' } as const;
                const labelStyle = { color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 } as const;
                const numStyle = { width: 20, height: 20, borderRadius: '50%', background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0 } as const;
                return (
                  <div key={p.id}>
                    <div style={{ padding: '20px 0' }}>
                      {/* Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{p.name || 'Procedimento'} {p.isCortesia ? '🌸' : ''}</h3>
                        <span style={{ padding: '4px 14px', borderRadius: 10, fontSize: '0.78rem', fontWeight: 700, background: p.isCortesia ? 'rgba(16,185,129,0.08)' : 'rgba(230,0,126,0.06)', color: p.isCortesia ? '#10b981' : '#e91e63' }}>{p.isCortesia ? 'CORTESIA' : `${sessoesDone}/${p.totalSessions} sessões`}</span>
                      </div>
                      {p.isCortesia ? (
                        <div style={{ padding: '12px 16px', background: 'rgba(16,185,129,0.05)', borderRadius: 10, fontSize: '0.88rem', color: '#10b981', fontWeight: 600 }}>Procedimento cortesia — sem impacto no cálculo de devolução.</div>
                      ) : (
                        <div style={{ background: 'var(--bg)', borderRadius: 12, padding: '12px 16px', border: '1px solid var(--border)' }}>
                          {/* Step 1: Subtotal */}
                          <div style={stepStyle}>
                            <span style={labelStyle}><span style={numStyle}>1</span> Subtotal do pacote</span>
                            <span style={{ fontWeight: 600 }}>{fmt(p.subtotal)}</span>
                          </div>
                          {/* Step 2: Desconto (if any) */}
                          {p.discount > 0 && (
                            <div style={stepStyle}>
                              <span style={labelStyle}><span style={numStyle}>2</span> Desconto aplicado</span>
                              <span style={{ fontWeight: 600, color: '#f59e0b' }}>− {fmt(p.discount)}</span>
                            </div>
                          )}
                          {/* Step 3: Valor Pago */}
                          <div style={stepStyle}>
                            <span style={labelStyle}><span style={numStyle}>{p.discount > 0 ? 3 : 2}</span> Valor efetivamente pago</span>
                            <span style={{ fontWeight: 700 }}>{fmt(pago)}</span>
                          </div>
                          {/* Separator */}
                          <div style={{ height: 1, background: 'var(--border)', margin: '8px 0', borderStyle: 'dashed' }} />
                          {/* Step 4: Base de cálculo */}
                          {c.scenario === 'com-multa' && p.discount > 0 && (
                            <div style={{ ...stepStyle, background: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: '8px 10px', margin: '4px 0' }}>
                              <span style={{ ...labelStyle, fontSize: '0.82rem' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#f59e0b' }}>info</span>
                                Base de cálculo: <strong>subtotal sem desconto</strong>
                              </span>
                              <span style={{ fontWeight: 600, color: '#f59e0b' }}>{fmt(p.subtotal)}</span>
                            </div>
                          )}
                          {/* Step 5: Valor por sessão */}
                          <div style={stepStyle}>
                            <span style={labelStyle}>
                              <span style={numStyle}>{p.discount > 0 ? 4 : 3}</span> 
                              Valor/sessão
                              <span style={{ fontSize: '0.75rem', color: '#aaa' }}>({fmt(base)} ÷ {p.totalSessions})</span>
                            </span>
                            <span style={{ fontWeight: 600 }}>{fmt(vSessao)}</span>
                          </div>
                          {/* Step 6: Valor consumido */}
                          <div style={stepStyle}>
                            <span style={labelStyle}>
                              <span style={numStyle}>{p.discount > 0 ? 5 : 4}</span> 
                              Valor consumido
                              <span style={{ fontSize: '0.75rem', color: '#aaa' }}>({fmt(vSessao)} × {sessoesDone} sessões)</span>
                            </span>
                            <span style={{ fontWeight: 600, color: '#e91e63' }}>{fmt(cons)}</span>
                          </div>
                          {/* Separator */}
                          <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
                          {/* Step 7: Saldo */}
                          {c.scenario === 'com-multa' ? (() => {
                            // multa proporcional deste item: 10% do subtotal deste item
                            const multaDoItem = 0.10 * p.subtotal;
                            const saldoLiquido = Math.max(0, saldo - multaDoItem);
                            return (
                              <>
                                {/* Saldo bruto */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', fontSize: '0.88rem' }}>
                                  <span style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    Saldo bruto
                                    <span style={{ fontSize: '0.75rem', color: '#aaa', fontWeight: 400 }}>({fmt(pago)} − {fmt(cons)})</span>
                                  </span>
                                  <span style={{ fontWeight: 700, color: saldoBruto >= 0 ? '#10b981' : '#dc2626' }}>{saldoBruto < 0 ? '− ' : ''}{fmt(Math.abs(saldoBruto))}</span>
                                </div>
                                {itemAPagar > 0 ? (
                                  <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.06)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.15)', marginTop: 4 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                                      <span style={{ fontWeight: 800, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>warning</span>
                                        Valor a ressarcir à empresa
                                      </span>
                                      <span style={{ fontWeight: 900, color: '#dc2626', fontSize: '1.1rem' }}>{fmt(itemAPagar)}</span>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    {/* Dedução multa */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: '0.88rem' }}>
                                      <span style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, color: '#f59e0b' }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>warning</span>
                                        Multa contratual (10%)
                                        <span style={{ fontSize: '0.75rem', color: '#aaa', fontWeight: 400 }}>(10% × {fmt(p.subtotal)})</span>
                                      </span>
                                      <span style={{ fontWeight: 700, color: '#f59e0b' }}>− {fmt(multaDoItem)}</span>
                                    </div>
                                    {/* Separador final */}
                                    <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                                    {/* Saldo líquido */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', fontSize: '0.95rem' }}>
                                      <span style={{ fontWeight: 800 }}>Saldo a devolver <span style={{ fontSize: '0.75rem', color: '#aaa', fontWeight: 400 }}>(com multa)</span></span>
                                      <span style={{ fontWeight: 900, color: saldoLiquido > 0 ? '#10b981' : '#e91e63', fontSize: '1.1rem' }}>{fmt(saldoLiquido)}</span>
                                    </div>
                                  </>
                                )}
                              </>
                            );
                          })() : itemAPagar > 0 ? (
                            <>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', fontSize: '0.88rem' }}>
                                <span style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                                  Saldo bruto
                                  <span style={{ fontSize: '0.75rem', color: '#aaa', fontWeight: 400 }}>({fmt(pago)} − {fmt(cons)})</span>
                                </span>
                                <span style={{ fontWeight: 700, color: '#dc2626' }}>− {fmt(itemAPagar)}</span>
                              </div>
                              <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.06)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.15)', marginTop: 4 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                                  <span style={{ fontWeight: 800, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>warning</span>
                                    Valor a ressarcir à empresa
                                  </span>
                                  <span style={{ fontWeight: 900, color: '#dc2626', fontSize: '1.1rem' }}>{fmt(itemAPagar)}</span>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', fontSize: '0.95rem' }}>
                              <span style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                                Saldo a devolver
                                <span style={{ fontSize: '0.75rem', color: '#aaa', fontWeight: 400 }}>({fmt(pago)} − {fmt(cons)})</span>
                              </span>
                              <span style={{ fontWeight: 900, color: '#10b981', fontSize: '1.1rem' }}>{fmt(saldo)}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {i < c.results.length - 1 && <div style={{ height: 1, background: 'var(--border)' }} />}
                  </div>
                );
              })}
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer style={{ padding: '20px 24px', borderTop: '1px solid var(--border)', textAlign: 'center', background: 'var(--card-bg)', backdropFilter: 'blur(16px)' }}>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>© 2024 Virtuosa Estética - Todos os direitos reservados.</p>
          <p style={{ margin: '4px 0 16px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Desenvolvido para uso exclusivo de unidades autorizadas.</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>A DEVOLVER ({c.scenario.toUpperCase().replace('-', ' ')}):</span>
              <span style={{ fontSize: '1.3rem', fontWeight: 900, color: '#e91e63' }}>{fmt(c.totalDevolverFinal)}</span>
              {c.totalAPagarEmpresaGlobal > 0 && (
                <>
                  <span style={{ color: 'var(--border)', margin: '0 4px' }}>|</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.03em' }}>RESSARCIR:</span>
                  <span style={{ fontSize: '1.3rem', fontWeight: 900, color: '#dc2626' }}>{fmt(c.totalAPagarEmpresaGlobal)}</span>
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={c.handleWhatsApp} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 12, border: 'none', background: '#25D366', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit' }}><span className="material-symbols-outlined">share</span> WhatsApp</button>
              <button onClick={c.handlePDF} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'inherit' }}><span className="material-symbols-outlined">picture_as_pdf</span> Gerar PDF</button>
            </div>
          </div>
        </footer>

        <div id="print-area" style={{ display: 'none' }} />

        {c.showLoading && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', color: '#fff' }}><span className="material-symbols-outlined" style={{ fontSize: 48, animation: 'spin 1s linear infinite' }}>sync</span><p style={{ marginTop: 12, fontWeight: 700, fontSize: '1.1rem' }}>Gerando PDF...</p></div>
          </div>
        )}

        {c.showClearModal && (
          <div onClick={() => c.setShowClearModal(false)} style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 32, maxWidth: 420, width: '90%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', border: '1px solid var(--border)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#e53935', marginBottom: 12, display: 'block' }}>warning</span>
              <h3 style={{ margin: '0 0 8px', fontSize: '1.3rem', color: '#c62828' }}>Limpar Todos os Dados?</h3>
              <p style={{ margin: '0 0 24px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Essa ação é <strong>irreversível</strong>.</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button onClick={() => c.setShowClearModal(false)} style={{ padding: '10px 24px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-muted)', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', fontFamily: 'inherit' }}>Cancelar</button>
                <button onClick={c.handleClearAll} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#e53935,#c62828)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', fontFamily: 'inherit' }}>🗑️ Confirmar</button>
              </div>
            </div>
          </div>
        )}

        {showHistory && (
          <div onClick={() => setShowHistory(false)} style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 16, padding: '32px 24px', maxWidth: 800, width: '90%', maxHeight: '80vh', overflowY: 'auto', border: '1px solid var(--border)', position: 'relative', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
              <button onClick={() => setShowHistory(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><span className="material-symbols-outlined">close</span></button>
              <h2 style={{ margin: '0 0 20px', fontSize: '1.4rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 10 }}><span className="material-symbols-outlined" style={{ color: 'var(--primary)' }}>history</span> Histórico de Cancelamentos</h2>
              <div style={{ marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center' }}>
                <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.9rem' }}>Filtrar Unidade:</span>
                <select value={historyUnitFilter} onChange={e => { setHistoryUnitFilter(e.target.value); }} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)', outline: 'none', background: 'var(--bg)', color: 'var(--text-main)', fontFamily: 'inherit', cursor: 'pointer' }}>
                  <option value="">Todas</option>
                  <option value="Barueri">Barueri</option>
                  <option value="SCS">SCS</option>
                  <option value="SBC">SBC</option>
                  <option value="Osasco">Osasco</option>
                </select>
              </div>
              {isLoadingHistory ? (
                <div style={{ textAlign: 'center', padding: 40 }}><span className="material-symbols-outlined" style={{ fontSize: 32, animation: 'spin 1s linear infinite', color: 'var(--primary)' }}>sync</span><p style={{ marginTop: 12 }}>Carregando histórico...</p></div>
              ) : historyData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Nenhum documento encontrado.</div>
              ) : (
                <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                    <thead style={{ background: 'rgba(99,102,241,0.04)' }}>
                      <tr>
                        {['Data', 'Cliente', 'Unidade', 'Cenário', 'Itens', 'A Devolver', 'Ações'].map(h => (
                          <th key={h} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {historyData.map((h: any) => (
                        <tr key={h.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.04)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')} onClick={() => setSelectedHistory(h)}>
                          <td style={{ padding: '12px 16px', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>{new Date(h.createdAt).toLocaleDateString('pt-BR')} {new Date(h.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
                          <td style={{ padding: '12px 16px', color: 'var(--text-main)', fontWeight: 600 }}>{h.clientName}</td>
                          <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{h.unit}</td>
                          <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{h.scenario}</td>
                          <td style={{ padding: '12px 16px', color: 'var(--text-muted)', textAlign: 'center' }}>{h.proceduresCount}</td>
                          <td style={{ padding: '12px 16px', color: '#e91e63', fontWeight: 800 }}>{fmt(h.totalDevolver)}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <button onClick={e => { e.stopPropagation(); setSelectedHistory(h); }} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--primary)', background: 'rgba(99,102,241,0.08)', color: 'var(--primary)', fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>visibility</span> Abrir
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Detail modal for a selected history record */}
        {selectedHistory && (
          <div onClick={() => setSelectedHistory(null)} style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 20, padding: '36px 32px', maxWidth: 560, width: '92%', border: '1px solid var(--border)', position: 'relative', boxShadow: '0 24px 64px rgba(0,0,0,0.35)' }}>
              <button onClick={() => setSelectedHistory(null)} style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><span className="material-symbols-outlined">close</span></button>

              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--primary)', display: 'block', marginBottom: 8 }}>description</span>
                <h3 style={{ margin: 0, fontSize: '1.3rem', color: 'var(--text-main)' }}>Detalhes do Cancelamento</h3>
                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {new Date(selectedHistory.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })} às {new Date(selectedHistory.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div style={{ background: 'rgba(99,102,241,0.06)', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Cliente</div>
                  <div style={{ fontSize: '1rem', color: 'var(--text-main)', fontWeight: 700 }}>{selectedHistory.clientName}</div>
                </div>
                <div style={{ background: 'rgba(99,102,241,0.06)', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Unidade</div>
                  <div style={{ fontSize: '1rem', color: 'var(--text-main)', fontWeight: 700 }}>{selectedHistory.unit}</div>
                </div>
                <div style={{ background: 'rgba(99,102,241,0.06)', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Cenário</div>
                  <div style={{ fontSize: '1rem', color: 'var(--text-main)', fontWeight: 700 }}>{selectedHistory.scenario}</div>
                </div>
                <div style={{ background: 'rgba(99,102,241,0.06)', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Procedimentos</div>
                  <div style={{ fontSize: '1rem', color: 'var(--text-main)', fontWeight: 700 }}>{selectedHistory.proceduresCount}</div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Total Pago</span>
                  <span style={{ color: 'var(--text-main)', fontWeight: 700, fontSize: '1rem' }}>{fmt(selectedHistory.totalPago)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Total Consumido</span>
                  <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: '1rem' }}>{fmt(selectedHistory.totalConsumido)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Multa</span>
                  <span style={{ color: '#ef4444', fontWeight: 700, fontSize: '1rem' }}>{fmt(selectedHistory.multa)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
                  <span style={{ color: 'var(--text-main)', fontSize: '1rem', fontWeight: 800 }}>Total a Devolver</span>
                  <span style={{ color: '#e91e63', fontWeight: 900, fontSize: '1.2rem' }}>{fmt(selectedHistory.totalDevolver)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
