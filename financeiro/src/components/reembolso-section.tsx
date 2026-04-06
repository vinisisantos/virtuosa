'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/* ─── Types ─── */
interface ReembolsoItemData { id?: string; name: string; price: number; isReimbursed?: boolean; reimbursedAt?: string | null; reimbursedBy?: string | null }
interface AttachmentMeta { id: string; fileName: string; fileType: string; fileSize: number; createdAt?: string }
interface AuditEntry { id: string; ticketId: string; action: string; field?: string | null; oldValue?: string | null; newValue?: string | null; actorName: string; description?: string | null; createdAt: string }
interface Ticket {
  id: string; ticketNumber: number; requesterName: string; requesterId?: string | null;
  unit: string; status: string; totalAmount: number; reimbursedAmount: number;
  isCreatedByAdmin?: boolean; adminNotes?: string | null; reviewedBy?: string | null;
  reviewedAt?: string | null; finalizedAt?: string | null;
  paymentProofName?: string | null; paymentProofType?: string | null; paidAt?: string | null;
  createdAt: string; items: ReembolsoItemData[]; attachments: AttachmentMeta[];
}
interface PendingAttachment { file: File; preview?: string; base64?: string }

/* ─── Helpers ─── */
const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtBytes = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pendente: { label: 'Pendente', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: 'hourglass_top' },
  parcialmente_reembolsado: { label: 'Parcial', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', icon: 'timelapse' },
  reembolsado: { label: 'Reembolsado', color: '#22c55e', bg: 'rgba(34,197,94,0.12)', icon: 'check_circle' },
  finalizado: { label: 'Finalizado', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', icon: 'verified' },
  reprovado: { label: 'Reprovado', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', icon: 'cancel' },
  aprovado: { label: 'Aprovado', color: '#22c55e', bg: 'rgba(34,197,94,0.12)', icon: 'check_circle' },
  pago: { label: 'Pago', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', icon: 'paid' },
};

const getCurrentUser = () => { try { const u = localStorage.getItem('virtuosa_user'); return u ? JSON.parse(u) : null; } catch { return null; } };

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */
export function ReembolsoSection({ selectedUnit }: { selectedUnit?: string }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('todos');
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [saving, setSaving] = useState(false);

  const user = getCurrentUser();
  const isAdmin = user?.role === 'ADMINISTRADOR' || user?.permissions?.admin === true;

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'todos') params.set('status', filterStatus);
      if (selectedUnit && selectedUnit !== 'Todas' && selectedUnit !== 'all') params.set('unit', selectedUnit);
      if (user?.id) params.set('userId', user.id);
      const res = await fetch(`/api/reembolso?${params}`);
      if (res.ok) setTickets(await res.json());
    } catch {} finally { setLoading(false); }
  }, [filterStatus, selectedUnit, user?.id]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const pending = tickets.filter(t => t.status === 'pendente' || t.status === 'parcialmente_reembolsado');
  const finalized = tickets.filter(t => t.status === 'finalizado' || t.status === 'reembolsado' || t.status === 'pago');
  const totalPending = pending.reduce((s, t) => s + (t.totalAmount - t.reimbursedAmount), 0);
  const totalReimbursed = tickets.reduce((s, t) => s + t.reimbursedAmount, 0);

  const handleStatusChange = async (ticketId: string, status: string, adminNotes?: string, paymentProof?: any) => {
    setSaving(true);
    try {
      const res = await fetch('/api/reembolso', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, status, adminNotes, userId: user?.id, userName: user?.name, paymentProof }),
      });
      if (res.ok) { const updated = await res.json(); setTickets(prev => prev.map(t => t.id === ticketId ? updated : t)); if (selectedTicket?.id === ticketId) setSelectedTicket(updated); }
    } catch {} finally { setSaving(false); }
  };

  const handleItemToggle = async (itemId: string, isReimbursed: boolean) => {
    try {
      const res = await fetch('/api/reembolso/items', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, isReimbursed, userId: user?.id, userName: user?.name }),
      });
      if (res.ok) {
        const updated = await res.json();
        setTickets(prev => prev.map(t => t.id === updated.id ? updated : t));
        if (selectedTicket?.id === updated.id) setSelectedTicket(updated);
      }
    } catch {}
  };

  const cardS: React.CSSProperties = { background: 'var(--card)', borderRadius: 'var(--radius-lg, 16px)', border: '1px solid var(--border)', padding: 20 };
  const statusList = ['todos', 'pendente', 'parcialmente_reembolsado', 'finalizado', 'reprovado'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#f97316' }}>receipt_long</span>
          Solicitações de Reembolso
        </h2>
        <button onClick={() => setShowNewModal(true)} style={{ padding: '10px 22px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff', fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add_circle</span> Nova Solicitação
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        {[
          { label: 'Valor Pendente', value: fmtBRL(totalPending), icon: 'hourglass_top', color: '#f59e0b', sub: `${pending.length} ticket(s)` },
          { label: 'Total Reembolsado', value: fmtBRL(totalReimbursed), icon: 'check_circle', color: '#22c55e', sub: `acumulado` },
          { label: 'Finalizados', value: String(finalized.length), icon: 'verified', color: '#3b82f6', sub: 'ticket(s)' },
          { label: 'Total de Tickets', value: String(tickets.length), icon: 'confirmation_number', color: '#8b5cf6', sub: 'registrados' },
        ].map(kpi => (
          <div key={kpi.label} style={{ ...cardS, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: `${kpi.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: kpi.color }}>{kpi.icon}</span>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{kpi.label}</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{kpi.value}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{kpi.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Status Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {statusList.map(s => {
          const active = filterStatus === s; const cfg = STATUS_CONFIG[s];
          return (
            <button key={s} onClick={() => setFilterStatus(s)}
              style={{ padding: '8px 18px', borderRadius: 10, border: active ? 'none' : '1px solid var(--border)', background: active ? (cfg?.color || '#6366f1') : 'var(--card)', color: active ? '#fff' : 'var(--text-main)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit' }}>
              {s === 'todos' ? 'Todos' : cfg?.label} {s !== 'todos' && ` (${tickets.filter(t => t.status === s).length})`}
            </button>
          );
        })}
      </div>

      {/* Ticket List */}
      <div style={{ ...cardS, padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 32, animation: 'spin 1s linear infinite' }}>progress_activity</span>
            <div style={{ marginTop: 8 }}>Carregando tickets...</div>
          </div>
        ) : tickets.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 56, color: 'var(--border)' }}>inbox</span>
            <div style={{ marginTop: 12, fontSize: '1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Nenhuma solicitação encontrada</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                  {['#', 'Data', 'Solicitante', 'Unidade', 'Itens', 'Total', 'Reembolsado', 'Progresso', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 800, fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tickets.map(t => {
                  const cfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.pendente;
                  const pct = t.totalAmount > 0 ? Math.round((t.reimbursedAmount / t.totalAmount) * 100) : 0;
                  return (
                    <tr key={t.id} onClick={() => setSelectedTicket(t)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '12px 14px', fontWeight: 800, color: '#f97316' }}>#{t.ticketNumber}</td>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>{fmtDate(t.createdAt)}</td>
                      <td style={{ padding: '12px 14px', fontWeight: 600 }}>{t.requesterName}</td>
                      <td style={{ padding: '12px 14px' }}>{t.unit}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>{t.items.length}</td>
                      <td style={{ padding: '12px 14px', fontWeight: 800 }}>{fmtBRL(t.totalAmount)}</td>
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: '#22c55e' }}>{fmtBRL(t.reimbursedAmount)}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden', minWidth: 50 }}>
                            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: pct === 100 ? '#22c55e' : pct > 0 ? '#8b5cf6' : 'transparent', transition: 'width 0.3s' }} />
                          </div>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', minWidth: 30 }}>{pct}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8, background: cfg.bg, color: cfg.color, fontWeight: 700, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{cfg.icon}</span>{cfg.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <button onClick={e => { e.stopPropagation(); setSelectedTicket(t); }}
                          style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-main)', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit' }}>Ver</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNewModal && <NewTicketModal user={user} selectedUnit={selectedUnit} onClose={() => setShowNewModal(false)} onCreated={t => { setTickets(prev => [t, ...prev]); setShowNewModal(false); }} />}
      {selectedTicket && <TicketDetailModal ticket={selectedTicket} isAdmin={isAdmin} saving={saving} onClose={() => setSelectedTicket(null)} onStatusChange={handleStatusChange} onItemToggle={handleItemToggle} user={user} />}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   NEW TICKET MODAL
   ═══════════════════════════════════════════════════ */
function NewTicketModal({ user, selectedUnit, onClose, onCreated }: { user: any; selectedUnit?: string; onClose: () => void; onCreated: (t: Ticket) => void }) {
  const [items, setItems] = useState<{ name: string; price: string }[]>([{ name: '', price: '' }]);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const addItem = () => setItems(prev => [...prev, { name: '', price: '' }]);
  const removeItem = (i: number) => { if (items.length > 1) setItems(prev => prev.filter((_, idx) => idx !== i)); };
  const updateItem = (i: number, field: 'name' | 'price', val: string) => setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  const totalAmount = items.reduce((s, item) => { const v = parseFloat(item.price.replace(/\./g, '').replace(',', '.')); return s + (isNaN(v) ? 0 : v); }, 0);

  const processFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) { setError('Máximo 10MB'); continue; }
      const base64 = await fileToBase64(file);
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      setAttachments(prev => [...prev, { file, preview, base64 }]);
    }
    setError('');
  };

  const handleSubmit = async () => {
    if (!attachments.length) { setError('📎 Anexe pelo menos um comprovante.'); return; }
    const validItems = items.filter(i => i.name.trim());
    if (!validItems.length) { setError('Adicione pelo menos um produto.'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/reembolso', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterName: user?.name || 'Usuário', requesterId: user?.id || null, unit: selectedUnit || 'Barueri',
          items: validItems.map(i => ({ name: i.name.trim(), price: parseFloat(i.price.replace(/\./g, '').replace(',', '.')) || 0 })),
          attachments: attachments.map(a => ({ fileName: a.file.name, fileType: a.file.type, fileSize: a.file.size, fileData: a.base64 })),
        }),
      });
      if (res.ok) onCreated(await res.json());
      else { const d = await res.json(); setError(d.error || 'Erro ao enviar'); }
    } catch { setError('Erro de conexão'); } finally { setSaving(false); }
  };

  const overlayS: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
  const modalS: React.CSSProperties = { background: 'var(--card)', borderRadius: 20, width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' };
  const inputS: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontSize: '0.88rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' };

  return (
    <div style={overlayS} onClick={onClose}>
      <div style={modalS} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #f97316, #ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 22 }}>receipt_long</span>
            </div>
            <div><div style={{ fontWeight: 900, fontSize: '1.1rem' }}>Nova Solicitação de Reembolso</div><div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Preencha os dados e anexe o comprovante</div></div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 22 }}>✕</button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Upload */}
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>📎 Comprovante <span style={{ color: '#ef4444' }}>*</span></label>
            <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
              style={{ border: `2px dashed ${dragOver ? '#f97316' : attachments.length ? '#22c55e' : 'var(--border)'}`, borderRadius: 14, padding: 28, textAlign: 'center', cursor: 'pointer', background: dragOver ? 'rgba(249,115,22,0.06)' : 'transparent' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 40, color: attachments.length ? '#22c55e' : 'var(--text-secondary)' }}>{attachments.length ? 'task' : 'cloud_upload'}</span>
              <div style={{ marginTop: 8, fontWeight: 700, fontSize: '0.9rem' }}>{attachments.length ? `${attachments.length} arquivo(s)` : 'Clique ou arraste'}</div>
              <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple style={{ display: 'none' }} onChange={e => { if (e.target.files) processFiles(e.target.files); }} />
            </div>
            {attachments.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {attachments.map((att, i) => (
                  <div key={i} style={{ position: 'relative', width: 72, height: 72, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg)' }}>
                    {att.preview ? <img src={att.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="material-symbols-outlined" style={{ fontSize: 28, color: '#ef4444' }}>picture_as_pdf</span></div>}
                    <button onClick={e => { e.stopPropagation(); setAttachments(prev => prev.filter((_, idx) => idx !== i)); }} style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: '50%', background: 'rgba(239,68,68,0.9)', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Items */}
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>🛒 Produtos / Itens</label>
            {items.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <div style={{ flex: 2 }}>{i === 0 && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 3, fontWeight: 600 }}>Nome</div>}<input value={item.name} onChange={e => updateItem(i, 'name', e.target.value)} placeholder="Ex: Seringa..." style={inputS} /></div>
                <div style={{ flex: 1, minWidth: 120 }}>{i === 0 && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 3, fontWeight: 600 }}>Preço</div>}<input value={item.price} onChange={e => updateItem(i, 'price', e.target.value)} placeholder="0,00" style={inputS} inputMode="decimal" /></div>
                {items.length > 1 && <button onClick={() => removeItem(i)} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: i === 0 ? 18 : 0 }}><span className="material-symbols-outlined" style={{ fontSize: 16, color: '#ef4444' }}>delete</span></button>}
              </div>
            ))}
            <button onClick={addItem} style={{ marginTop: 4, padding: '8px 16px', borderRadius: 10, border: '1px dashed var(--border)', background: 'transparent', color: '#f97316', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, width: '100%', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span> Adicionar Item
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 700 }}>Total</span><span style={{ fontWeight: 900, fontSize: '1.3rem', color: '#f97316' }}>{fmtBRL(totalAmount)}</span>
          </div>
          {error && <div style={{ padding: '10px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 600, fontSize: '0.82rem' }}>{error}</div>}
        </div>
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={saving} style={{ flex: 2, padding: '12px 0', borderRadius: 12, border: 'none', background: saving ? 'var(--border)' : 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff', fontWeight: 800, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {saving ? <><span className="material-symbols-outlined" style={{ fontSize: 18, animation: 'spin 1s linear infinite' }}>progress_activity</span> Enviando...</> : <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>send</span> Enviar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   TICKET DETAIL MODAL
   ═══════════════════════════════════════════════════ */
function TicketDetailModal({ ticket, isAdmin, saving, onClose, onStatusChange, onItemToggle, user }: {
  ticket: Ticket; isAdmin: boolean; saving: boolean; user: any;
  onClose: () => void; onStatusChange: (id: string, status: string, notes?: string, proof?: any) => Promise<void>;
  onItemToggle: (itemId: string, isReimbursed: boolean) => Promise<void>;
}) {
  const [adminNotes, setAdminNotes] = useState('');
  const [viewingAttachment, setViewingAttachment] = useState<string | null>(null);
  const [attachmentData, setAttachmentData] = useState<{ fileType: string; fileData: string } | null>(null);
  const [loadingAtt, setLoadingAtt] = useState(false);
  const [payProofFile, setPayProofFile] = useState<File | null>(null);
  const [payProofPreview, setPayProofPreview] = useState<string | null>(null);
  const [payProofError, setPayProofError] = useState('');
  const [showPayProof, setShowPayProof] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const payProofRef = useRef<HTMLInputElement>(null);

  const cfg = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.pendente;
  const pct = ticket.totalAmount > 0 ? Math.round((ticket.reimbursedAmount / ticket.totalAmount) * 100) : 0;
  const pendingAmount = ticket.totalAmount - ticket.reimbursedAmount;

  const handlePayProofSelect = (file: File) => {
    if (file.size > 10 * 1024 * 1024) { setPayProofError('Máximo 10MB'); return; }
    setPayProofFile(file); setPayProofError('');
    setPayProofPreview(file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
  };

  const handleMarkAsPaid = async () => {
    if (!payProofFile) { setPayProofError('Anexe o comprovante'); return; }
    const base64 = await fileToBase64(payProofFile);
    await onStatusChange(ticket.id, 'pago', adminNotes, { fileName: payProofFile.name, fileType: payProofFile.type, fileData: base64 });
  };

  const viewAttachment = async (attId: string) => {
    setViewingAttachment(attId); setLoadingAtt(true);
    try { const res = await fetch(`/api/reembolso/attachment?id=${attId}`); if (res.ok) setAttachmentData(await res.json()); } catch {} finally { setLoadingAtt(false); }
  };

  const fetchAudit = async () => {
    setLoadingAudit(true);
    try { const res = await fetch(`/api/reembolso/audit?ticketId=${ticket.id}&userId=${user?.id}`); if (res.ok) setAuditLogs(await res.json()); } catch {} finally { setLoadingAudit(false); }
  };

  const overlayS: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
  const modalS: React.CSSProperties = { background: 'var(--card)', borderRadius: 20, width: '100%', maxWidth: 680, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' };

  const AUDIT_ICONS: Record<string, { icon: string; color: string }> = {
    ticket_criado: { icon: 'add_circle', color: '#22c55e' }, item_reembolsado: { icon: 'check_circle', color: '#22c55e' },
    item_desreembolsado: { icon: 'undo', color: '#f59e0b' }, ticket_editado: { icon: 'edit', color: '#3b82f6' },
    status_alterado: { icon: 'swap_horiz', color: '#8b5cf6' }, ticket_finalizado: { icon: 'verified', color: '#3b82f6' },
  };

  return (
    <div style={overlayS} onClick={onClose}>
      <div style={modalS} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 900, fontSize: '1.2rem', color: '#f97316' }}>Ticket #{ticket.ticketNumber}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 8, background: cfg.bg, color: cfg.color, fontWeight: 700, fontSize: '0.78rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{cfg.icon}</span>{cfg.label}
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>{ticket.requesterName} • {ticket.unit} • {fmtDate(ticket.createdAt)}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 22 }}>✕</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Financial Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#f97316' }}>{fmtBRL(ticket.totalAmount)}</div>
            </div>
            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#22c55e', textTransform: 'uppercase' }}>Reembolsado</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#22c55e' }}>{fmtBRL(ticket.reimbursedAmount)}</div>
            </div>
            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#f59e0b', textTransform: 'uppercase' }}>Pendente</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#f59e0b' }}>{fmtBRL(pendingAmount)}</div>
            </div>
          </div>

          {/* Progress Bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Progresso do Reembolso</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: pct === 100 ? '#22c55e' : '#8b5cf6' }}>{pct}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: pct === 100 ? 'linear-gradient(90deg, #22c55e, #16a34a)' : 'linear-gradient(90deg, #8b5cf6, #a78bfa)', transition: 'width 0.5s' }} />
            </div>
          </div>

          {/* Items with Checkboxes */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 8 }}>Itens do Reembolso</div>
            <div style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {ticket.items.map((item, i) => (
                <div key={item.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: i < ticket.items.length - 1 ? '1px solid var(--border)' : 'none', background: item.isReimbursed ? 'rgba(34,197,94,0.04)' : 'transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {isAdmin && ticket.status !== 'reprovado' && ticket.status !== 'finalizado' ? (
                      <button onClick={() => item.id && onItemToggle(item.id, !item.isReimbursed)}
                        style={{ width: 24, height: 24, borderRadius: 6, border: item.isReimbursed ? 'none' : '2px solid var(--border)', background: item.isReimbursed ? '#22c55e' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s' }}>
                        {item.isReimbursed && <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fff' }}>check</span>}
                      </button>
                    ) : (
                      <div style={{ width: 24, height: 24, borderRadius: 6, border: item.isReimbursed ? 'none' : '2px solid var(--border)', background: item.isReimbursed ? '#22c55e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {item.isReimbursed && <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fff' }}>check</span>}
                      </div>
                    )}
                    <div>
                      <span style={{ fontWeight: 600, textDecoration: item.isReimbursed ? 'line-through' : 'none', opacity: item.isReimbursed ? 0.7 : 1 }}>{item.name}</span>
                      {item.isReimbursed && item.reimbursedBy && (
                        <div style={{ fontSize: '0.68rem', color: '#22c55e', marginTop: 2 }}>
                          ✓ por {item.reimbursedBy} {item.reimbursedAt && `em ${fmtDate(item.reimbursedAt)}`}
                        </div>
                      )}
                    </div>
                  </div>
                  <span style={{ fontWeight: 800, color: item.isReimbursed ? '#22c55e' : '#f97316', whiteSpace: 'nowrap' }}>{fmtBRL(item.price)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg)', fontWeight: 900 }}>
                <span>Total</span><span style={{ color: '#f97316', fontSize: '1.1rem' }}>{fmtBRL(ticket.totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Attachments */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 8 }}>Anexos</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ticket.attachments.map(att => (
                <button key={att.id} onClick={() => viewAttachment(att.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: att.fileType.startsWith('image/') ? '#3b82f6' : '#ef4444' }}>{att.fileType.startsWith('image/') ? 'image' : 'picture_as_pdf'}</span>
                  {att.fileName} <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>({fmtBytes(att.fileSize)})</span>
                </button>
              ))}
            </div>
            {viewingAttachment && (
              <div style={{ marginTop: 12, borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--bg)' }}>
                {loadingAtt ? <div style={{ padding: 30, textAlign: 'center' }}><span className="material-symbols-outlined" style={{ fontSize: 28, animation: 'spin 1s linear infinite', color: 'var(--text-secondary)' }}>progress_activity</span></div>
                  : attachmentData?.fileType.startsWith('image/') ? <img src={`data:${attachmentData.fileType};base64,${attachmentData.fileData}`} alt="" style={{ width: '100%', maxHeight: 400, objectFit: 'contain' }} />
                    : attachmentData ? <div style={{ padding: 20, textAlign: 'center' }}><a href={`data:${attachmentData.fileType};base64,${attachmentData.fileData}`} download style={{ padding: '10px 20px', borderRadius: 10, background: '#3b82f6', color: '#fff', fontWeight: 700, textDecoration: 'none' }}>Baixar</a></div> : null}
              </div>
            )}
          </div>

          {/* Review History */}
          {ticket.reviewedBy && (
            <div style={{ padding: '14px 18px', borderRadius: 12, background: cfg.bg, border: `1px solid ${cfg.color}30` }}>
              <div style={{ fontWeight: 600 }}>{cfg.label} por <strong>{ticket.reviewedBy}</strong> em {ticket.reviewedAt ? fmtDate(ticket.reviewedAt) : '—'}</div>
              {ticket.adminNotes && <div style={{ marginTop: 6, fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>"{ticket.adminNotes}"</div>}
            </div>
          )}

          {ticket.finalizedAt && (
            <div style={{ padding: '14px 18px', borderRadius: 12, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#3b82f6' }}>verified</span>
              <div><div style={{ fontWeight: 800, color: '#3b82f6' }}>Reembolso Finalizado</div><div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Todos os itens foram reembolsados em {fmtDate(ticket.finalizedAt)}</div></div>
            </div>
          )}

          {/* Admin: Approve/Reject */}
          {isAdmin && ticket.status === 'pendente' && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 8 }}>Ação do Administrador</div>
              <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} placeholder="Observação (opcional)..." rows={2}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none', resize: 'none', boxSizing: 'border-box', marginBottom: 12 }} />
              <div style={{ display: 'flex', gap: 10 }}>
                <button disabled={saving} onClick={() => onStatusChange(ticket.id, 'reprovado', adminNotes)} style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: 'none', background: saving ? 'var(--border)' : '#ef4444', color: '#fff', fontWeight: 800, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>Reprovar</button>
              </div>
            </div>
          )}

          {/* Payment Proof */}
          {ticket.status === 'pago' && ticket.paymentProofName && (
            <div style={{ border: '1px solid #22c55e30', borderRadius: 14, padding: 18, background: 'rgba(34,197,94,0.04)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#22c55e', marginBottom: 8 }}>Comprovante de Pagamento</div>
              <button onClick={() => setShowPayProof(!showPayProof)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #22c55e40', background: 'rgba(34,197,94,0.08)', color: '#22c55e', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                {showPayProof ? 'Ocultar' : 'Visualizar'}
              </button>
              {showPayProof && <PaymentProofViewer ticketId={ticket.id} fileType={ticket.paymentProofType!} />}
            </div>
          )}

          {/* Audit Log (admin only) */}
          {isAdmin && (
            <div>
              <button onClick={() => { setShowAudit(!showAudit); if (!showAudit) fetchAudit(); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 10, border: '1px solid var(--border)', background: showAudit ? 'rgba(99,102,241,0.06)' : 'var(--bg)', color: showAudit ? '#6366f1' : 'var(--text-secondary)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit', width: '100%', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>history</span> {showAudit ? 'Ocultar' : 'Ver'} Histórico de Alterações
              </button>
              {showAudit && (
                <div style={{ marginTop: 10, maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {loadingAudit ? <div style={{ textAlign: 'center', padding: 20 }}><span className="material-symbols-outlined" style={{ fontSize: 24, animation: 'spin 1s linear infinite' }}>progress_activity</span></div>
                    : auditLogs.length === 0 ? <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Nenhum registro</div>
                      : auditLogs.map(log => {
                        const ai = AUDIT_ICONS[log.action] || { icon: 'info', color: '#64748b' };
                        return (
                          <div key={log.id} style={{ display: 'flex', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderLeft: `3px solid ${ai.color}` }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16, color: ai.color, marginTop: 2 }}>{ai.icon}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)' }}>{log.description || log.action}</div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                                {log.actorName} • {fmtDate(log.createdAt)}
                                {log.field && log.oldValue && <> • {log.field}: <span style={{ textDecoration: 'line-through', color: '#ef4444' }}>{log.oldValue}</span> → <span style={{ color: '#22c55e' }}>{log.newValue}</span></>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   PAYMENT PROOF VIEWER
   ═══════════════════════════════════════════════════ */
function PaymentProofViewer({ ticketId, fileType }: { ticketId: string; fileType: string }) {
  const [data, setData] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { try { const res = await fetch(`/api/reembolso/payment-proof?ticketId=${ticketId}`); if (res.ok) { const j = await res.json(); setData(j.fileData); } } catch {} finally { setLoading(false); } })(); }, [ticketId]);
  if (loading) return <div style={{ padding: 20, textAlign: 'center', marginTop: 10 }}><span className="material-symbols-outlined" style={{ fontSize: 24, animation: 'spin 1s linear infinite' }}>progress_activity</span></div>;
  if (!data) return <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-secondary)', marginTop: 8 }}>Não foi possível carregar</div>;
  if (fileType.startsWith('image/')) return <img src={`data:${fileType};base64,${data}`} alt="Comprovante" style={{ width: '100%', maxHeight: 400, objectFit: 'contain', borderRadius: 10, marginTop: 10 }} />;
  return <div style={{ padding: 16, textAlign: 'center', marginTop: 10 }}><a href={`data:${fileType};base64,${data}`} download="comprovante" style={{ padding: '10px 20px', borderRadius: 10, background: '#3b82f6', color: '#fff', fontWeight: 700, textDecoration: 'none' }}>Baixar</a></div>;
}

/* ─── Utility ─── */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const r = reader.result as string; resolve(r.split(',')[1]); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
