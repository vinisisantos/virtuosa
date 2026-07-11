'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import DOMPurify from 'dompurify';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { toast } from '@/components/toast';
import { PatientAutocomplete, PatientData } from '@/components/patient-autocomplete';
import { AdminKpiGrid, AdminPageHeader, AdminPrimaryAction } from '@/components/admin/admin-ui';

interface ContractListItem { id: string; clientName: string; templateName: string; status: string; unit: string; createdAt: string; }
interface Contract extends ContractListItem { clientCpf: string | null; clientEmail?: string | null; content: string; pdfContent?: string | null; signedAt: string | null; signatureImage?: string | null; signatureIp?: string | null; autentiqueDocId?: string | null; autentiqueSignId?: string | null; signatureLink?: string | null; signedPdfUrl?: string | null; autentiqueStatus?: string | null; }

const STATUS_COLORS: Record<string, { label: string; color: string; bg: string }> = {
  pendente: { label: 'Pendente', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  enviado: { label: 'Enviado p/ Assinatura', color: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
  assinado: { label: 'Assinado', color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
  cancelado: { label: 'Cancelado', color: '#94a3b8', bg: 'rgba(148,163,184,0.08)' },
};
const cardS: React.CSSProperties = { background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)', padding: 24 };
const inputS: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: '0.9rem', outline: 'none', background: 'var(--bg)', boxSizing: 'border-box' as const, color: 'var(--text-main)', fontFamily: 'inherit', fontWeight: 600, height: 48 };

export default function ContratosPage() {
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [templates, setTemplates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedContract, setSelectedContract] = useState<ContractListItem | null>(null);
  const [viewContract, setViewContract] = useState<Contract | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ContractListItem | null>(null);
  const [showEmailModal, setShowEmailModal] = useState<Contract | null>(null);
  const [emailTo, setEmailTo] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [form, setForm] = useState({ clientName: '', clientCpf: '', clientEmail: '', templateName: '', unit: 'SCS', procedimento: '', valor: '', pagamento: '' });
  const [selectedPatient, setSelectedPatient] = useState<PatientData | null>(null);
  const [sendingAutentique, setSendingAutentique] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const detailRequestId = useRef(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/contracts');
    const data = await res.json();
    setContracts(data.contracts || []);
    setTemplates(data.templates || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const closeContract = () => {
    detailRequestId.current += 1;
    setSelectedContract(null);
    setViewContract(null);
    setDetailLoading(false);
    setDetailError(null);
  };

  const openContract = async (contract: ContractListItem) => {
    const requestId = detailRequestId.current + 1;
    detailRequestId.current = requestId;
    setSelectedContract(contract);
    setViewContract(null);
    setDetailError(null);
    setDetailLoading(true);

    try {
      const res = await fetch(`/api/contracts?id=${encodeURIComponent(contract.id)}`);
      if (!res.ok) throw new Error('Não foi possível carregar o contrato');
      const detail = await res.json();
      if (!detail) throw new Error('Contrato não encontrado');
      if (detailRequestId.current === requestId) setViewContract(detail);
    } catch (error) {
      if (detailRequestId.current === requestId) {
        setDetailError(error instanceof Error ? error.message : 'Erro ao carregar contrato');
      }
    } finally {
      if (detailRequestId.current === requestId) setDetailLoading(false);
    }
  };

  const createContract = async () => {
    if (!form.clientName || !form.templateName) { toast('Preencha campos obrigatórios', 'error'); return; }
    await fetch('/api/contracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    toast('Contrato gerado!', 'success');
    setShowModal(false);
    fetchData();
  };

  const signContract = async (id: string) => {
    await fetch('/api/contracts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'assinado' }) });
    toast('Contrato assinado!', 'success');
    closeContract();
    fetchData();
  };

  const executeDelete = async () => {
    if (!confirmDelete) return;
    const res = await fetch(`/api/contracts?id=${encodeURIComponent(confirmDelete.id)}`, { method: 'DELETE' });
    if (res.ok) {
      toast('Contrato excluído com sucesso!', 'success');
      if (selectedContract?.id === confirmDelete.id) closeContract();
      fetchData();
    } else {
      toast('Erro ao excluir contrato', 'error');
    }
    setConfirmDelete(null);
  };

  const sendContractEmail = async () => {
    if (!showEmailModal || !emailTo) { toast('Informe o email', 'error'); return; }
    setSendingEmail(true);
    try {
      const res = await fetch('/api/contracts/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId: showEmailModal.id, email: emailTo }),
      });
      const data = await res.json();
      if (data.success) {
        toast('📧 Email enviado com sucesso!', 'success');
        setShowEmailModal(null);
        setEmailTo('');
      } else {
        toast(data.error || 'Erro ao enviar email', 'error');
      }
    } catch { toast('Erro de conexão', 'error'); }
    setSendingEmail(false);
  };

  const sendToAutentique = async (contractId: string) => {
    setSendingAutentique(true);
    try {
      const res = await fetch('/api/autentique', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', contractId }),
      });
      const data = await res.json();
      if (data.success) {
        toast('✅ Contrato enviado para assinatura digital!', 'success');
        if (data.signatureLink) {
          setViewContract(prev => prev ? { ...prev, signatureLink: data.signatureLink, autentiqueDocId: data.autentiqueDocId, status: 'enviado', autentiqueStatus: 'pending' } : null);
        }
        fetchData();
      } else {
        toast(data.error || 'Erro ao enviar para Autentique', 'error');
      }
    } catch { toast('Erro de conexão com Autentique', 'error'); }
    setSendingAutentique(false);
  };

  const resendAutentique = async (contractId: string) => {
    try {
      const res = await fetch('/api/autentique', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resend', contractId }),
      });
      const data = await res.json();
      if (data.success) toast('🔄 Solicitação de assinatura reenviada!', 'success');
      else toast(data.error || 'Erro ao reenviar', 'error');
    } catch { toast('Erro de conexão', 'error'); }
  };

  const copySignatureLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    toast('📋 Link copiado!', 'success');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const printContract = (contract: Contract) => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<html><head><title>${contract.templateName} — ${contract.clientName}</title><style>body{font-family:Arial,sans-serif;padding:48px;line-height:1.8;max-width:800px;margin:0 auto;} @media print{body{padding:24px;}} img{max-width:280px;}</style></head><body>${contract.content}${contract.signatureImage ? `<div style="margin-top:40px;font-family:'Courier New',monospace;"><hr style="border:none;border-top:1px solid #000;margin:30px 0;"/><p style="text-align:center;font-weight:bold;font-size:11pt;">${contract.signedAt ? new Date(contract.signedAt).toLocaleDateString('pt-BR') : ''}</p><hr style="border:none;border-top:1px solid #000;margin:30px 0;"/><p style="font-weight:bold;font-size:11pt;">Assinatura:</p><img src="${contract.signatureImage}" style="max-width:280px;max-height:140px;display:block;margin:16px 0;"/><p style="font-size:11pt;">${contract.clientName}</p><p style="font-size:10pt;color:#333;">${contract.signedAt ? new Date(contract.signedAt).toLocaleString('pt-BR') : ''}</p>${contract.signatureIp ? `<p style="font-size:9pt;color:#666;">IP: ${contract.signatureIp}</p>` : ''}</div>` : ''}</body></html>`);
    win.document.close();
    win.print();
  };

  const displayedContract = viewContract || selectedContract;

  return (
    <AuthGuard>
      <AppHeader activePage="contratos" />
      <main style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
        <AdminPageHeader
          title="📑 Contratos Digitais"
          description="Gere, assine e gerencie contratos e termos"
          action={(
            <AdminPrimaryAction icon="note_add" data-tour="cont-novo" onClick={() => { setForm({ clientName: '', clientCpf: '', clientEmail: '', templateName: templates[0] || '', unit: 'SCS', procedimento: '', valor: '', pagamento: '' }); setSelectedPatient(null); setShowModal(true); }}>
              Novo Contrato
            </AdminPrimaryAction>
          )}
        />

        {/* KPIs */}
        <AdminKpiGrid
          variant="compact"
          minWidth={180}
          tourId="cont-kpis"
          items={[
            { icon: 'description', color: '#6366f1', label: 'Total', value: contracts.length },
            { icon: 'pending', color: '#f59e0b', label: 'Pendentes', value: contracts.filter(c => c.status === 'pendente').length },
            { icon: 'send', color: '#6366f1', label: 'Aguardando', value: contracts.filter(c => c.status === 'enviado').length },
            { icon: 'task_alt', color: '#10b981', label: 'Assinados', value: contracts.filter(c => c.status === 'assinado').length },
          ]}
        />

        {/* Contract list */}
        <div data-tour="cont-lista" style={cardS}>
          {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Carregando...</div> : contracts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: 0.3, color: 'var(--text-muted)' }}>description</span>
              <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>Nenhum contrato gerado</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {contracts.map(c => {
                const st = STATUS_COLORS[c.status] || STATUS_COLORS.pendente;
                return (
                  <div key={c.id} onClick={() => openContract(c)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 14, border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 24, color: st.color }}>description</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.templateName}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{c.clientName} • {c.unit} • {new Date(c.createdAt).toLocaleDateString('pt-BR')}</div>
                    </div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: st.bg, color: st.color }}>{st.label}</span>
                    <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(c); }}
                        title="Excluir contrato"
                        style={{ background: 'rgba(239,68,68,0.06)', border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.06)')}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ef4444' }}>delete</span>
                      </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Create Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setShowModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 24, padding: 32, maxWidth: 500, width: '100%', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--primary)' }}>note_add</span>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>Gerar Contrato</h2>
              <button onClick={() => setShowModal(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><span className="material-symbols-outlined">close</span></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' as const }}>Template *</label>
                <select value={form.templateName} onChange={e => setForm({ ...form, templateName: e.target.value })} style={inputS}>
                  {templates.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <PatientAutocomplete
                  value={selectedPatient}
                  onSelect={(patient: PatientData) => { setSelectedPatient(patient); setForm(f => ({ ...f, clientName: patient.name, clientCpf: patient.cpf || '', clientEmail: patient.email || '' })); }}
                  onClear={() => { setSelectedPatient(null); setForm(f => ({ ...f, clientName: '', clientCpf: '', clientEmail: '' })); }}
                  onNameChange={name => setForm(f => ({ ...f, clientName: name }))}
                  label="Cliente"
                  required
                  placeholder="Buscar paciente..."
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' as const }}>CPF {selectedPatient && form.clientCpf && '✓'}</label>
                <input value={form.clientCpf} onChange={e => setForm({ ...form, clientCpf: e.target.value })} style={{ ...inputS, background: selectedPatient ? 'rgba(16,185,129,0.03)' : 'var(--bg)' }} placeholder="000.000.000-00" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' as const }}>Email {selectedPatient && form.clientEmail && '✓'}</label>
                <input value={form.clientEmail} onChange={e => setForm({ ...form, clientEmail: e.target.value })} style={{ ...inputS, background: selectedPatient ? 'rgba(16,185,129,0.03)' : 'var(--bg)' }} placeholder="cliente@email.com" type="email" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' as const }}>Procedimento</label>
                <input value={form.procedimento} onChange={e => setForm({ ...form, procedimento: e.target.value })} style={inputS} placeholder="Ex: Depilação Laser" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' as const }}>Unidade</label>
                <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} style={inputS}>
                  {[ 'Osasco', 'SBC', 'SCS'].map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={createContract} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Gerar Contrato</button>
            </div>
          </div>
        </div>
      )}

      {/* View Contract */}
      {selectedContract && displayedContract && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={closeContract}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 24, padding: 32, maxWidth: 700, width: '100%', maxHeight: '85vh', overflowY: 'auto', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--primary)' }}>description</span>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>{displayedContract.templateName}</h2>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{displayedContract.clientName} • {displayedContract.unit}</div>
              </div>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: STATUS_COLORS[displayedContract.status]?.bg, color: STATUS_COLORS[displayedContract.status]?.color }}>{STATUS_COLORS[displayedContract.status]?.label}</span>
              <button onClick={closeContract} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><span className="material-symbols-outlined">close</span></button>
            </div>
            {detailLoading ? (
              <div style={{ minHeight: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-muted)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 32 }}>hourglass_top</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Carregando contrato...</span>
              </div>
            ) : detailError ? (
              <div style={{ minHeight: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#ef4444' }}>error</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{detailError}</span>
                <button onClick={() => openContract(selectedContract)} style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Tentar novamente</button>
              </div>
            ) : viewContract ? (
              <>
            {/* Contract PDF or HTML Content */}
            {viewContract.pdfContent ? (
              <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 20 }}>
                <iframe
                  src={`data:application/pdf;base64,${viewContract.pdfContent}`}
                  style={{ width: '100%', height: '65vh', border: 'none', display: 'block' }}
                  title="Contrato"
                />
              </div>
            ) : (
              <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 20 }}>
                <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                  <div style={{ padding: '48px 40px', background: '#fff', color: '#000', lineHeight: 1.6 }}>
                    <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(viewContract.content) }} />
                  </div>
                </div>
              </div>
            )}
            {/* Signature Info */}
            {viewContract.status === 'assinado' && viewContract.signatureImage && (
              <div style={{ borderRadius: 14, border: '1px solid var(--border)', padding: '20px 28px', marginBottom: 20, background: 'var(--bg)' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12 }}>✅ Assinatura Digital Registrada</div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
                  <img src={viewContract.signatureImage} alt="Assinatura" style={{ maxWidth: 200, maxHeight: 100, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', padding: 8 }} />
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 800, marginBottom: 4 }}>{viewContract.clientName}</div>
                    {viewContract.signedAt && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>📅 {new Date(viewContract.signedAt).toLocaleString('pt-BR')}</div>}
                    {viewContract.signatureIp && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>🌐 IP: {viewContract.signatureIp}</div>}
                  </div>
                </div>
              </div>
            )}
            {/* Autentique Signature Link Section */}
            {viewContract.signatureLink && (viewContract.status === 'enviado' || viewContract.autentiqueStatus === 'pending') && (
              <div style={{ borderRadius: 14, border: '1px solid rgba(99,102,241,0.3)', padding: '16px 20px', marginBottom: 20, background: 'rgba(99,102,241,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#6366f1' }}>link</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6366f1', textTransform: 'uppercase' }}>Link de Assinatura Digital</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input readOnly value={viewContract.signatureLink} style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: '0.82rem', background: 'var(--bg)', color: 'var(--text-main)', fontFamily: 'monospace' }} />
                  <button onClick={() => copySignatureLink(viewContract.signatureLink!)} style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: copiedLink ? '#10b981' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{copiedLink ? 'check' : 'content_copy'}</span> {copiedLink ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
                <p style={{ margin: '10px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>Envie este link para o cliente assinar. Válido até a assinatura ser realizada.</p>
              </div>
            )}
            {/* Autentique Signed Info */}
            {viewContract.autentiqueStatus === 'signed' && !viewContract.signatureImage && (
              <div style={{ borderRadius: 14, border: '1px solid rgba(16,185,129,0.3)', padding: '16px 20px', marginBottom: 20, background: 'rgba(16,185,129,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#10b981' }}>verified</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase' }}>Assinado Digitalmente via Autentique</span>
                </div>
                {viewContract.signedAt && <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>📅 Assinado em {new Date(viewContract.signedAt).toLocaleString('pt-BR')}</p>}
                {viewContract.signatureIp && <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>🌐 IP: {viewContract.signatureIp}</p>}
                {viewContract.signedPdfUrl && (
                  <a href={viewContract.signedPdfUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: '0.78rem', color: '#6366f1', fontWeight: 600, textDecoration: 'none' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>picture_as_pdf</span> Baixar PDF Assinado
                  </a>
                )}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => printContract(viewContract)} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>print</span> Imprimir
              </button>
              {viewContract.status === 'pendente' && (
                <>
                  <button onClick={() => sendToAutentique(viewContract.id)} disabled={sendingAutentique} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: sendingAutentique ? '#94a3b8' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 700, cursor: sendingAutentique ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{sendingAutentique ? 'hourglass_top' : 'verified'}</span> {sendingAutentique ? 'Enviando...' : 'Enviar p/ Assinatura Autentique'}
                  </button>
                  <button onClick={() => { setEmailTo(viewContract.clientEmail || ''); setShowEmailModal(viewContract); }} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>mail</span> Email
                  </button>
                  <button onClick={() => signContract(viewContract.id)} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>draw</span> Assinar Manual
                  </button>
                </>
              )}
              {viewContract.status === 'enviado' && (
                <button onClick={() => resendAutentique(viewContract.id)} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>refresh</span> Reenviar Solicitação
                </button>
              )}
            </div>
              </>
            ) : null}
          </div>
        </div>
      )}
      {/* Custom Delete Confirmation Modal */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 20, animation: 'fadeIn 0.15s ease-out' }} onClick={() => setConfirmDelete(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 24, padding: '32px 28px', maxWidth: 420, width: '100%', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', animation: 'fadeInScale 0.2s ease-out', textAlign: 'center' }}>
            {/* Warning Icon */}
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#ef4444' }}>delete_forever</span>
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-main)' }}>Excluir Contrato?</h3>
            <p style={{ margin: '0 0 6px', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, lineHeight: 1.5 }}>
              O contrato de <strong style={{ color: 'var(--text-main)' }}>{confirmDelete.clientName}</strong> será excluído permanentemente.
            </p>
            <p style={{ margin: '0 0 24px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              Esta ação não pode ser desfeita.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setConfirmDelete(null)} style={{ padding: '12px 28px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem', transition: 'all 0.15s' }}>
                Cancelar
              </button>
              <button onClick={executeDelete} style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 15px rgba(239,68,68,0.3)', transition: 'all 0.15s' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Email Send Modal */}
      {showEmailModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 20 }} onClick={() => setShowEmailModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 24, padding: '32px 28px', maxWidth: 460, width: '100%', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#6366f1' }}>forward_to_inbox</span>
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-main)' }}>Enviar Contrato por Email</h3>
            <p style={{ margin: '0 0 20px', fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              O cliente receberá um email com o link para ler e assinar o contrato <strong>"{showEmailModal.templateName}"</strong>.
            </p>
            <input
              value={emailTo}
              onChange={e => setEmailTo(e.target.value)}
              placeholder="Email do cliente"
              type="email"
              style={{ ...inputS, textAlign: 'center', marginBottom: 20 }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setShowEmailModal(null)} style={{ padding: '12px 28px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.88rem' }}>
                Cancelar
              </button>
              <button onClick={sendContractEmail} disabled={sendingEmail || !emailTo} style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: sendingEmail || !emailTo ? '#94a3b8' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 700, cursor: sendingEmail || !emailTo ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6, boxShadow: !sendingEmail && emailTo ? '0 4px 15px rgba(99,102,241,0.3)' : 'none' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{sendingEmail ? 'hourglass_top' : 'send'}</span>
                {sendingEmail ? 'Enviando...' : 'Enviar Email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
