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
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, padding: 28, borderRadius: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>
                Dia {selectedDay.getDate().toString().padStart(2, '0')}/{(selectedDay.getMonth()+1).toString().padStart(2, '0')}/{selectedDay.getFullYear()}
              </h2>
              <button onClick={() => setSelectedDay(null)} style={{ background: 'var(--border)', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>
            
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', padding: 20, borderRadius: 12, marginBottom: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>Adicionar Alocação</h3>
                <button 
                  onClick={() => setShowManageModal(true)} 
                  style={{ background: 'rgba(230,0,126,0.1)', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, padding: '4px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.2s' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
                  Novo Aparelho
                </button>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <select className="glass-input" style={{ width: '100%', height: 48 }} value={allocAparelho} onChange={e => setAllocAparelho(e.target.value)}>
                  <option value="" disabled>Selecione o Aparelho</option>
                  {aparelhos.map(ap => <option key={ap.id} value={ap.id}>{ap.name}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 12 }}>
                  <select className="glass-input" style={{ flex: 1, height: 48 }} value={allocUnit} onChange={e => setAllocUnit(e.target.value)}>
                    {allUnits.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <button onClick={handleAddAlocacao} disabled={isSaving || !allocAparelho} className="btn-primary" style={{ height: 48, padding: '0 24px', borderRadius: 8, fontWeight: 600 }}>
                    Salvar
                  </button>
                </div>
              </div>
            </div>

            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: 16 }}>Aparelhos Neste Dia</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 280, overflowY: 'auto', paddingRight: 4 }}>
              {dayAllocs.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: '30px 0', fontSize: '0.95rem' }}>Nenhum aparelho alocado neste dia.</p>
              ) : dayAllocs.map(a => (
                <div key={a.aparelho.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'var(--card-bg)', borderRadius: 10, border: '1px solid var(--border)', borderLeft: `4px solid ${a.aparelho.color}` }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: '1rem' }}>{a.aparelho.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                      <span style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 4, color: 'var(--text-main)', fontWeight: 600 }}>
                        {a.unit}
                      </span>
                      {a.userName && (
                        <span style={{ color: 'var(--text-muted)' }}>
                          por {a.userName.split(' ')[0]}
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => handleRemoveAlocacao(a.aparelho.id, a.userId)} style={{ background: 'rgba(255,77,77,0.1)', border: 'none', color: '#ff4d4d', cursor: 'pointer', padding: 8, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} title="Remover alocação">
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>delete</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
