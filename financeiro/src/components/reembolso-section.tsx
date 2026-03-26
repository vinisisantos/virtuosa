'use client';
import { useState, useRef, useEffect } from 'react';

interface ChatMsg {
  id: string;
  role: 'user' | 'ai';
  text: string;
  fileName?: string;
  filePreview?: string;
  extractedData?: any;
  isLoading?: boolean;
  error?: string;
  timestamp: Date;
}

interface ReembolsoItem {
  descricao: string;
  categoria: string;
  valor: number | string;
  data?: string;
  status?: 'pendente' | 'aprovado' | 'pago';
  responsavel?: string;
  [key: string]: any;
}

interface PlatformUser { id:string; name:string; role:string; unit?:string; isActive?:boolean; }

const ACCEPTED = '.pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.bmp,.gif';

const cardS: React.CSSProperties = {
  background: 'var(--card-bg)', backdropFilter: 'blur(20px)', borderRadius: 20,
  border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)',
};

const categoryColors: Record<string, { bg: string; color: string; icon: string }> = {
  'Alimentação': { bg: 'rgba(251,146,60,0.1)', color: '#f97316', icon: 'restaurant' },
  'Transporte': { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6', icon: 'directions_car' },
  'Material': { bg: 'rgba(168,85,247,0.1)', color: '#a855f7', icon: 'inventory_2' },
  'Combustível': { bg: 'rgba(234,179,8,0.1)', color: '#ca8a04', icon: 'local_gas_station' },
  'Estacionamento': { bg: 'rgba(20,184,166,0.1)', color: '#14b8a6', icon: 'local_parking' },
  'Saúde': { bg: 'rgba(239,68,68,0.1)', color: '#ef4444', icon: 'medical_services' },
  'Hospedagem': { bg: 'rgba(99,102,241,0.1)', color: '#6366f1', icon: 'hotel' },
  'Outros': { bg: 'rgba(107,114,128,0.1)', color: '#6b7280', icon: 'more_horiz' },
};
const ALL_CATEGORIES = Object.keys(categoryColors);

function getCategoryStyle(cat: string) {
  const key = Object.keys(categoryColors).find(k => cat.toLowerCase().includes(k.toLowerCase()));
  return categoryColors[key || 'Outros'] || categoryColors['Outros'];
}

function formatBRL(v: number | string) {
  const n = typeof v === 'string' ? parseFloat(v.replace(/[^\d.,]/g, '').replace(',', '.')) : v;
  if (isNaN(n)) return String(v);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function numVal(v: number | string): number {
  const n = typeof v === 'string' ? parseFloat(v.replace(/[^\d.,]/g, '').replace(',', '.')) : v;
  return isNaN(n) ? 0 : n;
}

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pendente:  { label: 'Pendente',  color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', icon: 'schedule' },
  aprovado:  { label: 'Aprovado',  color: '#10b981', bg: 'rgba(16,185,129,0.08)', icon: 'check_circle' },
  pago:      { label: 'Pago',      color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', icon: 'paid' },
};

export function ReembolsoSection() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('virtuosa_reembolso_collapsed') === 'true';
    return false;
  });
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>(() => {
    if (typeof window !== 'undefined') {
      try { const s = localStorage.getItem('virtuosa_reembolso_chat'); if (s) return JSON.parse(s).map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })); } catch {}
    }
    return [];
  });
  const [chatInput, setChatInput] = useState('');
  const [chatFile, setChatFile] = useState<File | null>(null);
  const [chatFilePreview, setChatFilePreview] = useState<string | null>(null);
  const [chatFileBase64, setChatFileBase64] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [reembolsos, setReembolsos] = useState<ReembolsoItem[]>(() => {
    if (typeof window !== 'undefined') { try { const s = localStorage.getItem('virtuosa_reembolso_items'); if (s) return JSON.parse(s); } catch {} }
    return [];
  });
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editValor, setEditValor] = useState('');
  const [editCat, setEditCat] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [responsavel, setResponsavel] = useState('');
  const [platformUsers, setPlatformUsers] = useState<PlatformUser[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch users
  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(d => { if (Array.isArray(d)) setPlatformUsers(d.filter((u: PlatformUser) => u.isActive !== false)); }).catch(() => {});
  }, []);

  // Persist
  useEffect(() => { const s = chatMessages.filter(m => !m.isLoading); localStorage.setItem('virtuosa_reembolso_chat', JSON.stringify(s)); }, [chatMessages]);
  useEffect(() => { localStorage.setItem('virtuosa_reembolso_items', JSON.stringify(reembolsos)); }, [reembolsos]);

  const toggleCollapsed = () => { setCollapsed(prev => { const next = !prev; localStorage.setItem('virtuosa_reembolso_collapsed', String(next)); return next; }); };

  const hasInitRef = useRef(false);
  useEffect(() => { if (!hasInitRef.current) { hasInitRef.current = true; return; } chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  // File handling
  const handleFileSelect = (file: File) => {
    setChatFile(file);
    if (file.type.startsWith('image/')) { const r = new FileReader(); r.onload = () => setChatFilePreview(r.result as string); r.readAsDataURL(file); } else setChatFilePreview(null);
    const r2 = new FileReader(); r2.onload = () => setChatFileBase64(r2.result as string); r2.readAsDataURL(file);
  };
  const clearFile = () => { setChatFile(null); setChatFilePreview(null); setChatFileBase64(null); };

  // Drag & Drop
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  // Send message
  const sendMessage = async () => {
    if (!chatInput.trim() && !chatFile) return;
    const msgId = Date.now().toString();
    const userMsg: ChatMsg = { id: msgId, role: 'user', text: chatInput.trim(), fileName: chatFile?.name, filePreview: chatFilePreview || undefined, timestamp: new Date() };
    const aiMsgId = (Date.now() + 1).toString();
    const aiPlaceholder: ChatMsg = { id: aiMsgId, role: 'ai', text: '', isLoading: true, timestamp: new Date() };
    setChatMessages(prev => [...prev, userMsg, aiPlaceholder]);
    const currentInput = chatInput.trim();
    const currentFile = chatFile;
    const currentBase64 = chatFileBase64;
    setChatInput(''); setSending(true);

    const currentListJson = JSON.stringify(reembolsos.map((r, i) => ({ id: i, ...r })));
    const reembolsoPrompt = `Você é um assistente de classificação de reembolsos para uma clínica de estética.\n\nLISTA ATUAL DE REEMBOLSOS:\n${currentListJson}\n\nREGRAS:\n1. Responda SEMPRE em JSON válido\n2. Para ADICIONAR novos itens: { "action": "add", "items": [...], "summary": "...", "total": 0 }\n3. Para SUBSTITUIR a lista inteira (editar, remover, alterar): { "action": "replace_all", "items": [...], "summary": "...", "total": 0 }\n4. Cada item deve ter: { "descricao": "...", "categoria": "...", "valor": 0, "data": "...", "status": "pendente" }\n5. Categorias possíveis: Alimentação, Transporte, Material, Combustível, Estacionamento, Saúde, Hospedagem, Outros\n6. Se não conseguir identificar um campo, use null\n7. O "total" deve ser a soma de todos os valores dos items retornados\n8. Responda em português (pt-BR)\n9. NÃO inclua markdown, code blocks, ou texto fora do JSON\n10. Se o usuário pedir para REMOVER um item, retorne a lista completa SEM o item removido com action "replace_all"\n11. Se o usuário pedir para EDITAR um item, retorne a lista completa COM o item editado com action "replace_all"\n12. Se o usuário enviar novos reembolsos, use action "add" para adicioná-los à lista existente\n13. Se o usuário apenas fizer uma pergunta sem dados de reembolso, responda com { "action": "chat", "summary": "sua resposta aqui" }\n14. Sempre inclua "status": "pendente" nos novos itens`;

    try {
      if (currentFile && currentBase64) {
        const res = await fetch('/api/insumos', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileBase64: currentBase64, fileName: currentFile.name, fileType: currentFile.type, fileSize: currentFile.size, prompt: reembolsoPrompt + '\n\nInstrução adicional do usuário: ' + (currentInput || 'Classifique todos os reembolsos deste documento'), unit: 'Barueri', userId: '', userName: '' }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao processar.');
        let parsed: any = null;
        if (data.extractedData) {
          try { parsed = JSON.parse(data.extractedData); } catch { parsed = { raw: data.extractedData }; }
          if (parsed?.items) {
            const items = parsed.items.map((it: ReembolsoItem) => ({ ...it, status: it.status || 'pendente', responsavel: responsavel || undefined }));
            if (parsed.action === 'replace_all') setReembolsos(items);
            else setReembolsos(prev => [...prev, ...items]);
          }
        }
        setChatMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, isLoading: false, text: parsed?.summary || 'Reembolsos classificados!', extractedData: parsed } : m));
        clearFile();
      } else {
        const res = await fetch('/api/insumos/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: reembolsoPrompt + '\n\nTexto do usuário com os reembolsos:\n' + currentInput }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao processar.');
        let parsed: any = null;
        const responseText = data.response || '';
        try {
          let clean = responseText.trim();
          if (clean.startsWith('```')) clean = clean.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
          parsed = JSON.parse(clean);
          if (parsed?.items) {
            const items = parsed.items.map((it: ReembolsoItem) => ({ ...it, status: it.status || 'pendente', responsavel: responsavel || undefined }));
            if (parsed.action === 'replace_all') setReembolsos(items);
            else if (parsed.action !== 'chat') setReembolsos(prev => [...prev, ...items]);
          }
        } catch { parsed = null; }
        setChatMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, isLoading: false, text: parsed?.summary || responseText || 'Resposta recebida.', extractedData: parsed?.action !== 'chat' ? parsed : undefined } : m));
      }
    } catch (err: any) {
      setChatMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, isLoading: false, error: err.message } : m));
    } finally { setSending(false); }
  };

  // Edit handlers
  const startEdit = (item: ReembolsoItem, idx: number) => { setEditingIdx(idx); setEditDesc(item.descricao); setEditValor(String(numVal(item.valor))); setEditCat(item.categoria); };
  const saveEdit = (idx: number) => {
    setReembolsos(prev => prev.map((r, i) => i === idx ? { ...r, descricao: editDesc.trim() || r.descricao, valor: parseFloat(editValor) || r.valor, categoria: editCat || r.categoria } : r));
    setEditingIdx(null);
  };

  // Status cycle
  const cycleStatus = (idx: number) => {
    const order: ('pendente'|'aprovado'|'pago')[] = ['pendente', 'aprovado', 'pago'];
    setReembolsos(prev => prev.map((r, i) => {
      if (i !== idx) return r;
      const cur = order.indexOf(r.status || 'pendente');
      return { ...r, status: order[(cur + 1) % 3] };
    }));
  };

  // Export CSV
  const exportCSV = () => {
    let csv = '\uFEFF'; // BOM
    csv += 'REEMBOLSOS - VIRTUOSA ESTÉTICA\n';
    if (responsavel) csv += `Responsável: ${responsavel}\n`;
    csv += `Exportado em: ${new Date().toLocaleString('pt-BR')}\n\n`;
    csv += 'Descrição;Categoria;Valor;Data;Status;Responsável\n';
    reembolsos.forEach(r => {
      csv += `${r.descricao};${r.categoria};${numVal(r.valor).toFixed(2).replace('.',',')};${r.data||''};${STATUS_META[r.status||'pendente'].label};${r.responsavel||''}\n`;
    });
    csv += `\nTotal:;${totalReembolsos.toFixed(2).replace('.',',')}\n`;
    csv += `Itens:;${reembolsos.length}\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `reembolsos_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // Calculations
  const totalReembolsos = reembolsos.reduce((s, r) => s + numVal(r.valor), 0);
  const avgReembolso = reembolsos.length > 0 ? totalReembolsos / reembolsos.length : 0;
  const pendCount = reembolsos.filter(r => (r.status||'pendente') === 'pendente').length;
  const approvedCount = reembolsos.filter(r => r.status === 'aprovado').length;
  const paidCount = reembolsos.filter(r => r.status === 'pago').length;

  const catTotals: Record<string,number> = {};
  reembolsos.forEach(r => { catTotals[r.categoria] = (catTotals[r.categoria]||0) + numVal(r.valor); });
  const topCat = Object.entries(catTotals).sort((a,b)=>b[1]-a[1])[0];

  const grouped = reembolsos.reduce((acc, r) => { const cat = r.categoria||'Outros'; if (!acc[cat]) acc[cat]=[]; acc[cat].push(r); return acc; }, {} as Record<string, ReembolsoItem[]>);

  return (
    <section style={{ marginTop: 40 }}>
      {/* Header */}
      <div onClick={toggleCollapsed} style={{ ...cardS, padding: '16px 24px', marginBottom: collapsed ? 0 : 20, cursor: 'pointer', userSelect: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-main)' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="material-symbols-outlined" style={{ color: '#f97316', fontSize: 24 }}>receipt_long</span>
          Reembolsos
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {reembolsos.length > 0 && (
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f97316', background: 'rgba(251,146,60,0.1)', padding: '4px 14px', borderRadius: 20 }}>
              {reembolsos.length} itens • {formatBRL(totalReembolsos)}
            </span>
          )}
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-muted)', transition: 'transform 0.3s', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}>expand_more</span>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxHeight: collapsed ? 0 : 8000, opacity: collapsed ? 0 : 1, overflow: 'hidden', transition: 'max-height 0.4s ease, opacity 0.3s ease' }}>

        {/* Mini KPIs */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:16}}>
          {[
            {label:'Total Reembolsos',value:formatBRL(totalReembolsos),icon:'payments',color:'#f97316',sub:`${reembolsos.length} itens`},
            {label:'Ticket Médio',value:formatBRL(avgReembolso),icon:'analytics',color:'#8b5cf6',sub:'por item'},
            {label:'Pendentes',value:String(pendCount),icon:'schedule',color:'#f59e0b',sub:approvedCount>0?`${approvedCount} aprovados`:'—'},
            {label:'Top Categoria',value:topCat?.[0]||'—',icon:'category',color:'#3b82f6',sub:topCat?formatBRL(topCat[1]):'—'},
          ].map((kpi,i) => (
            <div key={i} style={{...cardS,padding:14,position:'relative',overflow:'hidden',transition:'all 0.2s'}}
              onMouseEnter={e=>(e.currentTarget as HTMLElement).style.transform='translateY(-2px)'}
              onMouseLeave={e=>(e.currentTarget as HTMLElement).style.transform='translateY(0)'}>
              <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${kpi.color},${kpi.color}66)`}} />
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                <span style={{fontSize:'0.68rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.5px'}}>{kpi.label}</span>
                <div style={{width:30,height:30,borderRadius:10,background:`${kpi.color}12`,display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <span className="material-symbols-outlined" style={{fontSize:16,color:kpi.color}}>{kpi.icon}</span>
                </div>
              </div>
              <div style={{fontSize:'1.15rem',fontWeight:900,color:kpi.color,lineHeight:1.1}}>{kpi.value}</div>
              <div style={{fontSize:'0.65rem',color:'var(--text-muted)',marginTop:2,fontWeight:600}}>{kpi.sub}</div>
            </div>
          ))}
        </div>

        {/* Responsável selector + Actions */}
        <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
          <div style={{display:'flex',alignItems:'center',gap:6,flex:1,minWidth:200}}>
            <span className="material-symbols-outlined" style={{fontSize:18,color:'#f97316'}}>person</span>
            <select value={responsavel} onChange={e=>setResponsavel(e.target.value)} style={{flex:1,padding:'8px 12px',borderRadius:10,border:'1px solid var(--border)',background:'var(--card-bg)',fontSize:'0.82rem',fontWeight:600,fontFamily:'inherit',color:'var(--text-main)',outline:'none'}}>
              <option value="">Selecionar responsável...</option>
              {platformUsers.map(u => <option key={u.id} value={u.name}>{u.name} ({u.role})</option>)}
            </select>
          </div>
          {reembolsos.length > 0 && (
            <div style={{display:'flex',gap:6}}>
              <button onClick={exportCSV} style={{display:'flex',alignItems:'center',gap:4,padding:'8px 14px',borderRadius:10,border:'1px solid rgba(16,185,129,0.2)',background:'rgba(16,185,129,0.06)',color:'#10b981',fontWeight:700,fontSize:'0.78rem',cursor:'pointer',fontFamily:'inherit'}}>
                <span className="material-symbols-outlined" style={{fontSize:14}}>download</span>Exportar CSV
              </button>
              <button onClick={()=>setShowClearConfirm(true)} style={{display:'flex',alignItems:'center',gap:4,padding:'8px 14px',borderRadius:10,border:'1px solid rgba(239,68,68,0.2)',background:'rgba(239,68,68,0.05)',color:'#ef4444',fontWeight:700,fontSize:'0.78rem',cursor:'pointer',fontFamily:'inherit'}}>
                <span className="material-symbols-outlined" style={{fontSize:14}}>delete_sweep</span>Limpar Tudo
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>

          {/* Left: Chat with Drag & Drop */}
          <div style={{ ...cardS, padding: 0, display: 'flex', flexDirection: 'column', height: 520, overflow: 'hidden', position: 'relative' }}
            onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>

            {isDragging && (
              <div style={{position:'absolute',inset:0,zIndex:20,background:'rgba(249,115,22,0.1)',border:'3px dashed #f97316',borderRadius:20,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(4px)'}}>
                <div style={{textAlign:'center'}}>
                  <span className="material-symbols-outlined" style={{fontSize:48,color:'#f97316'}}>upload_file</span>
                  <p style={{fontWeight:700,color:'#f97316',marginTop:8}}>Solte o arquivo aqui</p>
                </div>
              </div>
            )}

            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--card-bg)' }}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#f97316,#ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#fff' }}>auto_awesome</span>
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.88rem' }}>Assistente de Reembolso</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Cole valores, arraste foto ou PDF</div>
                </div>
              </div>
              {chatMessages.length > 0 && (
                <button onClick={() => { if(confirm('Limpar histórico do chat? Os reembolsos classificados serão mantidos.')) setChatMessages([]); }}
                  style={{padding:'4px 10px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg)',fontSize:'0.7rem',fontWeight:600,color:'var(--text-muted)',cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:4}}>
                  <span className="material-symbols-outlined" style={{fontSize:12}}>chat_bubble</span>Limpar Chat
                </button>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: 'var(--bg)' }}>
              {chatMessages.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 16px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 44, color: '#f97316', opacity: 0.3, display: 'block', marginBottom: 12 }}>receipt_long</span>
                  <p style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 4 }}>Envie seus reembolsos</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '0 auto', maxWidth: 300 }}>Cole os valores, arraste uma foto ou PDF e a IA classifica tudo automaticamente.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 16 }}>
                    {['Uber R$35, almoço R$45, estacionamento R$12', 'Classifique os reembolsos deste recibo'].map(s => (
                      <button key={s} onClick={() => setChatInput(s)} style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: '0.78rem', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, textAlign: 'left' }}>{s}</button>
                    ))}
                  </div>
                </div>
              )}
              {chatMessages.map(msg => (
                <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
                  <div style={{ maxWidth: '85%', padding: '12px 16px', borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: msg.role === 'user' ? 'linear-gradient(135deg,#f97316,#ea580c)' : 'var(--card-bg)', color: msg.role === 'user' ? '#fff' : 'var(--text-main)', border: msg.role === 'user' ? 'none' : '1px solid var(--border)', boxShadow: msg.role === 'user' ? '0 4px 12px rgba(249,115,22,0.2)' : 'var(--shadow-sm)' }}>
                    {msg.fileName && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, padding: '6px 10px', background: msg.role === 'user' ? 'rgba(255,255,255,0.15)' : 'rgba(249,115,22,0.06)', borderRadius: 8 }}>
                        {msg.filePreview ? <img src={msg.filePreview} alt="" style={{ width: 30, height: 30, borderRadius: 6, objectFit: 'cover' }} /> : <span className="material-symbols-outlined" style={{ fontSize: 18 }}>picture_as_pdf</span>}
                        <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{msg.fileName}</span>
                      </div>
                    )}
                    {msg.isLoading && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="material-symbols-outlined spinning" style={{ fontSize: 16, color: '#f97316' }}>progress_activity</span><span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Classificando...</span></div>}
                    {msg.error && <div style={{ color: '#ef4444', fontSize: '0.82rem', fontWeight: 600 }}>❌ {msg.error}</div>}
                    {msg.text && <div style={{ fontSize: '0.85rem', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{msg.text}</div>}
                    {msg.extractedData?.items && (
                      <div style={{ marginTop: 8, fontSize: '0.8rem' }}>
                        {msg.extractedData.items.map((item: ReembolsoItem, i: number) => {
                          const style = getCategoryStyle(item.categoria);
                          return (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', borderRadius: 6, marginBottom: 2, background: style.bg }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span className="material-symbols-outlined" style={{ fontSize: 14, color: style.color }}>{style.icon}</span>{item.descricao}</span>
                              <span style={{ fontWeight: 700, color: style.color }}>{formatBRL(item.valor)}</span>
                            </div>
                          );
                        })}
                        {msg.extractedData.total != null && <div style={{ textAlign: 'right', fontWeight: 800, marginTop: 4, fontSize: '0.88rem' }}>Total: {formatBRL(msg.extractedData.total)}</div>}
                      </div>
                    )}
                    <div style={{ fontSize: '0.65rem', opacity: 0.5, marginTop: 4, textAlign: 'right' }}>{msg.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {chatFile && (
              <div style={{ padding: '6px 20px', borderTop: '1px solid var(--border)', background: 'rgba(249,115,22,0.04)', display: 'flex', alignItems: 'center', gap: 8 }}>
                {chatFilePreview ? <img src={chatFilePreview} alt="" style={{ width: 30, height: 30, borderRadius: 6, objectFit: 'cover' }} /> : <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ef4444' }}>picture_as_pdf</span>}
                <span style={{ fontSize: '0.78rem', fontWeight: 600, flex: 1 }}>{chatFile.name}</span>
                <button onClick={clearFile} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="material-symbols-outlined" style={{ fontSize: 12, color: '#ef4444' }}>close</span></button>
              </div>
            )}

            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--card-bg)', display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <input ref={fileInputRef} type="file" accept={ACCEPTED} onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }} style={{ display: 'none' }} />
              <button onClick={() => fileInputRef.current?.click()} style={{ width: 40, height: 40, borderRadius: 10, border: '1px solid var(--border)', background: chatFile ? 'rgba(249,115,22,0.1)' : 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: chatFile ? '#f97316' : 'var(--text-muted)' }}>attach_file</span>
              </button>
              <textarea value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder="Cole valores ou descreva o reembolso..." rows={1} style={{ flex: 1, padding: '10px 14px', borderRadius: 12, border: '1px solid var(--border)', fontSize: '0.88rem', outline: 'none', background: 'var(--bg)', color: 'var(--text-main)', resize: 'none', fontFamily: 'inherit', maxHeight: 100 }} />
              <button onClick={sendMessage} disabled={sending || (!chatInput.trim() && !chatFile)} style={{ width: 40, height: 40, borderRadius: 10, border: 'none', background: sending || (!chatInput.trim() && !chatFile) ? 'var(--border)' : 'linear-gradient(135deg,#f97316,#ea580c)', cursor: sending ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {sending ? <span className="material-symbols-outlined spinning" style={{ fontSize: 18, color: 'var(--text-muted)' }}>progress_activity</span> : <span className="material-symbols-outlined" style={{ fontSize: 18, color: chatInput.trim() || chatFile ? '#fff' : 'var(--text-muted)' }}>send</span>}
              </button>
            </div>
          </div>

          {/* Right: Classified Reembolsos */}
          <div style={{ ...cardS, padding: '20px 24px', maxHeight: 520, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: '1rem', fontWeight: 800 }}>
                <span className="material-symbols-outlined" style={{ color: '#f97316' }}>category</span>
                Classificação
              </h3>
              {reembolsos.length > 0 && (
                <div style={{display:'flex',gap:4}}>
                  {Object.entries(STATUS_META).map(([key, meta]) => {
                    const count = reembolsos.filter(r => (r.status||'pendente') === key).length;
                    return count > 0 ? (
                      <span key={key} style={{fontSize:'0.68rem',fontWeight:700,padding:'3px 8px',borderRadius:6,background:meta.bg,color:meta.color}}>
                        {count} {meta.label.toLowerCase()}
                      </span>
                    ) : null;
                  })}
                </div>
              )}
            </div>

            {reembolsos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 16px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--text-muted)', opacity: 0.3 }}>category</span>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 8 }}>Os reembolsos classificados aparecerão aqui.</p>
              </div>
            ) : (
              <>
                {/* Total */}
                <div style={{ padding: '14px 18px', borderRadius: 14, background: 'linear-gradient(135deg,rgba(249,115,22,0.08),rgba(234,88,12,0.04))', border: '1px solid rgba(249,115,22,0.15)', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Total Geral</span>
                  <span style={{ fontWeight: 900, fontSize: '1.2rem', color: '#f97316' }}>{formatBRL(totalReembolsos)}</span>
                </div>

                {/* Grouped */}
                {Object.entries(grouped).map(([cat, items]) => {
                  const style = getCategoryStyle(cat);
                  const catTotal = items.reduce((s, r) => s + numVal(r.valor), 0);
                  return (
                    <div key={cat} style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.85rem', color: style.color }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{style.icon}</span>{cat}
                        </span>
                        <span style={{ fontWeight: 700, fontSize: '0.82rem', color: style.color }}>{formatBRL(catTotal)}</span>
                      </div>
                      {items.map((item, i) => {
                        const globalIdx = reembolsos.indexOf(item);
                        const statusMeta = STATUS_META[item.status || 'pendente'];
                        const isEditing = editingIdx === globalIdx;

                        return isEditing ? (
                          /* Edit mode */
                          <div key={i} style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(249,115,22,0.04)', border: '1px solid rgba(249,115,22,0.2)', marginBottom: 4, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <input value={editDesc} onChange={e=>setEditDesc(e.target.value)} style={{flex:2,minWidth:100,padding:'6px 10px',borderRadius:8,border:'1px solid var(--border)',fontSize:'0.82rem',background:'var(--bg)',color:'var(--text-main)',fontFamily:'inherit',outline:'none'}} />
                            <input value={editValor} onChange={e=>setEditValor(e.target.value)} type="number" step="0.01" style={{width:80,padding:'6px 10px',borderRadius:8,border:'1px solid var(--border)',fontSize:'0.82rem',background:'var(--bg)',color:'var(--text-main)',fontFamily:'inherit',outline:'none'}} />
                            <select value={editCat} onChange={e=>setEditCat(e.target.value)} style={{padding:'6px 8px',borderRadius:8,border:'1px solid var(--border)',fontSize:'0.78rem',background:'var(--bg)',color:'var(--text-main)',fontFamily:'inherit',outline:'none'}}>
                              {ALL_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                            </select>
                            <button onClick={()=>saveEdit(globalIdx)} style={{width:28,height:28,borderRadius:8,border:'none',background:'#10b981',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><span className="material-symbols-outlined" style={{fontSize:14,color:'#fff'}}>check</span></button>
                            <button onClick={()=>setEditingIdx(null)} style={{width:28,height:28,borderRadius:8,border:'1px solid var(--border)',background:'var(--bg)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><span className="material-symbols-outlined" style={{fontSize:14,color:'var(--text-muted)'}}>close</span></button>
                          </div>
                        ) : (
                          /* View mode */
                          <div key={i} className="reembolso-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 10, background: style.bg, marginBottom: 4, position: 'relative', transition: 'all 0.15s' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                                {item.descricao}
                                {item.responsavel && <span style={{fontSize:'0.65rem',fontWeight:600,padding:'1px 6px',borderRadius:5,background:'rgba(249,115,22,0.1)',color:'#f97316'}}>👤 {item.responsavel}</span>}
                              </div>
                              {item.data && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.data}</div>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                              {/* Status badge — click to cycle */}
                              <button onClick={()=>cycleStatus(globalIdx)} title={`Status: ${statusMeta.label} — clique para alterar`}
                                style={{padding:'3px 8px',borderRadius:6,border:'none',background:statusMeta.bg,color:statusMeta.color,fontSize:'0.65rem',fontWeight:700,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:3}}>
                                <span className="material-symbols-outlined" style={{fontSize:12}}>{statusMeta.icon}</span>
                                {statusMeta.label}
                              </button>
                              <span style={{ fontWeight: 800, fontSize: '0.9rem', color: style.color }}>{formatBRL(item.valor)}</span>
                              {/* Edit button */}
                              <button onClick={()=>startEdit(item, globalIdx)} className="reembolso-action-btn"
                                style={{width:24,height:24,borderRadius:6,border:'none',background:'rgba(249,115,22,0.1)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',opacity:0,transition:'opacity 0.15s'}}>
                                <span className="material-symbols-outlined" style={{fontSize:13,color:'#f97316'}}>edit</span>
                              </button>
                              {/* Delete button */}
                              <button onClick={()=>setReembolsos(prev=>prev.filter((_,idx)=>idx!==globalIdx))} className="reembolso-action-btn"
                                style={{width:24,height:24,borderRadius:6,border:'none',background:'rgba(239,68,68,0.1)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',opacity:0,transition:'opacity 0.15s'}}>
                                <span className="material-symbols-outlined" style={{fontSize:13,color:'#ef4444'}}>close</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Clear Confirm Modal */}
      {showClearConfirm && (
        <div onClick={()=>setShowClearConfirm(false)} style={{position:'fixed',inset:0,zIndex:99999,background:'rgba(0,0,0,0.5)',backdropFilter:'blur(4px)',display:'flex',justifyContent:'center',alignItems:'center'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'var(--card-bg)',borderRadius:16,padding:32,maxWidth:400,width:'90%',textAlign:'center',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
            <span className="material-symbols-outlined" style={{fontSize:48,color:'#ef4444',display:'block',marginBottom:12}}>delete_sweep</span>
            <h3 style={{margin:'0 0 8px',fontSize:'1.2rem',color:'#ef4444'}}>Limpar Reembolsos?</h3>
            <p style={{margin:'0 0 24px',color:'var(--text-muted)',fontSize:'0.88rem'}}>Todos os {reembolsos.length} itens serão removidos.</p>
            <div style={{display:'flex',gap:12,justifyContent:'center'}}>
              <button onClick={()=>setShowClearConfirm(false)} style={{padding:'10px 24px',borderRadius:10,border:'1px solid var(--border)',background:'var(--card-bg)',color:'var(--text-muted)',fontWeight:700,cursor:'pointer',fontSize:'0.88rem',fontFamily:'inherit'}}>Cancelar</button>
              <button onClick={()=>{setReembolsos([]);setShowClearConfirm(false);}} style={{padding:'10px 24px',borderRadius:10,border:'none',background:'linear-gradient(135deg,#ef4444,#dc2626)',color:'#fff',fontWeight:700,cursor:'pointer',fontSize:'0.88rem',fontFamily:'inherit'}}>🗑️ Limpar Tudo</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .reembolso-item:hover .reembolso-action-btn { opacity: 1 !important; }
        .spinning { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </section>
  );
}
