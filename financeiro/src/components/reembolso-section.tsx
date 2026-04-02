'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/* ─── Types ─── */
interface ReembolsoItemData { id?: string; name: string; price: number }
interface AttachmentMeta { id: string; fileName: string; fileType: string; fileSize: number; createdAt?: string }
interface Ticket {
  id: string; ticketNumber: number; requesterName: string; requesterId?: string | null;
  unit: string; status: string; totalAmount: number;
  adminNotes?: string | null; reviewedBy?: string | null; reviewedAt?: string | null;
  paymentProofName?: string | null; paymentProofType?: string | null; paidAt?: string | null;
  createdAt: string; items: ReembolsoItemData[]; attachments: AttachmentMeta[];
}
interface PendingAttachment { file: File; preview?: string; base64?: string }

/* ─── Helpers ─── */
const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtBytes = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pendente:  { label: 'Pendente',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: 'hourglass_top' },
  aprovado:  { label: 'Aprovado',  color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  icon: 'check_circle' },
  reprovado: { label: 'Reprovado', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  icon: 'cancel' },
  pago:      { label: 'Pago',      color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', icon: 'paid' },
};

/* ─── Main Component ─── */
export function ReembolsoSection({ selectedUnit }: { selectedUnit?: string }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('todos');
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [saving, setSaving] = useState(false);

  // Get current user from localStorage
  const getCurrentUser = () => {
    try { const u = localStorage.getItem('virtuosa_current_user'); return u ? JSON.parse(u) : null; } catch { return null; }
  };
  const user = getCurrentUser();
  const isAdmin = user?.role === 'ADMINISTRADOR';

  /* ── Fetch tickets ── */
  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'todos') params.set('status', filterStatus);
      if (selectedUnit && selectedUnit !== 'Todas') params.set('unit', selectedUnit);
      const res = await fetch(`/api/reembolso?${params}`);
      if (res.ok) setTickets(await res.json());
    } catch {} finally { setLoading(false); }
  }, [filterStatus, selectedUnit]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  /* ── KPI ── */
  const pending = tickets.filter(t => t.status === 'pendente');
  const approved = tickets.filter(t => t.status === 'aprovado' || t.status === 'pago');
  const totalPending = pending.reduce((s, t) => s + t.totalAmount, 0);
  const totalApproved = approved.reduce((s, t) => s + t.totalAmount, 0);

  /* ── Approve / Reject / Pay ── */
  const handleStatusChange = async (ticketId: string, status: string, adminNotes?: string, paymentProof?: { fileName: string; fileType: string; fileData: string } | null) => {
    setSaving(true);
    try {
      const res = await fetch('/api/reembolso', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, status, adminNotes, reviewedBy: user?.name || 'Admin', paymentProof: paymentProof || undefined }),
      });
      if (res.ok) {
        const updated = await res.json();
        setTickets(prev => prev.map(t => t.id === ticketId ? updated : t));
        if (selectedTicket?.id === ticketId) setSelectedTicket(updated);
      }
    } catch {} finally { setSaving(false); }
  };

  /* ── Styles ── */
  const cardS: React.CSSProperties = { background: 'var(--card)', borderRadius: 'var(--radius-lg, 16px)', border: '1px solid var(--border)', padding: 20 };
  const btnPrimary: React.CSSProperties = { padding: '10px 22px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff', fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#f97316' }}>receipt_long</span>
          Solicitações de Reembolso
        </h2>
        <button onClick={() => setShowNewModal(true)} style={btnPrimary}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add_circle</span>
          Nova Solicitação
        </button>
      </div>

      {/* ── KPI Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        {[
          { label: 'Total Pendente', value: fmtBRL(totalPending), icon: 'hourglass_top', color: '#f59e0b', sub: `${pending.length} ticket(s)` },
          { label: 'Total Aprovado', value: fmtBRL(totalApproved), icon: 'check_circle', color: '#22c55e', sub: `${approved.length} ticket(s)` },
          { label: 'Total de Tickets', value: String(tickets.length), icon: 'confirmation_number', color: '#8b5cf6', sub: 'registrados' },
        ].map(kpi => (
          <div key={kpi.label} style={{ ...cardS, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: `${kpi.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: kpi.color }}>{kpi.icon}</span>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{kpi.label}</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 900 }}>{kpi.value}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{kpi.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Status Filters ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {['todos', 'pendente', 'aprovado', 'reprovado', 'pago'].map(s => {
          const active = filterStatus === s;
          const cfg = STATUS_CONFIG[s];
          return (
            <button key={s} onClick={() => setFilterStatus(s)}
              style={{ padding: '8px 18px', borderRadius: 10, border: active ? 'none' : '1px solid var(--border)', background: active ? (cfg?.color || '#6366f1') : 'var(--card)', color: active ? '#fff' : 'var(--text-main)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s' }}>
              {s === 'todos' ? 'Todos' : cfg?.label}
              {s !== 'todos' && ` (${tickets.filter(t => t.status === s).length})`}
            </button>
          );
        })}
      </div>

      {/* ── Ticket List ── */}
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
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 4 }}>Clique em "Nova Solicitação" para abrir um ticket</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                  {['#', 'Data', 'Solicitante', 'Unidade', 'Itens', 'Valor Total', 'Status', 'Ações'].map(h => (
                    <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 800, fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tickets.map(t => {
                  const cfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.pendente;
                  return (
                    <tr key={t.id} onClick={() => setSelectedTicket(t)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '12px 14px', fontWeight: 800, color: '#f97316' }}>#{t.ticketNumber}</td>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>{fmtDate(t.createdAt)}</td>
                      <td style={{ padding: '12px 14px', fontWeight: 600 }}>{t.requesterName}</td>
                      <td style={{ padding: '12px 14px' }}>{t.unit}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>{t.items.length}</td>
                      <td style={{ padding: '12px 14px', fontWeight: 800 }}>{fmtBRL(t.totalAmount)}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 8, background: cfg.bg, color: cfg.color, fontWeight: 700, fontSize: '0.78rem' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{cfg.icon}</span>
                          {cfg.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <button onClick={e => { e.stopPropagation(); setSelectedTicket(t); }}
                          style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-main)', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                          Ver
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── New Ticket Modal ── */}
      {showNewModal && (
        <NewTicketModal
          user={user}
          selectedUnit={selectedUnit}
          onClose={() => setShowNewModal(false)}
          onCreated={(ticket) => { setTickets(prev => [ticket, ...prev]); setShowNewModal(false); }}
        />
      )}

      {/* ── Detail / Approval Modal ── */}
      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          isAdmin={isAdmin}
          saving={saving}
          onClose={() => setSelectedTicket(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   NEW TICKET MODAL
   ═══════════════════════════════════════════════════════════════════ */
function NewTicketModal({ user, selectedUnit, onClose, onCreated }: {
  user: any; selectedUnit?: string;
  onClose: () => void; onCreated: (t: Ticket) => void;
}) {
  const [items, setItems] = useState<{ name: string; price: string }[]>([{ name: '', price: '' }]);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const addItem = () => setItems(prev => [...prev, { name: '', price: '' }]);
  const removeItem = (i: number) => { if (items.length > 1) setItems(prev => prev.filter((_, idx) => idx !== i)); };
  const updateItem = (i: number, field: 'name' | 'price', val: string) => {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  };

  const totalAmount = items.reduce((s, item) => {
    const v = parseFloat(item.price.replace(/\./g, '').replace(',', '.'));
    return s + (isNaN(v) ? 0 : v);
  }, 0);

  /* File handling */
  const processFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    const maxSize = 10 * 1024 * 1024; // 10MB

    for (const file of arr) {
      if (!validTypes.includes(file.type) && !file.type.startsWith('image/')) {
        setError(`Tipo não suportado: ${file.type}. Use imagens ou PDF.`);
        continue;
      }
      if (file.size > maxSize) {
        setError(`Arquivo muito grande: ${file.name}. Máximo 10MB.`);
        continue;
      }
      const base64 = await fileToBase64(file);
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      setAttachments(prev => [...prev, { file, preview, base64 }]);
    }
    setError('');
  };

  const removeAttachment = (i: number) => setAttachments(prev => prev.filter((_, idx) => idx !== i));

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files);
  };

  /* Submit */
  const handleSubmit = async () => {
    if (!attachments.length) { setError('📎 Anexo obrigatório! Adicione pelo menos um comprovante.'); return; }
    const validItems = items.filter(i => i.name.trim());
    if (!validItems.length) { setError('Adicione pelo menos um produto.'); return; }
    for (const item of validItems) {
      if (!item.name.trim()) { setError('Nome do produto é obrigatório.'); return; }
    }

    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/reembolso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterName: user?.name || 'Usuário',
          requesterId: user?.id || null,
          unit: selectedUnit || 'Barueri',
          items: validItems.map(i => ({
            name: i.name.trim(),
            price: parseFloat(i.price.replace(/\./g, '').replace(',', '.')) || 0,
          })),
          attachments: attachments.map(a => ({
            fileName: a.file.name,
            fileType: a.file.type,
            fileSize: a.file.size,
            fileData: a.base64,
          })),
        }),
      });
      if (res.ok) onCreated(await res.json());
      else { const d = await res.json(); setError(d.error || 'Erro ao enviar'); }
    } catch { setError('Erro de conexão'); }
    finally { setSaving(false); }
  };

  const overlayS: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
  const modalS: React.CSSProperties = { background: 'var(--card)', borderRadius: 20, width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' };
  const inputS: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontSize: '0.88rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' };
  const labelS: React.CSSProperties = { display: 'block', marginBottom: 4, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' };

  return (
    <div style={overlayS} onClick={onClose}>
      <div style={modalS} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #f97316, #ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 22 }}>receipt_long</span>
            </div>
            <div>
              <div style={{ fontWeight: 900, fontSize: '1.1rem' }}>Nova Solicitação de Reembolso</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Preencha os dados e anexe o comprovante</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 22 }}>✕</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Upload Area */}
          <div>
            <label style={labelS}>
              📎 Comprovante / Anexo <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div ref={dropRef}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? '#f97316' : attachments.length ? '#22c55e' : 'var(--border)'}`,
                borderRadius: 14, padding: 28, textAlign: 'center', cursor: 'pointer',
                background: dragOver ? 'rgba(249,115,22,0.06)' : attachments.length ? 'rgba(34,197,94,0.04)' : 'transparent',
                transition: 'all 0.2s',
              }}>
              <span className="material-symbols-outlined" style={{ fontSize: 40, color: attachments.length ? '#22c55e' : 'var(--text-secondary)' }}>
                {attachments.length ? 'task' : 'cloud_upload'}
              </span>
              <div style={{ marginTop: 8, fontWeight: 700, fontSize: '0.9rem' }}>
                {attachments.length ? `${attachments.length} arquivo(s) anexado(s)` : 'Clique ou arraste o comprovante aqui'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                Imagens (JPG, PNG) ou PDF • Máx. 10MB
              </div>
              <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple
                style={{ display: 'none' }} onChange={e => { if (e.target.files) processFiles(e.target.files); }} />
            </div>

            {/* Attachment previews */}
            {attachments.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {attachments.map((att, i) => (
                  <div key={i} style={{ position: 'relative', width: 72, height: 72, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg)' }}>
                    {att.preview ? (
                      <img src={att.preview} alt={att.file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#ef4444' }}>picture_as_pdf</span>
                      </div>
                    )}
                    <button onClick={e => { e.stopPropagation(); removeAttachment(i); }}
                      style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: '50%', background: 'rgba(239,68,68,0.9)', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>
                      ✕
                    </button>
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '0.55rem', padding: '2px 4px', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {fmtBytes(att.file.size)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Products */}
          <div>
            <label style={labelS}>🛒 Produtos / Itens</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ flex: 2 }}>
                    {i === 0 && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 3, fontWeight: 600 }}>Nome do Produto</div>}
                    <input value={item.name} onChange={e => updateItem(i, 'name', e.target.value)}
                      placeholder="Ex: Seringa, Lençol TNT..." style={inputS} />
                  </div>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    {i === 0 && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 3, fontWeight: 600 }}>Preço (R$)</div>}
                    <input value={item.price} onChange={e => updateItem(i, 'price', e.target.value)}
                      placeholder="0,00" style={inputS} inputMode="decimal" />
                  </div>
                  {items.length > 1 && (
                    <button onClick={() => removeItem(i)}
                      style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: i === 0 ? 18 : 0 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#ef4444' }}>delete</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addItem}
              style={{ marginTop: 10, padding: '8px 16px', borderRadius: 10, border: '1px dashed var(--border)', background: 'transparent', color: '#f97316', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, width: '100%', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
              Adicionar Item
            </button>
          </div>

          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Valor Total da Solicitação</span>
            <span style={{ fontWeight: 900, fontSize: '1.3rem', color: '#f97316' }}>{fmtBRL(totalAmount)}</span>
          </div>

          {/* Error */}
          {error && (
            <div style={{ padding: '10px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 600, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>error</span>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text-main)', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving}
            style={{ flex: 2, padding: '12px 0', borderRadius: 12, border: 'none', background: saving ? 'var(--border)' : 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff', fontWeight: 800, fontSize: '0.88rem', cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {saving ? (
              <><span className="material-symbols-outlined" style={{ fontSize: 18, animation: 'spin 1s linear infinite' }}>progress_activity</span> Enviando...</>
            ) : (
              <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>send</span> Enviar Solicitação</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   TICKET DETAIL / APPROVAL MODAL
   ═══════════════════════════════════════════════════════════════════ */
function TicketDetailModal({ ticket, isAdmin, saving, onClose, onStatusChange }: {
  ticket: Ticket; isAdmin: boolean; saving: boolean;
  onClose: () => void; onStatusChange: (id: string, status: string, notes?: string, paymentProof?: { fileName: string; fileType: string; fileData: string } | null) => Promise<void>;
}) {
  const [adminNotes, setAdminNotes] = useState('');
  const [viewingAttachment, setViewingAttachment] = useState<string | null>(null);
  const [attachmentData, setAttachmentData] = useState<{ fileType: string; fileData: string } | null>(null);
  const [loadingAtt, setLoadingAtt] = useState(false);
  const [payProofFile, setPayProofFile] = useState<File | null>(null);
  const [payProofPreview, setPayProofPreview] = useState<string | null>(null);
  const [payProofError, setPayProofError] = useState('');
  const [showPayProof, setShowPayProof] = useState(false);
  const payProofRef = useRef<HTMLInputElement>(null);

  const handlePayProofSelect = (file: File) => {
    const valid = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!valid.includes(file.type) && !file.type.startsWith('image/')) { setPayProofError('Use imagem ou PDF'); return; }
    if (file.size > 10 * 1024 * 1024) { setPayProofError('Máximo 10MB'); return; }
    setPayProofFile(file);
    setPayProofError('');
    if (file.type.startsWith('image/')) setPayProofPreview(URL.createObjectURL(file));
    else setPayProofPreview(null);
  };

  const handleMarkAsPaid = async () => {
    if (!payProofFile) { setPayProofError('Anexe o comprovante de pagamento para dar baixa'); return; }
    const base64 = await fileToBase64(payProofFile);
    await onStatusChange(ticket.id, 'pago', adminNotes, { fileName: payProofFile.name, fileType: payProofFile.type, fileData: base64 });
  };

  const cfg = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.pendente;

  const viewAttachment = async (attId: string) => {
    setViewingAttachment(attId);
    setLoadingAtt(true);
    try {
      const res = await fetch(`/api/reembolso/attachment?id=${attId}`);
      if (res.ok) setAttachmentData(await res.json());
    } catch {} finally { setLoadingAtt(false); }
  };

  const overlayS: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 };
  const modalS: React.CSSProperties = { background: 'var(--card)', borderRadius: 20, width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' };

  return (
    <div style={overlayS} onClick={onClose}>
      <div style={modalS} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 900, fontSize: '1.2rem', color: '#f97316' }}>Ticket #{ticket.ticketNumber}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 8, background: cfg.bg, color: cfg.color, fontWeight: 700, fontSize: '0.78rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{cfg.icon}</span>
                {cfg.label}
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>
              {ticket.requesterName} • {ticket.unit} • {fmtDate(ticket.createdAt)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 22 }}>✕</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Items */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: 8 }}>Produtos / Itens</div>
            <div style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {ticket.items.map((item, i) => (
                <div key={item.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: i < ticket.items.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-secondary)' }}>shopping_bag</span>
                    <span style={{ fontWeight: 600 }}>{item.name}</span>
                  </div>
                  <span style={{ fontWeight: 800, color: '#f97316' }}>{fmtBRL(item.price)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg)', fontWeight: 900 }}>
                <span>Total</span>
                <span style={{ color: '#f97316', fontSize: '1.1rem' }}>{fmtBRL(ticket.totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Attachments */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: 8 }}>Anexos / Comprovantes</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ticket.attachments.map(att => (
                <button key={att.id} onClick={() => viewAttachment(att.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: att.fileType.startsWith('image/') ? '#3b82f6' : '#ef4444' }}>
                    {att.fileType.startsWith('image/') ? 'image' : 'picture_as_pdf'}
                  </span>
                  {att.fileName}
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>({fmtBytes(att.fileSize)})</span>
                </button>
              ))}
            </div>

            {/* Attachment Viewer */}
            {viewingAttachment && (
              <div style={{ marginTop: 12, borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--bg)' }}>
                {loadingAtt ? (
                  <div style={{ padding: 30, textAlign: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 28, animation: 'spin 1s linear infinite', color: 'var(--text-secondary)' }}>progress_activity</span>
                  </div>
                ) : attachmentData?.fileType.startsWith('image/') ? (
                  <img src={`data:${attachmentData.fileType};base64,${attachmentData.fileData}`} alt="Comprovante" style={{ width: '100%', maxHeight: 400, objectFit: 'contain' }} />
                ) : attachmentData ? (
                  <div style={{ padding: 20, textAlign: 'center' }}>
                    <a href={`data:${attachmentData.fileType};base64,${attachmentData.fileData}`} download
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 10, background: '#3b82f6', color: '#fff', fontWeight: 700, textDecoration: 'none', fontSize: '0.88rem' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
                      Baixar Arquivo
                    </a>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Review History */}
          {ticket.reviewedBy && (
            <div style={{ padding: '14px 18px', borderRadius: 12, background: cfg.bg, border: `1px solid ${cfg.color}30` }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: cfg.color, letterSpacing: '0.05em', marginBottom: 6 }}>
                Decisão
              </div>
              <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                {cfg.label} por <strong>{ticket.reviewedBy}</strong> em {ticket.reviewedAt ? fmtDate(ticket.reviewedAt) : '—'}
              </div>
              {ticket.adminNotes && (
                <div style={{ marginTop: 6, fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                  "{ticket.adminNotes}"
                </div>
              )}
            </div>
          )}

          {/* Admin Actions */}
          {isAdmin && ticket.status === 'pendente' && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: 8 }}>
                Ação do Administrador
              </div>
              <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
                placeholder="Observação (opcional)..." rows={2}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none', resize: 'none', boxSizing: 'border-box', marginBottom: 12 }} />
              <div style={{ display: 'flex', gap: 10 }}>
                <button disabled={saving} onClick={() => onStatusChange(ticket.id, 'aprovado', adminNotes)}
                  style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: 'none', background: saving ? 'var(--border)' : 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', fontWeight: 800, fontSize: '0.88rem', cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span>
                  Aprovar
                </button>
                <button disabled={saving} onClick={() => onStatusChange(ticket.id, 'reprovado', adminNotes)}
                  style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: 'none', background: saving ? 'var(--border)' : 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', fontWeight: 800, fontSize: '0.88rem', cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>cancel</span>
                  Reprovar
                </button>
              </div>
            </div>
          )}

          {/* Admin: Mark as Paid — with required payment proof upload */}
          {isAdmin && ticket.status === 'aprovado' && (
            <div style={{ border: '1px solid #3b82f630', borderRadius: 14, padding: 18, background: 'rgba(59,130,246,0.04)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#3b82f6', letterSpacing: '0.05em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>paid</span>
                Dar Baixa — Comprovante de Pagamento
              </div>

              {/* Upload area */}
              <div onClick={() => payProofRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) handlePayProofSelect(e.dataTransfer.files[0]); }}
                style={{ border: `2px dashed ${payProofFile ? '#22c55e' : '#3b82f680'}`, borderRadius: 12, padding: 18, textAlign: 'center', cursor: 'pointer', background: payProofFile ? 'rgba(34,197,94,0.04)' : 'transparent', transition: 'all 0.2s', marginBottom: 12 }}>
                {payProofFile ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    {payProofPreview ? (
                      <img src={payProofPreview} alt="Preview" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />
                    ) : (
                      <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#ef4444' }}>picture_as_pdf</span>
                    )}
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{payProofFile.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{fmtBytes(payProofFile.size)} • Clique para trocar</div>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#3b82f6' }}>cloud_upload</span>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', marginTop: 4 }}>Anexar comprovante de pagamento</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Imagem ou PDF • Obrigatório para dar baixa</div>
                  </>
                )}
                <input ref={payProofRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
                  onChange={e => { if (e.target.files?.[0]) handlePayProofSelect(e.target.files[0]); }} />
              </div>

              {payProofError && (
                <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 600, fontSize: '0.78rem', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>error</span>
                  {payProofError}
                </div>
              )}

              <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
                placeholder="Observação sobre o pagamento (opcional)..." rows={2}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none', resize: 'none', boxSizing: 'border-box', marginBottom: 12 }} />

              <button disabled={saving} onClick={handleMarkAsPaid}
                style={{ width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', background: saving ? 'var(--border)' : 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', fontWeight: 800, fontSize: '0.88rem', cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {saving ? (
                  <><span className="material-symbols-outlined" style={{ fontSize: 18, animation: 'spin 1s linear infinite' }}>progress_activity</span> Processando...</>
                ) : (
                  <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>paid</span> Confirmar Pagamento e Dar Baixa</>
                )}
              </button>
            </div>
          )}

          {/* Payment Proof — visible to everyone when status is pago */}
          {ticket.status === 'pago' && ticket.paymentProofName && (
            <div style={{ border: '1px solid #22c55e30', borderRadius: 14, padding: 18, background: 'rgba(34,197,94,0.04)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#22c55e', letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>verified</span>
                Comprovante de Pagamento
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: ticket.paymentProofType?.startsWith('image/') ? '#3b82f6' : '#ef4444' }}>
                    {ticket.paymentProofType?.startsWith('image/') ? 'image' : 'picture_as_pdf'}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{ticket.paymentProofName}</span>
                </div>
                {ticket.paidAt && <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Pago em {fmtDate(ticket.paidAt)}</span>}
              </div>
              <button onClick={() => setShowPayProof(!showPayProof)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #22c55e40', background: 'rgba(34,197,94,0.08)', color: '#22c55e', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{showPayProof ? 'visibility_off' : 'visibility'}</span>
                {showPayProof ? 'Ocultar' : 'Visualizar Comprovante'}
              </button>
              {showPayProof && (
                <PaymentProofViewer ticketId={ticket.id} fileType={ticket.paymentProofType!} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PAYMENT PROOF VIEWER — fetches proof from API and renders
   ═══════════════════════════════════════════════════════════════════ */
function PaymentProofViewer({ ticketId, fileType }: { ticketId: string; fileType: string }) {
  const [data, setData] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/reembolso/payment-proof?ticketId=${ticketId}`);
        if (res.ok) {
          const json = await res.json();
          setData(json.fileData);
        }
      } catch {} finally { setLoading(false); }
    })();
  }, [ticketId]);

  if (loading) return (
    <div style={{ padding: 20, textAlign: 'center', marginTop: 10 }}>
      <span className="material-symbols-outlined" style={{ fontSize: 24, animation: 'spin 1s linear infinite', color: 'var(--text-secondary)' }}>progress_activity</span>
    </div>
  );

  if (!data) return <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: 8 }}>Não foi possível carregar o comprovante</div>;

  if (fileType.startsWith('image/')) {
    return <img src={`data:${fileType};base64,${data}`} alt="Comprovante de pagamento" style={{ width: '100%', maxHeight: 400, objectFit: 'contain', borderRadius: 10, marginTop: 10 }} />;
  }

  return (
    <div style={{ padding: 16, textAlign: 'center', marginTop: 10 }}>
      <a href={`data:${fileType};base64,${data}`} download="comprovante-pagamento"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 10, background: '#3b82f6', color: '#fff', fontWeight: 700, textDecoration: 'none', fontSize: '0.88rem' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
        Baixar Comprovante
      </a>
    </div>
  );
}

/* ─── Utility ─── */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
