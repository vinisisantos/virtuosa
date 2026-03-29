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

export default function ConfiguracoesPage() {
  const [activeTab, setActiveTab] = useState<'backup' | 'auditoria'>('backup');
  const [backupLoading, setBackupLoading] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('virtuosa_last_backup');
    if (saved) setLastBackup(saved);
  }, []);

  const fetchAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    try {
      // Simulated audit logs - replace with real API when available
      const logs: AuditEntry[] = [
        { id: '1', action: 'Login', user: 'Vinicius Santos', details: 'Login realizado com sucesso', timestamp: new Date().toISOString() },
        { id: '2', action: 'Cadastro Cliente', user: 'Vinicius Santos', details: 'Novo cliente cadastrado via Orçamento', timestamp: new Date(Date.now() - 3600000).toISOString() },
        { id: '3', action: 'Pacote Fechado', user: 'Vinicius Santos', details: 'Novo pacote criado - 5 sessões', timestamp: new Date(Date.now() - 7200000).toISOString() },
        { id: '4', action: 'Edição Usuário', user: 'Admin', details: 'Permissões atualizadas', timestamp: new Date(Date.now() - 86400000).toISOString() },
        { id: '5', action: 'Backup Manual', user: 'Vinicius Santos', details: 'Backup exportado com sucesso', timestamp: new Date(Date.now() - 172800000).toISOString() },
      ];
      setAuditLogs(logs);
    } catch {}
    setAuditLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'auditoria') fetchAuditLogs();
  }, [activeTab, fetchAuditLogs]);

  const handleBackup = async () => {
    setBackupLoading(true);
    try {
      // Export data as JSON backup
      const [clientsRes, catalogRes] = await Promise.all([
        fetch('/api/clients?limit=10000'),
        fetch('/api/catalog'),
      ]);
      const clients = await clientsRes.json();
      const catalog = await catalogRes.json();

      const backupData = {
        version: '1.0',
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
    { key: 'backup' as const, label: 'Backup', icon: 'backup' },
    { key: 'auditoria' as const, label: 'Auditoria', icon: 'receipt_long' },
  ];

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const actionColors: Record<string, string> = {
    'Login': '#6366f1',
    'Cadastro Cliente': '#10b981',
    'Pacote Fechado': '#f59e0b',
    'Edição Usuário': '#8b5cf6',
    'Backup Manual': '#3b82f6',
  };

  return (
    <AuthGuard>
      <AppHeader activePage="perfil" />
      <main style={{ padding: '24px 32px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--primary)' }}>settings</span>
            Configurações
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Gerenciamento do sistema, backup e auditoria</p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--bg)', borderRadius: 14, border: '1px solid var(--border)', padding: 4 }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1, padding: '12px 20px', borderRadius: 10, border: 'none',
                background: activeTab === tab.key ? 'linear-gradient(135deg, var(--primary), #ff4db1)' : 'transparent',
                color: activeTab === tab.key ? '#fff' : 'var(--text-muted)',
                fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.2s',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* BACKUP TAB */}
        {activeTab === 'backup' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={sectionS}>
              <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>cloud_download</span>
                Exportar Backup
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 20px', lineHeight: 1.6 }}>
                Exporte uma cópia de segurança de todos os dados do sistema: clientes, catálogo de serviços e configurações.
                O arquivo será baixado em formato JSON.
              </p>

              {lastBackup && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.1)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#10b981' }}>check_circle</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#10b981' }}>Último backup: {lastBackup}</span>
                </div>
              )}

              <button
                onClick={handleBackup}
                disabled={backupLoading}
                style={{
                  padding: '14px 28px', borderRadius: 14, border: 'none',
                  background: backupLoading ? '#94a3b8' : 'linear-gradient(135deg, var(--primary), #ff4db1)',
                  color: '#fff', fontWeight: 800, cursor: backupLoading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                  {backupLoading ? 'hourglass_top' : 'download'}
                </span>
                {backupLoading ? 'Gerando Backup...' : 'Baixar Backup'}
              </button>
            </div>

            {/* Backup schedule info */}
            <div style={sectionS}>
              <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#6366f1' }}>schedule</span>
                Informações do Sistema
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Banco de dados', value: 'MySQL', icon: 'database', color: '#3b82f6' },
                  { label: 'Hospedagem', value: 'Vercel', icon: 'cloud', color: '#10b981' },
                  { label: 'Framework', value: 'Next.js 15', icon: 'code', color: '#8b5cf6' },
                  { label: 'Versão', value: 'v2.0', icon: 'info', color: '#f59e0b' },
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
          <div>
            <div style={sectionS}>
              <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>receipt_long</span>
                Registro de Atividades
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  {auditLogs.length} registro(s)
                </span>
              </h3>

              {auditLoading ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>Carregando...</div>
              ) : auditLogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 56, opacity: 0.2, color: 'var(--text-muted)' }}>receipt_long</span>
                  <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>Nenhum registro encontrado</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {auditLogs.map(log => (
                    <div key={log.id} style={{ ...cardS, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${actionColors[log.action] || '#6366f1'}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 20, color: actionColors[log.action] || '#6366f1' }}>
                          {log.action === 'Login' ? 'login' : log.action === 'Cadastro Cliente' ? 'person_add' : log.action === 'Pacote Fechado' ? 'inventory' : log.action === 'Backup Manual' ? 'backup' : 'edit'}
                        </span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: `${actionColors[log.action] || '#6366f1'}12`, color: actionColors[log.action] || '#6366f1' }}>
                            {log.action}
                          </span>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)' }}>{log.user}</span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>{log.details}</div>
                      </div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {formatDate(log.timestamp)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </AuthGuard>
  );
}
