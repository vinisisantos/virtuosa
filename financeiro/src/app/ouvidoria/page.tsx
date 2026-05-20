'use client';

import { useState, useEffect } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { useGlobalUnit } from '@/contexts/UnitContext';
import * as Dialog from '@radix-ui/react-dialog';
import { polyfill } from 'mobile-drag-drop';
import { scrollBehaviourDragImageTranslateOverride } from 'mobile-drag-drop/scroll-behaviour';
import 'mobile-drag-drop/default.css';

type ComplaintStatus = 'novo' | 'em_apuracao' | 'em_negociacao' | 'aguardando_acordo' | 'finalizado';
type Severity = 'Leve' | 'Médio' | 'Alto' | 'Risco Processual';

interface Complaint {
  id: string;
  clientName: string;
  unit: string;
  category: string;
  severity: Severity;
  description: string;
  clientDesire: string;
  status: ComplaintStatus;
  resolutionNotes?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt: string;
  history: ComplaintHistory[];
}

interface ComplaintHistory {
  id: string;
  action: string;
  notes: string;
  actorName: string;
  createdAt: string;
}

const STATUSES: { id: ComplaintStatus; label: string; color: string }[] = [
  { id: 'novo', label: 'Novos Casos', color: '#ef4444' },
  { id: 'em_apuracao', label: 'Em Apuração', color: '#f59e0b' },
  { id: 'em_negociacao', label: 'Em Negociação', color: '#3b82f6' },
  { id: 'aguardando_acordo', label: 'Aguardando Acordo', color: '#8b5cf6' },
  { id: 'finalizado', label: 'Finalizados', color: '#10b981' },
];

export default function OuvidoriaPage() {
  const { globalUnit } = useGlobalUnit();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [newStatus, setNewStatus] = useState<ComplaintStatus>('novo');
  const [historyNote, setHistoryNote] = useState('');
  
  // New Case Modal
  const [isNewCaseOpen, setIsNewCaseOpen] = useState(false);
  const [newCaseData, setNewCaseData] = useState({
    clientName: '',
    category: 'Atendimento',
    severity: 'Leve',
    description: '',
    clientDesire: ''
  });

  const baseInputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '10px',
    border: '1px solid var(--border)',
    background: 'var(--bg)',
    color: 'var(--text-main)',
    fontSize: '0.95rem',
    boxSizing: 'border-box',
    outline: 'none',
    transition: 'all 0.2s ease',
  };

  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const raw = localStorage.getItem('virtuosa_user');
    if (raw) {
      setCurrentUser(JSON.parse(raw));
    }

    // Initialize mobile-drag-drop polyfill for touch devices
    polyfill({
      dragImageTranslateOverride: scrollBehaviourDragImageTranslateOverride
    });

    const preventDefault = (e: TouchEvent) => {
      // Just an empty passive listener to help iOS Safari scroll behavior
    };
    window.addEventListener('touchmove', preventDefault, { passive: false });

    return () => {
      window.removeEventListener('touchmove', preventDefault);
    };
  }, []);

  const fetchComplaints = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/complaints?unit=${globalUnit || 'Todas'}`);
      const data = await res.json();
      setComplaints(data);
    } catch (e) {
      console.error(e);
    }
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    fetchComplaints();
  }, [globalUnit]);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, status: ComplaintStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;

    const complaint = complaints.find(c => c.id === id);
    if (!complaint || complaint.status === status) return;

    // Optimistic update
    setComplaints(prev => prev.map(c => c.id === id ? { ...c, status } : c));

    try {
      await fetch(`/api/complaints/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status,
          actorId: currentUser?.id,
          actorName: currentUser?.name
        })
      });
      fetchComplaints(true); // silent fetch
      showToast('Status atualizado com sucesso!', 'success');
    } catch (error) {
      console.error(error);
      fetchComplaints(true); // Revert on error
      showToast('Erro ao atualizar status.', 'error');
    }
  };

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleAddHistory = async () => {
    if (!selectedComplaint || !historyNote.trim()) return;
    
    try {
      await fetch(`/api/complaints/${selectedComplaint.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          action: 'comment',
          notes: historyNote,
          actorId: currentUser?.id,
          actorName: currentUser?.name
        })
      });
      
      setHistoryNote('');
      setIsModalOpen(false);
      fetchComplaints(true);
      showToast('Histórico salvo com sucesso!', 'success');
    } catch (error) {
      console.error(error);
      showToast('Erro ao salvar histórico.', 'error');
    }
  };

  const handleCreateCase = async () => {
    try {
      await fetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newCaseData,
          unit: globalUnit && globalUnit !== 'Todas' ? globalUnit : (currentUser?.unit || 'Barueri'),
          createdBy: currentUser?.id,
          createdByName: currentUser?.name
        })
      });
      setIsNewCaseOpen(false);
      setNewCaseData({
        clientName: '',
        category: 'Atendimento',
        severity: 'Leve',
        description: '',
        clientDesire: ''
      });
      fetchComplaints(true);
      showToast('Novo caso criado com sucesso!', 'success');
    } catch (error) {
      console.error(error);
      showToast('Erro ao criar caso.', 'error');
    }
  };

  const handleDeleteCase = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este caso? Esta ação não pode ser desfeita.')) return;
    try {
      await fetch(`/api/complaints/${id}`, { method: 'DELETE' });
      setIsModalOpen(false);
      setSelectedComplaint(null);
      fetchComplaints(true);
      showToast('Caso excluído com sucesso.', 'success');
    } catch (error) {
      console.error(error);
      showToast('Erro ao excluir caso.', 'error');
    }
  };

  return (
    <AuthGuard allowedRoles={['ADMINISTRADOR', 'GERENTE', 'VENDEDOR']} requiredPermission="dashboard">
      <div className="page-layout">
        <AppHeader activePage="ouvidoria" />
        
        <main className="page-content" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div>
              <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>Ouvidoria & SAC</h1>
              <p style={{ color: 'var(--text-muted)', margin: 0 }}>Gestão de reclamações e casos críticos.</p>
            </div>
            <button 
              onClick={() => setIsNewCaseOpen(true)}
              style={{
                background: 'var(--primary)',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <span className="material-symbols-outlined">add</span>
              Novo Caso
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>Carregando...</div>
          ) : (
            <div style={{ 
              display: 'flex', 
              gap: 16, 
              overflowX: 'auto', 
              minHeight: 'calc(100vh - 200px)',
              paddingBottom: 24 
            }}>
              {STATUSES.map(status => (
                <div 
                  key={status.id}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, status.id)}
                  style={{
                    flex: '0 0 320px',
                    background: 'var(--card-bg)',
                    borderRadius: 16,
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '100%',
                  }}
                >
                  <div style={{ 
                    padding: '16px', 
                    borderBottom: `3px solid ${status.color}`,
                    fontWeight: 700,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    {status.label}
                    <span style={{ 
                      background: 'var(--bg)', 
                      padding: '2px 8px', 
                      borderRadius: 12,
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)'
                    }}>
                      {complaints.filter(c => c.status === status.id).length}
                    </span>
                  </div>
                  
                  <div style={{ padding: '12px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {complaints.filter(c => c.status === status.id).map(complaint => (
                      <div 
                        key={complaint.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, complaint.id)}
                        onClick={() => {
                          setSelectedComplaint(complaint);
                          setNewStatus(complaint.status);
                          setIsModalOpen(true);
                        }}
                        style={{
                          background: 'var(--bg)',
                          border: '1px solid var(--border)',
                          borderRadius: 12,
                          padding: '16px',
                          cursor: 'grab',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                          position: 'relative'
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 4 }}>
                          {complaint.clientName}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                          {complaint.unit} • {complaint.category}
                        </div>
                        
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ 
                            fontSize: '0.75rem', 
                            padding: '4px 8px', 
                            borderRadius: 8, 
                            fontWeight: 600,
                            background: complaint.severity === 'Leve' ? 'rgba(16, 185, 129, 0.1)' : 
                                      complaint.severity === 'Médio' ? 'rgba(245, 158, 11, 0.1)' : 
                                      'rgba(239, 68, 68, 0.1)',
                            color: complaint.severity === 'Leve' ? '#10b981' : 
                                  complaint.severity === 'Médio' ? '#f59e0b' : 
                                  '#ef4444',
                          }}>
                            {complaint.severity}
                          </span>
                          <span style={{ 
                            fontSize: '0.75rem', 
                            padding: '4px 8px', 
                            borderRadius: 8, 
                            fontWeight: 600,
                            background: 'var(--border)',
                            color: 'var(--text-muted)'
                          }}>
                            {new Date(complaint.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Modal Nova Reclamação */}
      <Dialog.Root open={isNewCaseOpen} onOpenChange={setIsNewCaseOpen}>
        <Dialog.Portal>
          <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }} />
          <Dialog.Content style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'var(--card-bg)', width: '90%', maxWidth: 500, borderRadius: 24, padding: 24,
            zIndex: 1000, border: '1px solid var(--border)'
          }}>
            <h2 style={{ marginTop: 0, marginBottom: 20 }}>Registrar Novo Caso</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Nome da Cliente</label>
                <input 
                  type="text" 
                  value={newCaseData.clientName}
                  onChange={e => setNewCaseData({...newCaseData, clientName: e.target.value})}
                  style={baseInputStyle}
                />
              </div>
              
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Motivo</label>
                  <select 
                    value={newCaseData.category}
                    onChange={e => setNewCaseData({...newCaseData, category: e.target.value})}
                    style={baseInputStyle}
                  >
                    <option>Atendimento</option>
                    <option>Resultado de Procedimento</option>
                    <option>Queimadura / Intercorrência</option>
                    <option>Atraso</option>
                    <option>Financeiro / Estorno</option>
                    <option>Estrutura</option>
                    <option>Outro</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Gravidade</label>
                  <select 
                    value={newCaseData.severity}
                    onChange={e => setNewCaseData({...newCaseData, severity: e.target.value as Severity})}
                    style={baseInputStyle}
                  >
                    <option>Leve</option>
                    <option>Médio</option>
                    <option>Alto</option>
                    <option>Risco Processual</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Relato do Problema</label>
                <textarea 
                  rows={3}
                  value={newCaseData.description}
                  onChange={e => setNewCaseData({...newCaseData, description: e.target.value})}
                  style={{ ...baseInputStyle, resize: 'vertical' }}
                  placeholder="O que aconteceu?"
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>O que a cliente deseja?</label>
                <input 
                  type="text" 
                  value={newCaseData.clientDesire}
                  onChange={e => setNewCaseData({...newCaseData, clientDesire: e.target.value})}
                  style={baseInputStyle}
                  placeholder="Ex: Estorno do valor, Refazer, Cancelamento..."
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
              <button onClick={() => setIsNewCaseOpen(false)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleCreateCase} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 700, cursor: 'pointer' }}>Salvar Caso</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Modal Detalhes/Histórico */}
      <Dialog.Root open={isModalOpen} onOpenChange={setIsModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }} />
          <Dialog.Content style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'var(--card-bg)', width: '90%', maxWidth: 700, borderRadius: 24, padding: 0,
            zIndex: 1000, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
            maxHeight: '85vh'
          }}>
            {selectedComplaint && (
              <>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', borderRadius: '24px 24px 0 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700 }}>{selectedComplaint.clientName}</h2>
                    <button
                      onClick={() => handleDeleteCase(selectedComplaint.id)}
                      title="Excluir caso"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                        padding: 4,
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'color 0.2s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>delete</span>
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 12, color: 'var(--text-muted)', fontSize: '0.85rem', flexWrap: 'wrap', marginBottom: 16 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>location_on</span>
                      {selectedComplaint.unit}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>category</span>
                      {selectedComplaint.category}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>warning</span>
                      {selectedComplaint.severity}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {STATUSES.map(s => {
                      const isActive = newStatus === s.id;
                      return (
                        <button
                          key={s.id}
                          onClick={() => setNewStatus(s.id)}
                          style={{
                            padding: '5px 14px',
                            borderRadius: 20,
                            border: `1.5px solid ${s.color}`,
                            background: isActive ? s.color : 'transparent',
                            color: isActive ? '#fff' : s.color,
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ padding: 24, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div style={{ background: 'var(--bg)', padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
                      <h4 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)' }}>Relato Original</h4>
                      <p style={{ margin: 0 }}>{selectedComplaint.description}</p>
                    </div>
                    <div style={{ background: 'var(--bg)', padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
                      <h4 style={{ margin: '0 0 8px 0', color: 'var(--text-muted)' }}>O que a cliente deseja?</h4>
                      <p style={{ margin: 0 }}>{selectedComplaint.clientDesire}</p>
                    </div>
                  </div>

                  <div>
                    <h3 style={{ margin: '0 0 16px 0' }}>Histórico / Diário de Bordo</h3>
                    
                    <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                      <textarea 
                        value={historyNote}
                        onChange={e => setHistoryNote(e.target.value)}
                        placeholder="Adicionar atualização (ex: liguei para cliente, enviei email...)"
                        style={{ flex: 1, padding: 12, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', resize: 'vertical' }}
                        rows={2}
                      />
                      <button 
                        onClick={handleAddHistory}
                        disabled={!historyNote.trim() && newStatus === selectedComplaint.status}
                        style={{ 
                          padding: '0 24px', borderRadius: 12, border: 'none', background: 'var(--primary)', 
                          color: 'white', fontWeight: 700, cursor: 'pointer',
                          opacity: (!historyNote.trim() && newStatus === selectedComplaint.status) ? 0.5 : 1
                        }}
                      >
                        Salvar
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {selectedComplaint.history.map(h => (
                        <div key={h.id} style={{ display: 'flex', gap: 16 }}>
                          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>
                            {h.actorName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <strong style={{ fontSize: '0.95rem' }}>{h.actorName}</strong>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {new Date(h.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <div style={{ background: 'var(--bg)', padding: '12px 16px', borderRadius: '0 12px 12px 12px', border: '1px solid var(--border)', fontSize: '0.95rem', whiteSpace: 'pre-wrap' }}>
                              {h.notes}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          background: toastMessage.type === 'success' ? '#10b981' : '#ef4444',
          color: 'white',
          padding: '12px 24px',
          borderRadius: 12,
          fontWeight: 600,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          zIndex: 9999,
          animation: 'slideInRight 0.3s ease-out'
        }}>
          <span className="material-symbols-outlined">
            {toastMessage.type === 'success' ? 'check_circle' : 'error'}
          </span>
          {toastMessage.text}
        </div>
      )}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </AuthGuard>
  );
}
