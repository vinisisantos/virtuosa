'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { toast } from '@/components/toast';

interface Message { id: string; direction: string; type: string; body: string | null; sentBy: string | null; status: string; timestamp: string; mediaUrl?: string | null; }
interface ClientData { id: string; name: string; phone: string | null; email: string | null; tags: string | null; stage: string; source: string | null; totalSpent: number; visitCount: number; createdAt: string; }
interface PipelineData { id: string; stage: string; value: number; source: string | null; assignedName: string | null; }
interface Conversation {
  id: string; waId: string; contactName: string | null; contactPhone: string; clientId: string | null;
  status: string; assignedTo: string | null; lastMessageAt: string; unreadCount: number;
  source: string | null; adName: string | null; unit: string;
  messages: Message[]; client?: ClientData | null; pipeline?: PipelineData | null;
}

// ─── View: 'list' | 'chat' | 'contact' ───
type ViewState = 'list' | 'chat' | 'contact';

export default function WhatsAppInboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [view, setView] = useState<ViewState>('list');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastMsgCountRef = useRef(0);

  // ─── Data Fetching ───
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/conversations');
      const data = await res.json();
      const list = data.conversations || (Array.isArray(data) ? data : []);
      setConversations(list);
      const totalUnread = list.reduce((s: number, c: Conversation) => s + c.unreadCount, 0);
      if (totalUnread > lastMsgCountRef.current && lastMsgCountRef.current > 0) {
        try { new Audio('/notification.mp3').play().catch(() => {}); } catch {}
      }
      lastMsgCountRef.current = totalUnread;
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);
  useEffect(() => {
    const interval = setInterval(fetchConversations, 5000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  // Auto-refresh messages in open chat
  useEffect(() => {
    if (!selectedId || view !== 'chat') return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/whatsapp/conversations?id=${selectedId}`);
        const data = await res.json();
        if (data.messages) setMessages(data.messages);
        if (data.client || data.pipeline) {
          setSelectedConv(prev => prev ? { ...prev, client: data.client, pipeline: data.pipeline } : prev);
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedId, view]);

  // ─── Actions ───
  const openConversation = async (id: string) => {
    setSelectedId(id);
    setView('chat');
    try {
      const res = await fetch(`/api/whatsapp/conversations?id=${id}`);
      const data = await res.json();
      setMessages(data.messages || []);
      setSelectedConv(data);
      setConversations(prev => prev.map(c => c.id === id ? { ...c, unreadCount: 0 } : c));
    } catch { /* ignore */ }
  };

  const goBack = () => {
    if (view === 'contact') { setView('chat'); return; }
    setView('list');
    setSelectedId(null);
    setSelectedConv(null);
    setMessages([]);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !selectedId || sending) return;
    setSending(true);
    const msgText = input.trim();
    setInput('');

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
        setMessages(prev => prev.map(m => m.id === optimistic.id ? { ...m, id: data.messageId, status: data.warning ? 'pending_config' : 'sent' } : m));
        if (data.warning) toast('⚠️ API não configurada — mensagem salva localmente', 'info');
      }
    } catch { /* keep optimistic */ }
    setSending(false);
    inputRef.current?.focus();
  };

  // ─── Formatting helpers ───
  const fmtTime = (d: string) => {
    const date = new Date(d);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    if (isToday) return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (isYesterday) return 'Ontem';
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const fmtMsgTime = (d: string) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const statusIcon = (s: string) => {
    if (s === 'read') return '✓✓';
    if (s === 'delivered') return '✓✓';
    if (s === 'sent') return '✓';
    if (s === 'sending' || s === 'pending_config') return '⏳';
    return '✓';
  };

  const filtered = conversations
    .filter(c => statusFilter === 'all' || c.status === statusFilter)
    .filter(c => !searchQuery || (c.contactName || c.contactPhone).toLowerCase().includes(searchQuery.toLowerCase()));

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  const avatarColors = ['#25d366', '#00a884', '#53bdeb', '#8696a0', '#e17076', '#7c85de', '#d4a373', '#f4845f'];
  const getAvatarColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return avatarColors[Math.abs(hash) % avatarColors.length];
  };

  // ─── RENDER: Conversation List (WhatsApp-style) ───
  const renderList = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--card-bg)' }}>
      {/* Top bar */}
      <div style={{ padding: '16px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '-0.5px' }}>Conversas</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {totalUnread > 0 && (
            <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '3px 10px', borderRadius: 12, background: '#25d366', color: '#fff' }}>
              {totalUnread}
            </span>
          )}
          <a href="/crm/pipeline" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: '50%', background: 'var(--bg)', textDecoration: 'none' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)' }}>filter_alt</span>
          </a>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '12px 16px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 24, background: 'var(--bg)', border: '1px solid var(--border)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)' }}>search</span>
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar conversa..."
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '0.88rem', fontFamily: 'inherit', color: 'var(--text-main)' }} />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-muted)' }}>close</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters — compact pill row */}
      <div style={{ display: 'flex', gap: 6, padding: '4px 16px 8px', overflowX: 'auto' }}>
        {[
          { k: 'all', l: 'Todas' },
          { k: 'aberta', l: 'Abertas' },
          { k: 'em_andamento', l: 'Andamento' },
          { k: 'finalizada', l: 'Finalizadas' },
        ].map(f => (
          <button key={f.k} onClick={() => setStatusFilter(f.k)}
            style={{
              padding: '5px 14px', borderRadius: 20, border: 'none', whiteSpace: 'nowrap',
              fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              background: statusFilter === f.k ? '#25d366' : 'var(--bg)',
              color: statusFilter === f.k ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.15s',
            }}>
            {f.l}
          </button>
        ))}
      </div>

      {/* Conversation list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 32, animation: 'wa-spin 1.2s linear infinite' }}>progress_activity</span>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 56, color: 'var(--text-muted)', opacity: 0.15 }}>forum</span>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: 12, fontWeight: 500 }}>
              {conversations.length === 0 ? 'Nenhuma conversa ainda' : 'Nenhum resultado'}
            </p>
          </div>
        ) : (
          filtered.map(c => {
            const lastMsg = c.messages?.[0];
            const name = c.contactName || c.contactPhone;
            const hasUnread = c.unreadCount > 0;
            return (
              <div key={c.id} onClick={() => openConversation(c.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Avatar — round like WhatsApp */}
                <div style={{
                  width: 50, height: 50, borderRadius: '50%', flexShrink: 0,
                  background: getAvatarColor(name),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 700, fontSize: '1.1rem',
                }}>
                  {name.charAt(0).toUpperCase()}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                    <span style={{
                      fontWeight: hasUnread ? 800 : 600, fontSize: '0.95rem',
                      color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {name}
                    </span>
                    <span style={{
                      fontSize: '0.72rem', flexShrink: 0, marginLeft: 8,
                      color: hasUnread ? '#25d366' : 'var(--text-muted)',
                      fontWeight: hasUnread ? 700 : 400,
                    }}>
                      {fmtTime(c.lastMessageAt)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      color: hasUnread ? 'var(--text-main)' : 'var(--text-muted)',
                      fontWeight: hasUnread ? 500 : 400,
                      maxWidth: '80%',
                    }}>
                      {lastMsg?.direction === 'outbound' && (
                        <span style={{ color: '#53bdeb', marginRight: 3, fontSize: '0.75rem' }}>
                          {statusIcon(lastMsg.status)} {' '}
                        </span>
                      )}
                      {lastMsg?.body || '📎 Mídia'}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      {c.source === 'meta_ads' && (
                        <span style={{ fontSize: '0.55rem', fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>ADS</span>
                      )}
                      {hasUnread && (
                        <span style={{
                          minWidth: 20, height: 20, borderRadius: '50%',
                          background: '#25d366', color: '#fff',
                          fontSize: '0.65rem', fontWeight: 800,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          padding: '0 5px',
                        }}>
                          {c.unreadCount > 99 ? '99+' : c.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  // ─── RENDER: Chat View (full-screen WhatsApp-style) ───
  const renderChat = () => {
    if (!selectedConv) return null;
    const name = selectedConv.contactName || selectedConv.contactPhone;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
        {/* Chat header — WhatsApp green bar */}
        <div style={{
          padding: '10px 8px', display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--card-bg)', borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, zIndex: 10,
        }}>
          <button onClick={goBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--text-main)' }}>arrow_back</span>
          </button>
          <div onClick={() => setView('contact')}
            style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, cursor: 'pointer', minWidth: 0 }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
              background: getAvatarColor(name),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: '0.95rem',
            }}>
              {name.charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {name}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {selectedConv.status === 'aberta' ? 'Online' : selectedConv.status === 'em_andamento' ? 'Em atendimento' : 'Finalizada'}
              </div>
            </div>
          </div>
          {/* Action buttons */}
          <button onClick={() => setView('contact')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-muted)' }}>person</span>
          </button>
        </div>

        {/* Messages — WhatsApp chat bubbles */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '12px 12px',
          backgroundImage: 'var(--wa-chat-bg, none)',
          backgroundSize: 'cover',
        }}>
          {messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{
                display: 'inline-block', padding: '8px 16px', borderRadius: 10,
                background: 'var(--card-bg)', border: '1px solid var(--border)',
                fontSize: '0.78rem', color: 'var(--text-muted)',
              }}>
                Início da conversa
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isOut = msg.direction === 'outbound';
              const prevMsg = messages[idx - 1];
              const showTimeSep = !prevMsg || (
                new Date(msg.timestamp).toDateString() !== new Date(prevMsg.timestamp).toDateString()
              );

              return (
                <div key={msg.id}>
                  {/* Date separator */}
                  {showTimeSep && (
                    <div style={{ textAlign: 'center', margin: '16px 0 12px' }}>
                      <span style={{
                        display: 'inline-block', padding: '5px 14px', borderRadius: 8,
                        background: 'var(--card-bg)', border: '1px solid var(--border)',
                        fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600,
                      }}>
                        {(() => {
                          const d = new Date(msg.timestamp);
                          const now = new Date();
                          if (d.toDateString() === now.toDateString()) return 'Hoje';
                          const yday = new Date(now); yday.setDate(now.getDate() - 1);
                          if (d.toDateString() === yday.toDateString()) return 'Ontem';
                          return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
                        })()}
                      </span>
                    </div>
                  )}

                  {/* Message bubble */}
                  <div style={{
                    display: 'flex', justifyContent: isOut ? 'flex-end' : 'flex-start',
                    marginBottom: 3, paddingLeft: isOut ? '18%' : 0, paddingRight: isOut ? 0 : '18%',
                  }}>
                    <div style={{
                      maxWidth: '100%', padding: '7px 10px 4px',
                      borderRadius: isOut ? '10px 10px 3px 10px' : '10px 10px 10px 3px',
                      background: isOut ? 'var(--wa-out-bg, #e7ffdb)' : 'var(--card-bg)',
                      border: isOut ? 'none' : '1px solid var(--border)',
                      boxShadow: '0 1px 1px rgba(0,0,0,0.06)',
                      position: 'relative',
                    }}>
                      {/* Sender name for outbound */}
                      {isOut && msg.sentBy && (
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--primary)', marginBottom: 1 }}>
                          {msg.sentBy}
                        </div>
                      )}
                      <div style={{
                        fontSize: '0.88rem', lineHeight: 1.45, whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word', color: 'var(--text-main)',
                      }}>
                        {msg.body || '📎 Mídia'}
                        {/* Inline time + status (WhatsApp style) */}
                        <span style={{
                          float: 'right', marginLeft: 8, marginTop: 3,
                          fontSize: '0.62rem', color: 'var(--text-muted)',
                          display: 'flex', alignItems: 'center', gap: 2,
                          position: 'relative', top: 4,
                        }}>
                          {fmtMsgTime(msg.timestamp)}
                          {isOut && (
                            <span style={{ color: msg.status === 'read' ? '#53bdeb' : 'var(--text-muted)', fontSize: '0.7rem' }}>
                              {statusIcon(msg.status)}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area — WhatsApp style */}
        <div style={{
          padding: '6px 6px', display: 'flex', gap: 6, alignItems: 'flex-end',
          background: 'var(--card-bg)', borderTop: '1px solid var(--border)',
        }}>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'flex-end',
            borderRadius: 24, background: 'var(--bg)', border: '1px solid var(--border)',
            padding: '2px 4px 2px 14px', overflow: 'hidden',
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Mensagem"
              rows={1}
              style={{
                flex: 1, padding: '10px 0', border: 'none', background: 'transparent',
                fontSize: '0.9rem', fontFamily: 'inherit', resize: 'none', outline: 'none',
                maxHeight: 120, lineHeight: 1.4, color: 'var(--text-main)',
              }}
              onInput={e => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 120) + 'px';
              }}
            />
          </div>
          <button onClick={sendMessage} disabled={sending || !input.trim()}
            style={{
              width: 44, height: 44, borderRadius: '50%', border: 'none', flexShrink: 0,
              background: sending || !input.trim() ? 'var(--border)' : '#25d366',
              cursor: sending || !input.trim() ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s',
            }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#fff' }}>send</span>
          </button>
        </div>
      </div>
    );
  };

  // ─── RENDER: Contact Info (full-screen) ───
  const renderContactInfo = () => {
    if (!selectedConv) return null;
    const name = selectedConv.contactName || selectedConv.contactPhone;
    const client = selectedConv.client;
    const pipeline = selectedConv.pipeline;

    const stageLabels: Record<string, { label: string; color: string }> = {
      novo_lead: { label: 'Novo Lead', color: '#25d366' },
      em_atendimento: { label: 'Em Atendimento', color: '#53bdeb' },
      em_negociacao: { label: 'Negociação', color: '#f59e0b' },
      fechado: { label: 'Fechado', color: '#8b5cf6' },
      perdido: { label: 'Perdido', color: '#e17076' },
      entrada: { label: 'Entrada', color: '#7c85de' },
    };

    const updateStatus = async (status: string) => {
      await fetch('/api/whatsapp/conversations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedId, status }),
      });
      toast(`Status: ${status}`, 'success');
      setSelectedConv(prev => prev ? { ...prev, status } : prev);
      fetchConversations();
    };

    const infoRow = (icon: string, label: string, value: string, color?: string) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0', borderBottom: '1px solid var(--border)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 22, color: color || 'var(--text-muted)' }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
          <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-main)', marginTop: 1 }}>{value}</div>
        </div>
      </div>
    );

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--card-bg)' }}>
        {/* Header */}
        <div style={{ padding: '12px 12px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)' }}>
          <button onClick={goBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--text-main)' }}>arrow_back</span>
          </button>
          <span style={{ fontWeight: 700, fontSize: '1rem' }}>Dados do contato</span>
        </div>

        {/* Profile section */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <div style={{ textAlign: 'center', padding: '28px 20px 20px' }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%', margin: '0 auto 14px',
              background: getAvatarColor(name),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: '2rem',
            }}>
              {name.charAt(0).toUpperCase()}
            </div>
            <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--text-main)' }}>{name}</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>{selectedConv.contactPhone}</div>
            {selectedConv.source === 'meta_ads' && (
              <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 16, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', fontSize: '0.72rem', fontWeight: 700 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>campaign</span>
                Meta Ads
              </div>
            )}
          </div>

          {/* Info sections */}
          <div style={{ padding: '0 20px' }}>
            {client && (
              <>
                {client.email && infoRow('email', 'E-mail', client.email, '#53bdeb')}
                {client.tags && infoRow('label', 'Tags', client.tags.split(',').join(' • '), '#f59e0b')}
                {(() => {
                  const st = stageLabels[client.stage] || { label: client.stage, color: '#8696a0' };
                  return infoRow('flag', 'Estágio CRM', st.label, st.color);
                })()}
                {infoRow('payments', 'Total gasto', `R$ ${client.totalSpent.toLocaleString('pt-BR')}`, '#25d366')}
                {infoRow('event', 'Visitas', String(client.visitCount), '#53bdeb')}
              </>
            )}

            {pipeline && (
              <>
                <div style={{ marginTop: 10 }} />
                {(() => {
                  const pst = stageLabels[pipeline.stage] || { label: pipeline.stage, color: '#8696a0' };
                  return infoRow('filter_alt', 'Funil', pst.label, pst.color);
                })()}
                {pipeline.value > 0 && infoRow('attach_money', 'Valor', `R$ ${pipeline.value.toLocaleString('pt-BR')}`, '#25d366')}
                {pipeline.assignedName && infoRow('person', 'Responsável', pipeline.assignedName, '#7c85de')}
              </>
            )}

            {selectedConv.adName && infoRow('ads_click', 'Campanha', selectedConv.adName, '#3b82f6')}

            {/* Quick actions */}
            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 30 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Ações</div>
              {[
                { label: 'Marcar em andamento', icon: 'play_circle', action: () => updateStatus('em_andamento'), color: '#53bdeb' },
                { label: 'Finalizar conversa', icon: 'check_circle', action: () => updateStatus('finalizada'), color: '#25d366' },
                { label: 'Reabrir conversa', icon: 'refresh', action: () => updateStatus('aberta'), color: '#f59e0b' },
              ].map(a => (
                <button key={a.label} onClick={a.action}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                    padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)',
                    background: 'var(--bg)', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-main)', textAlign: 'left',
                  }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 22, color: a.color }}>{a.icon}</span>
                  {a.label}
                </button>
              ))}

              {client && (
                <a href={`/clientes?id=${client.id}`} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '14px', borderRadius: 12, border: 'none',
                  background: '#25d366', color: '#fff',
                  fontWeight: 700, fontSize: '0.88rem', textDecoration: 'none', marginTop: 4,
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>open_in_new</span>
                  Ver ficha completa
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <AuthGuard requiredPermission="dashboard">
      <div style={{ width: '100%', maxWidth: 1600, margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Show AppHeader only on list view (hide in chat/contact for full-screen feel) */}
        {view === 'list' && <AppHeader activePage="clientes" />}

        <main style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          height: view === 'list' ? 'auto' : '100vh',
          maxHeight: view === 'list' ? 'none' : '100vh',
          overflow: 'hidden',
        }}>
          {/* Desktop: side-by-side layout | Mobile: full-screen views */}
          <div className="wa-layout" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

            {/* LIST PANEL */}
            <div className="wa-list-panel" style={{
              display: view === 'list' ? 'flex' : undefined,
              flexDirection: 'column', flex: 1,
              borderRight: '1px solid var(--border)',
            }}>
              {renderList()}
            </div>

            {/* CHAT PANEL */}
            <div className="wa-chat-panel" style={{
              display: view === 'chat' ? 'flex' : undefined,
              flexDirection: 'column', flex: 1,
            }}>
              {view === 'chat' ? renderChat() : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: 10 }}>
                  <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 36, opacity: 0.3 }}>forum</span>
                  </div>
                  <p style={{ fontWeight: 600, fontSize: '1rem' }}>Selecione uma conversa</p>
                  <p style={{ fontSize: '0.82rem', opacity: 0.6 }}>As mensagens aparecem aqui</p>
                </div>
              )}
            </div>

            {/* CONTACT PANEL (full-screen overlay on mobile) */}
            {view === 'contact' && (
              <div className="wa-contact-panel" style={{
                display: 'flex', flexDirection: 'column', flex: 1,
              }}>
                {renderContactInfo()}
              </div>
            )}
          </div>
        </main>

        <style>{`
          @keyframes wa-spin { to { transform: rotate(360deg); } }

          /* Dark mode overrides for WhatsApp colors */
          :root {
            --wa-out-bg: #dcf8c6;
            --wa-chat-bg: none;
          }
          [data-theme="dark"] {
            --wa-out-bg: #005c4b;
          }

          /* ─── MOBILE (< 768px): Full-screen stacked views ─── */
          @media (max-width: 768px) {
            .wa-layout {
              position: relative;
            }
            .wa-list-panel {
              width: 100% !important;
              display: ${view === 'list' ? 'flex' : 'none'} !important;
              border-right: none !important;
            }
            .wa-chat-panel {
              position: fixed !important;
              inset: 0 !important;
              z-index: 9999 !important;
              display: ${view === 'chat' ? 'flex' : 'none'} !important;
              width: 100% !important;
              background: var(--bg) !important;
            }
            .wa-contact-panel {
              position: fixed !important;
              inset: 0 !important;
              z-index: 10000 !important;
              display: ${view === 'contact' ? 'flex' : 'none'} !important;
              width: 100% !important;
              background: var(--card-bg) !important;
            }
          }

          /* ─── DESKTOP (>= 769px): Side-by-side layout ─── */
          @media (min-width: 769px) {
            .wa-list-panel {
              width: 380px !important;
              max-width: 380px !important;
              flex-shrink: 0 !important;
              display: flex !important;
            }
            .wa-chat-panel {
              display: flex !important;
              flex: 1 !important;
            }
            .wa-contact-panel {
              width: 340px !important;
              max-width: 340px !important;
              flex-shrink: 0 !important;
              border-left: 1px solid var(--border) !important;
            }
          }
        `}</style>
      </div>
    </AuthGuard>
  );
}
