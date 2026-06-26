'use client';

import { useState, useEffect } from 'react';
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
  conclusionText?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt: string;
  history: ComplaintHistory[];
  attachments: ComplaintAttachmentMeta[];
}

interface ComplaintAttachmentMeta {
  id: string;
  fileName: string;
  mimeType: string;
  createdAt: string;
  uploadedByName?: string;
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

  // Conclusion modal (when finalizing)
  const [isConclusionOpen, setIsConclusionOpen] = useState(false);
  const [conclusionComplaintId, setConclusionComplaintId] = useState<string | null>(null);
  const [conclusionText, setConclusionText] = useState('');
  const [conclusionFiles, setConclusionFiles] = useState<File[]>([]);
  const [uploadingConclusion, setUploadingConclusion] = useState(false);
  
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

    // If dropping to 'finalizado', open conclusion modal instead
    if (status === 'finalizado') {
      setConclusionComplaintId(id);
      setConclusionText('');
      setConclusionFiles([]);
      setIsConclusionOpen(true);
      return;
    }

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
      fetchComplaints(true);
      showToast('Status atualizado com sucesso!', 'success');
    } catch (error) {
      console.error(error);
      fetchComplaints(true);
      showToast('Erro ao atualizar status.', 'error');
    }
  };

  const handleConclusionSubmit = async () => {
    if (!conclusionComplaintId || !conclusionText.trim()) return;
    setUploadingConclusion(true);

    try {
      // 1. Update status + conclusion text
      await fetch(`/api/complaints/${conclusionComplaintId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'finalizado',
          conclusionText: conclusionText,
          action: 'finalized',
          notes: `Caso finalizado. Conclusão: ${conclusionText}`,
          actorId: currentUser?.id,
          actorName: currentUser?.name
        })
      });

      // 2. Upload files if any
      for (const file of conclusionFiles) {
        const base64 = await fileToBase64(file);
        await fetch('/api/complaints/attachments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            complaintId: conclusionComplaintId,
            fileName: file.name,
            mimeType: file.type,
            fileBase64: base64,
            uploadedBy: currentUser?.id,
            uploadedByName: currentUser?.name
          })
        });
      }

      setIsConclusionOpen(false);
      setConclusionComplaintId(null);
      setConclusionText('');
      setConclusionFiles([]);
      fetchComplaints(true);
      showToast('Caso finalizado com sucesso!', 'success');
    } catch (error) {
      console.error(error);
      showToast('Erro ao finalizar caso.', 'error');
    }
    setUploadingConclusion(false);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]); // Strip the data:...;base64, prefix
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleAddHistory = async () => {
    if (!selectedComplaint) return;
    
    // If changing to finalizado, open conclusion modal instead
    if (newStatus === 'finalizado' && selectedComplaint.status !== 'finalizado') {
      setConclusionComplaintId(selectedComplaint.id);
      setConclusionText('');
      setConclusionFiles([]);
      setIsModalOpen(false);
      setIsConclusionOpen(true);
      return;
    }

    if (!historyNote.trim() && newStatus === selectedComplaint.status) return;
    
    try {
      await fetch(`/api/complaints/${selectedComplaint.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          action: 'comment',
          notes: historyNote || `Status alterado para ${newStatus}`,
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
          unit: globalUnit && globalUnit !== 'Todas' ? globalUnit : (currentUser?.unit || 'SCS'),
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
      <div className="w-full p-6">
        <main className="w-full">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Ouvidoria & SAC</h1>
              <p className="text-muted-foreground mt-1">Gestão de reclamações e casos críticos.</p>
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
                          border: complaint.severity === 'Risco Processual' 
                            ? '2px solid #ef4444' 
                            : complaint.severity === 'Alto' 
                              ? '2px solid #f59e0b' 
                              : '1px solid var(--border)',
                          borderRadius: 12,
                          padding: '16px',
                          cursor: 'grab',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                          position: 'relative',
                          animation: (complaint.severity === 'Alto' || complaint.severity === 'Risco Processual')
                            ? complaint.severity === 'Risco Processual' 
                              ? 'pulseRisco 1.5s ease-in-out infinite' 
                              : 'pulseAlto 2s ease-in-out infinite'
                            : 'none'
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
          <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 999 }} />
          <Dialog.Content style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'var(--card-bg)', width: '90%', maxWidth: 520, borderRadius: 20, padding: 0,
            zIndex: 1000, border: '1px solid var(--border)', overflow: 'hidden',
            maxHeight: '90vh', display: 'flex', flexDirection: 'column'
          }}>
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg)',
              display: 'flex', alignItems: 'center', gap: 12
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: 'rgba(239, 68, 68, 0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <span className="material-symbols-outlined" style={{ color: '#ef4444', fontSize: 22 }}>add_comment</span>
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>Registrar Novo Caso</h2>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Preencha os dados da reclamação</p>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>person</span>
                  Nome da Cliente
                </label>
                <input 
                  type="text" 
                  value={newCaseData.clientName}
                  onChange={e => setNewCaseData({...newCaseData, clientName: e.target.value})}
                  style={baseInputStyle}
                  placeholder="Nome completo"
                />
              </div>
              
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>category</span>
                    Motivo
                  </label>
                  <select 
                    value={newCaseData.category}
                    onChange={e => setNewCaseData({...newCaseData, category: e.target.value})}
                    style={{ ...baseInputStyle, appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%23888\' d=\'M6 8L1 3h10z\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 32 }}
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
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>warning</span>
                    Gravidade
                  </label>
                  <select 
                    value={newCaseData.severity}
                    onChange={e => setNewCaseData({...newCaseData, severity: e.target.value as Severity})}
                    style={{ ...baseInputStyle, appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%23888\' d=\'M6 8L1 3h10z\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 32 }}
                  >
                    <option>Leve</option>
                    <option>Médio</option>
                    <option>Alto</option>
                    <option>Risco Processual</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>description</span>
                  Relato do Problema
                </label>
                <textarea 
                  rows={4}
                  value={newCaseData.description}
                  onChange={e => setNewCaseData({...newCaseData, description: e.target.value})}
                  style={{ ...baseInputStyle, resize: 'vertical', lineHeight: 1.5 }}
                  placeholder="Descreva o que aconteceu com detalhes..."
                />
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>handshake</span>
                  O que a cliente deseja?
                </label>
                <input 
                  type="text" 
                  value={newCaseData.clientDesire}
                  onChange={e => setNewCaseData({...newCaseData, clientDesire: e.target.value})}
                  style={baseInputStyle}
                  placeholder="Ex: Estorno do valor, Refazer, Cancelamento..."
                />
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setIsNewCaseOpen(false)}
                style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.9rem' }}
              >Cancelar</button>
              <button
                onClick={handleCreateCase}
                style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.9rem' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span>
                Salvar Caso
              </button>
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

                  {/* Conclusion & Attachments (when finalized) */}
                  {selectedComplaint.status === 'finalizado' && selectedComplaint.conclusionText && (
                    <div style={{ background: 'rgba(16,185,129,0.08)', padding: 16, borderRadius: 12, border: '1px solid rgba(16,185,129,0.3)' }}>
                      <h4 style={{ margin: '0 0 8px 0', color: '#10b981', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>task_alt</span>
                        Conclusão
                      </h4>
                      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{selectedComplaint.conclusionText}</p>
                    </div>
                  )}

                  {selectedComplaint.attachments && selectedComplaint.attachments.length > 0 && (
                    <div>
                      <h4 style={{ margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>attach_file</span>
                        Arquivos Anexados ({selectedComplaint.attachments.length})
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {selectedComplaint.attachments.map(att => (
                          <a
                            key={att.id}
                            href={`/api/complaints/attachments/${att.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              background: 'var(--bg)', padding: '10px 14px', borderRadius: 10,
                              border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text-main)',
                              transition: 'border-color 0.2s'
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 20, color: att.mimeType.includes('pdf') ? '#ef4444' : '#3b82f6' }}>
                              {att.mimeType.includes('pdf') ? 'picture_as_pdf' : att.mimeType.includes('image') ? 'image' : 'description'}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.fileName}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {att.uploadedByName && `${att.uploadedByName} · `}{new Date(att.createdAt).toLocaleString()}
                              </div>
                            </div>
                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-muted)' }}>open_in_new</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

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

      {/* Modal Conclusão (Finalização) */}
      <Dialog.Root open={isConclusionOpen} onOpenChange={setIsConclusionOpen}>
        <Dialog.Portal>
          <Dialog.Overlay style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 999 }} />
          <Dialog.Content style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'var(--card-bg)', width: '90%', maxWidth: 520, borderRadius: 20, padding: 0,
            zIndex: 1000, border: '1px solid var(--border)', overflow: 'hidden',
            maxHeight: '90vh', display: 'flex', flexDirection: 'column'
          }}>
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg)',
              display: 'flex', alignItems: 'center', gap: 12
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: 'rgba(16,185,129,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <span className="material-symbols-outlined" style={{ color: '#10b981', fontSize: 22 }}>task_alt</span>
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>Finalizar Caso</h2>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Registre a conclusão e anexe documentos</p>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit_note</span>
                  Conclusão *
                </label>
                <textarea
                  rows={4}
                  value={conclusionText}
                  onChange={e => setConclusionText(e.target.value)}
                  style={{ ...baseInputStyle, resize: 'vertical', lineHeight: 1.5 }}
                  placeholder="Descreva a conclusão tomada para este caso..."
                />
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>attach_file</span>
                  Anexar Documentos (opcional)
                </label>
                <div
                  style={{
                    border: '2px dashed var(--border)',
                    borderRadius: 12,
                    padding: 20,
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s',
                    background: 'var(--bg)'
                  }}
                  onClick={() => document.getElementById('conclusionFileInput')?.click()}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>cloud_upload</span>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Clique para selecionar arquivos</p>
                  <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>PDF, PNG, JPEG, DOC e outros</p>
                </div>
                <input
                  id="conclusionFileInput"
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.gif,.doc,.docx,.xls,.xlsx"
                  style={{ display: 'none' }}
                  onChange={e => {
                    if (e.target.files) {
                      setConclusionFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                    }
                  }}
                />

                {conclusionFiles.length > 0 && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {conclusionFiles.map((file, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: 'var(--bg)', padding: '8px 12px', borderRadius: 8,
                        border: '1px solid var(--border)', fontSize: '0.85rem'
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: file.type.includes('pdf') ? '#ef4444' : '#3b82f6' }}>
                          {file.type.includes('pdf') ? 'picture_as_pdf' : file.type.includes('image') ? 'image' : 'description'}
                        </span>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{(file.size / 1024).toFixed(0)} KB</span>
                        <button
                          onClick={() => setConclusionFiles(prev => prev.filter((_, idx) => idx !== i))}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => { setIsConclusionOpen(false); setConclusionFiles([]); setConclusionText(''); }}
                style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.9rem' }}
              >Cancelar</button>
              <button
                onClick={handleConclusionSubmit}
                disabled={!conclusionText.trim() || uploadingConclusion}
                style={{
                  padding: '10px 24px', borderRadius: 10, border: 'none',
                  background: '#10b981', color: 'white', fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.9rem',
                  opacity: (!conclusionText.trim() || uploadingConclusion) ? 0.5 : 1
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{uploadingConclusion ? 'hourglass_empty' : 'check_circle'}</span>
                {uploadingConclusion ? 'Finalizando...' : 'Finalizar Caso'}
              </button>
            </div>
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
        @keyframes pulseRisco {
          0%, 100% { box-shadow: 0 0 4px rgba(239, 68, 68, 0.3); border-color: #ef4444; }
          50% { box-shadow: 0 0 16px rgba(239, 68, 68, 0.6), 0 0 30px rgba(239, 68, 68, 0.2); border-color: #f87171; }
        }
        @keyframes pulseAlto {
          0%, 100% { box-shadow: 0 0 4px rgba(245, 158, 11, 0.2); border-color: #f59e0b; }
          50% { box-shadow: 0 0 14px rgba(245, 158, 11, 0.5), 0 0 24px rgba(245, 158, 11, 0.15); border-color: #fbbf24; }
        }
      `}</style>
    </AuthGuard>
  );
}
