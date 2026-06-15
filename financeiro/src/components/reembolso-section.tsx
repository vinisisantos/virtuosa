"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useToast } from '@/components/toast';

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
  const { showToast } = useToast();

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
    if (!newItemName.trim() || !newItemPrice) return showToast('Nome e valor são obrigatórios', 'warning');
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
      showToast(err.message, 'error');
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
    if (!isAdmin) return showToast('Somente administradores podem dar baixa.', 'warning');
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
        showToast(data.error || 'Erro ao atualizar item', 'error');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCloseTicket = async () => {
    if (!activeTicket || activeTicket.items.length === 0) return showToast('Adicione itens antes de fechar.', 'warning');
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
        showToast('Ticket enviado para aprovação!', 'success');
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
    if (val <= 0) return showToast('Valor recebido deve ser maior que zero', 'warning');
    setProcessandoRecebimento(true);
    try {
      const res = await fetch('/api/reembolso/recebimento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit: selectedUnit || 'Barueri', valorRecebido: val })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Sucesso! ${data.resumo.quantidadeLiquidada} reembolsos quitados. Crédito gerado: ${fmtBRL(data.resumo.creditoGeradoCentavos / 100)}`, 'success', 5000);
        setIsRecebimentoModalOpen(false);
        setValorRecebido('');
        fetchTickets();
      } else {
        showToast(data.error || 'Erro ao processar', 'error');
      }
    } catch (e) {
      showToast('Erro de conexão ao processar recebimento', 'error');
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

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Carregando...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%', boxSizing: 'border-box' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span onClick={() => window.history.back()} style={{ cursor: 'pointer', fontSize: 20, color: 'var(--text-secondary)' }}>←</span>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Reembolsos / <span style={{ color: 'var(--text-main)' }}>{activeTicket ? `Ticket #${activeTicket.ticketNumber}` : 'Novo Ticket'}</span></h2>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isAdmin && (
            <button onClick={() => setIsRecebimentoModalOpen(true)}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>payments</span> Registrar Recebimento
            </button>
          )}
          <button onClick={() => { setIsAdding(true); setTimeout(() => document.getElementById('newItemName')?.focus(), 100); }} 
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#ec4899', color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span> Adicionar
          </button>
          <button onClick={handleCloseTicket} disabled={!activeTicket || activeTicket.items.length === 0}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-main)', fontWeight: 700, fontSize: '0.8rem', cursor: activeTicket && activeTicket.items.length > 0 ? 'pointer' : 'not-allowed', opacity: activeTicket && activeTicket.items.length > 0 ? 1 : 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>lock</span> Fechar ticket
          </button>
        </div>
      </div>

      {/* CRÉDITO ACUMULADO BANNER */}
      {isAdmin && creditoAcumulado > 0 && (
        <div style={{ padding: '14px 20px', borderRadius: 12, border: '1px solid rgba(16, 185, 129, 0.3)', background: 'rgba(16, 185, 129, 0.08)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#10b981' }}>account_balance_wallet</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Crédito Disponível:</span>
            <span style={{ fontSize: '1rem', fontWeight: 800, color: '#10b981' }}>{fmtBRL(creditoAcumulado)}</span>
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Somado automaticamente ao próximo recebimento</span>
        </div>
      )}

      {/* MAIN CONTENT GRID — percentage based for zoom stability */}
      <div style={{ display: 'grid', gridTemplateColumns: '58% 1fr', gap: 20, alignItems: 'start', width: '100%' }}>
        
        {/* LEFT COLUMN: Itens do Ticket */}
        <div style={{ background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)', padding: '20px 22px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Reembolso em andamento</h3>
              <span style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6', padding: '2px 10px', borderRadius: 10, fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Aberto</span>
            </div>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
            Criado em {activeTicket ? fmtDate(activeTicket.createdAt) : fmtDate(new Date().toISOString())} por {user?.name} • {selectedUnit || 'Barueri'}
          </div>

          {/* Item list with scroll */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 480, overflowY: 'auto', paddingRight: 4 }}>
            {activeItems.map((item, i) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', transition: 'border-color 0.15s' }}>
                {/* Checkbox */}
                <div 
                  onClick={() => handleToggleItem(item.id!, !!item.isReimbursed)}
                  style={{ width: 24, height: 24, minWidth: 24, borderRadius: '50%', background: item.isReimbursed ? '#10b981' : 'transparent', border: item.isReimbursed ? '2px solid #10b981' : '2px solid var(--border)', color: item.isReimbursed ? '#fff' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isAdmin ? 'pointer' : 'default', transition: 'all 0.2s' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check</span>
                </div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                  {item.description && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{item.description}</div>}
                </div>
                {/* Price & date */}
                <div style={{ textAlign: 'right', minWidth: 90 }}>
                  <div style={{ fontWeight: 800, color: '#10b981', fontSize: '0.88rem' }}>{fmtBRL(item.price)}</div>
                  {item.expenseDate && <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: 1 }}>{fmtDate(item.expenseDate)}</div>}
                </div>
                {/* Delete */}
                <button onClick={(e) => { e.stopPropagation(); handleRemoveItem(item.id!); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, borderRadius: 6, transition: 'color 0.15s' }} 
                  onMouseEnter={e => e.currentTarget.style.color = '#ef4444'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                </button>
              </div>
            ))}

            {/* Add item form / placeholder */}
            {isAdding ? (
              <div style={{ padding: '12px', borderRadius: 10, border: '1px dashed rgba(99, 102, 241, 0.4)', background: 'rgba(99, 102, 241, 0.04)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input id="newItemName" value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="Título da despesa" style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontSize: '0.8rem', outline: 'none' }} />
                  <input value={newItemPrice} onChange={e => setNewItemPrice(formatPrice(e.target.value))} placeholder="R$ 0,00" inputMode="numeric" style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontSize: '0.8rem', outline: 'none' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input type="date" value={newItemDate} onChange={e => setNewItemDate(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontSize: '0.8rem', outline: 'none' }} />
                  <input value={newItemDesc} onChange={e => setNewItemDesc(e.target.value)} placeholder="Descrição (opcional)" style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontSize: '0.8rem', outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setIsAdding(false)} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer', fontSize: '0.78rem' }}>Cancelar</button>
                  <button onClick={handleAddItem} disabled={saving} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontSize: '0.78rem' }}>Salvar</button>
                </div>
              </div>
            ) : (
              <div onClick={() => { setIsAdding(true); setTimeout(() => document.getElementById('newItemName')?.focus(), 100); }} style={{ padding: '10px 12px', borderRadius: 10, border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', border: '1px dashed var(--border)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
                </div>
                <span style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Novo reembolso</span>
              </div>
            )}
          </div>

          {/* Bottom totals bar */}
          {activeItems.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, padding: '12px 14px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-main)', marginTop: 2 }}>{fmtBRL(activeTotal)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{activeItems.length} {activeItems.length === 1 ? 'item' : 'itens'}</div>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: pct >= 100 ? '#10b981' : '#f59e0b', marginTop: 2 }}>{pct.toFixed(0)}% reembolsado</div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Resumo do Reembolso */}
        <div style={{ background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)', padding: '20px 22px', display: 'flex', flexDirection: 'column', position: 'sticky', top: 20, boxSizing: 'border-box', overflow: 'hidden' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, marginBottom: 20 }}>Resumo do reembolso</h3>
          
          {/* Donut chart — centered */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <div style={{ width: 180, height: 180, borderRadius: '50%', background: conicStops ? `conic-gradient(${conicStops})` : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 130, height: 130, borderRadius: '50%', background: 'var(--card)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-main)', marginTop: 2 }}>{fmtBRL(activeTotal)}</div>
              </div>
            </div>
          </div>
          
          {/* Legend — 2 columns for compactness */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {activeItems.map((item, i) => {
              const percentage = activeTotal > 0 ? ((item.price / activeTotal) * 100).toFixed(1) : 0;
              const color = CHART_COLORS[i % CHART_COLORS.length];
              return (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, minWidth: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-main)' }}>{item.name}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>{fmtBRL(item.price)} ({percentage}%)</div>
                </div>
              );
            })}
            {activeItems.length === 0 && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', gridColumn: '1 / -1' }}>Nenhum item adicionado.</div>}
          </div>

          {/* Progress section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', marginTop: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Valor em aberto</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: openValue === 0 ? '#10b981' : '#f59e0b', marginTop: 2 }}>{fmtBRL(openValue)}</div>
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: 800, color: pct >= 100 ? '#10b981' : 'var(--text-main)' }}>{pct.toFixed(0)}%</div>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#10b981' : '#3b82f6', borderRadius: 3, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        </div>
      </div>

      {/* TICKETS HISTÓRICO */}
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 14 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            Histórico de Tickets
            <span style={{ background: 'var(--border)', padding: '2px 8px', borderRadius: 10, fontSize: '0.72rem', fontWeight: 600 }}>{historicalTickets.length}</span>
          </h3>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {historicalTickets.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Nenhum histórico encontrado.</div>}
          {historicalTickets.map(t => {
            const isFinalizado = t.status === 'finalizado' || t.status === 'reembolsado' || t.status === 'pago';
            const color = isFinalizado ? '#10b981' : '#f59e0b';
            const label = isFinalizado ? 'Finalizado' : 'Aguardando';
            return (
              <div key={t.id} onClick={() => { setSelectedTicketId(t.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 10, background: 'var(--card)', border: '1px solid var(--border)', cursor: 'pointer', transition: 'border-color 0.15s' }} onMouseEnter={e => e.currentTarget.style.borderColor = color} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: `${color}15`, color: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{isFinalizado ? 'check_circle' : 'schedule'}</span>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-main)' }}>Ticket #{t.ticketNumber}</span>
                      <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '1px 6px', borderRadius: 6, background: `${color}15`, color: color, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{label}</span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>{fmtDate(t.createdAt)} • {t.requesterName} • {t.unit}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontWeight: 800, fontSize: '1rem', color: color }}>{fmtBRL(t.totalAmount)}</span>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-secondary)' }}>chevron_right</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MODAL: Registrar Recebimento */}
      {isRecebimentoModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 420, padding: 28, boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Registrar Recebimento</h3>
              <button onClick={() => setIsRecebimentoModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Valor Recebido (R$)</label>
              <input 
                autoFocus
                value={valorRecebido}
                onChange={e => setValorRecebido(formatPrice(e.target.value))}
                placeholder="R$ 0,00"
                inputMode="numeric"
                style={{ padding: '14px 18px', borderRadius: 10, border: '2px solid var(--border)', background: 'var(--card)', color: 'var(--text-main)', fontSize: '1.1rem', fontWeight: 800, outline: 'none', transition: 'border-color 0.2s' }}
                onFocus={e => e.currentTarget.style.borderColor = '#3b82f6'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
              />
            </div>

            <div style={{ padding: 14, borderRadius: 10, background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                <span>Crédito acumulado</span>
                <span style={{ fontWeight: 600 }}>{fmtBRL(creditoAcumulado)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', color: 'var(--text-main)', fontWeight: 800, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 6 }}>
                <span>Total a processar</span>
                <span>{fmtBRL(creditoAcumulado + (parseFloat(valorRecebido.replace(/[^0-9,-]+/g, "").replace(",", ".")) || 0))}</span>
              </div>
            </div>

            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 18, lineHeight: 1.5 }}>
              O sistema quitará automaticamente os reembolsos pendentes, do mais antigo ao mais recente, sem pagamentos parciais.
            </p>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setIsRecebimentoModalOpen(false)} style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>Cancelar</button>
              <button onClick={handleProcessarRecebimento} disabled={processandoRecebimento || !valorRecebido} style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, cursor: processandoRecebimento || !valorRecebido ? 'not-allowed' : 'pointer', opacity: processandoRecebimento || !valorRecebido ? 0.5 : 1, fontSize: '0.85rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
                {processandoRecebimento ? 'Processando...' : 'Confirmar e Processar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
