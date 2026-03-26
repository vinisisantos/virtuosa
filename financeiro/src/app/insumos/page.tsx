'use client';
import { useRef } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { useInsumos, InsumoUpload, ChatMessage } from '@/hooks/useInsumos';

const ACCEPTED = '.pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.bmp,.gif';

const cardS: React.CSSProperties = {
  background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(20px)', borderRadius: 20,
  border: '1px solid rgba(255,255,255,0.6)', boxShadow: '0 4px 24px rgba(0,0,0,0.04)', padding: '24px 28px',
};

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/* ── Result Table Component ── */
function ResultTable({ data }: { data: any }) {
  if (!data) return null;
  if (data.raw) return <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', background: 'rgba(249,250,251,0.8)', padding: 16, borderRadius: 12, overflow: 'auto', maxHeight: 400 }}>{typeof data.raw === 'string' ? data.raw : JSON.stringify(data.raw, null, 2)}</pre>;
  const summary = data.summary;
  const items = data.items;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return (<div>
      {summary && <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 12 }}>{summary}</p>}
      <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', background: 'rgba(249,250,251,0.8)', padding: 16, borderRadius: 12, overflow: 'auto', maxHeight: 400 }}>{JSON.stringify(data, null, 2)}</pre>
    </div>);
  }
  const keys = Object.keys(items[0]).filter(k => k !== 'id');
  return (<div>
    {summary && <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'rgba(99,102,241,0.06)', borderRadius: 12, marginBottom: 16, fontSize: '0.9rem', fontWeight: 600, color: 'var(--primary)' }}><span className="material-symbols-outlined" style={{ fontSize: 20 }}>info</span>{summary}</div>}
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ background: 'rgba(99,102,241,0.04)' }}>
          <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>#</th>
          {keys.map(k => <th key={k} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{k}</th>)}
        </tr></thead>
        <tbody>{items.map((item: any, i: number) => (
          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '12px 16px', fontSize: '0.88rem', color: 'var(--text-muted)', fontWeight: 600 }}>{i + 1}</td>
            {keys.map(k => <td key={k} style={{ padding: '12px 16px', fontSize: '0.88rem', color: 'var(--text-main)', fontWeight: 500 }}>{item[k] === null ? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span> : String(item[k])}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  </div>);
}

/* ── Chat Bubble Component ── */
function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
      <div style={{
        maxWidth: '80%', padding: '14px 18px', borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        background: isUser ? 'linear-gradient(135deg, var(--primary), #ff4db1)' : 'rgba(255,255,255,0.9)',
        color: isUser ? '#fff' : 'var(--text-main)',
        border: isUser ? 'none' : '1px solid var(--border)',
        boxShadow: isUser ? '0 4px 16px rgba(230,0,126,0.2)' : '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        {/* File attachment */}
        {msg.fileName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '8px 12px', background: isUser ? 'rgba(255,255,255,0.15)' : 'rgba(99,102,241,0.06)', borderRadius: 10 }}>
            {msg.filePreview ? (
              <img src={msg.filePreview} alt="Anexo" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
            ) : (
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: isUser ? '#fff' : '#ef4444' }}>picture_as_pdf</span>
            )}
            <span style={{ fontSize: '0.82rem', fontWeight: 600, opacity: 0.9 }}>{msg.fileName}</span>
          </div>
        )}

        {/* Loading */}
        {msg.isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined spinning" style={{ fontSize: 18, color: 'var(--primary)' }}>progress_activity</span>
            <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Analisando...</span>
          </div>
        )}

        {/* Error */}
        {msg.error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ef4444' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>error</span>
            <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{msg.error}</span>
          </div>
        )}

        {/* Text */}
        {msg.text && <div style={{ fontSize: '0.92rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{msg.text}</div>}

        {/* Extracted data table */}
        {msg.extractedData && (
          <div style={{ marginTop: 12, padding: '12px', background: 'rgba(249,250,251,0.95)', borderRadius: 12, border: '1px solid var(--border)' }}>
            <ResultTable data={msg.extractedData} />
          </div>
        )}

        <div style={{ fontSize: '0.7rem', opacity: 0.6, marginTop: 6, textAlign: 'right' }}>
          {msg.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ── */
export default function InsumosPage() {
  const ins = useInsumos();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) ins.handleFileSelect(file); };

  return (
    <AuthGuard requiredPermission="pedidos">
      <div style={{ width: '100%', maxWidth: 1400, margin: '0 auto', minHeight: '100vh', paddingBottom: 60 }}>
        <AppHeader activePage="insumos" />
        <main style={{ padding: '0 20px' }}>
          {/* Hero */}
          <section style={{ background: 'transparent', margin: '40px 0 20px', textAlign: 'center' }}>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-1px', marginBottom: 8 }}>Gestão de <span style={{ color: 'var(--primary)' }}>Insumos</span></h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '1rem', maxWidth: 600, margin: '0 auto' }}>Faça upload de PDFs ou fotos e deixe a IA extrair as informações que você precisa.</p>
          </section>

          {/* Tab Nav */}
          <nav style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.5)', padding: 4, borderRadius: 14, border: '1px solid var(--border)', maxWidth: 520, margin: '0 auto 24px' }}>
            {([
              { key: 'upload' as const, label: '📤 Upload' },
              { key: 'chat' as const, label: '💬 Chat IA' },
              { key: 'history' as const, label: '📋 Histórico' },
            ]).map(t => (
              <button key={t.key} onClick={() => ins.setActiveView(t.key)} style={{ flex: 1, padding: '10px 20px', borderRadius: 10, border: 'none', background: ins.activeView === t.key ? 'linear-gradient(135deg,var(--primary),#ff4db1)' : 'transparent', color: ins.activeView === t.key ? '#fff' : 'var(--text-muted)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s' }}>{t.label}</button>
            ))}
          </nav>

          {/* ══════════ UPLOAD VIEW ══════════ */}
          {ins.activeView === 'upload' && (
            <div style={{ display: 'grid', gridTemplateColumns: ins.lastResult ? '1fr 1fr' : '1fr', gap: 20, alignItems: 'start' }}>
              <div>
                <div onDragOver={e => e.preventDefault()} onDrop={handleDrop} onClick={() => !ins.selectedFile && fileInputRef.current?.click()}
                  style={{ ...cardS, textAlign: 'center', cursor: ins.selectedFile ? 'default' : 'pointer', border: ins.selectedFile ? '2px solid var(--primary)' : '2px dashed var(--border)', background: ins.selectedFile ? 'rgba(99,102,241,0.03)' : 'rgba(255,255,255,0.75)', transition: 'all 0.3s', marginBottom: 16 }}>
                  <input ref={fileInputRef} type="file" accept={ACCEPTED} onChange={e => { const f = e.target.files?.[0]; if (f) ins.handleFileSelect(f); }} style={{ display: 'none' }} />
                  {!ins.selectedFile ? (
                    <div style={{ padding: '32px 0' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 56, color: 'var(--primary)', marginBottom: 12, display: 'block', opacity: 0.7 }}>cloud_upload</span>
                      <p style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 4 }}>Arraste o arquivo aqui</p>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>ou clique para selecionar</p>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 12, background: 'rgba(99,102,241,0.06)', display: 'inline-block', padding: '4px 14px', borderRadius: 8 }}>PDF, PNG, JPG, WEBP, HEIC, BMP, GIF</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      {ins.filePreview ? <img src={ins.filePreview} alt="Preview" style={{ width: 80, height: 80, borderRadius: 12, objectFit: 'cover', border: '1px solid var(--border)' }} /> : <div style={{ width: 80, height: 80, borderRadius: 12, background: 'rgba(239,68,68,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="material-symbols-outlined" style={{ fontSize: 36, color: '#ef4444' }}>picture_as_pdf</span></div>}
                      <div style={{ textAlign: 'left', flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', wordBreak: 'break-all' }}>{ins.selectedFile.name}</div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>{formatSize(ins.selectedFile.size)} • {ins.selectedFile.type.split('/')[1]?.toUpperCase()}</div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); ins.clearFile(); }} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ef4444' }}>close</span></button>
                    </div>
                  )}
                </div>
                <div style={{ ...cardS, marginBottom: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.9rem', marginBottom: 10 }}><span className="material-symbols-outlined" style={{ color: 'var(--primary)', fontSize: 20 }}>auto_awesome</span>O que deseja extrair?</label>
                  <textarea value={ins.prompt} onChange={e => ins.setPrompt(e.target.value)} placeholder="Ex: extraia nome do produto, quantidade, preço unitário e fornecedor" rows={3} style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: '0.95rem', outline: 'none', background: 'rgba(249,250,251,0.8)', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    {['Nome, quantidade e preço de cada produto', 'Dados da nota fiscal (CNPJ, data, valor total)', 'Lista de insumos com quantidades e unidades', 'Dados do fornecedor e condições de pagamento'].map(s => (
                      <button key={s} onClick={() => ins.setPrompt(s)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.8)', fontSize: '0.78rem', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>{s}</button>
                    ))}
                  </div>
                </div>
                <button onClick={ins.handleUploadAndExtract} disabled={ins.uploading || !ins.selectedFile || !ins.prompt.trim()} style={{ width: '100%', padding: '14px 24px', borderRadius: 14, border: 'none', background: ins.uploading || !ins.selectedFile || !ins.prompt.trim() ? 'var(--border)' : 'linear-gradient(135deg,var(--primary),#ff4db1)', color: ins.uploading || !ins.selectedFile || !ins.prompt.trim() ? 'var(--text-muted)' : '#fff', fontWeight: 800, fontSize: '1rem', cursor: ins.uploading ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: ins.selectedFile && ins.prompt.trim() ? '0 4px 16px rgba(230,0,126,0.25)' : 'none' }}>
                  {ins.uploading ? <><span className="material-symbols-outlined spinning">progress_activity</span> Analisando...</> : <><span className="material-symbols-outlined">auto_awesome</span> Extrair com IA</>}
                </button>
                {ins.error && <div style={{ marginTop: 12, padding: '12px 16px', background: 'rgba(239,68,68,0.06)', borderRadius: 12, border: '1px solid rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', gap: 8 }}><span className="material-symbols-outlined" style={{ fontSize: 20, color: '#ef4444' }}>error</span><span style={{ fontSize: '0.88rem', color: '#ef4444', fontWeight: 600 }}>{ins.error}</span></div>}
              </div>
              {ins.lastResult && (
                <div style={{ ...cardS, padding: '20px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: '1rem', fontWeight: 800 }}><span className="material-symbols-outlined" style={{ color: 'var(--primary)' }}>table_chart</span>Dados Extraídos</h2>
                    <button onClick={() => navigator.clipboard.writeText(JSON.stringify(ins.lastResult, null, 2))} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.8)', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'inherit' }}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>content_copy</span>Copiar</button>
                  </div>
                  <ResultTable data={ins.lastResult} />
                </div>
              )}
            </div>
          )}

          {/* ══════════ CHAT VIEW ══════════ */}
          {ins.activeView === 'chat' && (
            <div style={{ ...cardS, padding: 0, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 300px)', minHeight: 500, overflow: 'hidden' }}>
              {/* Chat Header */}
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.9)' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,var(--primary),#ff4db1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#fff' }}>auto_awesome</span>
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>Assistente IA</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Envie arquivos e pergunte o que quiser</div>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: 'linear-gradient(180deg,rgba(249,250,251,0.5),rgba(255,255,255,0.3))' }}>
                {ins.chatMessages.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 56, color: 'var(--primary)', opacity: 0.3, display: 'block', marginBottom: 16 }}>forum</span>
                    <p style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 4 }}>Converse com a IA</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: 400, margin: '0 auto' }}>Envie uma imagem ou PDF junto com sua pergunta, ou simplesmente converse sobre insumos.</p>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
                      {['Quais insumos são mais usados em depilação a laser?', 'Me ajude a montar um pedido de reposição'].map(s => (
                        <button key={s} onClick={() => ins.setChatInput(s)} style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.8)', fontSize: '0.82rem', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, maxWidth: 260 }}>{s}</button>
                      ))}
                    </div>
                  </div>
                )}
                {ins.chatMessages.map(msg => <ChatBubble key={msg.id} msg={msg} />)}
                <div ref={ins.chatEndRef} />
              </div>

              {/* File Preview Bar */}
              {ins.chatFile && (
                <div style={{ padding: '8px 24px', borderTop: '1px solid var(--border)', background: 'rgba(99,102,241,0.04)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  {ins.chatFilePreview ? (
                    <img src={ins.chatFilePreview} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} />
                  ) : (
                    <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#ef4444' }}>picture_as_pdf</span>
                  )}
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, flex: 1 }}>{ins.chatFile.name}</span>
                  <button onClick={ins.clearChatFile} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#ef4444' }}>close</span>
                  </button>
                </div>
              )}

              {/* Input Bar */}
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'rgba(255,255,255,0.95)', display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                <input ref={chatFileInputRef} type="file" accept={ACCEPTED} onChange={e => { const f = e.target.files?.[0]; if (f) ins.handleChatFileSelect(f); e.target.value = ''; }} style={{ display: 'none' }} />
                <button onClick={() => chatFileInputRef.current?.click()} style={{ width: 44, height: 44, borderRadius: 12, border: '1px solid var(--border)', background: ins.chatFile ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.8)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} title="Anexar arquivo">
                  <span className="material-symbols-outlined" style={{ fontSize: 22, color: ins.chatFile ? 'var(--primary)' : 'var(--text-muted)' }}>attach_file</span>
                </button>
                <textarea
                  value={ins.chatInput}
                  onChange={e => ins.setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ins.sendChatMessage(); } }}
                  placeholder={ins.chatFile ? 'O que quer saber sobre este arquivo?' : 'Digite sua mensagem...'}
                  rows={1}
                  style={{ flex: 1, padding: '12px 16px', borderRadius: 14, border: '1px solid var(--border)', fontSize: '0.92rem', outline: 'none', background: 'rgba(249,250,251,0.8)', resize: 'none', fontFamily: 'inherit', maxHeight: 120 }}
                />
                <button onClick={ins.sendChatMessage} disabled={ins.chatSending || (!ins.chatInput.trim() && !ins.chatFile)}
                  style={{ width: 44, height: 44, borderRadius: 12, border: 'none', background: ins.chatSending || (!ins.chatInput.trim() && !ins.chatFile) ? 'var(--border)' : 'linear-gradient(135deg,var(--primary),#ff4db1)', cursor: ins.chatSending ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s' }}>
                  {ins.chatSending ? (
                    <span className="material-symbols-outlined spinning" style={{ fontSize: 20, color: 'var(--text-muted)' }}>progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: ins.chatInput.trim() || ins.chatFile ? '#fff' : 'var(--text-muted)' }}>send</span>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ══════════ HISTORY VIEW ══════════ */}
          {ins.activeView === 'history' && (
            <div style={cardS}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--primary)', fontSize: 24 }}>history</span>
                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Histórico de Uploads</h2>
                <span style={{ marginLeft: 'auto', background: 'var(--primary)', color: '#fff', borderRadius: 20, padding: '4px 14px', fontSize: '0.8rem', fontWeight: 700 }}>{ins.uploads.length}</span>
              </div>
              {ins.loading ? (
                <div style={{ padding: 40, textAlign: 'center' }}><span className="material-symbols-outlined spinning" style={{ fontSize: 32, color: 'var(--primary)' }}>progress_activity</span><p style={{ color: 'var(--text-muted)', marginTop: 8 }}>Carregando...</p></div>
              ) : ins.uploads.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center' }}><span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-muted)', opacity: 0.5 }}>inventory_2</span><p style={{ color: 'var(--text-muted)', marginTop: 8, fontWeight: 600 }}>Nenhum upload realizado ainda.</p></div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {ins.uploads.map((u: InsumoUpload) => (
                    <div key={u.id} style={{ padding: '16px 20px', borderRadius: 14, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: u.fileType.includes('pdf') ? 'rgba(239,68,68,0.06)' : 'rgba(99,102,241,0.06)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 24, color: u.fileType.includes('pdf') ? '#ef4444' : 'var(--primary)' }}>{u.fileType.includes('pdf') ? 'picture_as_pdf' : 'image'}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', wordBreak: 'break-all' }}>{u.fileName}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <span>{new Date(u.createdAt).toLocaleString('pt-BR')}</span>
                          <span style={{ background: 'rgba(99,102,241,0.08)', padding: '1px 8px', borderRadius: 6 }}>{formatSize(u.fileSize)}</span>
                          {u.userName && <span>por {u.userName}</span>}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>"{u.prompt}"</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700, background: u.status === 'completed' ? 'rgba(16,185,129,0.1)' : u.status === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)', color: u.status === 'completed' ? '#10b981' : u.status === 'error' ? '#ef4444' : '#f59e0b' }}>
                          {u.status === 'completed' ? '✅ Completo' : u.status === 'error' ? '❌ Erro' : '⏳ Processando'}
                        </span>
                        {u.status === 'completed' && u.extractedData && <button onClick={() => ins.viewExtracted(u)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.8)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--primary)' }}>visibility</span></button>}
                        <button onClick={() => ins.deleteUpload(u.id)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="material-symbols-outlined" style={{ fontSize: 16, color: '#ef4444' }}>delete</span></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
        <footer style={{ padding: '20px 24px', borderTop: '1px solid var(--border)', textAlign: 'center', marginTop: 40 }}>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>© 2024 Virtuosa Estética - Gestão de Insumos com IA</p>
        </footer>
      </div>
    </AuthGuard>
  );
}
