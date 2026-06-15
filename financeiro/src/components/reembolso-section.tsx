"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';

/* ─── Types ─── */
interface ReembolsoItemData { id?: string; name: string; price: number; expenseDate?: string | null; description?: string | null; isReimbursed?: boolean; reimbursedAt?: string | null; reimbursedBy?: string | null }
interface Ticket {
  id: string; ticketNumber: number; requesterName: string; requesterId?: string | null;
  unit: string; status: string; totalAmount: number; reimbursedAmount: number;
  createdAt: string; items: ReembolsoItemData[]; attachments: any[];
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string) => {
  if (!d) return '--/--/----';
  // Extracts YYYY-MM-DD from ISO string and formats to DD/MM/YYYY to avoid timezone shifts
  const datePart = d.includes('T') ? d.split('T')[0] : d;
  const [year, month, day] = datePart.split('-');
  return `${day}/${month}/${year}`;
};

const CHART_COLORS = ['#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#14b8a6', '#f97316'];

const getCurrentUser = () => { try { const u = localStorage.getItem('virtuosa_user'); return u ? JSON.parse(u) : null; } catch { return null; } };

export function ReembolsoSection({ selectedUnit }: { selectedUnit?: string }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [creditoAcumulado, setCreditoAcumulado] = useState(0);
  const [isRecebimentoModalOpen, setIsRecebimentoModalOpen] = useState(false);
  const [valorRecebido, setValorRecebido] = useState('');
  const [processandoRecebimento, setProcessandoRecebimento] = useState(false);
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
      const res = await fetch(`/api/reembolso?${params}`);
      if (res.ok) setTickets(await res.json());

      // Fetch crédito acumulado
      if (isAdmin) {
        const credRes = await fetch(`/api/reembolso/credito?${params}`);
        if (credRes.ok) {
          const credData = await credRes.json();
          setCreditoAcumulado(credData.saldo || 0);
        }
      }
    } catch {} finally { setLoading(false); }
  }, [selectedUnit, user?.id]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const activeTicket = useMemo(() => {
    if (selectedTicketId) return tickets.find(t => t.id === selectedTicketId) || null;
    // Find the current draft, pending, or partially reimbursed ticket
    return tickets.find(t => ['rascunho', 'pendente', 'parcialmente_reembolsado'].includes(t.status)) || null;
  }, [tickets, selectedTicketId]);

  const historicalTickets = useMemo(() => {
    return tickets.filter(t => t.id !== activeTicket?.id);
  }, [tickets, activeTicket]);

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
      const res = await fetch(`/api/reembolso/items?id=${itemId}`, { method: 'DELETE' });
      if (res.ok) {
        const updatedTicket = await res.json();
        setTickets(prev => prev.map(t => t.id === updatedTicket.id ? updatedTicket : t));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleItem = async (itemId: string, currentStatus: boolean) => {
    if (!isAdmin) return alert('Somente administradores podem dar baixa.');
    try {
      const res = await fetch('/api/reembolso/items', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, isReimbursed: !currentStatus, userId: user?.id, userName: user?.name })
      });
      if (res.ok) {
        const updatedTicket = await res.json();
        setTickets(prev => prev.map(t => t.id === updatedTicket.id ? updatedTicket : t));
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao atualizar item');
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
  const reimbursedTotal = activeItems.filter(i => i.isReimbursed).reduce((s, i) => s + i.price, 0);
  const openValue = activeTotal - reimbursedTotal;
  const pct = activeTotal > 0 ? (reimbursedTotal / activeTotal) * 100 : 0;

  // Format price input
  const formatPrice = (v: string) => {
    const digits = v.replace(/\D/g, '');
    const num = parseInt(digits, 10) / 100;
    if (isNaN(num)) return '';
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const handleProcessarRecebimento = async () => {
    const val = parseFloat(valorRecebido.replace(/[^0-9,-]+/g, "").replace(",", ".")) || 0;
    if (val <= 0) return alert('Valor recebido deve ser maior que zero');
    setProcessandoRecebimento(true);
    try {
      const res = await fetch('/api/reembolso/recebimento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit: selectedUnit || 'Barueri', valorRecebido: val })
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Sucesso! ${data.resumo.quantidadeLiquidada} reembolsos quitados.\nCrédito gerado: ${fmtBRL(data.resumo.creditoGeradoCentavos / 100)}`);
        setIsRecebimentoModalOpen(false);
        setValorRecebido('');
        fetchTickets();
      } else {
        alert(data.error || 'Erro ao processar');
      }
    } catch (e) {
      alert('Erro de conexão ao processar recebimento');
    } finally {
      setProcessandoRecebimento(false);
    }
  };

  // Generate Conic Gradient for Donut Chart
  let currentAngle = 0;
  const conicStops = activeItems.map((item, i) => {
    if (activeTotal === 0) return '';
    const percentage = (item.price / activeTotal) * 360;
    const color = CHART_COLORS[i % CHART_COLORS.length];
    const stop = `${color} ${currentAngle}deg ${currentAngle + percentage}deg`;
    currentAngle += percentage;
    return stop;
  }).join(', ');

  const donutStyle: React.CSSProperties = {
    width: 200, height: 200, borderRadius: '50%',
    background: conicStops ? `conic-gradient(${conicStops})` : 'var(--border)',
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
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Reembolsos / <span style={{ color: 'var(--text-main)' }}>{activeTicket ? `Ticket #${activeTicket.ticketNumber}` : 'Novo Ticket'}</span></h2>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {isAdmin && (
            <button onClick={() => setIsRecebimentoModalOpen(true)}
              style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>payments</span> Registrar Recebimento
            </button>
          )}
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
      {isAdmin && creditoAcumulado > 0 && (
        <div style={{ padding: 16, borderRadius: 12, border: '1px solid #10b981', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#10b981' }}>account_balance_wallet</span>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Crédito Disponível</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#10b981' }}>{fmtBRL(creditoAcumulado)}</div>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
            Este valor será somado automaticamente ao próximo recebimento registrado.
          </div>
        </div>
      )}

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
                  <div 
                    onClick={() => handleToggleItem(item.id!, !!item.isReimbursed)}
                    style={{ width: 28, height: 28, borderRadius: '50%', background: item.isReimbursed ? '#10b981' : 'var(--border)', color: item.isReimbursed ? '#fff' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isAdmin ? 'pointer' : 'default', transition: 'background 0.2s' }}>
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
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: openValue === 0 ? 'var(--text-secondary)' : '#f59e0b', marginTop: 4 }}>{fmtBRL(openValue)}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                Progresso <span>{pct.toFixed(0)}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', marginTop: 12, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: '#10b981', borderRadius: 3, transition: 'width 0.3s' }} />
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
              <div key={t.id} onClick={() => { setSelectedTicketId(t.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--card)'}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: `${color}15`, color: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{isFinalizado ? 'check' : 'hourglass_top'}</span>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-main)' }}>Ticket #{t.ticketNumber}</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: `${color}15`, color: color }}>{label}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>{fmtDate(t.createdAt)} • {t.requesterName} • {t.unit}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <span style={{ fontWeight: 800, fontSize: '1.1rem', color: color }}>{fmtBRL(t.totalAmount)}</span>
                  <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--text-secondary)' }}>open_in_new</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isRecebimentoModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 450, padding: 32, boxShadow: '0 20px 40px rgba(0,0,0,0.4)', animation: 'slideUp 0.3s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>Registrar Recebimento</h3>
              <button onClick={() => setIsRecebimentoModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 24 }}>close</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Valor Recebido (R$)</label>
              <input 
                autoFocus
                value={valorRecebido}
                onChange={e => setValorRecebido(formatPrice(e.target.value))}
                placeholder="R$ 0,00"
                inputMode="numeric"
                style={{ padding: '16px 20px', borderRadius: 12, border: '2px solid var(--border)', background: 'var(--card)', color: 'var(--text-main)', fontSize: '1.2rem', fontWeight: 800, outline: 'none', transition: 'border-color 0.2s' }}
                onFocus={e => e.currentTarget.style.borderColor = '#3b82f6'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
              />
            </div>

            <div style={{ padding: 16, borderRadius: 12, background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: '#3b82f6' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>info</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Resumo da Liquidação</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                <span>Crédito Acumulado:</span>
                <span style={{ fontWeight: 600 }}>{fmtBRL(creditoAcumulado)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 800, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8, marginTop: 4 }}>
                <span>Total a Processar:</span>
                <span>{fmtBRL(creditoAcumulado + (parseFloat(valorRecebido.replace(/[^0-9,-]+/g, "").replace(",", ".")) || 0))}</span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 12, lineHeight: 1.4 }}>
                O sistema quitará automaticamente os reembolsos pendentes, do mais antigo ao mais recente, sem pagamentos parciais.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setIsRecebimentoModalOpen(false)} style={{ flex: 1, padding: '14px', borderRadius: 12, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s' }}>Cancelar</button>
              <button onClick={handleProcessarRecebimento} disabled={processandoRecebimento || !valorRecebido} style={{ flex: 1, padding: '14px', borderRadius: 12, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, cursor: processandoRecebimento || !valorRecebido ? 'not-allowed' : 'pointer', opacity: processandoRecebimento || !valorRecebido ? 0.6 : 1, transition: 'opacity 0.2s', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                {processandoRecebimento ? 'Processando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
