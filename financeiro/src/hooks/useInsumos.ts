'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

export interface InsumoUpload {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  prompt: string;
  extractedData: string | null;
  status: string;
  errorMessage: string | null;
  unit: string | null;
  userName: string | null;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
  fileName?: string;
  filePreview?: string;
  fileType?: string;
  extractedData?: any;
  isLoading?: boolean;
  error?: string;
  timestamp: Date;
}

function getUserInfo() {
  try {
    const stored = localStorage.getItem('virtuosa_user');
    if (stored) {
      const user = JSON.parse(stored);
      return { userName: user.name || 'Alguém', userId: user.id || '', userUnit: user.unit || 'Barueri' };
    }
  } catch {}
  return { userName: 'Alguém', userId: '', userUnit: 'Barueri' };
}

export function useInsumos() {
  const [uploads, setUploads] = useState<InsumoUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'upload' | 'chat' | 'history'>('upload');

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatFile, setChatFile] = useState<File | null>(null);
  const [chatFilePreview, setChatFilePreview] = useState<string | null>(null);
  const [chatFileBase64, setChatFileBase64] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/insumos');
      if (res.ok) setUploads(await res.json());
    } catch (err) { console.error('Fetch insumos error:', err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  /* ── Upload tab file handling ── */
  const handleFileSelect = (file: File) => {
    setSelectedFile(file); setError(null); setLastResult(null);
    if (file.type.startsWith('image/')) {
      const r = new FileReader(); r.onload = () => setFilePreview(r.result as string); r.readAsDataURL(file);
    } else { setFilePreview(null); }
    const r2 = new FileReader(); r2.onload = () => setFileBase64(r2.result as string); r2.readAsDataURL(file);
  };

  const clearFile = () => {
    setSelectedFile(null); setFilePreview(null); setFileBase64(null); setLastResult(null); setError(null);
  };

  /* ── Chat file handling ── */
  const handleChatFileSelect = (file: File) => {
    setChatFile(file);
    if (file.type.startsWith('image/')) {
      const r = new FileReader(); r.onload = () => setChatFilePreview(r.result as string); r.readAsDataURL(file);
    } else { setChatFilePreview(null); }
    const r2 = new FileReader(); r2.onload = () => setChatFileBase64(r2.result as string); r2.readAsDataURL(file);
  };

  const clearChatFile = () => { setChatFile(null); setChatFilePreview(null); setChatFileBase64(null); };

  /* ── Send chat message ── */
  const sendChatMessage = async () => {
    if (!chatInput.trim() && !chatFile) return;
    if (chatFile && !chatFileBase64) return;

    const msgId = Date.now().toString();
    const userMsg: ChatMessage = {
      id: msgId, role: 'user', text: chatInput.trim(),
      fileName: chatFile?.name, filePreview: chatFilePreview || undefined,
      fileType: chatFile?.type, timestamp: new Date(),
    };
    const aiMsgId = (Date.now() + 1).toString();
    const aiPlaceholder: ChatMessage = { id: aiMsgId, role: 'ai', text: '', isLoading: true, timestamp: new Date() };

    setChatMessages(prev => [...prev, userMsg, aiPlaceholder]);
    const currentInput = chatInput.trim();
    const currentFile = chatFile;
    const currentBase64 = chatFileBase64;
    setChatInput('');
    setChatSending(true);

    const { userName, userId, userUnit } = getUserInfo();

    try {
      if (currentFile && currentBase64) {
        const res = await fetch('/api/insumos', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileBase64: currentBase64, fileName: currentFile.name,
            fileType: currentFile.type, fileSize: currentFile.size,
            prompt: currentInput || 'Descreva o conteúdo deste arquivo em detalhes',
            unit: userUnit, userId, userName,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao processar.');
        let parsed = null;
        if (data.extractedData) {
          try { parsed = JSON.parse(data.extractedData); } catch { parsed = { raw: data.extractedData }; }
        }
        setChatMessages(prev => prev.map(m => m.id === aiMsgId ? {
          ...m, isLoading: false, text: parsed?.summary || 'Dados extraídos com sucesso!', extractedData: parsed,
        } : m));
        clearChatFile();
        fetchHistory();
      } else {
        const res = await fetch('/api/insumos/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: currentInput }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao processar.');
        setChatMessages(prev => prev.map(m => m.id === aiMsgId ? {
          ...m, isLoading: false, text: data.response || 'Sem resposta.',
        } : m));
      }
    } catch (err: any) {
      setChatMessages(prev => prev.map(m => m.id === aiMsgId ? {
        ...m, isLoading: false, text: '', error: err.message || 'Erro inesperado.',
      } : m));
    } finally { setChatSending(false); }
  };

  /* ── Upload tab extract ── */
  const handleUploadAndExtract = async () => {
    if (!selectedFile || !fileBase64 || !prompt.trim()) { setError('Selecione um arquivo e digite o que deseja extrair.'); return; }
    setUploading(true); setError(null);
    const { userName, userId, userUnit } = getUserInfo();
    try {
      const res = await fetch('/api/insumos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64, fileName: selectedFile.name, fileType: selectedFile.type,
          fileSize: selectedFile.size, prompt: prompt.trim(), unit: userUnit, userId, userName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao processar.');
      if (data.extractedData) { try { setLastResult(JSON.parse(data.extractedData)); } catch { setLastResult({ raw: data.extractedData }); } }
      fetchHistory();
    } catch (err: any) { setError(err.message || 'Erro inesperado.'); }
    finally { setUploading(false); }
  };

  const deleteUpload = async (id: string) => {
    try { const r = await fetch(`/api/insumos?id=${id}`, { method: 'DELETE' }); if (r.ok) fetchHistory(); } catch {}
  };

  const viewExtracted = (upload: InsumoUpload) => {
    if (upload.extractedData) { try { setLastResult(JSON.parse(upload.extractedData)); } catch { setLastResult({ raw: upload.extractedData }); } }
    setActiveView('upload');
  };

  const reExtract = async (upload: InsumoUpload, newPrompt: string) => {
    if (!fileBase64) { setError('Recarregue o arquivo para re-extrair.'); return; }
    setExtracting(true); setError(null);
    try {
      const res = await fetch('/api/insumos/extract', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId: upload.id, fileBase64, fileType: upload.fileType, prompt: newPrompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao re-extrair.');
      if (data.extractedData) { try { setLastResult(JSON.parse(data.extractedData)); } catch { setLastResult({ raw: data.extractedData }); } }
      fetchHistory();
    } catch (err: any) { setError(err.message); }
    finally { setExtracting(false); }
  };

  return {
    uploads, loading, uploading, extracting, prompt, setPrompt,
    selectedFile, filePreview, fileBase64, lastResult, error,
    activeView, setActiveView,
    handleFileSelect, clearFile, handleUploadAndExtract,
    deleteUpload, viewExtracted, reExtract,
    chatMessages, chatFile, chatFilePreview, chatInput, setChatInput,
    chatSending, chatEndRef, handleChatFileSelect, clearChatFile, sendChatMessage,
  };
}
