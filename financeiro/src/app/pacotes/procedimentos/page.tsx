'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { toast } from '@/components/toast';
import { confirmDialog } from '@/components/ui/confirm-dialog';

interface Service { id: string; name: string; description: string | null; category: string; price: number; duration: number; unit: string; active: boolean; }
const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const cardS: React.CSSProperties = { background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)', padding: 24 };
const inputS: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: '0.9rem', outline: 'none', background: 'var(--bg)', boxSizing: 'border-box' as const, color: 'var(--text-main)', fontFamily: 'inherit', fontWeight: 600, height: 48 };
const labelS: React.CSSProperties = { display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' as const };

const CATEGORIES = ['Depilação', 'Facial', 'Corporal', 'Injetáveis', 'Laser', 'Massagem', 'Estética', 'Outros'];

export default function ProcedimentosPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<Record<string, Service[]>>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editService, setEditService] = useState<Service | null>(null);
  const [form, setForm] = useState({ name: '', description: '', category: 'Estética', price: '', duration: '60', unit: 'Todas' });
  const [searchTerm, setSearchTerm] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/catalog?active=all');
    const data = await res.json();
    setServices(data.services || []);
    setCategories(data.categories || {});
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    if (!form.name || !form.price) { toast('Preencha campos obrigatórios', 'error'); return; }
    if (editService) {
      await fetch('/api/catalog', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editService.id, ...form, price: parseFloat(form.price), duration: parseInt(form.duration) }) });
      toast('Procedimento atualizado!', 'success');
    } else {
      await fetch('/api/catalog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, price: parseFloat(form.price), duration: parseInt(form.duration) }) });
      toast('Procedimento adicionado!', 'success');
    }
    setShowModal(false);
    setEditService(null);
    fetchData();
  };

  const toggleActive = async (s: Service) => {
    await fetch('/api/catalog', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, active: !s.active }) });
    fetchData();
  };

  const deleteService = async (id: string) => {
    if (!await confirmDialog({ title: 'Remover Procedimento', message: 'Remover este procedimento do catálogo?', confirmText: 'Sim, remover', variant: 'danger' })) return;
    await fetch(`/api/catalog?id=${id}`, { method: 'DELETE' });
    fetchData();
  };

  const openEdit = (s: Service) => {
    setEditService(s);
    setForm({ name: s.name, description: s.description || '', category: s.category, price: String(s.price), duration: String(s.duration), unit: s.unit });
    setShowModal(true);
  };

  // Filter by search
  const filteredCategories = searchTerm.trim()
    ? Object.fromEntries(
        Object.entries(categories)
          .map(([cat, items]) => [cat, items.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()))])
          .filter(([, items]) => (items as Service[]).length > 0)
      )
    : categories;

  return (
    <AuthGuard>
      <AppHeader activePage="pacotes-procedimentos" />
      <main style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--primary)' }}>spa</span>
              Procedimentos
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Catálogo de procedimentos e serviços oferecidos</p>
          </div>
          <button onClick={() => { setEditService(null); setForm({ name: '', description: '', category: 'Estética', price: '', duration: '60', unit: 'Todas' }); setShowModal(true); }} style={{ padding: '12px 24px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span> Novo Procedimento
          </button>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
          {[
            { icon: 'spa', color: '#6366f1', label: 'Total Procedimentos', value: services.length },
            { icon: 'check_circle', color: '#10b981', label: 'Ativos', value: services.filter(s => s.active).length },
            { icon: 'category', color: '#f59e0b', label: 'Categorias', value: Object.keys(categories).length },
            { icon: 'payments', color: '#8b5cf6', label: 'Preço Médio', value: services.length > 0 ? fmt(services.reduce((s, sv) => s + sv.price, 0) / services.length) : 'R$ 0' },
          ].map(kpi => (
            <div key={kpi.label} style={{ ...cardS, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: `${kpi.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: kpi.color }}>{kpi.icon}</span>
              </div>
              <div>
                <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const }}>{kpi.label}</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{kpi.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ position: 'relative', maxWidth: 400 }}>
            <span className="material-symbols-outlined" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 20, color: 'var(--text-muted)' }}>search</span>
            <input
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar procedimento..."
              style={{ ...inputS, paddingLeft: 44 }}
            />
          </div>
        </div>

        {/* Services by category */}
        {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Carregando...</div> : Object.keys(filteredCategories).length === 0 ? (
          <div style={{ ...cardS, textAlign: 'center', padding: 40 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: 0.3, color: 'var(--text-muted)' }}>spa</span>
            <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>{searchTerm ? 'Nenhum procedimento encontrado' : 'Nenhum procedimento cadastrado'}</p>
          </div>
        ) : (
          Object.entries(filteredCategories).map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: 20 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: '0.92rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--primary)' }}>category</span> {cat}
                <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', padding: '2px 8px', borderRadius: 6, background: 'var(--bg)' }}>{(items as Service[]).length}</span>
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                {(items as Service[]).map(s => (
                  <div key={s.id} style={{ ...cardS, padding: '16px 20px', opacity: s.active ? 1 : 0.5, position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.92rem', fontWeight: 800 }}>{s.name}</div>
                        {s.description && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{s.description}</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => openEdit(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-muted)' }}>edit</span>
                        </button>
                        <button onClick={() => toggleActive(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: s.active ? '#10b981' : '#94a3b8' }}>{s.active ? 'visibility' : 'visibility_off'}</span>
                        </button>
                        <button onClick={() => deleteService(s.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#ef4444' }}>delete</span>
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--primary)' }}>{fmt(s.price)}</span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>schedule</span> {s.duration}min
                      </span>
                      {s.unit !== 'Todas' && <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: 'rgba(99,102,241,0.06)', color: '#6366f1' }}>{s.unit}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </main>

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => { setShowModal(false); setEditService(null); }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 24, padding: 32, maxWidth: 500, width: '100%', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--primary)' }}>{editService ? 'edit' : 'add'}</span>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>{editService ? 'Editar Procedimento' : 'Novo Procedimento'}</h2>
              <button onClick={() => { setShowModal(false); setEditService(null); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><span className="material-symbols-outlined">close</span></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}><label style={labelS}>Nome *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={inputS} placeholder="Ex: Depilação Laser Axilas" /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={labelS}>Descrição</label><input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={inputS} placeholder="Descrição do procedimento" /></div>
              <div><label style={labelS}>Categoria</label><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={inputS}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
              <div><label style={labelS}>Preço *</label><input type="number" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} style={inputS} placeholder="R$ 0,00" /></div>
              <div><label style={labelS}>Duração (min)</label><input type="number" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} style={inputS} /></div>
              <div><label style={labelS}>Unidade</label><select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} style={inputS}><option>Todas</option>{[ 'Osasco', 'SBC', 'SCS'].map(u => <option key={u}>{u}</option>)}</select></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={() => { setShowModal(false); setEditService(null); }} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={handleSave} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{editService ? 'Salvar' : 'Adicionar'}</button>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
