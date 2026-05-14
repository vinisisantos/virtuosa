'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { toast } from '@/components/toast';
import { useGlobalUnit } from '@/contexts/UnitContext';

type ConnectionState = 'disconnected' | 'connecting' | 'scanning' | 'connected' | 'error';

interface Config {
  configured: boolean;
  apiUrl: string;
  apiKeyMasked: string;
  instanceName: string;
  isConnected: boolean;
  phoneNumber: string | null;
  profileName: string | null;
  lastConnected: string | null;
}

export default function WhatsAppConnectPage() {
  const { globalUnit } = useGlobalUnit();
  const [config, setConfig] = useState<Config | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showAddInstance, setShowAddInstance] = useState(false);

  // Multi-instance state
  interface InstanceInfo { id: string; instanceName: string; label: string | null; isConnected: boolean; phoneNumber: string | null; profileName: string | null; configured?: boolean; providerType?: string; }
  const [instances, setInstances] = useState<InstanceInfo[]>([]);
  const [activeInstance, setActiveInstance] = useState<string>(''); // instanceName being configured/connected

  // Config form
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [instanceName, setInstanceName] = useState('virtuosa-default');
  const [instanceLabel, setInstanceLabel] = useState('');


  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Fetch instances list ───
  const fetchInstances = useCallback(async () => {
    try {
      const res = await fetch(`/api/whatsapp/session?action=instances&unit=${encodeURIComponent(globalUnit)}`);
      const data = await res.json();
      if (Array.isArray(data)) setInstances(data);
    } catch { /* ignore */ }
  }, [globalUnit]);

  // ─── Fetch config for active instance ───
  const fetchConfig = useCallback(async () => {
    try {
      const instParam = activeInstance ? `&instance=${encodeURIComponent(activeInstance)}` : '';
      const res = await fetch(`/api/whatsapp/session?action=config&unit=${encodeURIComponent(globalUnit)}${instParam}`);
      const data = await res.json();
      setConfig(data);
      setApiUrl(data.apiUrl || '');
      setInstanceName(data.instanceName || 'virtuosa-default');

      if (data.isConnected) {
        setConnectionState('connected');
      }
      if (!data.configured) {
        setShowConfig(true);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [globalUnit, activeInstance]);

  useEffect(() => { fetchInstances(); }, [fetchInstances]);
  useEffect(() => { if (activeInstance || instances.length === 0) fetchConfig(); }, [fetchConfig, activeInstance, instances.length]);

  // ─── Check connection status ───
  const checkStatus = useCallback(async () => {
    try {
      const instParam = activeInstance ? `&instance=${encodeURIComponent(activeInstance)}` : '';
      const res = await fetch(`/api/whatsapp/session?action=status&unit=${encodeURIComponent(globalUnit)}${instParam}`);
      const data = await res.json();
      if (data.isConnected) {
        setConnectionState('connected');
        setQrCode(null);
        // Stop QR polling
        if (qrPollRef.current) { clearInterval(qrPollRef.current); qrPollRef.current = null; }
        fetchConfig(); // refresh profile info
      } else if (connectionState === 'scanning') {
        // Still scanning, keep polling
      } else if (connectionState !== 'connecting') {
        setConnectionState('disconnected');
      }
    } catch { /* ignore */ }
  }, [connectionState, fetchConfig]);

  // Poll status while scanning
  useEffect(() => {
    if (connectionState === 'scanning' || connectionState === 'connecting') {
      pollRef.current = setInterval(checkStatus, 3000);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [connectionState, checkStatus]);

  // ─── Save config ───
  const saveConfig = async () => {
    if (!apiUrl.trim()) { toast('Insira a URL da API', 'error'); return; }
    if (!apiKey.trim() && !config?.configured) { toast('Insira a API Key', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/whatsapp/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiUrl: apiUrl.trim(), apiKey: apiKey.trim(), instanceName, label: instanceLabel || null, unit: globalUnit, action: 'save' }),
      });
      const data = await res.json();
      if (data.success) {
        toast('✅ Configuração salva!', 'success');
        setShowConfig(false);
        setApiKey('');
        setActiveInstance(instanceName);
        fetchConfig();
        fetchInstances();
      } else {
        toast('Erro ao salvar', 'error');
      }
    } catch { toast('Erro ao salvar', 'error'); }
    setSaving(false);
  };

  // ─── Connect (get QR code) ───
  const startConnection = async () => {
    setConnectionState('connecting');
    setQrCode(null);

    try {
      // First, create instance if needed
      await fetch('/api/whatsapp/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_instance', unit: globalUnit, instanceName: activeInstance || instanceName }),
      });

      // Then get QR code
      const instParam = activeInstance ? `&instance=${encodeURIComponent(activeInstance)}` : '';
      const qrRes = await fetch(`/api/whatsapp/session?action=qrcode&unit=${encodeURIComponent(globalUnit)}${instParam}`);
      const qrData = await qrRes.json();

      if (qrData.qrcode) {
        setQrCode(qrData.qrcode);
        setConnectionState('scanning');

        // Poll for new QR codes (they expire every ~30s)
        qrPollRef.current = setInterval(async () => {
          try {
            const instP = activeInstance ? `&instance=${encodeURIComponent(activeInstance)}` : '';
            const r = await fetch(`/api/whatsapp/session?action=qrcode&unit=${encodeURIComponent(globalUnit)}${instP}`);
            const d = await r.json();
            if (d.qrcode) setQrCode(d.qrcode);
            if (d.state === 'open') {
              setConnectionState('connected');
              setQrCode(null);
              if (qrPollRef.current) clearInterval(qrPollRef.current);
            }
          } catch { /* ignore */ }
        }, 25000);
      } else if (qrData.error) {
        toast(`❌ ${qrData.error}`, 'error');
        setConnectionState('error');
      } else {
        // Maybe already connected
        const stInstP = activeInstance ? `&instance=${encodeURIComponent(activeInstance)}` : '';
        const stRes = await fetch(`/api/whatsapp/session?action=status&unit=${encodeURIComponent(globalUnit)}${stInstP}`);
        const stData = await stRes.json();
        if (stData.isConnected) {
          setConnectionState('connected');
          fetchConfig();
        } else {
          setConnectionState('error');
          toast('Não foi possível gerar o QR code', 'error');
        }
      }
    } catch {
      setConnectionState('error');
      toast('Erro ao conectar com o servidor WhatsApp', 'error');
    }
  };

  // ─── Disconnect ───
  const disconnect = async () => {
    if (!confirm('Desconectar o WhatsApp?')) return;
    try {
      const instParam = activeInstance ? `&instance=${encodeURIComponent(activeInstance)}` : '';
      await fetch(`/api/whatsapp/session?unit=${encodeURIComponent(globalUnit)}${instParam}`, { method: 'DELETE' });
      setConnectionState('disconnected');
      setQrCode(null);
      toast('WhatsApp desconectado', 'success');
      fetchConfig();
      fetchInstances();
    } catch { toast('Erro ao desconectar', 'error'); }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (qrPollRef.current) clearInterval(qrPollRef.current);
    };
  }, []);

  const stateInfo: Record<ConnectionState, { icon: string; label: string; color: string; bg: string }> = {
    disconnected: { icon: 'link_off', label: 'Desconectado', color: '#8696a0', bg: 'rgba(134,150,160,0.08)' },
    connecting: { icon: 'progress_activity', label: 'Conectando...', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
    scanning: { icon: 'qr_code_scanner', label: 'Aguardando leitura do QR Code', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
    connected: { icon: 'check_circle', label: 'Conectado', color: '#25d366', bg: 'rgba(37,211,102,0.08)' },
    error: { icon: 'error', label: 'Erro na conexão', color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const inputS: React.CSSProperties = {
    width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)',
    background: 'var(--bg)', fontSize: '0.88rem', fontFamily: 'inherit', outline: 'none',
    color: 'var(--text-main)', boxSizing: 'border-box', transition: 'border-color 0.2s',
  };

  const labelS: React.CSSProperties = {
    fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 6, display: 'block',
  };

  return (
    <AuthGuard requiredPermission="dashboard">
      <div style={{ width: '100%', maxWidth: 1600, margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <AppHeader activePage="clientes" />
        <main style={{ flex: 1, padding: '24px 20px', maxWidth: 800, margin: '0 auto', width: '100%' }}>

          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 14,
                background: 'linear-gradient(135deg, #25d366, #128c7e)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#fff' }}>qr_code_2</span>
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, letterSpacing: '-0.5px' }}>WhatsApp Conectar</h1>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>Espelhar WhatsApp Business via QR Code</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-muted)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 40, animation: 'wa-spin 1.2s linear infinite' }}>progress_activity</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* ═══ Instance Selector Tabs ═══ */}
              {instances.length > 1 && (
                <div style={{
                  display: 'flex', gap: 6, overflowX: 'auto', padding: '2px 0',
                }}>
                  {instances.map(inst => (
                    <button
                      key={inst.instanceName}
                      onClick={() => {
                        setActiveInstance(inst.instanceName);
                        setInstanceName(inst.instanceName);
                        setInstanceLabel(inst.label || '');
                        setConnectionState(inst.isConnected ? 'connected' : 'disconnected');
                        setQrCode(null);
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 18px', borderRadius: 14,
                        whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit',
                        fontSize: '0.85rem', fontWeight: 700,
                        transition: 'all 0.2s',
                        background: activeInstance === inst.instanceName
                          ? 'linear-gradient(135deg, #25d366, #128c7e)'
                          : 'var(--card-bg)',
                        color: activeInstance === inst.instanceName
                          ? '#fff'
                          : 'var(--text-muted)',
                        boxShadow: activeInstance === inst.instanceName
                          ? '0 4px 12px rgba(37,211,102,0.3)'
                          : 'var(--shadow-sm)',
                        border: activeInstance === inst.instanceName
                          ? 'none'
                          : '1px solid var(--border)',
                      }}
                    >
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        background: inst.isConnected ? '#25d366' : '#8696a0',
                        boxShadow: inst.isConnected ? '0 0 6px #25d366' : 'none',
                      }} />
                      {inst.label || inst.instanceName}
                    </button>
                  ))}
                </div>
              )}

              {/* ═══ Connection Status Card ═══ */}
              <div style={{
                background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-md)', overflow: 'hidden',
              }}>
                {/* Status bar */}
                <div style={{
                  padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 14,
                  background: stateInfo[connectionState].bg,
                  borderBottom: '1px solid var(--border)',
                }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 14,
                    background: `${stateInfo[connectionState].color}18`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span className="material-symbols-outlined" style={{
                      fontSize: 24, color: stateInfo[connectionState].color,
                      ...(connectionState === 'connecting' ? { animation: 'wa-spin 1.2s linear infinite' } : {}),
                    }}>
                      {stateInfo[connectionState].icon}
                    </span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: stateInfo[connectionState].color, display: 'flex', alignItems: 'center', gap: 10 }}>
                      {stateInfo[connectionState].label}
                      {activeInstance && instances.length > 1 && (
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 700, padding: '3px 10px',
                          borderRadius: 8, background: 'rgba(59,130,246,0.1)', color: '#3b82f6',
                        }}>
                          {instances.find(i => i.instanceName === activeInstance)?.label || activeInstance}
                        </span>
                      )}
                    </div>
                    {connectionState === 'connected' && config?.profileName && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {config.profileName} • {config.phoneNumber || ''}
                      </div>
                    )}
                    {connectionState === 'connected' && config?.lastConnected && (
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        Conectado desde: {formatDate(config.lastConnected)}
                      </div>
                    )}
                  </div>

                  {/* Config button */}
                  <button onClick={() => setShowConfig(!showConfig)} style={{
                    background: 'none', border: '1px solid var(--border)', borderRadius: 10,
                    padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                    fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>settings</span>
                    Config
                  </button>
                </div>

                {/* ─── QR Code Area ─── */}
                <div style={{ padding: '32px 24px', textAlign: 'center' }}>

                  {/* Disconnected — show connect button */}
                  {connectionState === 'disconnected' && config?.configured && (
                    <div>
                      <div style={{
                        width: 100, height: 100, borderRadius: '50%', margin: '0 auto 24px',
                        background: 'linear-gradient(135deg, rgba(37,211,102,0.1), rgba(18,140,126,0.1))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#25d366' }}>smartphone</span>
                      </div>
                      <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 800 }}>Conectar WhatsApp</h3>
                      <p style={{ margin: '0 0 24px', fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: 400, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
                        Clique no botão abaixo para gerar um QR code. Escaneie com o WhatsApp Business do celular para conectar.
                      </p>
                      <button onClick={startConnection} style={{
                        padding: '14px 36px', borderRadius: 14, border: 'none',
                        background: 'linear-gradient(135deg, #25d366, #128c7e)',
                        color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer',
                        fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 10,
                        boxShadow: '0 4px 16px rgba(37,211,102,0.3)',
                        transition: 'transform 0.15s, box-shadow 0.15s',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(37,211,102,0.4)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(37,211,102,0.3)'; }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>qr_code_2</span>
                        Gerar QR Code
                      </button>
                    </div>
                  )}

                  {/* Not configured — prompt to configure */}
                  {connectionState === 'disconnected' && !config?.configured && !showConfig && (
                    <div>
                      <div style={{
                        width: 100, height: 100, borderRadius: '50%', margin: '0 auto 24px',
                        background: 'rgba(245,158,11,0.08)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#f59e0b' }}>warning</span>
                      </div>
                      <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 800 }}>Configuração Necessária</h3>
                      <p style={{ margin: '0 0 20px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Configure a URL do servidor WhatsApp API para começar.
                      </p>
                      <button onClick={() => setShowConfig(true)} style={{
                        padding: '12px 28px', borderRadius: 12, border: 'none',
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        color: '#fff', fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'inherit',
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>settings</span>
                        Configurar
                      </button>
                    </div>
                  )}

                  {/* Connecting — spinner */}
                  {connectionState === 'connecting' && (
                    <div>
                      <span className="material-symbols-outlined" style={{ fontSize: 56, color: '#f59e0b', animation: 'wa-spin 1.2s linear infinite' }}>progress_activity</span>
                      <p style={{ marginTop: 16, fontWeight: 700, fontSize: '0.95rem' }}>Gerando QR Code...</p>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Conectando ao servidor WhatsApp</p>
                    </div>
                  )}

                  {/* Scanning — show QR code */}
                  {connectionState === 'scanning' && qrCode && (
                    <div>
                      <div style={{
                        display: 'inline-block', padding: 16, borderRadius: 20,
                        background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                        position: 'relative',
                      }}>
                        {/* Green animated border */}
                        <div style={{
                          position: 'absolute', inset: -3, borderRadius: 23,
                          background: 'linear-gradient(135deg, #25d366, #128c7e, #25d366)',
                          backgroundSize: '200% 200%',
                          animation: 'wa-gradient 3s ease infinite',
                          zIndex: 0,
                        }} />
                        <div style={{
                          position: 'relative', zIndex: 1, padding: 14,
                          background: '#fff', borderRadius: 17,
                        }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                            alt="QR Code WhatsApp"
                            style={{ width: 260, height: 260, display: 'block' }}
                          />
                        </div>
                      </div>

                      <div style={{ marginTop: 24 }}>
                        <p style={{ fontWeight: 800, fontSize: '1rem', margin: '0 0 12px' }}>
                          📱 Escaneie com o WhatsApp
                        </p>
                        <div style={{
                          display: 'inline-flex', flexDirection: 'column', gap: 10,
                          textAlign: 'left', padding: '16px 24px', borderRadius: 16,
                          background: 'var(--bg)', border: '1px solid var(--border)',
                          maxWidth: 360,
                        }}>
                          {[
                            { n: '1', text: 'Abra o WhatsApp Business no celular' },
                            { n: '2', text: 'Toque em ⋮ Menu > Aparelhos conectados' },
                            { n: '3', text: 'Toque em "Conectar um aparelho"' },
                            { n: '4', text: 'Aponte a câmera para este QR Code' },
                          ].map(step => (
                            <div key={step.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                              <span style={{
                                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                                background: 'linear-gradient(135deg, #25d366, #128c7e)',
                                color: '#fff', fontSize: '0.72rem', fontWeight: 800,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>{step.n}</span>
                              <span style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.5, paddingTop: 2 }}>
                                {step.text}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <button onClick={() => { setConnectionState('disconnected'); setQrCode(null); if (qrPollRef.current) clearInterval(qrPollRef.current); }}
                        style={{
                          marginTop: 20, padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)',
                          background: 'var(--bg)', color: 'var(--text-muted)', fontWeight: 700,
                          fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
                        }}>
                        Cancelar
                      </button>
                    </div>
                  )}

                  {/* Connected — show info */}
                  {connectionState === 'connected' && (
                    <div>
                      <div style={{
                        width: 100, height: 100, borderRadius: '50%', margin: '0 auto 20px',
                        background: 'rgba(37,211,102,0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        position: 'relative',
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 52, color: '#25d366' }}>check_circle</span>
                        {/* Pulse */}
                        <div style={{
                          position: 'absolute', inset: 0, borderRadius: '50%',
                          border: '2px solid #25d366', opacity: 0.3,
                          animation: 'wa-pulse 2s ease-in-out infinite',
                        }} />
                      </div>

                      <h3 style={{ margin: '0 0 6px', fontSize: '1.15rem', fontWeight: 800, color: '#25d366' }}>
                        WhatsApp Conectado!
                      </h3>
                      {config?.profileName && (
                        <p style={{ margin: '0 0 4px', fontSize: '0.95rem', fontWeight: 700 }}>
                          {config.profileName}
                        </p>
                      )}
                      {config?.phoneNumber && (
                        <p style={{ margin: '0 0 16px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          {config.phoneNumber}
                        </p>
                      )}

                      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <a href="/crm/whatsapp" style={{
                          padding: '12px 24px', borderRadius: 12, border: 'none',
                          background: 'linear-gradient(135deg, #25d366, #128c7e)',
                          color: '#fff', fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer',
                          fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 8,
                          textDecoration: 'none',
                        }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chat</span>
                          Ir para Conversas
                        </a>
                        <button onClick={disconnect} style={{
                          padding: '12px 24px', borderRadius: 12, border: '1px solid rgba(239,68,68,0.3)',
                          background: 'rgba(239,68,68,0.05)', color: '#ef4444',
                          fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>link_off</span>
                          Desconectar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Error state */}
                  {connectionState === 'error' && (
                    <div>
                      <div style={{
                        width: 100, height: 100, borderRadius: '50%', margin: '0 auto 24px',
                        background: 'rgba(239,68,68,0.08)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#ef4444' }}>error</span>
                      </div>
                      <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 800, color: '#ef4444' }}>Falha na Conexão</h3>
                      <p style={{ margin: '0 0 20px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Não foi possível conectar ao servidor WhatsApp. Verifique as configurações.
                      </p>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                        <button onClick={startConnection} style={{
                          padding: '12px 24px', borderRadius: 12, border: 'none',
                          background: 'linear-gradient(135deg, #25d366, #128c7e)',
                          color: '#fff', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>refresh</span>
                          Tentar Novamente
                        </button>
                        <button onClick={() => setShowConfig(true)} style={{
                          padding: '12px 24px', borderRadius: 12, border: '1px solid var(--border)',
                          background: 'var(--bg)', color: 'var(--text-muted)',
                          fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
                        }}>
                          Configurações
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ═══ Config Panel (collapsible) ═══ */}
              {showConfig && (
                <div style={{
                  background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-md)', overflow: 'hidden',
                  animation: 'wa-fadeIn 0.25s ease',
                }}>
                  <div style={{
                    padding: '18px 24px', borderBottom: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#3b82f6' }}>tune</span>
                      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 900 }}>Configuração do WhatsApp API</h3>
                    </div>
                    <button onClick={() => setShowConfig(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)' }}>close</span>
                    </button>
                  </div>

                  <div style={{ padding: '24px' }}>
                    <div style={{
                      padding: '14px 18px', borderRadius: 12, marginBottom: 20,
                      background: 'rgba(59,130,246,0.05)',
                      border: '1px solid rgba(59,130,246,0.12)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#3b82f6', marginTop: 1 }}>info</span>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                          <strong style={{ color: 'var(--text-main)' }}>Evolution API</strong> — Servidor self-hosted.<br />
                          Hospedado em VPS com conexão direta ao WhatsApp Business.
                          <a href="https://doc.evolution-api.com/" target="_blank" rel="noopener" style={{ color: '#3b82f6', marginLeft: 4, fontWeight: 700 }}>
                            Documentação →
                          </a>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div>
                        <label style={labelS}>URL da API</label>
                        <input
                          style={inputS}
                          value={apiUrl}
                          onChange={e => setApiUrl(e.target.value)}
                          placeholder="http://212.28.186.222:8080"
                        />
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>
                          URL base do seu servidor Evolution API (sem barra final)
                        </div>
                      </div>

                      <div>
                        <label style={labelS}>API Key (Global Key)</label>
                        <input
                          style={inputS}
                          type="password"
                          value={apiKey}
                          onChange={e => setApiKey(e.target.value)}
                          placeholder={config?.configured ? '••••••••' : 'Sua chave de API'}
                        />
                        {config?.configured && config.apiKeyMasked && (
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>
                            Atual: {config.apiKeyMasked} • Deixe vazio para manter
                          </div>
                        )}
                      </div>

                      <div>
                        <label style={labelS}>Nome da Instância</label>
                        <input
                          style={inputS}
                          value={instanceName}
                          onChange={e => setInstanceName(e.target.value)}
                          placeholder="virtuosa-leads"
                        />
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>
                          ID técnico único (sem espaços). Ex: virtuosa-leads, virtuosa-comercial
                        </div>
                      </div>

                      <div>
                        <label style={labelS}>Apelido (exibido no CRM)</label>
                        <input
                          style={inputS}
                          value={instanceLabel}
                          onChange={e => setInstanceLabel(e.target.value)}
                          placeholder="Leads, Comercial, SAC..."
                        />
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>
                          Nome amigável para identificar este WhatsApp no CRM
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 24, justifyContent: 'flex-end' }}>
                      <button onClick={() => setShowConfig(false)} style={{
                        padding: '12px 20px', borderRadius: 12, border: '1px solid var(--border)',
                        background: 'var(--bg)', color: 'var(--text-muted)', fontWeight: 700,
                        fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                        Cancelar
                      </button>
                      <button onClick={saveConfig} disabled={saving} style={{
                        padding: '12px 24px', borderRadius: 12, border: 'none',
                        background: saving ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                        color: '#fff', fontWeight: 800, fontSize: '0.88rem',
                        cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span>
                        {saving ? 'Salvando...' : 'Salvar Configuração'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ═══ How It Works section ═══ */}
              <div style={{
                background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-md)', padding: '24px',
              }}>
                <h3 style={{ margin: '0 0 20px', fontSize: '1rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#8b5cf6' }}>help</span>
                  Como funciona?
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                  {[
                    { icon: 'dns', color: '#3b82f6', title: 'Servidor', desc: 'O servidor Evolution API gerencia a sessão do WhatsApp de forma self-hosted.' },
                    { icon: 'qr_code_2', color: '#25d366', title: 'QR Code', desc: 'O sistema gera um QR code. Você escaneia com o WhatsApp Business do celular.' },
                    { icon: 'sync', color: '#f59e0b', title: 'Sincronização', desc: 'Todas as mensagens são sincronizadas em tempo real entre o celular e o CRM.' },
                    { icon: 'security', color: '#8b5cf6', title: 'Segurança', desc: 'A conexão é criptografada. Funciona como um "WhatsApp Web" dedicado.' },
                  ].map(item => (
                    <div key={item.title} style={{
                      padding: '18px', borderRadius: 16,
                      background: 'var(--bg)', border: '1px solid var(--border)',
                    }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 12, marginBottom: 12,
                        background: `${item.color}12`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 20, color: item.color }}>{item.icon}</span>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '0.88rem', marginBottom: 4 }}>{item.title}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{item.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ═══ Connected Instances List ═══ */}
              {instances.length > 0 && (
                <div style={{
                  background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-md)', overflow: 'hidden',
                }}>
                  <div style={{
                    padding: '18px 24px', borderBottom: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#25d366' }}>devices</span>
                      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 900 }}>Instâncias Conectadas ({instances.length})</h3>
                    </div>
                    <button onClick={() => {
                      setShowConfig(true);
                      setInstanceName('');
                      setInstanceLabel('');
                      setApiKey('');
                      setActiveInstance('');
                    }} style={{
                      padding: '8px 16px', borderRadius: 10, border: 'none',
                      background: 'linear-gradient(135deg, #25d366, #128c7e)',
                      color: '#fff', fontWeight: 700, fontSize: '0.78rem',
                      cursor: 'pointer', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                      Nova Instância
                    </button>
                  </div>

                  <div style={{ padding: '12px 16px' }}>
                    {instances.map(inst => (
                      <div key={inst.id} style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        padding: '14px 16px', borderRadius: 14, marginBottom: 6,
                        background: activeInstance === inst.instanceName ? 'var(--bg)' : 'transparent',
                        border: activeInstance === inst.instanceName ? '1px solid var(--border)' : '1px solid transparent',
                        transition: 'all 0.15s',
                      }}>
                        {/* Status indicator */}
                        <div style={{
                          width: 40, height: 40, borderRadius: 12,
                          background: inst.isConnected ? 'rgba(37,211,102,0.1)' : 'rgba(134,150,160,0.08)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          <span className="material-symbols-outlined" style={{
                            fontSize: 22,
                            color: inst.isConnected ? '#25d366' : '#8696a0',
                          }}>
                            {inst.isConnected ? 'smartphone' : 'phone_disabled'}
                          </span>
                        </div>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: '0.92rem' }}>
                            {inst.label || inst.instanceName}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: 8, marginTop: 2 }}>
                            <span>{inst.instanceName}</span>
                            {inst.phoneNumber && <span>• {inst.phoneNumber}</span>}
                            {inst.profileName && <span>• {inst.profileName}</span>}
                          </div>
                        </div>

                        {/* Status badge */}
                        <span style={{
                          padding: '4px 12px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700,
                          background: inst.isConnected ? 'rgba(37,211,102,0.1)' : 'rgba(134,150,160,0.08)',
                          color: inst.isConnected ? '#25d366' : '#8696a0',
                        }}>
                          {inst.isConnected ? '🟢 Conectado' : '⚪ Desconectado'}
                        </span>

                        {/* Action button */}
                        <button
                          onClick={() => {
                            setActiveInstance(inst.instanceName);
                            setInstanceName(inst.instanceName);
                            setInstanceLabel(inst.label || '');
                            if (!inst.isConnected) {
                              // Trigger connect flow
                              setConnectionState('disconnected');
                              setQrCode(null);
                            } else {
                              setConnectionState('connected');
                            }
                          }}
                          style={{
                            padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)',
                            background: 'var(--bg)', fontSize: '0.75rem', fontWeight: 700,
                            cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-main)',
                            display: 'flex', alignItems: 'center', gap: 4,
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>settings</span>
                          Gerenciar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        <style>{`
          @keyframes wa-spin { to { transform: rotate(360deg); } }
          @keyframes wa-pulse {
            0%, 100% { transform: scale(1); opacity: 0.3; }
            50% { transform: scale(1.15); opacity: 0; }
          }
          @keyframes wa-gradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          @keyframes wa-fadeIn {
            from { opacity: 0; transform: translateY(-8px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </AuthGuard>
  );
}
