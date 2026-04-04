'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { toast } from '@/components/toast';

interface StockItem {
  id: string; name: string; category: string; unit: string;
  quantity: number; minQuantity: number; unitCost: number;
  supplier: string | null; location: string | null;
  movements: { id: string; type: string; quantity: number; reason: string | null; userName: string | null; createdAt: string }[];
}

const UNITS = ['Barueri', 'Osasco', 'SBC', 'SCS'];
const CATEGORIES = ['Produto', 'Equipamento', 'Descartável', 'Cosmético', 'Material de Limpeza'];
const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const cardS: React.CSSProperties = { background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)', padding: 24 };
const inputS: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: '0.9rem', outline: 'none', background: 'var(--bg)', boxSizing: 'border-box' as const, color: 'var(--text-main)', fontFamily: 'inherit', fontWeight: 600, height: 48 };
const labelS: React.CSSProperties = { display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.5px' };

export default function EstoquePage() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [unitFilter, setUnitFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState<StockItem | null>(null);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);

  // Form
  const [form, setForm] = useState({ name: '', category: 'Produto', unit: 'Barueri', quantity: 0, minQuantity: 5, unitCost: 0, supplier: '', location: '' });
  // Movement form
  const [movType, setMovType] = useState<'entrada' | 'saida'>('entrada');
  const [movQty, setMovQty] = useState(1);
  const [movReason, setMovReason] = useState('');

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (unitFilter !== 'all') params.set('unit', unitFilter);
      if (catFilter) params.set('category', catFilter);
      const res = await fetch(`/api/stock?${params}`);
      const data = await res.json();
      setItems(data.items || []);
      setLowStockCount(data.lowStockCount || 0);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [unitFilter, catFilter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const openNew = () => { setEditingItem(null); setForm({ name: '', category: 'Produto', unit: 'Barueri', quantity: 0, minQuantity: 5, unitCost: 0, supplier: '', location: '' }); setShowModal(true); };
  const openEdit = (item: StockItem) => { setEditingItem(item); setForm({ name: item.name, category: item.category, unit: item.unit, quantity: item.quantity, minQuantity: item.minQuantity, unitCost: item.unitCost, supplier: item.supplier || '', location: item.location || '' }); setShowModal(true); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast('Nome obrigatório', 'error'); return; }
    try {
      const method = editingItem ? 'PUT' : 'POST';
      const body = editingItem ? { id: editingItem.id, ...form } : form;
      const res = await fetch('/api/stock', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { toast(editingItem ? 'Item atualizado!' : 'Item cadastrado!', 'success'); setShowModal(false); fetchItems(); }
    } catch { toast('Erro de conexão', 'error'); }
  };

  const handleMovement = async () => {
    if (!showMovementModal || movQty < 1) return;
    try {
      const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('virtuosa_user') || '{}') : {};
      const res = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'movement', stockItemId: showMovementModal.id, type: movType, quantity: movQty, reason: movReason, userName: user?.name }),
      });
      if (res.ok) { toast(`${movType === 'entrada' ? 'Entrada' : 'Saída'} registrada!`, 'success'); setShowMovementModal(null); fetchItems(); }
    } catch { toast('Erro ao registrar', 'error'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover item do estoque?')) return;
    try {
      await fetch('/api/stock', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      toast('Item removido', 'success'); fetchItems();
    } catch { toast('Erro', 'error'); }
  };

  const totalValue = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
  const totalItems = items.reduce((s, i) => s + i.quantity, 0);

  const CAT_ICONS: Record<string, string> = { Produto: 'inventory_2', Equipamento: 'build', Descartável: 'delete_sweep', Cosmético: 'spa', 'Material de Limpeza': 'cleaning_services' };

  return (
    <AuthGuard requiredPermission="dashboard">
      <AppHeader /><link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '30px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#f59e0b' }}>inventory</span> Controle de Estoque
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Gestão de insumos e produtos</p>
          </div>
          <button data-tour="est-novo" onClick={openNew} style={{ padding: '12px 24px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #f59e0b, #f97316)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add_circle</span> Novo Item
          </button>
        </div>

        {/* KPIs */}
        <div data-tour="est-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
          {[
            { icon: 'category', color: '#6366f1', label: 'Tipos de Item', value: String(items.length) },
            { icon: 'inventory_2', color: '#10b981', label: 'Total em Estoque', value: String(totalItems) },
            { icon: 'attach_money', color: '#f59e0b', label: 'Valor Total', value: fmt(totalValue) },
            { icon: 'warning', color: '#ef4444', label: 'Estoque Baixo', value: String(lowStockCount) },
          ].map(kpi => (
            <div key={kpi.label} style={{ ...cardS, padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 14, ...(kpi.label === 'Estoque Baixo' && lowStockCount > 0 ? { border: '2px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.04)' } : {}) }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `${kpi.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 24, color: kpi.color }}>{kpi.icon}</span>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>{kpi.label}</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: kpi.label === 'Estoque Baixo' && lowStockCount > 0 ? '#ef4444' : 'var(--text-main)' }}>{kpi.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div data-tour="est-filtros" style={{ ...cardS, marginBottom: 20, display: 'flex', gap: 12, padding: '14px 20px', flexWrap: 'wrap' }}>
          <select value={unitFilter} onChange={e => setUnitFilter(e.target.value)} style={{ ...inputS, width: 'auto', minWidth: 140 }}>
            <option value="all">Todas Unidades</option>
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ ...inputS, width: 'auto', minWidth: 160 }}>
            <option value="">Todas Categorias</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Items */}
        {loading ? (
          <div style={cardS}><div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Carregando...</div></div>
        ) : items.length === 0 ? (
          <div style={cardS}>
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 56, opacity: 0.3, color: 'var(--text-muted)' }}>inventory_2</span>
              <p style={{ fontWeight: 700, color: 'var(--text-muted)', marginTop: 12 }}>Nenhum item cadastrado</p>
              <button onClick={openNew} style={{ marginTop: 8, padding: '10px 20px', borderRadius: 10, border: 'none', background: '#f59e0b', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cadastrar Primeiro Item</button>
            </div>
          </div>
        ) : (
          <div data-tour="est-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
            {items.map(item => {
              const isLow = item.quantity <= item.minQuantity;
              const pct = item.minQuantity > 0 ? Math.min((item.quantity / (item.minQuantity * 3)) * 100, 100) : 100;
              const barColor = isLow ? '#ef4444' : pct > 60 ? '#10b981' : '#f59e0b';
              return (
                <div key={item.id} style={{ ...cardS, padding: '18px 22px', ...(isLow ? { border: '2px solid rgba(239,68,68,0.25)' } : {}) }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: `${barColor}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: barColor }}>{CAT_ICONS[item.category] || 'inventory_2'}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-main)' }}>{item.name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.category} • {item.unit}</div>
                    </div>
                    {isLow && <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>BAIXO</span>}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: '1.3rem', fontWeight: 900, color: isLow ? '#ef4444' : 'var(--text-main)' }}>{item.quantity}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'flex-end' }}>mín: {item.minQuantity}</span>
                  </div>
                  <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 3, transition: 'width 0.4s' }} />
                  </div>

                  {item.unitCost > 0 && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 10 }}>Custo unit.: {fmt(item.unitCost)} • Total: {fmt(item.quantity * item.unitCost)}</div>}

                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => { setShowMovementModal(item); setMovType('entrada'); setMovQty(1); setMovReason(''); }} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span> Entrada
                    </button>
                    <button onClick={() => { setShowMovementModal(item); setMovType('saida'); setMovQty(1); setMovReason(''); }} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>remove</span> Saída
                    </button>
                    <button onClick={() => openEdit(item)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                    </button>
                    <button onClick={() => handleDelete(item.id)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.04)', color: '#ef4444', cursor: 'pointer' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New/Edit Item Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setShowModal(false)}>
          <form onSubmit={handleSave} onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 24, padding: '32px', maxWidth: 480, width: '100%', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#f59e0b' }}>inventory</span>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-main)' }}>{editingItem ? 'Editar Item' : 'Novo Item'}</h2>
              <button type="button" onClick={() => setShowModal(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><span className="material-symbols-outlined">close</span></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={labelS}>Nome *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputS} required /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={labelS}>Categoria</label><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={inputS}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                <div><label style={labelS}>Unidade</label><select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} style={inputS}>{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div><label style={labelS}>Qtd Inicial</label><input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: +e.target.value })} style={inputS} /></div>
                <div><label style={labelS}>Qtd Mínima</label><input type="number" value={form.minQuantity} onChange={e => setForm({ ...form, minQuantity: +e.target.value })} style={inputS} /></div>
                <div><label style={labelS}>Custo Unit.</label><input type="number" step="0.01" value={form.unitCost} onChange={e => setForm({ ...form, unitCost: +e.target.value })} style={inputS} /></div>
              </div>
              <div><label style={labelS}>Fornecedor</label><input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} style={inputS} /></div>
            </div>
            <button type="submit" style={{ width: '100%', marginTop: 20, padding: '14px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #f59e0b, #f97316)', color: '#fff', fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer', fontFamily: 'inherit' }}>
              {editingItem ? 'Salvar' : 'Cadastrar Item'}
            </button>
          </form>
        </div>
      )}

      {/* Movement Modal */}
      {showMovementModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setShowMovementModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 24, padding: '32px', maxWidth: 400, width: '100%', border: '1px solid var(--border)' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-main)' }}>
              {movType === 'entrada' ? '📥 Entrada' : '📤 Saída'} — {showMovementModal.name}
            </h2>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>Estoque atual: <strong>{showMovementModal.quantity}</strong></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={labelS}>Quantidade</label><input type="number" min={1} value={movQty} onChange={e => setMovQty(+e.target.value)} style={inputS} /></div>
              <div><label style={labelS}>Motivo (opcional)</label><input value={movReason} onChange={e => setMovReason(e.target.value)} placeholder="Ex: Compra, Uso em procedimento" style={inputS} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowMovementModal(null)} style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={handleMovement} style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: movType === 'entrada' ? '#10b981' : '#ef4444', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
