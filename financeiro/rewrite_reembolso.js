const fs = require('fs');

const content = `"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';

/* ─── Types ─── */
interface ReembolsoItemData { id?: string; name: string; price: number; expenseDate?: string | null; description?: string | null; isReimbursed?: boolean; reimbursedAt?: string | null; reimbursedBy?: string | null }
interface Ticket {
  id: string; ticketNumber: number; requesterName: string; requesterId?: string | null;
  unit: string; status: string; totalAmount: number; reimbursedAmount: number;
  createdAt: string; items: ReembolsoItemData[]; attachments: any[];
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const CHART_COLORS = ['#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#14b8a6', '#f97316'];

const getCurrentUser = () => { try { const u = localStorage.getItem('virtuosa_user'); return u ? JSON.parse(u) : null; } catch { return null; } };

export function ReembolsoSection({ selectedUnit }: { selectedUnit?: string }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const user = getCurrentUser();
  const isAdmin = user?.role === 'ADMINISTRADOR' || user?.permissions?.admin === true;

  // New Item State
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemDate, setNewItemDate] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedUnit && selectedUnit !== 'Todas' && selectedUnit !== 'all') params.set('unit', selectedUnit);
      if (user?.id) params.set('userId', user.id);
      const res = await fetch(\`/api/reembolso?\${params}\`);
      if (res.ok) setTickets(await res.json());
    } catch {} finally { setLoading(false); }
  }, [selectedUnit, user?.id]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const activeTicket = useMemo(() => {
    // Find the current draft or pending ticket for this user
    return tickets.find(t => t.status === 'rascunho' || t.status === 'pendente') || null;
  }, [tickets]);

  const historicalTickets = useMemo(() => {
    return tickets.filter(t => t.status !== 'rascunho' && t.status !== 'pendente');
  }, [tickets]);

  const handleAddItem = async () => {
    if (!newItemName.trim() || !newItemPrice) return alert('Nome e valor são obrigatórios');
    setSaving(true);
    try {
      const val = parseFloat(newItemPrice.replace(/[^0-9,-]+/g, "").replace(",", ".")) || 0;
      let ticketId = activeTicket?.id;

      if (!ticketId) {
        // Create draft ticket first
        const res = await fetch('/api/reembolso', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requesterName: user?.name || 'Usuário',
            unit: selectedUnit || 'Barueri',
            status: 'rascunho',
            items: [], attachments: []
          })
        });
        if (res.ok) {
          const t = await res.json();
          ticketId = t.id;
          setTickets(prev => [t, ...prev]);
        } else {
          throw new Error('Falha ao criar ticket');
        }
      }

      // Add item
      const itemRes = await fetch('/api/reembolso/items', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId, name: newItemName, price: val,
          expenseDate: newItemDate || undefined, description: newItemDesc
        })
      });

      if (itemRes.ok) {
        const updatedTicket = await itemRes.json();
        setTickets(prev => prev.map(t => t.id === updatedTicket.id ? updatedTicket : t));
        setNewItemName(''); setNewItemPrice(''); setNewItemDate(''); setNewItemDesc('');
        setIsAdding(false);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!confirm('Excluir este item?')) return;
    try {
      const res = await fetch(\`/api/reembolso/items?id=\${itemId}\`, { method: 'DELETE' });
      if (res.ok) {
        const updatedTicket = await res.json();
        setTickets(prev => prev.map(t => t.id === updatedTicket.id ? updatedTicket : t));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCloseTicket = async () => {
    if (!activeTicket || activeTicket.items.length === 0) return alert('Adicione itens antes de fechar.');
    if (!confirm('Deseja fechar este ticket e enviar para aprovação? Não será mais possível adicionar itens nele.')) return;
    setSaving(true);
    try {
      const res = await fetch('/api/reembolso', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId: activeTicket.id, status: 'pendente' })
      });
      if (res.ok) {
        const updated = await res.json();
        setTickets(prev => prev.map(t => t.id === updated.id ? updated : t));
        alert('Ticket enviado para aprovação!');
      }
    } catch {} finally {
      setSaving(false);
    }
  };

  const activeTotal = activeTicket?.totalAmount || 0;
  const activeItems = activeTicket?.items || [];
  const pct = activeTotal > 0 ? 100 : 0; // Simple progress logic for UI, can be based on reimbursedAmount

  // Format price input
  const formatPrice = (v: string) => {
    const digits = v.replace(/\\D/g, '');
    const num = parseInt(digits, 10) / 100;
    if (isNaN(num)) return '';
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Generate Conic Gradient for Donut Chart
  let currentAngle = 0;
  const conicStops = activeItems.map((item, i) => {
    if (activeTotal === 0) return '';
    const percentage = (item.price / activeTotal) * 360;
    const color = CHART_COLORS[i % CHART_COLORS.length];
    const stop = \`\${color} \${currentAngle}deg \${currentAngle + percentage}deg\`;
    currentAngle += percentage;
    return stop;
  }).join(', ');

  const donutStyle: React.CSSProperties = {
    width: 200, height: 200, borderRadius: '50%',
    background: conicStops ? \`conic-gradient(\${conicStops})\` : 'var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative'
  };

  const innerCircleStyle: React.CSSProperties = {
    width: 150, height: 150, borderRadius: '50%', background: 'var(--card)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    zIndex: 2
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Carregando...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span onClick={() => window.history.back()} style={{ cursor: 'pointer', fontSize: 20, color: 'var(--text-secondary)' }}>←</span>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Reembolsos / <span style={{ color: 'var(--text-main)' }}>{activeTicket ? \`Ticket #\${activeTicket.ticketNumber}\` : 'Novo Ticket'}</span></h2>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => { setIsAdding(true); setTimeout(() => document.getElementById('newItemName')?.focus(), 100); }} 
            style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#ec4899', color: '#fff', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span> Adicionar reembolso
          </button>
          <button onClick={handleCloseTicket} disabled={!activeTicket || activeTicket.items.length === 0}
            style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-main)', fontWeight: 800, fontSize: '0.85rem', cursor: activeTicket && activeTicket.items.length > 0 ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>lock</span> Fechar ticket
          </button>
        </div>
      </div>

      {/* MAIN CONTENT GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 24 }}>
        
        {/* LEFT COLUMN: Itens do Ticket */}
        <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)', padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Reembolso em andamento</h3>
            <span style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', padding: '2px 8px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 700 }}>Aberto</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 20 }}>
            Criado em {activeTicket ? fmtDate(activeTicket.createdAt) : fmtDate(new Date().toISOString())} por {user?.name} • {selectedUnit || 'Barueri'}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {activeItems.map((item, i) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px', borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check</span>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{item.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.description || 'Sem descrição'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, color: '#10b981', fontSize: '1rem' }}>{fmtBRL(item.price)}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{item.expenseDate ? fmtDate(item.expenseDate) : '--/--/----'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {/* Placeholder para Editar se necessário */}
                    <button onClick={() => handleRemoveItem(item.id!)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {isAdding ? (
              <div style={{ padding: '14px', borderRadius: 12, border: '1px dashed var(--border)', background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <input id="newItemName" value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="Título da despesa" style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontSize: '0.85rem', outline: 'none' }} />
                  <input value={newItemPrice} onChange={e => setNewItemPrice(formatPrice(e.target.value))} placeholder="Valor (R$ 0,00)" inputMode="numeric" style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontSize: '0.85rem', outline: 'none' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <input type="date" value={newItemDate} onChange={e => setNewItemDate(e.target.value)} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontSize: '0.85rem', outline: 'none' }} />
                  <input value={newItemDesc} onChange={e => setNewItemDesc(e.target.value)} placeholder="Descrição (opcional)" style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontSize: '0.85rem', outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                  <button onClick={() => setIsAdding(false)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}>Cancelar</button>
                  <button onClick={handleAddItem} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontSize: '0.8rem' }}>Salvar Item</button>
                </div>
              </div>
            ) : (
              <div onClick={() => { setIsAdding(true); setTimeout(() => document.getElementById('newItemName')?.focus(), 100); }} style={{ padding: '14px', borderRadius: 12, border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--border)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Novo reembolso</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Clique para adicionar</div>
                  </div>
                </div>
                <div style={{ fontWeight: 800, color: 'var(--text-secondary)', fontSize: '0.95rem' }}>R$ 0,00</div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Resumo do Reembolso */}
        <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, marginBottom: 24 }}>Resumo do reembolso</h3>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 30, marginBottom: 40, flexWrap: 'wrap' }}>
            <div style={donutStyle}>
              <div style={innerCircleStyle}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text-main)', marginTop: 2 }}>{fmtBRL(activeTotal)}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>100%</div>
              </div>
            </div>
            
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {activeItems.map((item, i) => {
                const percentage = activeTotal > 0 ? ((item.price / activeTotal) * 100).toFixed(1) : 0;
                const color = CHART_COLORS[i % CHART_COLORS.length];
                return (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>{item.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{fmtBRL(item.price)} ({percentage}%)</div>
                    </div>
                  </div>
                );
              })}
              {activeItems.length === 0 && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Nenhum item adicionado.</div>}
            </div>
          </div>

          <div style={{ marginTop: 'auto', display: 'flex', gap: 20, padding: 16, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Valor em aberto</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#10b981', marginTop: 4 }}>{fmtBRL(activeTotal)}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                Progresso <span>100%</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', marginTop: 12, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '100%', background: '#10b981', borderRadius: 3 }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* TICKETS HISTÓRICO */}
      <div style={{ marginTop: 20 }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 16 }}>
          Tickets <span style={{ background: 'var(--border)', padding: '2px 8px', borderRadius: 10, fontSize: '0.75rem' }}>{historicalTickets.length}</span>
        </h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 20 }}>Histórico de tickets finalizados ou pendentes de aprovação.</p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {historicalTickets.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Nenhum histórico encontrado.</div>}
          {historicalTickets.map(t => {
            const isFinalizado = t.status === 'finalizado' || t.status === 'reembolsado' || t.status === 'pago';
            const color = isFinalizado ? '#10b981' : '#f59e0b';
            const label = isFinalizado ? 'Finalizado' : 'Aguardando';
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: \`\${color}15\`, color: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{isFinalizado ? 'check' : 'hourglass_top'}</span>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-main)' }}>Ticket #{t.ticketNumber}</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: \`\${color}15\`, color: color }}>{label}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>{fmtDate(t.createdAt)} • {t.requesterName} • {t.unit}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontWeight: 800, fontSize: '1.1rem', color: color }}>{fmtBRL(t.totalAmount)}</span>
                  <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--text-secondary)' }}>expand_more</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
`;

fs.writeFileSync('/Users/viniciussantos/Downloads/virtuosa-main/financeiro/src/components/reembolso-section.tsx', content);
