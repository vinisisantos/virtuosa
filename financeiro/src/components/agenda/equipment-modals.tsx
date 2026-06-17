import React, { useState } from 'react';
import type { Aparelho } from '@/app/agenda/aparelhos/page';

interface Props {
  showManageModal: boolean;
  setShowManageModal: (v: boolean) => void;
  selectedDay: Date | null;
  setSelectedDay: (d: Date | null) => void;
  aparelhos: Aparelho[];
  refresh: () => void;
}

export function EquipmentModals({ showManageModal, setShowManageModal, selectedDay, setSelectedDay, aparelhos, refresh }: Props) {
  const [currentUser, setCurrentUser] = React.useState<any>(null);
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem('virtuosa_user');
      if (raw) setCurrentUser(JSON.parse(raw));
    } catch {}
  }, []);
  const allUnits = ['SCS', 'SBC', 'Osasco'];
  const [newApName, setNewApName] = useState('');
  const [newApColor, setNewApColor] = useState('#3b82f6');
  const [isSaving, setIsSaving] = useState(false);

  // Manage Modal actions
  const handleAddAparelho = async () => {
    if (!newApName.trim()) return;
    setIsSaving(true);
    try {
      await fetch('/api/agenda/aparelhos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newApName, color: newApColor })
      });
      setNewApName('');
      setNewApColor('#3b82f6');
      refresh();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAparelho = async (id: string) => {
    if (!confirm('Deseja excluir este aparelho e todo o seu histórico de transito?')) return;
    try {
      await fetch(`/api/agenda/aparelhos?id=${id}`, { method: 'DELETE' });
      refresh();
    } catch (err) { console.error(err); }
  };

  // Day Modal actions
  const [allocUnit, setAllocUnit] = useState(allUnits[0] || 'SCS');
  const [allocAparelho, setAllocAparelho] = useState('');

  const handleAddAlocacao = async () => {
    if (!selectedDay || !allocAparelho || !allocUnit || !currentUser) return;
    setIsSaving(true);
    try {
      const dateIso = new Date(Date.UTC(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate())).toISOString();
      await fetch('/api/agenda/aparelhos/alocacao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          aparelhoId: allocAparelho, 
          unit: allocUnit, 
          date: dateIso,
          userId: currentUser.id,
          userName: currentUser.name
        })
      });
      setAllocAparelho('');
      refresh();
    } finally {
      setIsSaving(false);
    }
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
      }).filter(Boolean) as { aparelho: Aparelho, unit: string, userId?: string, userName?: string }[]
    : [];

  return (
    <>
      {/* Manage Modal */}
      {showManageModal && (
        <div className="modal-overlay" onClick={() => setShowManageModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, padding: 32, borderRadius: 20, boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>Cadastrar Aparelho</h2>
                <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Crie aparelhos e associe cores a eles.</p>
              </div>
              <button onClick={() => setShowManageModal(false)} style={{ background: 'var(--border)', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>
            
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 28 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>NOME DA MÁQUINA</label>
                  <input 
                    type="text" 
                    placeholder="Ex: Laser Lavieen" 
                    className="glass-input" 
                    style={{ width: '100%', height: 48, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', padding: '0 16px', borderRadius: 10, fontSize: '1rem', color: '#fff', outline: 'none' }} 
                    value={newApName} 
                    onChange={e => setNewApName(e.target.value)} 
                    onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                  />
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>COR DE IDENTIFICAÇÃO</label>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {['#e6007e', '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#6366f1'].map(c => (
                      <button 
                        key={c}
                        onClick={() => setNewApColor(c)}
                        style={{ 
                          width: 36, height: 36, borderRadius: '50%', border: newApColor === c ? '3px solid #fff' : '2px solid transparent',
                          background: c, cursor: 'pointer', outline: newApColor === c ? `2px solid ${c}` : 'none',
                          boxShadow: newApColor === c ? '0 0 10px rgba(0,0,0,0.5)' : 'none',
                          transition: 'all 0.2s', padding: 0
                        }}
                      />
                    ))}
                  </div>
                </div>

                <button 
                  onClick={handleAddAparelho} 
                  disabled={isSaving || !newApName.trim()} 
                  className="btn-primary" 
                  style={{ height: 48, width: '100%', borderRadius: 10, fontWeight: 700, fontSize: '1rem', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add_circle</span>
                  Adicionar Aparelho
                </button>
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12 }}>Aparelhos Cadastrados</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 220, overflowY: 'auto', paddingRight: 6 }}>
                {aparelhos.length === 0 ? (
                  <div style={{ padding: '30px 0', textAlign: 'center', background: 'rgba(0,0,0,0.1)', borderRadius: 12, border: '1px dashed var(--border)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--text-muted)', marginBottom: 8 }}>inventory_2</span>
                    <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.95rem' }}>Nenhuma máquina na lista.</p>
                  </div>
                ) : aparelhos.map(ap => (
                  <div key={ap.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid var(--border)', borderLeft: `4px solid ${ap.color}`, transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.04)'} onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.02)'}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 14, height: 14, borderRadius: '50%', background: ap.color, boxShadow: `0 0 8px ${ap.color}80` }} />
                      <span style={{ fontWeight: 600, fontSize: '1rem' }}>{ap.name}</span>
                    </div>
                    <button onClick={() => handleDeleteAparelho(ap.id)} style={{ background: 'rgba(255,77,77,0.1)', border: 'none', color: '#ff4d4d', cursor: 'pointer', width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} title="Excluir"><span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Day Modal */}
      {selectedDay && (
        <div className="modal-overlay" onClick={() => setSelectedDay(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, padding: 32, borderRadius: 20, boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
              <div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
                  {selectedDay.getDate().toString().padStart(2, '0')} de {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][selectedDay.getMonth()]} de {selectedDay.getFullYear()}
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Controle de alocação de aparelhos.</p>
              </div>
              <button onClick={() => setSelectedDay(null)} style={{ background: 'var(--border)', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>
            
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>Adicionar Alocação</h3>
                <button 
                  onClick={() => setShowManageModal(true)} 
                  style={{ background: 'rgba(230,0,126,0.1)', border: '1px solid rgba(230,0,126,0.2)', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, padding: '6px 12px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(230,0,126,0.15)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(230,0,126,0.1)'}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                  Novo Aparelho
                </button>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>SELECIONE O APARELHO</label>
                  <select 
                    style={{ width: '100%', height: 48, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', padding: '0 16px', borderRadius: 10, fontSize: '1rem', color: allocAparelho ? '#fff' : 'var(--text-muted)', outline: 'none', appearance: 'none', cursor: 'pointer' }} 
                    value={allocAparelho} 
                    onChange={e => setAllocAparelho(e.target.value)}
                    onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                  >
                    <option value="" disabled>Escolha um aparelho cadastrado</option>
                    {aparelhos.map(ap => <option key={ap.id} value={ap.id} style={{ color: '#000' }}>{ap.name}</option>)}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>UNIDADE DESTINO</label>
                    <select 
                      style={{ width: '100%', height: 48, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', padding: '0 16px', borderRadius: 10, fontSize: '1rem', color: '#fff', outline: 'none', appearance: 'none', cursor: 'pointer' }} 
                      value={allocUnit} 
                      onChange={e => setAllocUnit(e.target.value)}
                      onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                      onBlur={e => e.target.style.borderColor = 'var(--border)'}
                    >
                      {allUnits.map(u => <option key={u} value={u} style={{ color: '#000' }}>{u}</option>)}
                    </select>
                  </div>
                  <button onClick={handleAddAlocacao} disabled={isSaving || !allocAparelho} className="btn-primary" style={{ height: 48, padding: '0 24px', borderRadius: 10, fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>check_circle</span>
                    Salvar
                  </button>
                </div>
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12 }}>Aparelhos Neste Dia</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 260, overflowY: 'auto', paddingRight: 6 }}>
                {dayAllocs.length === 0 ? (
                  <div style={{ padding: '30px 0', textAlign: 'center', background: 'rgba(0,0,0,0.1)', borderRadius: 12, border: '1px dashed var(--border)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--text-muted)', marginBottom: 8 }}>event_busy</span>
                    <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.95rem' }}>Nenhum aparelho alocado hoje.</p>
                  </div>
                ) : dayAllocs.map(a => (
                  <div key={a.aparelho.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid var(--border)', borderLeft: `4px solid ${a.aparelho.color}`, transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.04)'} onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.02)'}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: a.aparelho.color, boxShadow: `0 0 6px ${a.aparelho.color}80` }} />
                        {a.aparelho.name}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                        <span style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 4, color: '#fff', fontWeight: 600 }}>
                          {a.unit}
                        </span>
                        {a.userName && (
                          <span style={{ color: 'var(--text-muted)' }}>
                            <span style={{ margin: '0 4px' }}>•</span>
                            por {a.userName.split(' ')[0]}
                          </span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => handleRemoveAlocacao(a.aparelho.id, a.userId)} style={{ background: 'rgba(255,77,77,0.1)', border: 'none', color: '#ff4d4d', cursor: 'pointer', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} title="Remover alocação">
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
