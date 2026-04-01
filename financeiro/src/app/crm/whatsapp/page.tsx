'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';

interface Message { id: string; direction: string; type: string; body: string | null; sentBy: string | null; status: string; timestamp: string; }
interface Conversation { id: string; waId: string; contactName: string | null; contactPhone: string; clientId: string | null; status: string; assignedTo: string | null; lastMessageAt: string; unreadCount: number; source: string | null; adName: string | null; messages: Message[]; }

const cardS: React.CSSProperties = { background: 'var(--card-bg)', backdropFilter: 'blur(12px)', borderRadius: 18, border: '1px solid var(--border)' };

export default function WhatsAppPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/conversations');
      const data = await res.json();
      setConversations(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  const selectConversation = async (id: string) => {
    setSelectedId(id);
    try {
      const res = await fetch(`/api/whatsapp/conversations?id=${id}`);
      const data = await res.json();
      setMessages(data.messages || []);
      // Update unread count locally
      setConversations(prev => prev.map(c => c.id === id ? { ...c, unreadCount: 0 } : c));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-refresh conversations every 10s
  useEffect(() => {
    const interval = setInterval(fetchConversations, 10000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  const sendMessage = async () => {
    if (!input.trim() || !selectedId || sending) return;
    setSending(true);
    const msgText = input.trim();
    setInput('');

    // Optimistic add
    const optimistic: Message = { id: 'temp-' + Date.now(), direction: 'outbound', type: 'text', body: msgText, sentBy: 'Você', status: 'sending', timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, optimistic]);

    try {
      const user = JSON.parse(localStorage.getItem('virtuosa_user') || '{}');
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: selectedId, message: msgText, operatorName: user.name || 'Operador' }),
      });
      const data = await res.json();
      if (data.success) {
        // Replace optimistic with real
        setMessages(prev => prev.map(m => m.id === optimistic.id ? { ...m, id: data.messageId, status: data.warning ? 'pending_config' : 'sent' } : m));
      }
    } catch { /* keep optimistic */ }
    setSending(false);
    inputRef.current?.focus();
  };

  const filtered = conversations
    .filter(c => statusFilter === 'all' || c.status === statusFilter)
    .filter(c => !searchQuery || (c.contactName || c.contactPhone).toLowerCase().includes(searchQuery.toLowerCase()));

  const selectedConv = conversations.find(c => c.id === selectedId);
  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  // API status check
  const isConfigured = true; // Will check env vars when they're set

  const fmtTime = (d: string) => {
    const date = new Date(d);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const statusBadge = (s: string) => {
    const map: Record<string, { bg: string; color: string; label: string }> = {
      aberta: { bg: 'rgba(16,185,129,0.1)', color: '#10b981', label: 'Aberta' },
      em_andamento: { bg: 'rgba(99,102,241,0.1)', color: '#6366f1', label: 'Em andamento' },
      finalizada: { bg: 'rgba(156,163,175,0.1)', color: '#9ca3af', label: 'Finalizada' },
    };
    const st = map[s] || map.aberta;
    return <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: st.bg, color: st.color }}>{st.label}</span>;
  };

  return (
    <AuthGuard requiredPermission="dashboard">
      <div style={{ width: '100%', maxWidth: 1400, margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <AppHeader activePage="clientes" />
        <main style={{ flex: 1, padding: '0 20px 20px', display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <section style={{ margin: '24px 0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #25d366, #128c7e)' }}>
                  <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 22 }}>chat</span>
                </span>
                WhatsApp <span style={{ color: 'var(--primary)' }}>CRM</span>
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 4 }}>
                Gerencie conversas de leads e clientes • {conversations.length} conversas {totalUnread > 0 && <span style={{ color: '#10b981', fontWeight: 700 }}>({totalUnread} não lidas)</span>}
              </p>
            </div>
            {/* Config status */}
            <div style={{ ...cardS, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#f59e0b' }}>settings</span>
              <span style={{ color: 'var(--text-muted)' }}>API: </span>
              <span style={{ fontWeight: 700, color: '#f59e0b' }}>⏳ Aguardando configuração</span>
            </div>
          </section>

          {/* Main chat area */}
          <div style={{ flex: 1, display: 'flex', gap: 14, minHeight: 'calc(100vh - 180px)' }}>
            {/* Left: Conversation list */}
            <div style={{ ...cardS, width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Search + filter */}
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-muted)' }}>search</span>
                  <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar conversa..."
                    style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '0.82rem', fontFamily: 'inherit', color: 'var(--text-main)' }} />
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                  {[{ k: 'all', l: 'Todas' }, { k: 'aberta', l: 'Abertas' }, { k: 'em_andamento', l: 'Andamento' }, { k: 'finalizada', l: 'Finalizadas' }].map(f => (
                    <button key={f.k} onClick={() => setStatusFilter(f.k)}
                      style={{ flex: 1, padding: '5px 4px', borderRadius: 6, border: 'none', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: statusFilter === f.k ? 'var(--primary)' : 'var(--bg)', color: statusFilter === f.k ? '#fff' : 'var(--text-muted)', transition: 'all 0.15s' }}>
                      {f.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Conversation list */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {loading ? (
                  <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 32, animation: 'spin 1.5s linear infinite' }}>progress_activity</span>
                  </div>
                ) : filtered.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-muted)', opacity: 0.3 }}>chat_bubble_outline</span>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 8 }}>
                      {conversations.length === 0 ? 'Nenhuma conversa ainda' : 'Nenhum resultado'}
                    </p>
                    {conversations.length === 0 && (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: 4 }}>
                        Conversas aparecerão aqui quando leads enviarem mensagens pelo WhatsApp
                      </p>
                    )}
                  </div>
                ) : (
                  filtered.map(c => {
                    const lastMsg = c.messages?.[0];
                    const isSelected = c.id === selectedId;
                    return (
                      <div key={c.id} onClick={() => selectConversation(c.id)}
                        style={{
                          padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                          background: isSelected ? 'rgba(230,0,126,0.06)' : 'transparent',
                          transition: 'all 0.12s',
                        }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(0,0,0,0.02)'; }}
                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {/* Avatar */}
                          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #25d366, #128c7e)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '0.82rem', flexShrink: 0 }}>
                            {(c.contactName || '?').charAt(0).toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {c.contactName || c.contactPhone}
                              </span>
                              <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', flexShrink: 0, marginLeft: 4 }}>
                                {fmtTime(c.lastMessageAt)}
                              </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                                {lastMsg?.direction === 'outbound' && '✓ '}
                                {lastMsg?.body || '📎 Mídia'}
                              </span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                {c.source === 'meta_ads' && <span style={{ fontSize: '0.55rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>ADS</span>}
                                {c.unreadCount > 0 && (
                                  <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#25d366', color: '#fff', fontSize: '0.6rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {c.unreadCount}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right: Chat area */}
            <div style={{ ...cardS, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {!selectedId ? (
                /* Empty state */
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: 'var(--text-muted)' }}>
                  <div style={{ width: 80, height: 80, borderRadius: 24, background: 'linear-gradient(135deg, #25d366, #128c7e)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.3 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 40, color: '#fff' }}>forum</span>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: '1rem', fontWeight: 700 }}>WhatsApp CRM</p>
                    <p style={{ fontSize: '0.82rem', marginTop: 4 }}>Selecione uma conversa ou aguarde novos leads</p>
                    <div style={{ marginTop: 16, padding: '12px 20px', borderRadius: 12, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                      <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#f59e0b' }}>⚙️ Configuração pendente</p>
                      <p style={{ fontSize: '0.72rem', marginTop: 4, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        Configure as variáveis no <code style={{ background: 'var(--bg)', padding: '1px 6px', borderRadius: 4 }}>.env</code>:
                        <br />WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_VERIFY_TOKEN
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Chat header */}
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #25d366, #128c7e)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '0.82rem' }}>
                      {(selectedConv?.contactName || '?').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: '0.92rem' }}>{selectedConv?.contactName || selectedConv?.contactPhone}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {selectedConv?.contactPhone}
                        {selectedConv?.source === 'meta_ads' && <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>Meta Ads</span>}
                        {statusBadge(selectedConv?.status || 'aberta')}
                      </div>
                    </div>
                    {/* Actions */}
                    <button onClick={async () => {
                      await fetch('/api/whatsapp/conversations', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selectedId, status: 'finalizada' }) });
                      fetchConversations();
                    }} title="Finalizar conversa" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#10b981' }}>check_circle</span>
                    </button>
                  </div>

                  {/* Messages area */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                    {messages.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 32, opacity: 0.3 }}>chat_bubble_outline</span>
                        <p style={{ marginTop: 8, fontSize: '0.82rem' }}>Início da conversa</p>
                      </div>
                    ) : (
                      messages.map(msg => (
                        <div key={msg.id} style={{
                          display: 'flex', justifyContent: msg.direction === 'outbound' ? 'flex-end' : 'flex-start',
                          marginBottom: 8,
                        }}>
                          <div style={{
                            maxWidth: '70%', padding: '10px 14px',
                            borderRadius: msg.direction === 'outbound' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                            background: msg.direction === 'outbound' ? 'linear-gradient(135deg, var(--primary), #ff4db1)' : 'var(--bg)',
                            color: msg.direction === 'outbound' ? '#fff' : 'var(--text-main)',
                            fontSize: '0.85rem', lineHeight: 1.5,
                          }}>
                            <div style={{ whiteSpace: 'pre-wrap' }}>{msg.body || '📎 Mídia'}</div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 4, opacity: 0.6 }}>
                              {msg.sentBy && <span style={{ fontSize: '0.6rem' }}>{msg.sentBy}</span>}
                              <span style={{ fontSize: '0.6rem' }}>{fmtTime(msg.timestamp)}</span>
                              {msg.direction === 'outbound' && (
                                <span style={{ fontSize: '0.65rem' }}>
                                  {msg.status === 'read' ? '✓✓' : msg.status === 'delivered' ? '✓✓' : msg.status === 'pending_config' ? '⏳' : '✓'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input area */}
                  <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                      placeholder="Digite sua mensagem..."
                      rows={1}
                      style={{
                        flex: 1, padding: '10px 14px', borderRadius: 12, border: '1px solid var(--border)',
                        background: 'var(--bg)', fontSize: '0.85rem', fontFamily: 'inherit',
                        resize: 'none', outline: 'none', maxHeight: 120, lineHeight: 1.5,
                        color: 'var(--text-main)',
                      }}
                      onInput={(e) => {
                        const t = e.target as HTMLTextAreaElement;
                        t.style.height = 'auto';
                        t.style.height = Math.min(t.scrollHeight, 120) + 'px';
                      }}
                    />
                    <button onClick={sendMessage} disabled={sending || !input.trim()}
                      style={{
                        background: sending || !input.trim() ? 'var(--border)' : 'linear-gradient(135deg, #25d366, #128c7e)',
                        border: 'none', borderRadius: 10, padding: '8px 12px', cursor: sending ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center',
                      }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#fff' }}>send</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </main>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </AuthGuard>
  );
}
