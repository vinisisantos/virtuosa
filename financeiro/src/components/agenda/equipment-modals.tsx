import React, { useState } from 'react';
import type { Aparelho } from '@/app/agenda/aparelhos/page';
import { useUsers } from '@/hooks/useUsers';

interface Props {
  showManageModal: boolean;
  setShowManageModal: (v: boolean) => void;
  selectedDay: Date | null;
  setSelectedDay: (d: Date | null) => void;
  aparelhos: Aparelho[];
  refresh: () => void;
}

export function EquipmentModals({ showManageModal, setShowManageModal, selectedDay, setSelectedDay, aparelhos, refresh }: Props) {
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
  const [allocAparelho, setAllocAparelho] = useState(aparelhos[0]?.id || '');

  const handleAddAlocacao = async () => {
    if (!selectedDay || !allocAparelho || !allocUnit) return;
    setIsSaving(true);
    try {
      const dateIso = new Date(Date.UTC(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate())).toISOString();
      await fetch('/api/agenda/aparelhos/alocacao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aparelhoId: allocAparelho, unit: allocUnit, date: dateIso })
      });
      refresh();
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveAlocacao = async (aparelhoId: string) => {
    if (!selectedDay) return;
    try {
      const dateIso = new Date(Date.UTC(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate())).toISOString();
      await fetch(`/api/agenda/aparelhos/alocacao?aparelhoId=${aparelhoId}&date=${dateIso}`, { method: 'DELETE' });
      refresh();
    } catch (err) { console.error(err); }
  };

  const dayAllocs = selectedDay 
    ? aparelhos.map(ap => {
        const dateIso = new Date(Date.UTC(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate())).toISOString().split('T')[0];
        const match = ap.alocacoes.find(a => a.date.startsWith(dateIso));
        return match ? { aparelho: ap, unit: match.unit } : null;
      }).filter(Boolean) as { aparelho: Aparelho, unit: string }[]
    : [];

  return (
    <>
      {/* Manage Modal */}
      {showManageModal && (
        <div className="modal-overlay" onClick={() => setShowManageModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <h2>Gerenciar Aparelhos</h2>
            
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
              <input type="text" placeholder="Nome do Aparelho (ex: Laser)" className="glass-input" style={{ flex: 1 }} value={newApName} onChange={e => setNewApName(e.target.value)} />
              <input type="color" value={newApColor} onChange={e => setNewApColor(e.target.value)} style={{ width: 40, height: 40, padding: 0, border: 'none', borderRadius: 8, cursor: 'pointer', background: 'transparent' }} />
              <button onClick={handleAddAparelho} disabled={isSaving || !newApName.trim()} style={{ padding: '0 20px', height: 40, borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                Adicionar
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 300, overflowY: 'auto' }}>
              {aparelhos.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: '20px 0' }}>Nenhum aparelho cadastrado.</p>
              ) : aparelhos.map(ap => (
                <div key={ap.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: `4px solid ${ap.color}` }}>
                  <span style={{ fontWeight: 600 }}>{ap.name}</span>
                  <button onClick={() => handleDeleteAparelho(ap.id)} style={{ background: 'transparent', border: 'none', color: '#ff4d4d', cursor: 'pointer' }}><span className="material-symbols-outlined">delete</span></button>
                </div>
              ))}
            </div>

            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button className="btn-cancel" onClick={() => setShowManageModal(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Day Modal */}
      {selectedDay && (
        <div className="modal-overlay" onClick={() => setSelectedDay(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <h2>Dia {selectedDay.getDate().toString().padStart(2, '0')}/{(selectedDay.getMonth()+1).toString().padStart(2, '0')}/{selectedDay.getFullYear()}</h2>
            
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: 8, marginBottom: 20 }}>
              <h3 style={{ fontSize: '1rem', marginBottom: 12 }}>Adicionar Alocação</h3>
              <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
                <select className="glass-input" value={allocAparelho} onChange={e => setAllocAparelho(e.target.value)}>
                  <option value="" disabled>Selecione o Aparelho</option>
                  {aparelhos.map(ap => <option key={ap.id} value={ap.id}>{ap.name}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 10 }}>
                  <select className="glass-input" style={{ flex: 1 }} value={allocUnit} onChange={e => setAllocUnit(e.target.value)}>
                    {allUnits.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <button onClick={handleAddAlocacao} disabled={isSaving || !allocAparelho} style={{ padding: '0 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                    Salvar
                  </button>
                </div>
              </div>
            </div>

            <h3 style={{ fontSize: '1rem', marginBottom: 12 }}>Aparelhos Neste Dia</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 250, overflowY: 'auto' }}>
              {dayAllocs.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: '20px 0' }}>Nenhum aparelho alocado neste dia.</p>
              ) : dayAllocs.map(a => (
                <div key={a.aparelho.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: `4px solid ${a.aparelho.color}` }}>
                  <div>
                    <span style={{ fontWeight: 600, display: 'block' }}>{a.aparelho.name}</span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Unidade: {a.unit}</span>
                  </div>
                  <button onClick={() => handleRemoveAlocacao(a.aparelho.id)} style={{ background: 'transparent', border: 'none', color: '#ff4d4d', cursor: 'pointer' }}><span className="material-symbols-outlined">close</span></button>
                </div>
              ))}
            </div>

            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button className="btn-cancel" onClick={() => setSelectedDay(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
