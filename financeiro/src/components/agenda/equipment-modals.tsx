import React, { useState, useRef, useEffect } from 'react';
import type { Aparelho } from '@/app/agenda/aparelhos/page';

interface Props {
  showManageModal: boolean;
  setShowManageModal: (v: boolean) => void;
  selectedDay: Date | null;
  setSelectedDay: (d: Date | null) => void;
  aparelhos: Aparelho[];
  refresh: () => void;
}

/* ─── Custom Dropdown ─── */
function CustomDropdown({ value, onChange, options, placeholder, icon }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; color?: string }[];
  placeholder: string;
  icon?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', height: 52, display: 'flex', alignItems: 'center', gap: 12,
          padding: '0 16px', borderRadius: 12,
          background: 'rgba(0,0,0,0.25)', border: open ? '1.5px solid var(--primary)' : '1px solid var(--border)',
          color: selected ? '#fff' : 'var(--text-muted)', fontSize: '0.95rem', fontWeight: 500,
          cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left',
        }}
      >
        {icon && <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)' }}>{icon}</span>}
        {selected?.color && <div style={{ width: 12, height: 12, borderRadius: '50%', background: selected.color, flexShrink: 0 }} />}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 100,
          background: '#1e1e2e', border: '1px solid var(--border)', borderRadius: 12,
          boxShadow: '0 12px 32px rgba(0,0,0,0.5)', overflow: 'hidden',
          animation: 'fadeIn 0.15s ease-out',
        }}>
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{
                width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
                background: value === opt.value ? 'rgba(230,0,126,0.08)' : 'transparent',
                border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)',
                color: value === opt.value ? 'var(--primary)' : '#fff',
                fontSize: '0.95rem', fontWeight: value === opt.value ? 700 : 500,
                cursor: 'pointer', transition: 'background 0.15s', textAlign: 'left',
              }}
              onMouseEnter={e => { if (value !== opt.value) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
              onMouseLeave={e => { if (value !== opt.value) e.currentTarget.style.background = 'transparent'; }}
            >
              {opt.color && <div style={{ width: 12, height: 12, borderRadius: '50%', background: opt.color, boxShadow: `0 0 6px ${opt.color}60`, flexShrink: 0 }} />}
              {value === opt.value && <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--primary)' }}>check</span>}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Months ─── */
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function EquipmentModals({ showManageModal, setShowManageModal, selectedDay, setSelectedDay, aparelhos, refresh }: Props) {
  const [currentUser, setCurrentUser] = React.useState<any>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('virtuosa_user');
      if (raw) setCurrentUser(JSON.parse(raw));
    } catch {}
  }, []);

  const allUnits = ['SCS', 'SBC', 'Osasco'];
  const [newApName, setNewApName] = useState('');
  const [newApColor, setNewApColor] = useState('#e6007e');
  const [isSaving, setIsSaving] = useState(false);

  const handleAddAparelho = async () => {
    if (!newApName.trim()) return;
    setIsSaving(true);
    try {
      await fetch('/api/agenda/aparelhos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newApName, color: newApColor })
      });
      setNewApName('');
      setNewApColor('#e6007e');
      refresh();
    } finally { setIsSaving(false); }
  };

  const handleDeleteAparelho = async (id: string) => {
    if (!confirm('Deseja excluir este aparelho e todo o seu histórico de trânsito?')) return;
    try {
      await fetch(`/api/agenda/aparelhos?id=${id}`, { method: 'DELETE' });
      refresh();
    } catch (err) { console.error(err); }
  };

  const [allocUnit, setAllocUnit] = useState(allUnits[0] || 'SCS');
  const [allocAparelho, setAllocAparelho] = useState('');

  const handleAddAlocacao = async () => {
    if (!selectedDay || !allocAparelho || !allocUnit || !currentUser) return;
    setIsSaving(true);
    try {
      const dateIso = new Date(Date.UTC(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate())).toISOString();
      await fetch('/api/agenda/aparelhos/alocacao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aparelhoId: allocAparelho, unit: allocUnit, date: dateIso, userId: currentUser.id, userName: currentUser.name })
      });
      setAllocAparelho('');
      refresh();
    } finally { setIsSaving(false); }
  };

  const handleRemoveAlocacao = async (aparelhoId: string, createdById?: string) => {
    if (!selectedDay || !currentUser) return;
    const isAdmin = currentUser.role === 'ADMINISTRADOR' || (currentUser.permissions as any)?.admin;
    if (createdById && createdById !== currentUser.id && !isAdmin) {
      alert('Você não tem permissão para remover esta alocação. Apenas o criador ou um ADM pode excluí-la.');
      return;
    }
    try {
      const dateIso = new Date(Date.UTC(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate())).toISOString();
      await fetch(`/api/agenda/aparelhos/alocacao?aparelhoId=${aparelhoId}&date=${dateIso}&userId=${currentUser.id}`, { method: 'DELETE' });
      refresh();
    } catch (err) { console.error(err); }
  };

  const dayAllocs = selectedDay
    ? aparelhos.map(ap => {
        const dateIso = new Date(Date.UTC(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate())).toISOString().split('T')[0];
        const match = ap.alocacoes.find(a => a.date.startsWith(dateIso));
        return match ? { aparelho: ap, unit: match.unit, userId: (match as any).userId, userName: (match as any).userName } : null;
      }).filter(Boolean) as { aparelho: Aparelho; unit: string; userId?: string; userName?: string }[]
    : [];

  /* ─── Shared modal shell style ─── */
  const modalShell: React.CSSProperties = {
    maxWidth: 520, padding: 0, borderRadius: 20,
    boxShadow: '0 24px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
    overflow: 'hidden',
  };

  const headerBar: React.CSSProperties = {
    background: 'linear-gradient(135deg, rgba(230,0,126,0.12) 0%, rgba(99,102,241,0.08) 100%)',
    padding: '24px 28px', borderBottom: '1px solid var(--border)',
  };

  const bodyPad: React.CSSProperties = { padding: '24px 28px' };

  const sectionTitle: React.CSSProperties = {
    fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12,
  };

  const divider: React.CSSProperties = {
    height: 1, background: 'var(--border)', margin: '24px 0',
  };

  const COLORS = ['#e6007e', '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#6366f1'];

  return (
    <>
      {/* ═══════════════════ Manage Modal ═══════════════════ */}
      {showManageModal && (
        <div className="modal-overlay" onClick={() => setShowManageModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={modalShell}>
            {/* Header */}
            <div style={headerBar}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--primary)' }}>precision_manufacturing</span>
                    <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0 }}>Cadastrar Aparelho</h2>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)' }}>Crie aparelhos e associe cores de identificação.</p>
                </div>
                <button onClick={() => setShowManageModal(false)} style={{ background: 'rgba(255,255,255,0.06)', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={bodyPad}>
              {/* Form */}
              <div style={sectionTitle}>Nova Máquina</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Nome</label>
                  <input
                    type="text"
                    placeholder="Ex: Laser Lavieen"
                    style={{ width: '100%', height: 52, background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border)', padding: '0 16px', borderRadius: 12, fontSize: '1rem', color: '#fff', outline: 'none', transition: 'border-color 0.2s' }}
                    value={newApName}
                    onChange={e => setNewApName(e.target.value)}
                    onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Cor</label>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewApColor(c)}
                        style={{
                          width: 38, height: 38, borderRadius: '50%',
                          border: newApColor === c ? '3px solid #fff' : '2px solid rgba(255,255,255,0.1)',
                          background: c, cursor: 'pointer',
                          outline: newApColor === c ? `2px solid ${c}` : 'none',
                          boxShadow: newApColor === c ? `0 0 14px ${c}80` : 'none',
                          transition: 'all 0.2s', padding: 0,
                        }}
                      />
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleAddAparelho}
                  disabled={isSaving || !newApName.trim()}
                  className="btn-primary"
                  style={{ height: 50, width: '100%', borderRadius: 12, fontWeight: 700, fontSize: '1rem', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add_circle</span>
                  Adicionar Aparelho
                </button>
              </div>

              <div style={divider} />

              {/* List */}
              <div style={sectionTitle}>Aparelhos Cadastrados ({aparelhos.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto', paddingRight: 4 }}>
                {aparelhos.length === 0 ? (
                  <div style={{ padding: '32px 0', textAlign: 'center', background: 'rgba(0,0,0,0.12)', borderRadius: 12, border: '1px dashed var(--border)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 36, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>inventory_2</span>
                    <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>Nenhuma máquina cadastrada.</p>
                  </div>
                ) : aparelhos.map(ap => (
                  <div
                    key={ap.id}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid var(--border)', borderLeft: `4px solid ${ap.color}`, transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 14, height: 14, borderRadius: '50%', background: ap.color, boxShadow: `0 0 8px ${ap.color}80` }} />
                      <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{ap.name}</span>
                    </div>
                    <button onClick={() => handleDeleteAparelho(ap.id)} style={{ background: 'rgba(255,77,77,0.08)', border: '1px solid rgba(255,77,77,0.15)', color: '#ff4d4d', cursor: 'pointer', width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} title="Excluir">
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ Day Modal ═══════════════════ */}
      {selectedDay && (
        <div className="modal-overlay" onClick={() => setSelectedDay(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={modalShell}>
            {/* Header */}
            <div style={headerBar}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--primary)' }}>event</span>
                    <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0 }}>
                      {selectedDay.getDate().toString().padStart(2, '0')} de {MESES[selectedDay.getMonth()]} de {selectedDay.getFullYear()}
                    </h2>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                    {DIAS_SEMANA[selectedDay.getDay()]} — Controle de trânsito de aparelhos
                  </p>
                </div>
                <button onClick={() => setSelectedDay(null)} style={{ background: 'rgba(255,255,255,0.06)', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={bodyPad}>
              {/* Allocation Form */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={sectionTitle as any}>Adicionar Alocação</div>
                <button
                  onClick={() => setShowManageModal(true)}
                  style={{ background: 'rgba(230,0,126,0.08)', border: '1px solid rgba(230,0,126,0.2)', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, padding: '6px 14px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(230,0,126,0.14)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(230,0,126,0.08)'}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                  Novo Aparelho
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Aparelho</label>
                  <CustomDropdown
                    value={allocAparelho}
                    onChange={setAllocAparelho}
                    options={aparelhos.map(ap => ({ value: ap.id, label: ap.name, color: ap.color }))}
                    placeholder="Escolha um aparelho"
                    icon="precision_manufacturing"
                  />
                </div>

                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Unidade Destino</label>
                    <CustomDropdown
                      value={allocUnit}
                      onChange={setAllocUnit}
                      options={allUnits.map(u => ({ value: u, label: u }))}
                      placeholder="Selecione a unidade"
                      icon="location_on"
                    />
                  </div>
                  <button
                    onClick={handleAddAlocacao}
                    disabled={isSaving || !allocAparelho}
                    className="btn-primary"
                    style={{ height: 52, padding: '0 28px', borderRadius: 12, fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>check_circle</span>
                    Salvar
                  </button>
                </div>
              </div>

              <div style={divider} />

              {/* Allocations List */}
              <div style={sectionTitle}>Aparelhos Neste Dia ({dayAllocs.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto', paddingRight: 4 }}>
                {dayAllocs.length === 0 ? (
                  <div style={{ padding: '32px 0', textAlign: 'center', background: 'rgba(0,0,0,0.12)', borderRadius: 12, border: '1px dashed var(--border)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 36, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>event_busy</span>
                    <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>Nenhum aparelho alocado neste dia.</p>
                  </div>
                ) : dayAllocs.map(a => (
                  <div
                    key={a.aparelho.id}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid var(--border)', borderLeft: `4px solid ${a.aparelho.color}`, transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: a.aparelho.color, boxShadow: `0 0 6px ${a.aparelho.color}80` }} />
                        {a.aparelho.name}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', marginLeft: 18 }}>
                        <span style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 10px', borderRadius: 6, color: '#fff', fontWeight: 600, fontSize: '0.8rem' }}>
                          {a.unit}
                        </span>
                        {a.userName && (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            • por {a.userName.split(' ')[0]}
                          </span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => handleRemoveAlocacao(a.aparelho.id, a.userId)} style={{ background: 'rgba(255,77,77,0.08)', border: '1px solid rgba(255,77,77,0.15)', color: '#ff4d4d', cursor: 'pointer', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} title="Remover alocação">
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>delete</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
