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
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 500, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Gerenciar Aparelhos</h2>
              <button onClick={() => setShowManageModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'center' }}>
              <input type="text" placeholder="Nome do Aparelho (ex: Laser)" className="glass-input" style={{ flex: 1 }} value={newApName} onChange={e => setNewApName(e.target.value)} />
              <input type="color" value={newApColor} onChange={e => setNewApColor(e.target.value)} style={{ width: 44, height: 44, padding: 0, border: 'none', borderRadius: 8, cursor: 'pointer', background: 'transparent' }} />
              <button onClick={handleAddAparelho} disabled={isSaving || !newApName.trim()} className="btn-primary" style={{ height: 44, whiteSpace: 'nowrap' }}>
                Adicionar
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 350, overflowY: 'auto', paddingRight: 4 }}>
              {aparelhos.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: '20px 0', fontSize: '0.9rem' }}>Nenhum aparelho cadastrado.</p>
              ) : aparelhos.map(ap => (
                <div key={ap.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--card-bg)', borderRadius: 8, border: '1px solid var(--border)', borderLeft: `4px solid ${ap.color}` }}>
                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{ap.name}</span>
                  <button onClick={() => handleDeleteAparelho(ap.id)} style={{ background: 'transparent', border: 'none', color: '#ff4d4d', cursor: 'pointer', padding: 4, display: 'flex' }}><span className="material-symbols-outlined" style={{ fontSize: 20 }}>delete</span></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Day Modal */}
      {selectedDay && (
        <div className="modal-overlay" onClick={() => setSelectedDay(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 500, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                Dia {selectedDay.getDate().toString().padStart(2, '0')}/{(selectedDay.getMonth()+1).toString().padStart(2, '0')}/{selectedDay.getFullYear()}
              </h2>
              <button onClick={() => setSelectedDay(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', padding: 20, borderRadius: 12, marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Adicionar Alocação</h3>
                <button 
                  onClick={() => setShowManageModal(true)} 
                  style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                  Novo Aparelho
                </button>
              </div>
              
              <div style={{ display: 'flex', gap: 12, flexDirection: 'column' }}>
                <select className="glass-input" value={allocAparelho} onChange={e => setAllocAparelho(e.target.value)}>
                  <option value="" disabled>Selecione o Aparelho</option>
                  {aparelhos.map(ap => <option key={ap.id} value={ap.id}>{ap.name}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 12 }}>
                  <select className="glass-input" style={{ flex: 1 }} value={allocUnit} onChange={e => setAllocUnit(e.target.value)}>
                    {allUnits.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <button onClick={handleAddAlocacao} disabled={isSaving || !allocAparelho} className="btn-primary" style={{ height: 44, padding: '0 24px' }}>
                    Salvar
                  </button>
                </div>
              </div>
            </div>

            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16 }}>Aparelhos Neste Dia</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
              {dayAllocs.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: '20px 0', fontSize: '0.9rem' }}>Nenhum aparelho alocado neste dia.</p>
              ) : dayAllocs.map(a => (
                <div key={a.aparelho.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--card-bg)', borderRadius: 8, border: '1px solid var(--border)', borderLeft: `4px solid ${a.aparelho.color}` }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{a.aparelho.name}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>Unidade:</span> {a.unit}
                    </span>
                    {a.userName && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        Alocado por {a.userName.split(' ')[0]}
                      </span>
                    )}
                  </div>
                  <button onClick={() => handleRemoveAlocacao(a.aparelho.id, a.userId)} style={{ background: 'rgba(255,77,77,0.1)', border: 'none', color: '#ff4d4d', cursor: 'pointer', padding: 8, borderRadius: 6, display: 'flex' }} title="Remover alocação">
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
