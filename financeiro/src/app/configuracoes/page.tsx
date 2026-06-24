'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { toast } from '@/components/toast';

const cardS: React.CSSProperties = { background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)', padding: 24 };
const sectionS: React.CSSProperties = { background: 'var(--bg)', borderRadius: 16, border: '1px solid var(--border)', padding: '24px 28px', marginBottom: 20 };

interface AuditEntry {
  id: string;
  action: string;
  user: string;
  details: string;
  timestamp: string;
}

interface MetaConfigState {
  configured: boolean;
  appId: string;
  appSecret: string;
  accessToken: string;
  verifyToken: string;
  pageId: string;
  phoneNumberId: string;
  wabaId: string;
  isActive: boolean;
  lastTestAt: string | null;
  lastTestOk: boolean;
}

interface WebhookLogEntry {
  id: string;
  source: string;
  eventType: string;
  status: string;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string;
  payload: string | null;
}

interface LeadAssignmentEntry {
  id: string;
  userId: string;
  userName: string;
  unit: string;
  isActive: boolean;
  weight: number;
  lastAssignedAt: string | null;
}

interface UserEntry {
  id: string;
  name: string;
  role: string;
  unit: string | null;
}

export default function ConfiguracoesPage() {
  const [activeTab, setActiveTab] = useState<'meta' | 'distribuicao' | 'webhooks' | 'backup' | 'auditoria'>('meta');

  // Backup
  const [backupLoading, setBackupLoading] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);

  // Audit
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Meta Config
  const [metaConfig, setMetaConfig] = useState<MetaConfigState>({
    configured: false, appId: '', appSecret: '', accessToken: '',
    verifyToken: '', pageId: '', phoneNumberId: '', wabaId: '',
    isActive: false, lastTestAt: null, lastTestOk: false,
  });
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaTesting, setMetaTesting] = useState(false);
  const [metaTestResult, setMetaTestResult] = useState<{ success: boolean; name?: string; error?: string } | null>(null);

  // Webhook Logs
  const [webhookLogs, setWebhookLogs] = useState<WebhookLogEntry[]>([]);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  // Lead Assignment
  const [assignments, setAssignments] = useState<LeadAssignmentEntry[]>([]);
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('virtuosa_last_backup');
    if (saved) setLastBackup(saved);
  }, []);

  // Fetch Meta Config
  const fetchMetaConfig = useCallback(async () => {
    setMetaLoading(true);
    try {
      const res = await fetch('/api/meta-config');
      const data = await res.json();
      setMetaConfig(data);
    } catch { /* ignore */ }
    setMetaLoading(false);
  }, []);

  // Fetch Webhook Logs
  const fetchWebhookLogs = useCallback(async () => {
    setWebhookLoading(true);
    try {
      const res = await fetch('/api/webhook-logs?limit=50');
      const data = await res.json();
      setWebhookLogs(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    setWebhookLoading(false);
  }, []);

  // Fetch Lead Assignments
  const fetchAssignments = useCallback(async () => {
    setAssignLoading(true);
    try {
      const [assignRes, usersRes] = await Promise.all([
        fetch('/api/lead-assignment'),
        fetch('/api/users'),
      ]);
      const assignData = await assignRes.json();
      const usersData = await usersRes.json();
      setAssignments(Array.isArray(assignData) ? assignData : []);
      setUsers(Array.isArray(usersData) ? usersData : (usersData.users || []));
    } catch { /* ignore */ }
    setAssignLoading(false);
  }, []);

  // Fetch Audit Logs
  const fetchAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await fetch('/api/audit?limit=50');
      const data = await res.json();
      const logs = Array.isArray(data) ? data : (data.logs || []);
      setAuditLogs(logs.map((l: { id: string; userName: string; action: string; details: string; createdAt: string }) => ({
        id: l.id, action: l.action, user: l.userName, details: l.details, timestamp: l.createdAt,
      })));
    } catch { /* ignore */ }
    setAuditLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'meta') fetchMetaConfig();
    if (activeTab === 'webhooks') fetchWebhookLogs();
    if (activeTab === 'distribuicao') fetchAssignments();
    if (activeTab === 'auditoria') fetchAuditLogs();
  }, [activeTab, fetchMetaConfig, fetchWebhookLogs, fetchAssignments, fetchAuditLogs]);

  // Save Meta Config
  const saveMetaConfig = async () => {
    setMetaSaving(true);
    try {
      const res = await fetch('/api/meta-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metaConfig),
      });
      const data = await res.json();
      if (data.success) {
        toast('✅ Configurações salvas!', 'success');
        fetchMetaConfig();
      } else {
        toast('Erro ao salvar', 'error');
      }
    } catch {
      toast('Erro ao salvar', 'error');
    }
    setMetaSaving(false);
  };

  // Test Meta Connection
  const testMetaConnection = async () => {
    setMetaTesting(true);
    setMetaTestResult(null);
    try {
      const res = await fetch('/api/meta-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setMetaTestResult(data);
      if (data.success) {
        toast(`✅ Conectado: ${data.name}`, 'success');
      } else {
        toast(`❌ Falha: ${data.error}`, 'error');
      }
      fetchMetaConfig();
    } catch {
      setMetaTestResult({ success: false, error: 'Erro de conexão' });
      toast('Erro ao testar', 'error');
    }
    setMetaTesting(false);
  };

  // Add Lead Assignment
  const addAssignment = async () => {
    if (!selectedUserId) return;
    const user = users.find(u => u.id === selectedUserId);
    if (!user) return;
    try {
      await fetch('/api/lead-assignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, userName: user.name, unit: user.unit || 'SCS' }),
      });
      toast('✅ Operador adicionado', 'success');
      setSelectedUserId('');
      fetchAssignments();
    } catch {
      toast('Erro', 'error');
    }
  };

  // Toggle Assignment
  const toggleAssignment = async (id: string, isActive: boolean) => {
    try {
      await fetch('/api/lead-assignment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isActive: !isActive }),
      });
      fetchAssignments();
    } catch { /* ignore */ }
  };

  // Remove Assignment
  const removeAssignment = async (id: string) => {
    if (!confirm('Remover operador da distribuição?')) return;
    try {
      await fetch(`/api/lead-assignment?id=${id}`, { method: 'DELETE' });
      toast('Removido', 'success');
      fetchAssignments();
    } catch { /* ignore */ }
  };

  const handleBackup = async () => {
    setBackupLoading(true);
    try {
      const [clientsRes, catalogRes] = await Promise.all([
        fetch('/api/clients?limit=10000'),
        fetch('/api/catalog'),
      ]);
      const clients = await clientsRes.json();
      const catalog = await catalogRes.json();

      const backupData = {
        version: '2.0',
        date: new Date().toISOString(),
        clients: clients.clients || [],
        catalog: catalog.services || [],
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `virtuosa-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      const now = new Date().toLocaleString('pt-BR');
      setLastBackup(now);
      localStorage.setItem('virtuosa_last_backup', now);
      toast('✅ Backup exportado com sucesso!', 'success');
    } catch {
      toast('Erro ao gerar backup', 'error');
    }
    setBackupLoading(false);
  };

  const tabs = [
    { key: 'meta' as const, label: 'Meta API', icon: 'share' },
    { key: 'distribuicao' as const, label: 'Distribuição', icon: 'groups' },
    { key: 'webhooks' as const, label: 'Webhooks', icon: 'webhook' },
    { key: 'backup' as const, label: 'Backup', icon: 'backup' },
    { key: 'auditoria' as const, label: 'Auditoria', icon: 'receipt_long' },
  ];

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const inputS: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)',
    background: 'var(--bg)', fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none',
    color: 'var(--text-main)', boxSizing: 'border-box',
  };

  const labelS: React.CSSProperties = { fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6, display: 'block' };

  const statusColors: Record<string, string> = {
    received: '#f59e0b',
    processing: '#3b82f6',
    processed: '#10b981',
    error: '#ef4444',
  };

  const actionColors: Record<string, string> = {
    'create': '#10b981',
    'update': '#6366f1',
    'delete': '#ef4444',
    'login': '#3b82f6',
    'status': '#f59e0b',
  };

  return (
    <AuthGuard>
      <AppHeader activePage="perfil" />
      <main style={{ padding: '24px 32px', maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--primary)' }}>settings</span>
            Configurações
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Meta API, distribuição de leads, webhooks e auditoria</p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--bg)', borderRadius: 14, border: '1px solid var(--border)', padding: 4, overflowX: 'auto' }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none', minWidth: 100,
                background: activeTab === tab.key ? 'linear-gradient(135deg, var(--primary), #ff4db1)' : 'transparent',
                color: activeTab === tab.key ? '#fff' : 'var(--text-muted)',
                fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'all 0.2s', whiteSpace: 'nowrap',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* META API TAB */}
        {activeTab === 'meta' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Connection Status */}
            <div style={{ ...sectionS, display: 'flex', alignItems: 'center', gap: 14, padding: '18px 24px' }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: metaConfig.lastTestOk ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span className="material-symbols-outlined" style={{
                  fontSize: 22, color: metaConfig.lastTestOk ? '#10b981' : '#f59e0b',
                }}>
                  {metaConfig.lastTestOk ? 'check_circle' : 'warning'}
                </span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: '0.92rem' }}>
                  {metaConfig.lastTestOk ? 'Conectado à Meta API' : 'Configuração Pendente'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {metaConfig.lastTestAt ? `Último teste: ${formatDate(metaConfig.lastTestAt)}` : 'Nenhum teste realizado'}
                </div>
              </div>
              <button onClick={testMetaConnection} disabled={metaTesting}
                style={{
                  padding: '8px 16px', borderRadius: 10, border: 'none',
                  background: metaTesting ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                  color: '#fff', fontWeight: 700, fontSize: '0.78rem', cursor: metaTesting ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
                }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  {metaTesting ? 'progress_activity' : 'wifi_tethering'}
                </span>
                {metaTesting ? 'Testando...' : 'Testar Conexão'}
              </button>
            </div>

            {metaTestResult && (
              <div style={{
                ...sectionS, padding: '14px 20px',
                background: metaTestResult.success ? 'rgba(16,185,129,0.04)' : 'rgba(239,68,68,0.04)',
                border: `1px solid ${metaTestResult.success ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: metaTestResult.success ? '#10b981' : '#ef4444' }}>
                    {metaTestResult.success ? 'check_circle' : 'error'}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: metaTestResult.success ? '#10b981' : '#ef4444' }}>
                    {metaTestResult.success ? `Conectado: ${metaTestResult.name}` : `Falha: ${metaTestResult.error}`}
                  </span>
                </div>
              </div>
            )}

            {/* Credentials Form */}
            <div style={sectionS}>
              <h3 style={{ margin: '0 0 20px', fontSize: '1rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#3b82f6' }}>key</span>
                Credenciais Meta
              </h3>

              {metaLoading ? (
                <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>Carregando...</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={labelS}>App ID</label>
                    <input style={inputS} value={metaConfig.appId} onChange={e => setMetaConfig({ ...metaConfig, appId: e.target.value })} placeholder="Ex: 123456789" />
                  </div>
                  <div>
                    <label style={labelS}>App Secret</label>
                    <input style={inputS} type="password" value={metaConfig.appSecret} onChange={e => setMetaConfig({ ...metaConfig, appSecret: e.target.value })} placeholder="••••••••" />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelS}>Access Token</label>
                    <input style={inputS} type="password" value={metaConfig.accessToken} onChange={e => setMetaConfig({ ...metaConfig, accessToken: e.target.value })} placeholder="••••••••" />
                  </div>
                  <div>
                    <label style={labelS}>Verify Token</label>
                    <input style={inputS} value={metaConfig.verifyToken} onChange={e => setMetaConfig({ ...metaConfig, verifyToken: e.target.value })} placeholder="Token para validar webhooks" />
                  </div>
                  <div>
                    <label style={labelS}>Page ID</label>
                    <input style={inputS} value={metaConfig.pageId} onChange={e => setMetaConfig({ ...metaConfig, pageId: e.target.value })} placeholder="ID da página Facebook" />
                  </div>
                  <div>
                    <label style={labelS}>Phone Number ID</label>
                    <input style={inputS} value={metaConfig.phoneNumberId} onChange={e => setMetaConfig({ ...metaConfig, phoneNumberId: e.target.value })} placeholder="ID do número WhatsApp" />
                  </div>
                  <div>
                    <label style={labelS}>WABA ID</label>
                    <input style={inputS} value={metaConfig.wabaId} onChange={e => setMetaConfig({ ...metaConfig, wabaId: e.target.value })} placeholder="WhatsApp Business Account ID" />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
                <button onClick={saveMetaConfig} disabled={metaSaving}
                  style={{
                    padding: '12px 24px', borderRadius: 12, border: 'none',
                    background: metaSaving ? '#94a3b8' : 'linear-gradient(135deg, var(--primary), #ff4db1)',
                    color: '#fff', fontWeight: 800, fontSize: '0.88rem', cursor: metaSaving ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span>
                  {metaSaving ? 'Salvando...' : 'Salvar Configurações'}
                </button>
              </div>
            </div>

            {/* Webhook URLs */}
            <div style={sectionS}>
              <h3 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#10b981' }}>webhook</span>
                URLs de Webhook
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 14 }}>
                Configure estas URLs no painel da Meta Business Suite
              </p>
              {[
                { label: 'Lead Ads', url: '/api/webhooks/meta/lead' },
                { label: 'WhatsApp Mensagens', url: '/api/webhooks/meta/messages' },
                { label: 'WhatsApp (Legacy)', url: '/api/whatsapp/webhook' },
              ].map(wh => (
                <div key={wh.label} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  padding: '10px 14px', borderRadius: 10, background: 'var(--card-bg)', border: '1px solid var(--border)',
                  marginBottom: 8,
                }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>{wh.label}</div>
                    <code style={{ fontSize: '0.75rem', color: '#3b82f6' }}>{typeof window !== 'undefined' ? window.location.origin : ''}{wh.url}</code>
                  </div>
                  <button onClick={() => {
                    navigator.clipboard.writeText((typeof window !== 'undefined' ? window.location.origin : '') + wh.url);
                    toast('URL copiada!', 'success');
                  }} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: 4, cursor: 'pointer', display: 'flex' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-muted)' }}>content_copy</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DISTRIBUIÇÃO TAB */}
        {activeTab === 'distribuicao' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={sectionS}>
              <h3 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#8b5cf6' }}>groups</span>
                Distribuição de Leads (Round-Robin)
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                Novos leads serão distribuídos automaticamente entre os operadores ativos, de forma rotativa.
              </p>

              {/* Add operator */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)}
                  style={{ ...inputS, flex: 1 }}>
                  <option value="">Selecionar operador...</option>
                  {users.filter(u => !assignments.some(a => a.userId === u.id)).map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                  ))}
                </select>
                <button onClick={addAssignment} disabled={!selectedUserId}
                  style={{
                    padding: '10px 18px', borderRadius: 10, border: 'none',
                    background: !selectedUserId ? '#94a3b8' : 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                    color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: selectedUserId ? 'pointer' : 'not-allowed',
                    fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>person_add</span>
                  Adicionar
                </button>
              </div>

              {/* Operators list */}
              {assignLoading ? (
                <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>Carregando...</div>
              ) : assignments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 36, opacity: 0.2 }}>group_off</span>
                  <p style={{ marginTop: 8, fontSize: '0.82rem' }}>Nenhum operador configurado</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {assignments.map(a => (
                    <div key={a.id} style={{
                      ...cardS, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
                      opacity: a.isActive ? 1 : 0.5,
                    }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '0.78rem' }}>
                        {a.userName.charAt(0)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: '0.88rem' }}>{a.userName}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          Peso: {a.weight} • {a.unit}
                          {a.lastAssignedAt && ` • Último: ${formatDate(a.lastAssignedAt)}`}
                        </div>
                      </div>
                      <button onClick={() => toggleAssignment(a.id, a.isActive)}
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: 4, cursor: 'pointer', display: 'flex' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: a.isActive ? '#10b981' : '#ef4444' }}>
                          {a.isActive ? 'toggle_on' : 'toggle_off'}
                        </span>
                      </button>
                      <button onClick={() => removeAssignment(a.id)}
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: 4, cursor: 'pointer', display: 'flex' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#ef4444' }}>delete</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* WEBHOOKS TAB */}
        {activeTab === 'webhooks' && (
          <div style={sectionS}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#f59e0b' }}>webhook</span>
              Logs de Webhook
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {webhookLogs.length} registro(s)
              </span>
            </h3>

            {webhookLoading ? (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>Carregando...</div>
            ) : webhookLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 40, opacity: 0.2, color: 'var(--text-muted)' }}>webhook</span>
                <p style={{ color: 'var(--text-muted)', marginTop: 12, fontSize: '0.85rem' }}>Nenhum webhook recebido</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Webhooks aparecerão aqui quando a Meta enviar eventos</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {webhookLogs.map(log => (
                  <div key={log.id} style={{ ...cardS, padding: 0, overflow: 'hidden' }}>
                    <div onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)} style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: log.payload ? 'pointer' : 'default' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColors[log.status] || '#6366f1', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
                          {log.source}
                        </span>
                        <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: `${statusColors[log.status]}15`, color: statusColors[log.status] }}>
                          {log.status}
                        </span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{log.eventType}</span>
                      </div>
                      {log.errorMessage && (
                        <div style={{ fontSize: '0.68rem', color: '#ef4444', marginTop: 3, fontStyle: 'italic' }}>{log.errorMessage}</div>
                      )}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', flexShrink: 0, textAlign: 'right' }}>
                      {formatDate(log.createdAt)}
                      {log.retryCount > 0 && (
                        <div style={{ fontSize: '0.58rem', color: '#f59e0b' }}>Retry: {log.retryCount}</div>
                      )}
                    </div>
                    </div>
                    {expandedLog === log.id && log.payload && (
                      <pre style={{ margin: 0, padding: '10px 14px', borderTop: '1px solid var(--border)', background: 'var(--bg)', fontSize: '0.62rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflow: 'auto' }}>
                        {(() => { try { return JSON.stringify(JSON.parse(log.payload as string), null, 2); } catch { return log.payload; } })()}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* BACKUP TAB */}
        {activeTab === 'backup' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={sectionS}>
              <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>cloud_download</span>
                Exportar Backup
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 20px', lineHeight: 1.6 }}>
                Exporte uma cópia de segurança de todos os dados do sistema.
              </p>
              {lastBackup && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.1)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#10b981' }}>check_circle</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#10b981' }}>Último backup: {lastBackup}</span>
                </div>
              )}
              <button onClick={handleBackup} disabled={backupLoading}
                style={{
                  padding: '14px 28px', borderRadius: 14, border: 'none',
                  background: backupLoading ? '#94a3b8' : 'linear-gradient(135deg, var(--primary), #ff4db1)',
                  color: '#fff', fontWeight: 800, cursor: backupLoading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 8,
                }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{backupLoading ? 'hourglass_top' : 'download'}</span>
                {backupLoading ? 'Gerando...' : 'Baixar Backup'}
              </button>
            </div>

            <div style={sectionS}>
              <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#6366f1' }}>schedule</span>
                Informações do Sistema
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Banco de dados', value: 'MySQL', icon: 'database', color: '#3b82f6' },
                  { label: 'Hospedagem', value: 'Vercel', icon: 'cloud', color: '#10b981' },
                  { label: 'Framework', value: 'Next.js 16', icon: 'code', color: '#8b5cf6' },
                  { label: 'Versão', value: 'v3.0 (Meta CRM)', icon: 'info', color: '#f59e0b' },
                ].map(item => (
                  <div key={item.label} style={{ ...cardS, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: `${item.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: item.color }}>{item.icon}</span>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{item.label}</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 800 }}>{item.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* AUDITORIA TAB */}
        {activeTab === 'auditoria' && (
          <div style={sectionS}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>receipt_long</span>
              Registro de Atividades
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {auditLogs.length} registro(s)
              </span>
            </h3>

            {auditLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Carregando...</div>
            ) : auditLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 56, opacity: 0.2, color: 'var(--text-muted)' }}>receipt_long</span>
                <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>Nenhum registro encontrado</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {auditLogs.map(log => (
                  <div key={log.id} style={{ ...cardS, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: `${actionColors[log.action] || '#6366f1'}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: actionColors[log.action] || '#6366f1' }}>
                        {log.action === 'login' ? 'login' : log.action === 'create' ? 'add_circle' : log.action === 'delete' ? 'delete' : 'edit'}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: `${actionColors[log.action] || '#6366f1'}12`, color: actionColors[log.action] || '#6366f1' }}>
                          {log.action}
                        </span>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)' }}>{log.user}</span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.details}</div>
                    </div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {formatDate(log.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </AuthGuard>
  );
}
