'use client';
import { useState, useRef, useEffect } from 'react';
import type DOMPurifyType from 'dompurify';

// Lazy import DOMPurify only on client (SSR-safe)
let DOMPurify: typeof DOMPurifyType;
if (typeof window !== 'undefined') {
  DOMPurify = require('dompurify');
}
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  fileName?: string;
  timestamp: Date;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', text: 'Olá! 👋 Sou a assistente da **Virtuosa Estética**.\n\nPosso te ajudar com:\n- 📄 Analisar relatórios de vendas (PDF ou imagem)\n- 📊 Perguntas sobre o financeiro\n- 💡 Dúvidas gerais sobre o sistema\n\nEnvie uma mensagem ou um arquivo para começar!', timestamp: new Date() },
  ]);
  const [input, setInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<'flash'|'pro'>('flash');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() && !file) return;
    if (loading) return;

    const userMsg: ChatMessage = {
      role: 'user',
      text: input.trim() || (file ? `📎 ${file.name}` : ''),
      fileName: file?.name,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const formData = new FormData();
    formData.append('message', input.trim());
    formData.append('model', selectedModel);
    if (file) formData.append('file', file);

    // Send history (last 10 messages for context)
    const historyForApi = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-10)
      .map(m => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text }));
    formData.append('history', JSON.stringify(historyForApi));

    setFile(null);

    try {
      const res = await fetch('/api/chat', { method: 'POST', body: formData });
      const data = await res.json();

      if (data.success) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: data.response,
          timestamp: new Date(),
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: `❌ ${data.error || 'Erro ao processar.'}`,
          timestamp: new Date(),
        }]);
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: '❌ Erro de conexão. Tente novamente.',
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatText = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code style="background:rgba(0,0,0,0.06);padding:1px 5px;border-radius:4px;font-size:0.85em">$1</code>')
      .replace(/\n/g, '<br/>');
  };

  const cardS = { background: 'var(--card-bg)', backdropFilter: 'blur(12px)', borderRadius: 18, padding: 24, border: '1px solid var(--border)' } as const;

  return (
    <AuthGuard requiredPermission="dashboard">
      <div style={{ width: '100%', maxWidth: 1400, margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <AppHeader activePage="chat" />
        <main style={{ flex: 1, padding: '0 20px', display: 'flex', flexDirection: 'column' }}>
          <section style={{ margin: '30px 0 16px', textAlign: 'center' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-1px', marginBottom: 4 }}>
              Assistente <span style={{ color: 'var(--primary)' }}>IA</span>
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>Gemini 2.5 • Envie textos, PDFs ou imagens</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 10 }}>
              <button onClick={() => setSelectedModel('flash')} style={{
                padding: '6px 16px', borderRadius: '8px 0 0 8px', border: '1px solid var(--border)',
                background: selectedModel === 'flash' ? 'linear-gradient(135deg, var(--primary), #ff4db1)' : 'var(--card-bg)',
                color: selectedModel === 'flash' ? '#fff' : 'var(--text-muted)', fontWeight: 700, fontSize: '0.78rem',
                cursor: 'pointer', fontFamily: 'inherit',
              }}>⚡ Flash</button>
              <button onClick={() => setSelectedModel('pro')} style={{
                padding: '6px 16px', borderRadius: '0 8px 8px 0', border: '1px solid var(--border)', borderLeft: 'none',
                background: selectedModel === 'pro' ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'var(--card-bg)',
                color: selectedModel === 'pro' ? '#fff' : 'var(--text-muted)', fontWeight: 700, fontSize: '0.78rem',
                cursor: 'pointer', fontFamily: 'inherit',
              }}>🧠 Pro</button>
            </div>
          </section>

          {/* Chat area */}
          <div style={{ ...cardS, flex: 1, display: 'flex', flexDirection: 'column', marginBottom: 16, padding: 0, overflow: 'hidden', minHeight: 500 }}>
            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 10px' }}>
              {messages.map((msg, i) => (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  marginBottom: 12,
                  animation: 'fadeSlideUp 0.3s ease',
                }}>
                  {msg.role === 'assistant' && (
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, var(--primary), #ff4db1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 8, flexShrink: 0 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fff' }}>smart_toy</span>
                    </div>
                  )}
                  <div style={{
                    maxWidth: '75%',
                    padding: '12px 16px',
                    borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background: msg.role === 'user' ? 'linear-gradient(135deg, var(--primary), #ff4db1)' : 'rgba(0,0,0,0.03)',
                    color: msg.role === 'user' ? '#fff' : 'var(--text-main)',
                    fontSize: '0.88rem', lineHeight: 1.6,
                  }}>
                    <div dangerouslySetInnerHTML={{ __html: DOMPurify ? DOMPurify.sanitize(formatText(msg.text)) : formatText(msg.text) }} />
                    <div style={{ fontSize: '0.65rem', marginTop: 6, opacity: 0.5, textAlign: 'right' }}>
                      {msg.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}

              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', marginBottom: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, var(--primary), #ff4db1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fff', animation: 'spin 1.5s linear infinite' }}>progress_activity</span>
                  </div>
                  <div style={{ padding: '10px 16px', borderRadius: '16px 16px 16px 4px', background: 'rgba(0,0,0,0.03)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Pensando<span className="dot-animation">...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* File preview */}
            {file && (
              <div style={{ padding: '8px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(230,0,126,0.03)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--primary)' }}>attach_file</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, flex: 1 }}>{file.name}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{(file.size / 1024).toFixed(0)} KB</span>
                <button onClick={() => setFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#ef4444' }}>close</span>
                </button>
              </div>
            )}

            {/* Input area */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'flex-end', background: 'var(--card-bg)' }}>
              <button onClick={() => fileRef.current?.click()} title="Anexar arquivo" style={{
                background: 'none', border: '1px solid var(--border)', borderRadius: 10, padding: 8,
                cursor: 'pointer', display: 'flex', alignItems: 'center',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>attach_file</span>
              </button>
              <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" hidden onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = ''; }} />
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Digite sua mensagem..."
                rows={1}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 12, border: '1px solid var(--border)',
                  background: 'var(--bg)', fontSize: '0.88rem', fontFamily: 'inherit',
                  resize: 'none', outline: 'none', maxHeight: 120, lineHeight: 1.5,
                }}
                onInput={(e) => {
                  const t = e.target as HTMLTextAreaElement;
                  t.style.height = 'auto';
                  t.style.height = Math.min(t.scrollHeight, 120) + 'px';
                }}
              />
              <button onClick={sendMessage} disabled={loading || (!input.trim() && !file)} style={{
                background: loading || (!input.trim() && !file) ? 'var(--border)' : 'linear-gradient(135deg, var(--primary), #ff4db1)',
                border: 'none', borderRadius: 10, padding: '8px 12px', cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#fff' }}>send</span>
              </button>
            </div>
          </div>
        </main>

        <style>{`
          @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes spin { to { transform: rotate(360deg); } }
          .dot-animation { animation: dots 1.5s steps(4, end) infinite; }
          @keyframes dots { 0%, 20% { content: ''; } 40% { content: '.'; } 60% { content: '..'; } 80%, 100% { content: '...'; } }
        `}</style>
      </div>
    </AuthGuard>
  );
}
