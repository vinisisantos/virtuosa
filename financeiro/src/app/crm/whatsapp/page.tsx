'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { toast } from '@/components/toast';
import { useGlobalUnit } from '@/contexts/UnitContext';

interface Message {
  id: string; direction: string; type: string; body: string | null; sentBy: string | null;
  status: string; timestamp: string; mediaUrl?: string | null;
  // Audio-specific
  audioDuration?: number | null; audioPtt?: boolean;
  keyId?: string; remoteJid?: string; fromMe?: boolean;
  hasMedia?: boolean; mimetype?: string | null;
  // Media fields
  thumbnail?: string | null; caption?: string | null; fileName?: string | null;
  imageWidth?: number | null; imageHeight?: number | null; videoSeconds?: number | null;
  // Ad referral (Click-to-WhatsApp)
  adReply?: { title?: string; body?: string; sourceUrl?: string; thumbnailUrl?: string } | null;
}
interface ClientData { id: string; name: string; phone: string | null; email: string | null; tags: string | null; stage: string; source: string | null; totalSpent: number; visitCount: number; createdAt: string; }
interface PipelineData { id: string; stage: string; value: number; source: string | null; assignedName: string | null; }
interface Conversation {
  id: string; waId: string; contactName: string | null; contactPhone: string; clientId: string | null;
  status: string; assignedTo: string | null; lastMessageAt: string; unreadCount: number;
  source: string | null; adName: string | null; unit: string;
  messages: Message[]; client?: ClientData | null; pipeline?: PipelineData | null;
  // Evolution-specific fields
  remoteJid?: string; profilePic?: string | null;
  lastMsgBody?: string; lastMsgFromMe?: boolean;
  // Campaign tracking (Click-to-WhatsApp)
  adTitle?: string | null; adBody?: string | null; adSourceUrl?: string | null;
  isLead?: boolean;
}

// ─── View: 'list' | 'chat' | 'contact' ───
type ViewState = 'list' | 'chat' | 'contact';
type DataSource = 'meta' | 'evolution' | 'loading';

export default function WhatsAppInboxPage() {
  const { globalUnit } = useGlobalUnit();
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
  const [dataSource, setDataSource] = useState<DataSource>('loading');
  const [unitNotConfigured, setUnitNotConfigured] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastMsgCountRef = useRef(0);
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  // Media attachment state
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachPreview, setAttachPreview] = useState<string | null>(null);
  const [attachCaption, setAttachCaption] = useState('');
  const [sendingMedia, setSendingMedia] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  // Media viewer (full-screen)
  const [mediaViewer, setMediaViewer] = useState<{ src: string; type: 'image' | 'video' } | null>(null);
  const [loadingMedia, setLoadingMedia] = useState<Record<string, boolean>>({});
  const mediaCache = useRef<Record<string, string>>({});

  // ─── Detect data source on mount (re-run when unit changes) ───
  useEffect(() => {
    setUnitNotConfigured(false);
    setConversations([]);
    setSelectedId(null);
    setSelectedConv(null);
    setMessages([]);
    setView('list');
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/whatsapp/session?action=status&unit=${encodeURIComponent(globalUnit)}`);
        const data = await res.json();
        if (data.isConnected) {
          setDataSource('evolution');
          return;
        }
      } catch { /* ignore */ }
      // Check if Evolution config exists for this unit
      try {
        const res = await fetch(`/api/whatsapp/evolution?action=chats&unit=${encodeURIComponent(globalUnit)}`);
        const data = await res.json();
        if (data.code === 'NOT_CONFIGURED') {
          setUnitNotConfigured(true);
          setDataSource('evolution');
          setLoading(false);
          return;
        }
      } catch { /* ignore */ }
      setDataSource('meta');
    })();
  }, [globalUnit]);

  // ─── Data Fetching ───
  const fetchConversations = useCallback(async () => {
    if (dataSource === 'loading') return;

    try {
      if (dataSource === 'evolution') {
        if (unitNotConfigured) { setLoading(false); return; }
        // Fetch from Evolution API
        const res = await fetch(`/api/whatsapp/evolution?action=chats&unit=${encodeURIComponent(globalUnit)}`);
        const data = await res.json();
        if (data.code === 'NOT_CONFIGURED') { setUnitNotConfigured(true); setLoading(false); return; }
        const chats = data.chats || [];
        const list: Conversation[] = chats.map((c: any) => ({
          id: c.remoteJid,
          waId: c.remoteJid,
          contactName: c.name || null,
          contactPhone: c.phone || c.remoteJid?.replace('@s.whatsapp.net', '').replace('@lid', '') || '',
          clientId: c.clientId || null,
          status: 'aberta',
          assignedTo: null,
          lastMessageAt: c.updatedAt || new Date().toISOString(),
          unreadCount: c.unreadCount || 0,
          source: c.isLead ? 'meta_ads' : 'evolution',
          adName: c.adBody || c.adTitle || null,
          unit: globalUnit,
          messages: [],
          remoteJid: c.remoteJid,
          profilePic: c.profilePic,
          lastMsgBody: c.lastMsgBody || '',
          lastMsgFromMe: c.lastMsgFromMe || false,
          // Campaign tracking
          adTitle: c.adTitle || null,
          adBody: c.adBody || null,
          adSourceUrl: c.adSourceUrl || null,
          isLead: c.isLead || false,
        }));
        setConversations(list);
      } else {
        // Fetch from Meta Cloud API (original behavior)
        const res = await fetch('/api/whatsapp/conversations');
        const data = await res.json();
        const list = data.conversations || (Array.isArray(data) ? data : []);
        setConversations(list);
        const totalUnread = list.reduce((s: number, c: Conversation) => s + c.unreadCount, 0);
        if (totalUnread > lastMsgCountRef.current && lastMsgCountRef.current > 0) {
          try { new Audio('/notification.mp3').play().catch(() => {}); } catch {}
        }
        lastMsgCountRef.current = totalUnread;
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [dataSource, globalUnit, unitNotConfigured]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);
  useEffect(() => {
    const interval = setInterval(fetchConversations, 15000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  // ─── Fix #11: Timeout stale optimistic messages after 30s ───
  useEffect(() => {
    const interval = setInterval(() => {
      setMessages(prev => {
        const now = Date.now();
        const filtered = prev.filter(m => {
          if (!m.id.startsWith('temp-')) return true;
          const msgTime = new Date(m.timestamp).getTime();
          return now - msgTime < 30000; // 30s timeout
        });
        return filtered.length !== prev.length ? filtered : prev;
      });
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Auto-refresh messages in open chat
  useEffect(() => {
    if (!selectedId || view !== 'chat') return;
    const remoteJid = selectedConv?.remoteJid;
    const interval = setInterval(async () => {
      try {
        if (dataSource === 'evolution' && remoteJid) {
          const res = await fetch(`/api/whatsapp/evolution?action=messages&remoteJid=${encodeURIComponent(remoteJid)}`);
          const data = await res.json();
          if (data.messages) {
            const serverMsgs: Message[] = data.messages.map((m: any) => ({
              id: m.id,
              direction: m.fromMe ? 'outbound' : 'inbound',
              type: m.type || 'text',
              body: m.body || null,
              sentBy: m.fromMe ? 'Você' : (m.pushName || null),
              status: m.status?.toLowerCase() || 'delivered',
              timestamp: m.timestamp || new Date().toISOString(),
              audioDuration: m.audioDuration || null,
              audioPtt: m.audioPtt || false,
              keyId: m.keyId, remoteJid: m.remoteJid, fromMe: m.fromMe,
              hasMedia: m.hasMedia || false, mimetype: m.mimetype || null,
              thumbnail: m.thumbnail || null, caption: m.caption || null,
              fileName: m.fileName || null,
              imageWidth: m.imageWidth || null, imageHeight: m.imageHeight || null,
              videoSeconds: m.videoSeconds || null,
              adReply: m.adReply || null,
            }));
            // Preserve optimistic messages (temp-*) that aren't in server response yet
            setMessages(prev => {
              const tempMsgs = prev.filter(m => m.id.startsWith('temp-'));
              // Check if server now has these messages (by matching body + timestamp proximity)
              const stillPending = tempMsgs.filter(tm => {
                return !serverMsgs.some(sm => sm.body === tm.body && sm.direction === 'outbound');
              });
              return [...serverMsgs, ...stillPending];
            });
          }
        } else if (dataSource !== 'evolution') {
          const res = await fetch(`/api/whatsapp/conversations?id=${selectedId}`);
          const data = await res.json();
          if (data.messages) setMessages(data.messages);
          if (data.client || data.pipeline) {
            setSelectedConv(prev => prev ? { ...prev, client: data.client, pipeline: data.pipeline } : prev);
          }
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedId, view, dataSource, selectedConv?.remoteJid]);

  // ─── Actions ───
  const openConversation = async (id: string) => {
    setSelectedId(id);
    setView('chat');
    const conv = conversations.find(c => c.id === id);
    try {
      if (dataSource === 'evolution' && conv?.remoteJid) {
        // Fetch messages from Evolution API
        const res = await fetch(`/api/whatsapp/evolution?action=messages&remoteJid=${encodeURIComponent(conv.remoteJid)}&unit=${encodeURIComponent(globalUnit)}`);
        const data = await res.json();
        const msgs: Message[] = (data.messages || []).map((m: any) => ({
          id: m.id,
          direction: m.fromMe ? 'outbound' : 'inbound',
          type: m.type || 'text',
          body: m.body || null,
          sentBy: m.fromMe ? 'Você' : (m.pushName || null),
          status: m.status?.toLowerCase() || 'delivered',
          timestamp: m.timestamp || new Date().toISOString(),
          audioDuration: m.audioDuration || null,
          audioPtt: m.audioPtt || false,
          keyId: m.keyId, remoteJid: m.remoteJid, fromMe: m.fromMe,
          hasMedia: m.hasMedia || false, mimetype: m.mimetype || null,
          thumbnail: m.thumbnail || null, caption: m.caption || null,
          fileName: m.fileName || null,
          imageWidth: m.imageWidth || null, imageHeight: m.imageHeight || null,
          videoSeconds: m.videoSeconds || null,
          adReply: m.adReply || null,
        }));
        setMessages(msgs);
        setSelectedConv(conv);
        // Save last message preview back to conversation list
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg) {
          setConversations(prev => prev.map(c => c.id === id ? {
            ...c, unreadCount: 0,
            lastMsgBody: lastMsg.body || '',
            lastMsgFromMe: lastMsg.direction === 'outbound',
          } : c));
        } else {
          setConversations(prev => prev.map(c => c.id === id ? { ...c, unreadCount: 0 } : c));
        }
      } else {
        const res = await fetch(`/api/whatsapp/conversations?id=${id}`);
        const data = await res.json();
        setMessages(data.messages || []);
        setSelectedConv(data);
        setConversations(prev => prev.map(c => c.id === id ? { ...c, unreadCount: 0 } : c));
      }
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
    // Scroll only the message container, not the whole page
    const el = messagesEndRef.current;
    if (el?.parentElement) {
      el.parentElement.scrollTop = el.parentElement.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !selectedId || sending) return;
    setSending(true);
    const msgText = input.trim();
    setInput('');

    const optimistic: Message = { id: 'temp-' + Date.now(), direction: 'outbound', type: 'text', body: msgText, sentBy: 'Você', status: 'sending', timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, optimistic]);

    try {
      if (dataSource === 'evolution') {
        const remoteJid = selectedConv?.remoteJid;
        if (remoteJid) {
          const res = await fetch('/api/whatsapp/evolution', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ remoteJid, message: msgText, unit: globalUnit }),
          });
          const data = await res.json();
          if (data.success) {
            setMessages(prev => prev.map(m => m.id === optimistic.id ? { ...m, status: 'sent' } : m));
          } else {
            toast(data.error || 'Erro ao enviar mensagem', 'error');
            setMessages(prev => prev.filter(m => m.id !== optimistic.id));
          }
        } else {
          toast('Conversa não encontrada', 'error');
          setMessages(prev => prev.filter(m => m.id !== optimistic.id));
        }
      } else {
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
      }
    } catch (err) {
      console.error('[sendMessage] erro:', err);
      toast('Erro de rede ao enviar mensagem', 'error');
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
    }
    setSending(false);
    inputRef.current?.focus();
  };

  // ─── File Attachment ───
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      toast('Arquivo muito grande (máx 16MB)', 'error');
      return;
    }
    setAttachFile(file);
    setAttachCaption('');
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      const url = URL.createObjectURL(file);
      setAttachPreview(url);
    } else {
      setAttachPreview(null);
    }
  };

  // ─── Drag & Drop ───
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      toast('Arquivo muito grande (máx 16MB)', 'error');
      return;
    }
    setAttachFile(file);
    setAttachCaption('');
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      setAttachPreview(URL.createObjectURL(file));
    } else {
      setAttachPreview(null);
    }
  };

  const cancelAttachment = () => {
    setAttachFile(null);
    setAttachPreview(null);
    setAttachCaption('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const sendMediaMessage = async () => {
    if (!attachFile || !selectedConv?.remoteJid || sendingMedia) return;
    setSendingMedia(true);

    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(attachFile);
      });

      let mediaType = 'document';
      if (attachFile.type.startsWith('image/')) mediaType = 'image';
      else if (attachFile.type.startsWith('video/')) mediaType = 'video';

      // Optimistic UI
      const optimistic: Message = {
        id: 'temp-media-' + Date.now(), direction: 'outbound',
        type: mediaType === 'image' ? 'imageMessage' : mediaType === 'video' ? 'videoMessage' : 'documentMessage',
        body: attachCaption || (mediaType === 'document' ? attachFile.name : ''),
        sentBy: 'Você', status: 'sending', timestamp: new Date().toISOString(),
        hasMedia: true, mimetype: attachFile.type,
        thumbnail: attachPreview || null, fileName: attachFile.name,
      };
      setMessages(prev => [...prev, optimistic]);
      cancelAttachment();

      const res = await fetch('/api/whatsapp/evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remoteJid: selectedConv.remoteJid,
          unit: globalUnit,
          mediaBase64: base64,
          mediaType,
          mimetype: attachFile.type,
          fileName: attachFile.name,
          caption: attachCaption,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => prev.map(m => m.id === optimistic.id ? { ...m, status: 'sent' } : m));
      } else {
        toast(data.error || 'Erro ao enviar mídia', 'error');
        setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      }
    } catch (err) {
      console.error('[sendMedia] erro:', err);
      toast('Erro ao enviar mídia', 'error');
    }
    setSendingMedia(false);
  };

  // ─── Load full-resolution media ───
  const loadFullMedia = async (msg: Message) => {
    if (!msg.keyId || !msg.remoteJid) return;
    const cacheKey = msg.keyId;
    if (mediaCache.current[cacheKey]) {
      const mime = msg.mimetype || '';
      setMediaViewer({ src: mediaCache.current[cacheKey], type: mime.startsWith('video/') ? 'video' : 'image' });
      return;
    }
    setLoadingMedia(prev => ({ ...prev, [cacheKey]: true }));
    try {
      const res = await fetch(`/api/whatsapp/evolution?action=media&remoteJid=${encodeURIComponent(msg.remoteJid)}&messageId=${encodeURIComponent(msg.keyId)}&fromMe=${msg.fromMe}&unit=${encodeURIComponent(globalUnit)}`);
      const data = await res.json();
      if (data.base64) {
        const src = `data:${data.mimetype};base64,${data.base64}`;
        mediaCache.current[cacheKey] = src;
        setMediaViewer({ src, type: (data.mimetype || '').startsWith('video/') ? 'video' : 'image' });
      } else {
        toast('Mídia não disponível', 'error');
      }
    } catch {
      toast('Erro ao carregar mídia', 'error');
    }
    setLoadingMedia(prev => ({ ...prev, [cacheKey]: false }));
  };

  const downloadDocument = async (msg: Message) => {
    if (!msg.keyId || !msg.remoteJid) return;
    const cacheKey = msg.keyId;
    setLoadingMedia(prev => ({ ...prev, [cacheKey]: true }));
    try {
      const res = await fetch(`/api/whatsapp/evolution?action=media&remoteJid=${encodeURIComponent(msg.remoteJid)}&messageId=${encodeURIComponent(msg.keyId)}&fromMe=${msg.fromMe}&unit=${encodeURIComponent(globalUnit)}`);
      const data = await res.json();
      if (data.base64) {
        const link = document.createElement('a');
        link.href = `data:${data.mimetype};base64,${data.base64}`;
        link.download = msg.fileName || msg.body || 'documento';
        link.click();
      } else {
        toast('Documento não disponível', 'error');
      }
    } catch {
      toast('Erro ao baixar documento', 'error');
    }
    setLoadingMedia(prev => ({ ...prev, [cacheKey]: false }));
  };

  // ─── Audio Recording ───
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = mediaRecorder;
      recordingChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch {
      toast('\u274c Permiss\u00e3o de microfone negada', 'error');
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    setRecordingTime(0);
    recordingChunksRef.current = [];
  };

  const sendRecording = async () => {
    if (!mediaRecorderRef.current || !selectedId) return;
    if (!selectedConv?.remoteJid) return;

    const recorder = mediaRecorderRef.current;
    recorder.stop();
    recorder.stream.getTracks().forEach(t => t.stop());
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);

    // Wait a tick for final chunks
    await new Promise(r => setTimeout(r, 200));

    const blob = new Blob(recordingChunksRef.current, { type: 'audio/webm;codecs=opus' });
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      const dataUri = `data:audio/ogg;base64,${base64}`;

      // Optimistic UI
      const optimistic: Message = {
        id: 'temp-audio-' + Date.now(), direction: 'outbound', type: 'audioMessage',
        body: '\ud83c\udfa4 \u00c1udio', sentBy: 'Voc\u00ea', status: 'sending',
        timestamp: new Date().toISOString(), audioDuration: recordingTime, audioPtt: true,
      };
      setMessages(prev => [...prev, optimistic]);
      setIsRecording(false);
      setRecordingTime(0);

      try {
        await fetch('/api/whatsapp/evolution', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ remoteJid: selectedConv.remoteJid, audioBase64: dataUri, unit: globalUnit }),
        });
        setMessages(prev => prev.map(m => m.id === optimistic.id ? { ...m, status: 'sent' } : m));
      } catch {
        toast('Erro ao enviar \u00e1udio', 'error');
      }
    };
    reader.readAsDataURL(blob);
  };

  const fmtRecTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

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
    .filter(c => !searchQuery || (c.contactName || c.contactPhone || '').toLowerCase().includes(searchQuery.toLowerCase()));

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  const avatarColors = ['#25d366', '#00a884', '#53bdeb', '#8696a0', '#e17076', '#7c85de', '#d4a373', '#f4845f'];
  const getAvatarColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return avatarColors[Math.abs(hash) % avatarColors.length];
  };

  // ─── RENDER: Conversation List (WhatsApp Web–style) ───
  const renderList = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--wa-sidebar-bg, #111b21)' }}>
      {/* Top bar — WhatsApp Web style */}
      <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--wa-header-bg, #202c33)' }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--wa-header-text, #e9edef)', letterSpacing: '-0.3px' }}>Conversas</h1>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {totalUnread > 0 && (
            <span style={{ fontSize: '0.62rem', fontWeight: 800, padding: '2px 8px', borderRadius: 10, background: '#00a884', color: '#fff', marginRight: 4 }}>
              {totalUnread}
            </span>
          )}
          <a href="/crm/pipeline" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: '50%', textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--wa-icon, #aebac1)' }}>filter_alt</span>
          </a>
        </div>
      </div>

      {/* Search — WhatsApp style */}
      <div style={{ padding: '8px 12px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', borderRadius: 8, background: 'var(--wa-search-bg, #202c33)', border: 'none' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--wa-icon, #8696a0)' }}>search</span>
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Pesquisar ou começar uma nova conversa"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '0.84rem', fontFamily: 'inherit', color: 'var(--wa-header-text, #e9edef)', padding: '4px 0' }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--wa-icon, #8696a0)' }}>close</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters — WhatsApp-style pill row */}
      <div style={{ display: 'flex', gap: 6, padding: '2px 12px 8px', overflowX: 'auto' }}>
        {[
          { k: 'all', l: 'Tudo' },
          { k: 'aberta', l: 'Não lidas' },
          { k: 'em_andamento', l: 'Andamento' },
          { k: 'finalizada', l: 'Finalizadas' },
        ].map(f => (
          <button key={f.k} onClick={() => setStatusFilter(f.k)}
            style={{
              padding: '5px 12px', borderRadius: 16, border: 'none', whiteSpace: 'nowrap',
              fontSize: '0.78rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
              background: statusFilter === f.k ? 'var(--wa-pill-active-bg, #00a884)' : 'var(--wa-pill-bg, #202c33)',
              color: statusFilter === f.k ? 'var(--wa-pill-active-text, #111b21)' : 'var(--wa-pill-text, #8696a0)',
              transition: 'all 0.15s',
            }}>
            {f.l}
          </button>
        ))}
      </div>

      {/* Conversation list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--wa-icon, #8696a0)', animation: 'wa-spin 1.2s linear infinite' }}>progress_activity</span>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 56, color: 'var(--wa-icon, #8696a0)', opacity: 0.15 }}>forum</span>
            <p style={{ color: 'var(--wa-icon, #8696a0)', fontSize: '0.88rem', marginTop: 12, fontWeight: 500 }}>
              {conversations.length === 0 ? 'Nenhuma conversa ainda' : 'Nenhum resultado'}
            </p>
          </div>
        ) : (
          filtered.map(c => {
            const lastMsg = c.messages?.[c.messages.length - 1];
            const name = c.contactName || c.contactPhone;
            const hasUnread = c.unreadCount > 0;
            const previewText = c.lastMsgBody || lastMsg?.body || '';
            const previewFromMe = c.lastMsgFromMe || (lastMsg?.direction === 'outbound');
            const isSelected = c.id === selectedId;
            return (
              <div key={c.id} onClick={() => openConversation(c.id)}
                className="wa-conv-item"
                style={{
                  display: 'flex', alignItems: 'center', gap: 13,
                  padding: '10px 14px', cursor: 'pointer',
                  background: isSelected ? 'var(--wa-item-active, #2a3942)' : 'transparent',
                  transition: 'background 0.12s',
                  position: 'relative',
                }}
              >
                {/* Avatar */}
                {c.profilePic ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.profilePic} alt={name} style={{
                    width: 49, height: 49, borderRadius: '50%', flexShrink: 0, objectFit: 'cover',
                  }} />
                ) : (
                  <div style={{
                    width: 49, height: 49, borderRadius: '50%', flexShrink: 0,
                    background: getAvatarColor(name),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 600, fontSize: '1.15rem',
                  }}>
                    {name.charAt(0).toUpperCase()}
                  </div>
                )}

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0, borderBottom: '1px solid var(--wa-divider, rgba(134,150,160,0.15))', paddingBottom: 10 }}>
                  {/* Row 1: Name + Time */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                    <span style={{
                      fontWeight: 400, fontSize: '1rem',
                      color: 'var(--wa-header-text, #e9edef)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      flex: 1,
                    }}>
                      {name}
                    </span>
                    <span style={{
                      fontSize: '0.72rem', flexShrink: 0, marginLeft: 8,
                      color: hasUnread ? '#00a884' : 'var(--wa-preview-text, #8696a0)',
                      fontWeight: 400,
                    }}>
                      {fmtTime(c.lastMessageAt)}
                    </span>
                  </div>

                  {/* Row 2: Message preview + Badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: '0.84rem',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      color: 'var(--wa-preview-text, #8696a0)',
                      fontWeight: 400,
                      flex: 1, minWidth: 0, lineHeight: 1.35,
                    }}>
                      {previewFromMe && (
                        <span style={{ color: hasUnread ? '#53bdeb' : 'var(--wa-check, #8696a0)', marginRight: 2, fontSize: '0.8rem', verticalAlign: 'middle' }}>
                          ✓✓{' '}
                        </span>
                      )}
                      {previewText || '📎 Mídia'}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      {(c.source === 'meta_ads' || c.isLead) && (
                        <span style={{ fontSize: '0.55rem', fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'rgba(59,130,246,0.12)', color: '#3b82f6', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
                          📢 {c.adBody || c.adTitle || c.adName || 'ADS'}
                        </span>
                      )}
                      {hasUnread && (
                        <span style={{
                          minWidth: 20, height: 20, borderRadius: '50%',
                          background: '#00a884', color: '#111b21',
                          fontSize: '0.7rem', fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          padding: '0 4px',
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

  // ─── AudioBubble: WhatsApp-style audio player ───
  const AudioBubble = ({ msg, isOut, fmtMsgTime: fmt, statusIcon: sIcon }: { msg: Message; isOut: boolean; fmtMsgTime: (d: string) => string; statusIcon: (s: string) => string }) => {
    const [playing, setPlaying] = useState(false);
    const [audioLoading, setAudioLoading] = useState(false);
    const [audioSrc, setAudioSrc] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const duration = msg.audioDuration || 0;
    const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;

    const loadAndPlay = async () => {
      if (audioSrc) {
        // Already loaded — toggle play/pause
        if (audioRef.current) {
          if (playing) { audioRef.current.pause(); setPlaying(false); }
          else { audioRef.current.play(); setPlaying(true); }
        }
        return;
      }
      // Load from API
      setAudioLoading(true);
      try {
        const params = new URLSearchParams({
          messageId: msg.keyId || msg.id,
          remoteJid: msg.remoteJid || '',
          fromMe: String(msg.fromMe || false),
        });
        const res = await fetch(`/api/whatsapp/evolution/media?${params}`);
        const data = await res.json();
        if (data.base64) {
          const mime = data.mimetype || 'audio/ogg';
          const src = `data:${mime};base64,${data.base64}`;
          setAudioSrc(src);
          const audio = new Audio(src);
          audioRef.current = audio;
          audio.onended = () => { setPlaying(false); setProgress(0); setCurrentTime(0); };
          audio.ontimeupdate = () => {
            if (audio.duration) {
              setProgress((audio.currentTime / audio.duration) * 100);
              setCurrentTime(audio.currentTime);
            }
          };
          audio.play();
          setPlaying(true);
        } else {
          toast('Áudio não disponível', 'error');
        }
      } catch {
        toast('Erro ao carregar áudio', 'error');
      }
      setAudioLoading(false);
    };

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px' }}>
        <button onClick={loadAndPlay} disabled={audioLoading} style={{
          width: 36, height: 36, borderRadius: '50%', border: 'none', flexShrink: 0,
          background: isOut ? 'rgba(0,0,0,0.1)' : '#25d366',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {audioLoading ? (
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: isOut ? '#333' : '#fff', animation: 'wa-spin 1.2s linear infinite' }}>progress_activity</span>
          ) : (
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: isOut ? '#333' : '#fff' }}>
              {playing ? 'pause' : 'play_arrow'}
            </span>
          )}
        </button>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Waveform bars */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 1.5, height: 20 }}>
            {Array.from({ length: 30 }).map((_, i) => {
              const h = [8, 14, 10, 18, 12, 16, 9, 20, 13, 15, 11, 17, 8, 19, 14, 10, 16, 12, 18, 9, 15, 11, 20, 13, 17, 8, 14, 10, 16, 12][i];
              const filled = progress > (i / 30) * 100;
              return <div key={i} style={{
                width: 2.5, borderRadius: 1,
                height: h, flexShrink: 0,
                background: filled ? (isOut ? '#333' : '#25d366') : 'var(--border)',
                transition: 'background 0.1s',
              }} />;
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
              {playing ? fmtDur(currentTime) : fmtDur(duration)}
            </span>
            <span style={{
              fontSize: '0.62rem', color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', gap: 2,
            }}>
              {fmt(msg.timestamp)}
              {isOut && (
                <span style={{ color: msg.status === 'read' ? '#53bdeb' : 'var(--text-muted)', fontSize: '0.7rem' }}>
                  {sIcon(msg.status)}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // ─── RENDER: Chat View (full-screen WhatsApp-style) ───
  const renderChat = () => {
    if (!selectedConv) return null;
    const name = selectedConv.contactName || selectedConv.contactPhone;

    const saveContactName = async () => {
      if (!selectedConv?.remoteJid) return;
      const trimmed = editNameValue.trim();
      try {
        const res = await fetch('/api/whatsapp/evolution', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ remoteJid: selectedConv.remoteJid, customName: trimmed || null }),
        });
        const data = await res.json();
        if (data.success) {
          // Update local state
          setSelectedConv(prev => prev ? { ...prev, contactName: trimmed || prev.contactPhone } : prev);
          setConversations(prev => prev.map(c => 
            c.id === selectedConv.id ? { ...c, contactName: trimmed || c.contactPhone } : c
          ));
          toast('Nome salvo', 'success');
        } else {
          toast(data.error || 'Erro ao salvar', 'error');
        }
      } catch { toast('Erro ao salvar nome', 'error'); }
      setEditingName(false);
    };

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
          <div onClick={() => { if (!editingName) setView('contact'); }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, cursor: 'pointer', minWidth: 0 }}>
            {selectedConv.profilePic ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedConv.profilePic} alt={name} style={{
                width: 40, height: 40, borderRadius: '50%', flexShrink: 0, objectFit: 'cover',
              }} />
            ) : (
              <div style={{
                width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                background: getAvatarColor(name),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700, fontSize: '0.95rem',
              }}>
                {name.charAt(0).toUpperCase()}
              </div>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              {editingName ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
                  <input
                    autoFocus
                    value={editNameValue}
                    onChange={e => setEditNameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveContactName(); if (e.key === 'Escape') setEditingName(false); }}
                    style={{
                      background: 'var(--bg)', border: '1px solid var(--accent)',
                      borderRadius: 6, padding: '4px 8px', color: 'var(--text-main)',
                      fontSize: '0.9rem', width: '100%', outline: 'none',
                    }}
                    placeholder="Nome do contato"
                  />
                  <button onClick={saveContactName} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#25D366' }}>check</span>
                  </button>
                  <button onClick={() => setEditingName(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)' }}>close</span>
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {name}
                  </div>
                  <button onClick={e => { e.stopPropagation(); setEditNameValue(name); setEditingName(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', opacity: 0.5 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-muted)' }}>edit</span>
                  </button>
                </div>
              )}
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

        {/* Campaign banner — shown when conversation is from a Click-to-WhatsApp ad */}
        {(selectedConv.isLead || selectedConv.source === 'meta_ads') && (selectedConv.adBody || selectedConv.adTitle || selectedConv.adName) && (
          <div style={{
            padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8,
            background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.06))',
            borderBottom: '1px solid var(--border)',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#3b82f6', flexShrink: 0 }}>campaign</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#3b82f6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                📢 {selectedConv.adBody || selectedConv.adTitle || selectedConv.adName}
              </div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 1 }}>
                Lead de campanha {selectedConv.adSourceUrl?.includes('instagram') ? '• via Instagram' : selectedConv.adSourceUrl?.includes('fb.me') ? '• via Facebook' : ''}
              </div>
            </div>
            <span style={{ fontSize: '0.58rem', fontWeight: 800, padding: '2px 8px', borderRadius: 10, background: 'rgba(16,185,129,0.1)', color: '#10b981', flexShrink: 0 }}>
              LEAD
            </span>
          </div>
        )}

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
                      maxWidth: '100%', padding: msg.type === 'audioMessage' ? '4px 8px 4px' : '7px 10px 4px',
                      borderRadius: isOut ? '10px 10px 3px 10px' : '10px 10px 10px 3px',
                      background: isOut ? 'var(--wa-out-bg, #e7ffdb)' : 'var(--card-bg)',
                      border: isOut ? 'none' : '1px solid var(--border)',
                      boxShadow: '0 1px 1px rgba(0,0,0,0.06)',
                      position: 'relative',
                      minWidth: msg.type === 'audioMessage' ? 220 : undefined,
                    }}>
                      {/* Sender name for outbound (not on audio) */}
                      {isOut && msg.sentBy && msg.type !== 'audioMessage' && (
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--primary)', marginBottom: 1 }}>
                          {msg.sentBy}
                        </div>
                      )}

                      {/* Ad referral card — Click-to-WhatsApp campaign indicator */}
                      {msg.adReply && (msg.adReply.body || msg.adReply.title) && (
                        <div style={{
                          margin: '0 -2px 6px', padding: '8px 10px', borderRadius: 8,
                          background: 'rgba(59,130,246,0.06)',
                          borderLeft: '3px solid #3b82f6',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 12, color: '#3b82f6' }}>campaign</span>
                            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Anúncio</span>
                          </div>
                          {msg.adReply.body && (
                            <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-main)', lineHeight: 1.3, marginBottom: 2 }}>
                              {msg.adReply.body}
                            </div>
                          )}
                          {msg.adReply.title && msg.adReply.title !== msg.adReply.body && (
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                              {msg.adReply.title}
                            </div>
                          )}
                          {msg.adReply.sourceUrl && (
                            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 10 }}>link</span>
                              {msg.adReply.sourceUrl.includes('instagram') ? 'instagram.com' : msg.adReply.sourceUrl.includes('fb.me') ? 'fb.me' : msg.adReply.sourceUrl}
                            </div>
                          )}
                        </div>
                      )}

                      {/* AUDIO MESSAGE — WhatsApp-style player */}
                      {msg.type === 'audioMessage' ? (
                        <AudioBubble msg={msg} isOut={isOut} fmtMsgTime={fmtMsgTime} statusIcon={statusIcon} />

                      ) : msg.type === 'imageMessage' || (msg.type === 'stickerMessage' && msg.thumbnail) ? (
                        /* IMAGE / STICKER — clickable thumbnail */
                        <div>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={msg.thumbnail || ''}
                            alt={msg.caption || 'Imagem'}
                            onClick={() => loadFullMedia(msg)}
                            style={{
                              maxWidth: msg.type === 'stickerMessage' ? 150 : 260,
                              maxHeight: 300, borderRadius: 6, cursor: 'pointer',
                              display: 'block', objectFit: 'cover',
                            }}
                          />
                          {loadingMedia[msg.keyId || ''] && (
                            <div style={{ textAlign: 'center', padding: 4, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              Carregando...
                            </div>
                          )}
                          {msg.body && (
                            <div style={{ fontSize: '0.88rem', lineHeight: 1.4, marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-main)' }}>
                              {msg.body}
                            </div>
                          )}
                          <span style={{
                            float: 'right', marginLeft: 8, marginTop: 3,
                            fontSize: '0.62rem', color: 'var(--text-muted)',
                            display: 'flex', alignItems: 'center', gap: 2, position: 'relative', top: 2,
                          }}>
                            {fmtMsgTime(msg.timestamp)}
                            {isOut && <span style={{ color: msg.status === 'read' ? '#53bdeb' : 'var(--text-muted)', fontSize: '0.7rem' }}>{statusIcon(msg.status)}</span>}
                          </span>
                        </div>

                      ) : msg.type === 'videoMessage' ? (
                        /* VIDEO — thumbnail with play overlay */
                        <div>
                          <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => loadFullMedia(msg)}>
                            {msg.thumbnail ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={msg.thumbnail} alt="Vídeo" style={{ maxWidth: 260, maxHeight: 300, borderRadius: 6, display: 'block', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ width: 200, height: 120, borderRadius: 6, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 40, color: '#fff' }}>videocam</span>
                              </div>
                            )}
                            <div style={{
                              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                              width: 48, height: 48, borderRadius: '50%', background: 'rgba(0,0,0,0.55)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#fff' }}>play_arrow</span>
                            </div>
                            {msg.videoSeconds && (
                              <div style={{ position: 'absolute', bottom: 6, left: 8, background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: 4, fontSize: '0.65rem', color: '#fff' }}>
                                {Math.floor((msg.videoSeconds || 0) / 60)}:{String((msg.videoSeconds || 0) % 60).padStart(2, '0')}
                              </div>
                            )}
                          </div>
                          {loadingMedia[msg.keyId || ''] && (
                            <div style={{ textAlign: 'center', padding: 4, fontSize: '0.7rem', color: 'var(--text-muted)' }}>Carregando vídeo...</div>
                          )}
                          {msg.body && (
                            <div style={{ fontSize: '0.88rem', lineHeight: 1.4, marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-main)' }}>
                              {msg.body}
                            </div>
                          )}
                          <span style={{
                            float: 'right', marginLeft: 8, marginTop: 3,
                            fontSize: '0.62rem', color: 'var(--text-muted)',
                            display: 'flex', alignItems: 'center', gap: 2, position: 'relative', top: 2,
                          }}>
                            {fmtMsgTime(msg.timestamp)}
                            {isOut && <span style={{ color: msg.status === 'read' ? '#53bdeb' : 'var(--text-muted)', fontSize: '0.7rem' }}>{statusIcon(msg.status)}</span>}
                          </span>
                        </div>

                      ) : msg.type === 'documentMessage' ? (
                        /* DOCUMENT — file icon + download */
                        <div>
                          <div
                            onClick={() => downloadDocument(msg)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                              background: 'rgba(0,0,0,0.04)', borderRadius: 8, cursor: 'pointer',
                              border: '1px solid var(--border)',
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--primary)' }}>description</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {msg.fileName || msg.body || 'Documento'}
                              </div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                {msg.mimetype?.split('/').pop()?.toUpperCase() || 'ARQUIVO'}
                              </div>
                            </div>
                            {loadingMedia[msg.keyId || ''] ? (
                              <div style={{ width: 24, height: 24, border: '2px solid var(--primary)', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                            ) : (
                              <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-muted)' }}>download</span>
                            )}
                          </div>
                          <span style={{
                            float: 'right', marginLeft: 8, marginTop: 3,
                            fontSize: '0.62rem', color: 'var(--text-muted)',
                            display: 'flex', alignItems: 'center', gap: 2, position: 'relative', top: 2,
                          }}>
                            {fmtMsgTime(msg.timestamp)}
                            {isOut && <span style={{ color: msg.status === 'read' ? '#53bdeb' : 'var(--text-muted)', fontSize: '0.7rem' }}>{statusIcon(msg.status)}</span>}
                          </span>
                        </div>

                      ) : (
                        /* TEXT / FALLBACK */
                        <div style={{
                          fontSize: '0.88rem', lineHeight: 1.45, whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word', color: 'var(--text-main)',
                        }}>
                          {msg.body || (msg.hasMedia ? '📎 Mídia' : '')}
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
                      )}
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
          {isRecording ? (
            /* Recording UI */
            <>
              <button onClick={cancelRecording} style={{
                width: 44, height: 44, borderRadius: '50%', border: 'none', flexShrink: 0,
                background: 'rgba(239,68,68,0.1)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#ef4444' }}>delete</span>
              </button>
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: 10,
                padding: '0 16px', borderRadius: 24, background: 'var(--bg)',
                border: '1px solid var(--border)', height: 44,
              }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', animation: 'wa-pulse-rec 1s infinite' }} />
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtRecTime(recordingTime)}
                </span>
                <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(recordingTime * 2, 100)}%`, height: '100%', background: '#ef4444', borderRadius: 2, transition: 'width 1s linear' }} />
                </div>
              </div>
              <button onClick={sendRecording} style={{
                width: 44, height: 44, borderRadius: '50%', border: 'none', flexShrink: 0,
                background: '#25d366', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#fff' }}>send</span>
              </button>
            </>
          ) : (
            /* Normal input UI */
            <>
              {/* Hidden file input */}
              <input ref={fileInputRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar" style={{ display: 'none' }} onChange={handleFileSelect} />

              {/* Attachment preview overlay */}
              {attachFile && (
                <div style={{
                  position: 'absolute', bottom: 60, left: 0, right: 0, zIndex: 50,
                  background: 'var(--card-bg)', borderTop: '1px solid var(--border)',
                  padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
                  boxShadow: '0 -4px 16px rgba(0,0,0,0.1)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-main)' }}>
                      {attachFile.type.startsWith('image/') ? '📷 Enviar imagem' : attachFile.type.startsWith('video/') ? '🎥 Enviar vídeo' : '📄 Enviar arquivo'}
                    </span>
                    <button onClick={cancelAttachment} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-muted)' }}>close</span>
                    </button>
                  </div>
                  {attachPreview && attachFile.type.startsWith('image/') && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={attachPreview} alt="Preview" style={{ maxHeight: 200, borderRadius: 8, objectFit: 'contain', alignSelf: 'center' }} />
                  )}
                  {attachPreview && attachFile.type.startsWith('video/') && (
                    <video src={attachPreview} controls style={{ maxHeight: 200, borderRadius: 8, alignSelf: 'center' }} />
                  )}
                  {!attachFile.type.startsWith('image/') && !attachFile.type.startsWith('video/') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, background: 'var(--bg)', borderRadius: 8 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--primary)' }}>description</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{attachFile.name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{(attachFile.size / 1024).toFixed(0)} KB</div>
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={attachCaption}
                      onChange={e => setAttachCaption(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') sendMediaMessage(); }}
                      placeholder="Adicionar legenda..."
                      style={{
                        flex: 1, padding: '8px 14px', borderRadius: 20, border: '1px solid var(--border)',
                        background: 'var(--bg)', fontSize: '0.85rem', outline: 'none', color: 'var(--text-main)',
                        fontFamily: 'inherit',
                      }}
                    />
                    <button onClick={sendMediaMessage} disabled={sendingMedia}
                      style={{
                        width: 40, height: 40, borderRadius: '50%', border: 'none',
                        background: sendingMedia ? 'var(--border)' : '#25d366',
                        cursor: sendingMedia ? 'default' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#fff' }}>send</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Attach button */}
              <button onClick={() => fileInputRef.current?.click()}
                style={{
                  width: 44, height: 44, borderRadius: '50%', border: 'none', flexShrink: 0,
                  background: 'transparent', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--text-muted)' }}>attach_file</span>
              </button>

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
              {input.trim() ? (
                <button onClick={sendMessage} disabled={sending}
                  style={{
                    width: 44, height: 44, borderRadius: '50%', border: 'none', flexShrink: 0,
                    background: sending ? 'var(--border)' : '#25d366',
                    cursor: sending ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.15s',
                  }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#fff' }}>send</span>
                </button>
              ) : (
                <button onClick={startRecording}
                  style={{
                    width: 44, height: 44, borderRadius: '50%', border: 'none', flexShrink: 0,
                    background: '#25d366', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.15s',
                  }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#fff' }}>mic</span>
                </button>
              )}
            </>
          )}
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
      <div style={{ width: '100%', maxWidth: 1600, margin: '0 auto', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
        {/* Show AppHeader only on list view (hide in chat/contact for full-screen feel) */}
        {view === 'list' && <AppHeader activePage="clientes" />}

        <main style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          height: view === 'list' ? 'auto' : '100dvh',
          maxHeight: view === 'list' ? 'none' : '100dvh',
          overflow: 'hidden',
          position: view === 'list' ? 'relative' as const : 'fixed' as const,
          top: view === 'list' ? 'auto' : 0,
          left: view === 'list' ? 'auto' : 0,
          right: view === 'list' ? 'auto' : 0,
          bottom: view === 'list' ? 'auto' : 0,
          zIndex: view === 'list' ? 'auto' : 100,
          background: 'var(--bg)',
        }}>
          {/* Desktop: side-by-side layout | Mobile: full-screen views */}
          <div className="wa-layout" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

            {/* UNIT NOT CONFIGURED — show setup screen */}
            {unitNotConfigured ? (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: 40, textAlign: 'center', gap: 16,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 64, color: 'var(--text-muted)', opacity: 0.5 }}>phonelink_erase</span>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                  WhatsApp não configurado
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: 400, margin: 0 }}>
                  A unidade <strong>{globalUnit}</strong> ainda não possui um WhatsApp conectado. Configure-o para começar a receber e enviar mensagens.
                </p>
                <a
                  href="/crm/whatsapp-connect"
                  style={{
                    marginTop: 8, padding: '10px 24px', borderRadius: 8,
                    background: '#25d366', color: '#fff', fontWeight: 700, fontSize: '0.9rem',
                    textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>qr_code_2</span>
                  Conectar WhatsApp
                </a>
              </div>
            ) : (<>
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
              flexDirection: 'column', flex: 1, position: 'relative',
            }}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleFileDrop}
            >
              {/* Drag & drop overlay */}
              {isDragging && (
                <div style={{
                  position: 'absolute', inset: 0, zIndex: 60,
                  background: 'rgba(37,211,102,0.12)', backdropFilter: 'blur(2px)',
                  border: '3px dashed #25d366', borderRadius: 12,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 8, pointerEvents: 'none',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#25d366' }}>upload_file</span>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: '#25d366' }}>Solte o arquivo aqui</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Imagens, vídeos, documentos (máx 16MB)</span>
                </div>
              )}
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
            </>)}
          </div>
        </main>

        <style>{`
          @keyframes wa-spin { to { transform: rotate(360deg); } }
          @keyframes wa-pulse-rec { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

          /* WhatsApp Web — dark theme (default, matches the app's dark mode) */
          :root {
            --wa-out-bg: #dcf8c6;
            --wa-chat-bg: none;
            --wa-sidebar-bg: #fff;
            --wa-header-bg: #f0f2f5;
            --wa-header-text: #111b21;
            --wa-search-bg: #f0f2f5;
            --wa-icon: #54656f;
            --wa-preview-text: #667781;
            --wa-check: #667781;
            --wa-divider: rgba(134,150,160,0.2);
            --wa-item-active: #f0f2f5;
            --wa-item-hover: #f5f6f6;
            --wa-pill-bg: #f0f2f5;
            --wa-pill-text: #54656f;
            --wa-pill-active-bg: #00a884;
            --wa-pill-active-text: #fff;
          }
          [data-theme="dark"] {
            --wa-out-bg: #005c4b;
            --wa-sidebar-bg: #111b21;
            --wa-header-bg: #202c33;
            --wa-header-text: #e9edef;
            --wa-search-bg: #202c33;
            --wa-icon: #aebac1;
            --wa-preview-text: #8696a0;
            --wa-check: #8696a0;
            --wa-divider: rgba(134,150,160,0.15);
            --wa-item-active: #2a3942;
            --wa-item-hover: #202c33;
            --wa-pill-bg: #202c33;
            --wa-pill-text: #8696a0;
            --wa-pill-active-bg: #00a884;
            --wa-pill-active-text: #111b21;
          }

          /* Conversation item hover */
          .wa-conv-item:hover {
            background: var(--wa-item-hover) !important;
          }

          /* ─── MOBILE (< 768px): Full-screen stacked views ─── */
          @media (max-width: 768px) {
            .wa-layout {
              position: relative;
              height: 100%;
            }
            .wa-list-panel {
              width: 100% !important;
              display: ${view === 'list' ? 'flex' : 'none'} !important;
              border-right: none !important;
              height: 100% !important;
            }
            .wa-chat-panel {
              position: fixed !important;
              top: 0 !important;
              left: 0 !important;
              right: 0 !important;
              bottom: 0 !important;
              z-index: 9999 !important;
              display: ${view === 'chat' ? 'flex' : 'none'} !important;
              width: 100% !important;
              height: 100dvh !important;
              background: var(--bg) !important;
            }
            .wa-contact-panel {
              position: fixed !important;
              top: 0 !important;
              left: 0 !important;
              right: 0 !important;
              bottom: 0 !important;
              z-index: 10000 !important;
              display: ${view === 'contact' ? 'flex' : 'none'} !important;
              width: 100% !important;
              height: 100dvh !important;
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

        {/* ─── Media Viewer Overlay ─── */}
        {mediaViewer && (
          <div onClick={() => setMediaViewer(null)} style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}>
            <button onClick={() => setMediaViewer(null)} style={{
              position: 'absolute', top: 16, right: 16, background: 'none', border: 'none',
              cursor: 'pointer', zIndex: 10,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#fff' }}>close</span>
            </button>
            {mediaViewer.type === 'video' ? (
              <video src={mediaViewer.src} controls autoPlay onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }} />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={mediaViewer.src} alt="Mídia" onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' }} />
            )}
          </div>
        )}

        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </AuthGuard>
  );
}
