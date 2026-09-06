'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { LogEntry, fmt, UNITS, cardS, inputS, labelS, btnPrimary, STORAGE_KEY_LOGS, formatCurrency } from '@/hooks/useDashboard';
import * as XLSX from 'xlsx';
import { DatePicker } from '@/components/ui/date-picker';
import { loadLogs as idbLoadLogs, saveLogs as idbSaveLogs } from '@/lib/indexeddb-storage';
import { isOperationalSale } from '@/lib/revenue';

interface Procedure { name: string; qty: number; unitPrice: number; }
interface ExtractedItem {
  date: string;
  clientName: string;
  phone: string | null;
  birthDate: string | null;
  procedures: Procedure[];
  seller: string;
  paymentType: string;
  installments: number;
  courtesy: number;
  discountValue: number;
  discountPercent: number;
  totalLiquido: number;
  unit: string;
}

interface Props {
  saleName:string; setSaleName:(v:string)=>void;
  saleValue:string; setSaleValue:(v:string)=>void;
  saleDate:string; setSaleDate:(v:string)=>void;
  salePayment:string; setSalePayment:(v:string)=>void;
  saleUnit:string; setSaleUnit:(v:string)=>void;
  saleObs:string; setSaleObs:(v:string)=>void;
  saleSeller:string; setSaleSeller:(v:string)=>void;
  addSale:()=>void;
  items:LogEntry[];
  deleteLogByDate:(date:string,name:string,type:string)=>void;
  updateLog:(oldItem:LogEntry,updated:Partial<LogEntry>)=>void;
  clearSalesByUnit:(unit:string)=>void;
  clearAllSales:()=>void;
  clearSalesByUnitAllMonths:(unit:string)=>void;
  clearAllSalesAllMonths:()=>void;
  selectedMonth:number;
  selectedYear:number;
  setSelectedMonth:(m:number)=>void;
  setSelectedYear:(y:number)=>void;
  selectedUnit:string;
}

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

interface PlatformUser { id:string; name:string; role:string; unit?:string; isActive?:boolean; }

export function SalesSection({ saleName, setSaleName, saleValue, setSaleValue, saleDate, setSaleDate, salePayment, setSalePayment, saleUnit, setSaleUnit, saleObs, setSaleObs, saleSeller, setSaleSeller, addSale, items, deleteLogByDate, updateLog, clearSalesByUnit, clearAllSales, clearSalesByUnitAllMonths, clearAllSalesAllMonths, selectedMonth, selectedYear, setSelectedMonth, setSelectedYear, selectedUnit }:Props) {
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  const goPrevMonth = () => {
    if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(selectedYear - 1); }
    else setSelectedMonth(selectedMonth - 1);
  };
  const goNextMonth = () => {
    if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(selectedYear + 1); }
    else setSelectedMonth(selectedMonth + 1);
  };
  const goToday = () => {
    const now = new Date();
    setSelectedMonth(now.getMonth());
    setSelectedYear(now.getFullYear());
    setShowMonthPicker(false);
  };
  const isCurrentMonth = selectedMonth === new Date().getMonth() && selectedYear === new Date().getFullYear();
  const sales = items.filter(isOperationalSale).reverse();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [extractSummary, setExtractSummary] = useState<{totalItems:number;totalLiquido:number;totalDesconto:number;period?:string}|null>(null);
  const [extractError, setExtractError] = useState('');
  const [uploadUnit, setUploadUnit] = useState(saleUnit || 'SBC');
  const [showUpload, setShowUpload] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [registerPatients, setRegisterPatients] = useState(true);
  const [expandedItem, setExpandedItem] = useState<number|null>(null);
  const [editingIdx, setEditingIdx] = useState<number|null>(null);
  const [editName, setEditName] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [confirmClear, setConfirmClear] = useState<string|null>(null);
  const [formCollapsed, setFormCollapsed] = useState(false);
  const [platformUsers, setPlatformUsers] = useState<PlatformUser[]>([]);

  /* ─── Fetch registered users for seller selector ─── */
  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setPlatformUsers(data.filter((u: PlatformUser) => u.isActive !== false));
    }).catch(() => {});
  }, []);

  /* ─── Sync uploadUnit with global unit selector ─── */
  useEffect(() => {
    setUploadUnit(saleUnit);
  }, [saleUnit]);

  /* ─── Mini KPI calculations ─── */
  const totalSalesValue = sales.reduce((s, l) => s + l.value, 0);
  const totalSalesCount = sales.length;
  const avgTicket = totalSalesCount > 0 ? totalSalesValue / totalSalesCount : 0;
  const uniqueClients = new Set(sales.map(l => l.name)).size;

  /* ─── Multi-file queue ─── */
  interface QueueItem {
    id: string;
    file: File;
    status: 'pending'|'processing'|'done'|'error';
    error?: string;
    itemCount?: number;
    progress?: string;
  }
  const [fileQueue, setFileQueue] = useState<QueueItem[]>([]);
  const [queueProcessing, setQueueProcessing] = useState(false);
  const queueRef = useRef<QueueItem[]>([]);
  queueRef.current = fileQueue;

  /* Infinite scroll */
  const PAGE_SIZE = 20;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset visible count when items change (e.g. month/unit filter)
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [items]);

  // IntersectionObserver to load more
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) { setVisibleCount(prev => Math.min(prev + PAGE_SIZE, sales.length)); } },
      { rootMargin: '200px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sales.length]);

  /* ─── Excel Parser ─── */
  const parseExcelFile = async (file: File): Promise<{items: ExtractedItem[]; error?: string}> => {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) return { items: [], error: 'Planilha vazia.' };
      const sheet = workbook.Sheets[sheetName];

      // Get ALL rows as raw arrays (header: 1) to find the real header row
      const allRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (allRows.length < 2) return { items: [], error: 'Planilha com dados insuficientes.' };

      // Normalize text for matching
      const normalize = (s: string) => s.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

      // Known header names to search for
      const knownHeaders = ['paciente', 'cliente', 'telefone', 'datavenda', 'procedimentos', 'vendedor', 'parcelas', 'totalliquido', 'total'];

      // Find the header row by scanning first 10 rows for known column names
      let headerRowIdx = -1;
      for (let i = 0; i < Math.min(allRows.length, 10); i++) {
        const row = allRows[i];
        const nonEmptyCells = row.filter((c: any) => String(c).trim().length >= 3);
        if (nonEmptyCells.length < 3) continue; // Skip rows with too few non-empty cells
        const matchCount = nonEmptyCells.filter((c: any) => {
          const norm = normalize(String(c));
          if (norm.length < 3) return false; // Skip very short normalized strings
          return knownHeaders.some(h => norm === h || norm.includes(h) || h.includes(norm));
        }).length;
        if (matchCount >= 3) { // At least 3 known headers found
          headerRowIdx = i;
          break;
        }
      }

      if (headerRowIdx === -1) return { items: [], error: 'Cabeçalho não encontrado. A planilha deve conter colunas como: Paciente, Telefone, Procedimentos, Total Líquido, etc.' };

      // Extract header names from the header row
      const headerRow = allRows[headerRowIdx].map((c: any) => String(c).trim());

      // Build column index map by matching EXACT header texts (case-insensitive)
      const colIndexMap: Record<string, number> = {};
      
      // Search for each header by exact text match (preserving accents/special chars)
      const headerSearchMap: Record<string, string[]> = {
        paciente: ['Paciente', 'Cliente', 'Nome', 'Nome Completo'],
        telefone: ['Telefone', 'Fone', 'Celular', 'Tel', 'Phone', 'WhatsApp'],
        datavenda: ['Data Venda', 'Data', 'Data da Venda', 'Data Compra'],
        datanascimento: ['Data de Nascimento', 'Data Nascimento', 'Nascimento', 'Dt Nascimento'],
        procedimentos: ['Procedimentos', 'Procedimento', 'Serviço', 'Serviços', 'Descrição', 'Itens', 'Item'],
        vendedor: ['Vendedor', 'Vendedora', 'Consultor', 'Consultora', 'Responsável', 'Profissional'],
        tipopagamento: ['Tipo de Pagamento', 'Tipo Pagamento', 'Pagamento', 'Forma Pagamento', 'Forma de Pagamento'],
        parcelas: ['Parcelas', 'Parcela', 'Num Parcelas', 'Qtd Parcelas'],
        cortesia: ['Cortesia', 'Brinde'],
        descrs: ['Desc. R$', 'Desc R$', 'Desconto R$', 'Desconto Reais', 'Desc Valor'],
        descpct: ['Desc. %', 'Desc %', 'Desconto %', 'Desconto Porcento', '% Desconto'],
        totalliquido: ['Total Líquido', 'Total Liquido', 'Total', 'Valor Total', 'Valor Líquido', 'Vlr Total'],
      };

      for (const [key, candidates] of Object.entries(headerSearchMap)) {
        for (let ci = 0; ci < headerRow.length; ci++) {
          if (colIndexMap[key] !== undefined) break; // Already found
          const h = headerRow[ci];
          if (candidates.some(c => c.toLowerCase() === h.toLowerCase())) {
            colIndexMap[key] = ci;
          }
        }
      }

      // Data rows start after the header row
      const dataRows = allRows.slice(headerRowIdx + 1);

      const getVal = (row: any[], key: string): string => {
        const ci = colIndexMap[key];
        if (ci === undefined || ci >= row.length) return '';
        const v = row[ci];
        if (v instanceof Date) return v.toISOString().split('T')[0];
        return String(v ?? '').trim();
      };

      const parseNum = (s: string) => {
        if (!s) return 0;
        if (typeof s === 'number') return s;
        // Handle "R$ 1.080,00" and "86,40%" formats
        const cleaned = String(s).replace(/[R$\s%]/g, '').replace(/\./g, '').replace(',', '.');
        return parseFloat(cleaned) || 0;
      };

      const parseDate = (s: string): string => {
        if (!s) return '';
        // Try DD/MM/YYYY
        const brMatch = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
        if (brMatch) {
          const [, d, m, y] = brMatch;
          const year = y.length === 2 ? '20' + y : y;
          return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        // Try ISO
        if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.split('T')[0];
        // Try Date object from xlsx
        const date = new Date(s);
        if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
        return '';
      };

      // Parse procedure string like "10x Depilação: R$ 1250.00  |  5x Peeling: R$ 500.00"
      const parseProcedures = (raw: string): Procedure[] => {
        if (!raw) return [{ name: 'Procedimento', qty: 1, unitPrice: 0 }];
        // Split by pipe | or semicolon for multiple procedures
        const parts = raw.split(/\s*\|\s*|[;\n]/).map(s => s.trim()).filter(Boolean);
        const procedures: Procedure[] = [];
        for (const part of parts) {
          // Try to match "10x Procedure Name: R$ 1250.00"
          const match = part.match(/^(\d+)x\s+(.+?)(?::\s*R\$\s*([\d.,]+))?$/i);
          if (match) {
            const qty = parseInt(match[1]) || 1;
            const name = match[2].trim();
            const price = match[3] ? parseFloat(match[3].replace(',', '.')) || 0 : 0;
            procedures.push({ name, qty, unitPrice: price });
          } else {
            procedures.push({ name: part, qty: 1, unitPrice: 0 });
          }
        }
        return procedures.length > 0 ? procedures : [{ name: 'Procedimento', qty: 1, unitPrice: 0 }];
      };

      const items: ExtractedItem[] = dataRows
        .filter(row => {
          const name = getVal(row, 'paciente');
          const total = getVal(row, 'totalliquido');
          // Skip empty rows, header-like rows, and totalizer rows
          if (!name || name.length < 2) return false;
          if (name.toLowerCase().includes('total de registros') || name.toLowerCase().includes('paciente')) return false;
          const totalNum = parseNum(total);
          return totalNum > 0;
        })
        .map(row => {
          const procedimentosRaw = getVal(row, 'procedimentos');
          const procedures = parseProcedures(procedimentosRaw);

          const totalLiquido = parseNum(getVal(row, 'totalliquido'));
          const descRs = parseNum(getVal(row, 'descrs'));
          const descPctRaw = getVal(row, 'descpct');
          const descPct = parseNum(descPctRaw);
          const cortesia = parseNum(getVal(row, 'cortesia'));
          const parcelasRaw = getVal(row, 'parcelas');
          const parcelas = parseInt(parcelasRaw) || 1;

          return {
            date: parseDate(getVal(row, 'datavenda')),
            clientName: getVal(row, 'paciente'),
            phone: getVal(row, 'telefone') || null,
            birthDate: parseDate(getVal(row, 'datanascimento')) || null,
            procedures,
            seller: getVal(row, 'vendedor'),
            paymentType: getVal(row, 'tipopagamento') || 'Não informado',
            installments: parcelas,
            courtesy: cortesia,
            discountValue: descRs,
            discountPercent: descPct,
            totalLiquido,
            unit: uploadUnit,
          };
        });

      if (items.length === 0) return { items: [], error: 'Nenhum registro válido encontrado. Verifique se o cabeçalho da planilha contém: Paciente, Total Líquido, etc.' };
      return { items };
    } catch (err: any) {
      return { items: [], error: `Erro ao ler Excel: ${err.message || String(err)}` };
    }
  };

  const startEdit = (item: LogEntry, idx: number) => {
    setEditingIdx(idx);
    setEditName(item.name);
    setEditValue(String(item.value));
    setEditUnit(item.unit || '');
  };

  const saveEdit = (item: LogEntry) => {
    const val = parseFloat(editValue.replace(',', '.'));
    if (!editName.trim() || isNaN(val) || val <= 0) return;
    updateLog(item, { name: editName.trim(), value: val, unit: editUnit || undefined });
    setEditingIdx(null);
  };

  const processSingleFile = async (file: File, queueId: string): Promise<{items: ExtractedItem[]; error?: string}> => {
    if (!/\.(xlsx|xls)$/i.test(file.name)) return { items: [], error: 'Selecione uma planilha Excel (.xlsx ou .xls).' };
    setFileQueue(prev => prev.map(q => q.id === queueId ? { ...q, progress: 'Lendo Excel...' } : q));
    return parseExcelFile(file);
  };

  /* ─── Queue processor: runs files one by one ─── */
  const processQueue = useCallback(async (queue: QueueItem[]) => {
    setQueueProcessing(true);
    setUploading(true);
    setExtractError('');

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      if (item.status !== 'pending') continue;

      // Mark as processing
      setFileQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'processing' as const } : q));
      setExtractError(`Processando arquivo ${i + 1}/${queue.length}: ${item.file.name}`);

      const result = await processSingleFile(item.file, item.id);

      if (result.error) {
        // Mark as error
        setFileQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'error' as const, error: result.error, progress: undefined } : q));
      } else {
        // Mark as done + accumulate items
        setFileQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'done' as const, itemCount: result.items.length, progress: undefined } : q));
        setExtractedItems(prev => {
          const all = [...prev, ...result.items];
          setExtractSummary({
            totalItems: all.length,
            totalLiquido: all.reduce((s: number, i: any) => s + (i.totalLiquido || 0), 0),
            totalDesconto: all.reduce((s: number, i: any) => s + (i.discountValue || 0), 0),
          });
          setSelectedItems(new Set(all.map((_: any, idx: number) => idx)));
          return all;
        });
      }
    }

    setUploading(false);
    setQueueProcessing(false);
    const errors = queueRef.current.filter(q => q.status === 'error');
    const done = queueRef.current.filter(q => q.status === 'done');
    if (errors.length > 0) {
      setExtractError(`✅ ${done.length} arquivo(s) OK — ❌ ${errors.length} com erro`);
    } else {
      setExtractError('');
    }
  }, [uploadUnit]);

  /* ─── Enqueue files (replaces old handleFileUpload) ─── */
  const handleFileUpload = (file: File) => {
    enqueueFiles([file]);
  };

  const enqueueFiles = (files: File[]) => {
    const validFiles = Array.from(files).filter(f => /\.(xlsx|xls)$/i.test(f.name)).slice(0, 30);
    if (validFiles.length === 0) return;

    const existing = queueRef.current.filter(q => q.status === 'pending' || q.status === 'processing');
    const totalAllowed = 30 - existing.length;
    const toAdd = validFiles.slice(0, Math.max(0, totalAllowed));
    if (toAdd.length === 0) { setExtractError('Limite de 30 arquivos na fila atingido.'); return; }

    const newItems: QueueItem[] = toAdd.map(f => ({
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      file: f,
      status: 'pending' as const,
    }));

    setFileQueue(prev => {
      const updated = [...prev, ...newItems];
      // Auto-start if not already processing
      if (!queueProcessing) {
        setTimeout(() => processQueue(updated.filter(q => q.status === 'pending')), 50);
      }
      return updated;
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) enqueueFiles(files);
  };

  const clearQueue = () => {
    setFileQueue([]);
    setExtractError('');
  };
  const toggleItem = (idx: number) => { setSelectedItems(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; }); };



  const importSelected = async () => {
    const toImport = extractedItems.filter((_, i) => selectedItems.has(i));
    if (toImport.length === 0) return;

    try {
      // Load existing logs from IndexedDB
      const savedLogs = await idbLoadLogs(STORAGE_KEY_LOGS);
      const existingLogs: LogEntry[] = savedLogs ? JSON.parse(savedLogs) : [];
      const newEntries: LogEntry[] = toImport.map(item => ({
        type: 'sale' as const, name: item.clientName || 'Venda', value: item.totalLiquido, unit: item.unit,
        payment: item.installments > 1 ? `${item.paymentType} ${item.installments}x` : item.paymentType || 'À vista',
        obs: [item.procedures.map(p => p.unitPrice > 0 ? `${p.qty}x ${p.name}: R$ ${(p.unitPrice * p.qty).toFixed(2)}` : `${p.qty}x ${p.name}`).join(', '), item.phone && `📱${item.phone}`, item.discountPercent > 0 && `Desc: ${item.discountPercent}%`, item.seller && `👤${item.seller}`].filter(Boolean).join(' | '),
        date: item.date ? new Date(item.date + 'T12:00:00Z').toISOString() : new Date().toISOString(),
        id: `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        seller: item.seller || '',
      }));
      const updated = [...existingLogs.filter(l => !l.id || !l.id.toString().startsWith('payroll-')), ...newEntries];

      // Save to IndexedDB (no 5MB limit)
      await idbSaveLogs(STORAGE_KEY_LOGS, JSON.stringify(updated));

      // Only create Package records if registerPatients is ON
      if (registerPatients) {
        toImport.forEach(item => {
          fetch('/api/packages', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clientName: item.clientName || 'Venda',
              services: JSON.stringify(item.procedures.map(p => ({ name: p.name, quantity: p.qty, unitPrice: String(p.unitPrice), discount: '0' }))),
              totalValue: item.totalLiquido,
              paidValue: 0,
              paymentMethod: item.paymentType || 'pix',
              installments: item.installments || 1,
              totalSessions: item.procedures.reduce((s, p) => s + p.qty, 0) || 1,
              completedSessions: 0,
              status: 'ativo',
              unit: item.unit || 'SCS',
            }),
          }).catch(() => {});
        });
      }

      // Auto-navigate to the most common month/year in the imported data
      const monthCounts: Record<string, number> = {};
      toImport.forEach(item => {
        if (item.date) {
          const d = new Date(item.date + 'T12:00:00Z');
          const key = `${d.getUTCMonth()}-${d.getUTCFullYear()}`;
          monthCounts[key] = (monthCounts[key] || 0) + 1;
        }
      });
      const topKey = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0];
      
      setExtractedItems([]); setExtractSummary(null); setSelectedItems(new Set()); setShowUpload(false);

      // Reload with correct month/year in URL so the dashboard shows the imported data
      if (topKey) {
        const [m, y] = topKey[0].split('-').map(Number);
        window.location.href = `/dashboard?tab=sales&month=${m}&year=${y}`;
      } else {
        window.location.reload();
      }
    } catch (err: any) {
      console.error('[Import] Unexpected error:', err);
      alert(`❌ Erro ao importar: ${err.message || String(err)}`);
    }
  };

  const calcAge = (bd: string|null) => { if (!bd) return null; const b = new Date(bd), t = new Date(); let a = t.getFullYear()-b.getFullYear(); if (t.getMonth()<b.getMonth()||(t.getMonth()===b.getMonth()&&t.getDate()<b.getDate())) a--; return a>0&&a<120?a:null; };

  const btnSmall = { background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' } as const;

  const focusStyle = (e: React.FocusEvent<HTMLInputElement|HTMLSelectElement>) => { e.target.style.borderColor='var(--primary)'; e.target.style.boxShadow='0 0 0 4px rgba(230,0,126,0.1)'; e.target.style.transform='translateY(-1px)'; };
  const blurStyle = (e: React.FocusEvent<HTMLInputElement|HTMLSelectElement>) => { e.target.style.borderColor='var(--border)'; e.target.style.boxShadow='none'; e.target.style.transform='translateY(0)'; };

  const roleBadge = (role: string) => {
    const r = role.toUpperCase();
    if (r === 'GERENTE') return { bg: 'rgba(168,85,247,0.1)', color: '#a855f7', label: 'Gerente' };
    if (r === 'ESTETICISTA') return { bg: 'rgba(20,184,166,0.1)', color: '#14b8a6', label: 'Esteticista' };
    return { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6', label: 'Vendedor(a)' };
  };

  return (
    <div>
      {/* Period Selector */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderRadius: 14, background: 'var(--card-bg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Prev Month */}
          <button onClick={goPrevMonth} style={{
            width: 32, height: 32, borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'rgba(230,0,126,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg)'; }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-muted)' }}>chevron_left</span>
          </button>

          {/* Month/Year Picker Toggle */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowMonthPicker(!showMonthPicker)} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 10,
              border: showMonthPicker ? '1px solid var(--primary)' : '1px solid var(--border)',
              background: showMonthPicker ? 'rgba(230,0,126,0.06)' : 'var(--bg)',
              color: 'var(--text-main)', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
              fontFamily: 'inherit', transition: 'all 0.2s',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--primary)' }}>calendar_month</span>
              {MONTHS[selectedMonth]} {selectedYear}
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-muted)', transition: 'transform 0.2s', transform: showMonthPicker ? 'rotate(180deg)' : 'none' }}>expand_more</span>
            </button>

            {/* Dropdown */}
            {showMonthPicker && (
              <>
                <div onClick={() => setShowMonthPicker(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)', zIndex: 100,
                  background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)',
                  boxShadow: '0 16px 48px rgba(0,0,0,0.15)', width: 280, overflow: 'hidden',
                  animation: 'fadeIn 0.15s ease',
                }}>
                  {/* Year Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                    <button onClick={() => setSelectedYear(selectedYear - 1)} style={{
                      width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_left</span>
                    </button>
                    <span style={{ fontWeight: 800, fontSize: '1rem' }}>{selectedYear}</span>
                    <button onClick={() => setSelectedYear(selectedYear + 1)} style={{
                      width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_right</span>
                    </button>
                  </div>

                  {/* Month Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, padding: '12px 14px' }}>
                    {MONTHS.map((m, i) => {
                      const isCurrent = i === new Date().getMonth() && selectedYear === new Date().getFullYear();
                      const isSelected = i === selectedMonth;
                      return (
                        <button key={i} onClick={() => { setSelectedMonth(i); setShowMonthPicker(false); }} style={{
                          padding: '9px 4px', borderRadius: 10, border: isCurrent && !isSelected ? '1px solid var(--primary)' : '1px solid transparent',
                          fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                          background: isSelected ? 'linear-gradient(135deg, var(--primary), #ff4db1)' : 'transparent',
                          color: isSelected ? '#fff' : isCurrent ? 'var(--primary)' : 'var(--text-muted)',
                        }}
                          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(230,0,126,0.06)'; }}
                          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                        >{m.slice(0, 3)}</button>
                      );
                    })}
                  </div>

                  {/* Today Button */}
                  {!isCurrentMonth && (
                    <div style={{ padding: '0 14px 12px' }}>
                      <button onClick={goToday} style={{
                        width: '100%', padding: '8px', borderRadius: 10, border: '1px solid var(--border)',
                        background: 'var(--bg)', color: 'var(--primary)', fontWeight: 700, fontSize: '0.75rem',
                        cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        transition: 'all 0.15s',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(230,0,126,0.06)'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>today</span>
                        Mês Atual
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Next Month */}
          <button onClick={goNextMonth} style={{
            width: 32, height: 32, borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'rgba(230,0,126,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg)'; }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-muted)' }}>chevron_right</span>
          </button>

          {/* Unit badge */}
          {selectedUnit !== 'all' && (
            <span style={{ padding: '4px 12px', borderRadius: 8, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)', fontSize: '0.75rem', fontWeight: 700, color: '#10b981', marginLeft: 4 }}>
              📍 {selectedUnit}
            </span>
          )}
        </div>

        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
          Dados filtrados por período selecionado
        </span>
      </div>

      {/* Mini KPI Cards — auto-fit, 2 colunas em mobile */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))',gap:10,marginBottom:14}}>
        {[
          {label:'Total Vendido',value:fmt(totalSalesValue),icon:'payments',color:'#10b981'},
          {label:'Qtd Vendas',value:String(totalSalesCount),icon:'receipt_long',color:'#6366f1'},
          {label:'Ticket Médio',value:fmt(avgTicket),icon:'local_offer',color:'#f59e0b'},
          {label:'Clientes',value:String(uniqueClients),icon:'group',color:'var(--primary)'},
        ].map((kpi,i) => (
          <div key={i} style={{...cardS,padding:'12px 12px 10px',position:'relative',overflow:'hidden'}}>
            <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${kpi.color},${kpi.color}66)`}} />
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
              <span style={{fontSize:'0.6rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase' as const,letterSpacing:'0.4px',lineHeight:1.3}}>{kpi.label}</span>
              <div style={{width:26,height:26,borderRadius:8,background:`${kpi.color}12`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginLeft:4}}>
                <span className="material-symbols-outlined" style={{fontSize:14,color:kpi.color}}>{kpi.icon}</span>
              </div>
            </div>
            <div style={{fontSize:'1.1rem',fontWeight:900,color:kpi.color,lineHeight:1.1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Collapsible Form Card */}
      <div style={cardS}>
        <div onClick={() => setFormCollapsed(!formCollapsed)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',userSelect:'none',gap:8}}>
          <div style={{display:'flex',alignItems:'center',gap:8,minWidth:0,flex:1}}>
            <div style={{width:36,height:36,borderRadius:12,background:'linear-gradient(135deg,var(--primary),#ff4db1)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 3px 10px rgba(230,0,126,0.3)',flexShrink:0}}>
              <span className="material-symbols-outlined" style={{fontSize:17,color:'#fff'}}>point_of_sale</span>
            </div>
            <div style={{minWidth:0}}>
              <h2 style={{margin:0,fontSize:'0.95rem',fontWeight:800,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>Registrar Venda</h2>
              <p style={{margin:0,fontSize:'0.68rem',color:'var(--text-muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{formCollapsed ? 'Clique para expandir' : 'Preencha os dados abaixo'}</p>
            </div>
          </div>
          <div style={{display:'flex',gap:5,alignItems:'center',flexShrink:0,flexWrap:'wrap',justifyContent:'flex-end'}}>
            <button onClick={e => { e.stopPropagation(); setShowUpload(!showUpload); }} style={{
              display:'flex',alignItems:'center',gap:5,padding:'6px 10px',borderRadius:9,
              border:'1px solid var(--border)',background:showUpload?'var(--primary)':'var(--card-bg)',
              color:showUpload?'#fff':'var(--text-main)',fontFamily:'inherit',fontWeight:700,fontSize:'0.75rem',cursor:'pointer',whiteSpace:'nowrap',
            }}>
              <span className="material-symbols-outlined" style={{fontSize:15}}>upload_file</span>
              {showUpload ? 'Fechar' : 'Importar'}
            </button>
            <span className="material-symbols-outlined" style={{fontSize:20,color:'var(--text-muted)',transition:'transform 0.3s',transform:formCollapsed?'rotate(0deg)':'rotate(180deg)'}}>expand_more</span>
          </div>
        </div>

        {/* Form body (collapsible) — mobile-first */}
        <div style={{maxHeight:formCollapsed?0:800,opacity:formCollapsed?0:1,overflow:'hidden',transition:'max-height 0.4s ease, opacity 0.3s ease, margin 0.3s ease',marginTop:formCollapsed?0:16}}>
          {/* Row 1: Data + Procedimento */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))',gap:12,marginBottom:12}}>
            <div><label style={labelS}><span className="material-symbols-outlined" style={{fontSize:13,color:'var(--primary)'}}>event</span>Data</label><DatePicker value={saleDate} onChange={setSaleDate} variant="input" /></div>
            <div><label style={labelS}><span className="material-symbols-outlined" style={{fontSize:13,color:'var(--primary)'}}>spa</span>Procedimento</label><input value={saleName} onChange={e=>setSaleName(e.target.value)} placeholder="Procedimento" style={inputS} onFocus={focusStyle as any} onBlur={blurStyle as any} /></div>
          </div>
          {/* Row 2: Valor + Pagamento */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))',gap:12,marginBottom:12}}>
            <div><label style={labelS}><span className="material-symbols-outlined" style={{fontSize:13,color:'var(--primary)'}}>payments</span>Valor (R$)</label><input value={saleValue} onChange={e=>setSaleValue(formatCurrency(e.target.value))} placeholder="0,00" style={inputS} inputMode="numeric" onFocus={focusStyle as any} onBlur={blurStyle as any} /></div>
            <div><label style={labelS}><span className="material-symbols-outlined" style={{fontSize:13,color:'var(--primary)'}}>credit_card</span>Pagamento</label><select value={salePayment} onChange={e=>setSalePayment(e.target.value)} style={inputS} onFocus={focusStyle as any} onBlur={blurStyle as any}><option>Pix</option><option>Cartão</option><option>Dinheiro</option></select></div>
            <div>
              <label style={labelS}><span className="material-symbols-outlined" style={{fontSize:13,color:'#a855f7'}}>person</span>Vendedor</label>
              <select value={saleSeller} onChange={e=>setSaleSeller(e.target.value)} style={{...inputS,borderColor:saleSeller?'#a855f7':'var(--border)'}} onFocus={focusStyle as any} onBlur={blurStyle as any}>
                <option value="">— Selecione —</option>
                {platformUsers.map(u => {
                  const badge = roleBadge(u.role);
                  return <option key={u.id} value={u.name}>{u.name} ({badge.label})</option>;
                })}
              </select>
            </div>
          </div>
          <div style={{marginBottom:12}}>
            <label style={labelS}><span className="material-symbols-outlined" style={{fontSize:13,color:'var(--primary)'}}>notes</span>Observações</label>
            <input value={saleObs} onChange={e=>setSaleObs(e.target.value)} placeholder="Detalhes opcionais..." style={inputS} onFocus={focusStyle as any} onBlur={blurStyle as any} />
          </div>
          <button onClick={addSale}
            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(-2px)';(e.currentTarget as HTMLElement).style.boxShadow='0 8px 25px rgba(230,0,126,0.35)';}}
            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(0)';(e.currentTarget as HTMLElement).style.boxShadow='0 4px 15px rgba(230,0,126,0.25)';}}
            style={{...btnPrimary,marginTop:4,maxWidth:320}}>
            <span className="material-symbols-outlined">add_circle</span> Registrar Venda
          </button>
        </div>
      </div>

      {/* Upload section */}
      {showUpload && (
        <div style={{ ...cardS, marginTop: 16, border: '2px dashed var(--primary)', background: 'rgba(230,0,126,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--primary)' }}>description</span> Importar Vendas Detalhadas
            </h2>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              {/* Register patients toggle */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ ...labelS, marginBottom: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: registerPatients ? '#10b981' : '#f59e0b' }}>
                    {registerPatients ? 'person_add' : 'analytics'}
                  </span>
                  Cadastrar Pacientes
                </label>
                <button
                  onClick={() => setRegisterPatients(!registerPatients)}
                  style={{
                    position: 'relative', width: 52, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer',
                    background: registerPatients ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                    transition: 'all 0.3s ease', padding: 0,
                    boxShadow: registerPatients ? '0 2px 8px rgba(16,185,129,0.3)' : '0 2px 8px rgba(245,158,11,0.3)',
                  }}
                  title={registerPatients ? 'Pacientes serão cadastrados no sistema' : 'Apenas dados financeiros serão coletados para análise'}
                >
                  <div style={{
                    position: 'absolute', top: 3, left: registerPatients ? 27 : 3,
                    width: 22, height: 22, borderRadius: 11, background: '#fff',
                    transition: 'left 0.3s ease', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 13, color: registerPatients ? '#10b981' : '#f59e0b' }}>
                      {registerPatients ? 'check' : 'close'}
                    </span>
                  </div>
                </button>
              </div>

            </div>
          </div>
          {/* Mode indicator banner */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 12, marginBottom: 14,
            background: registerPatients ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.06)',
            border: `1px solid ${registerPatients ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)'}`,
            transition: 'all 0.3s ease',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: registerPatients ? '#10b981' : '#f59e0b' }}>
              {registerPatients ? 'how_to_reg' : 'monitoring'}
            </span>
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: registerPatients ? '#10b981' : '#f59e0b' }}>
                {registerPatients ? '✅ Cadastro de pacientes ativado' : '📊 Modo somente análise'}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: 1 }}>
                {registerPatients
                  ? 'Os pacientes importados serão cadastrados no sistema (Vendas → Pacientes) com seus procedimentos e valores.'
                  : 'Apenas nomes, procedimentos e valores serão importados para análises financeiras. Nenhum paciente será cadastrado no sistema.'}
              </div>
            </div>
          </div>
          <div onDragOver={e => e.preventDefault()} onDrop={handleDrop} onClick={() => fileRef.current?.click()}
            style={{ padding: 40, textAlign: 'center', borderRadius: 16, cursor: 'pointer', background: 'rgba(230,0,126,0.03)', border: '1px dashed rgba(230,0,126,0.2)' }}>
            {uploading ? (
              <><span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--primary)', animation: 'spin 1s linear infinite' }}>progress_activity</span>
              <p style={{ marginTop: 12, fontWeight: 700 }}>Processando fila ({fileQueue.filter(q=>q.status==='done').length}/{fileQueue.length})...</p>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Lendo planilhas — não feche a página</p></>
            ) : (
              <><span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--primary)', opacity: 0.6 }}>cloud_upload</span>
              <p style={{ marginTop: 12, fontWeight: 700 }}>Arraste relatórios ou clique para selecionar</p>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}><strong style={{color:'#10b981'}}>Excel (.xlsx ou .xls)</strong> — múltiplos arquivos (máx. 30)</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 10, flexWrap: 'wrap' }}>
                {[{ext: 'XLSX', icon: 'table_chart', color: '#10b981', label: 'Excel'}].map(t => (
                  <div key={t.ext} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 8, background: `${t.color}08`, border: `1px solid ${t.color}20`, fontSize: '0.72rem', fontWeight: 700, color: t.color }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{t.icon}</span> {t.label}
                  </div>
                ))}
              </div></>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" multiple hidden onChange={e => { const files = e.target.files; if (files && files.length > 0) enqueueFiles(Array.from(files)); e.target.value = ''; }} />

          {/* Queue progress panel */}
          {fileQueue.length > 0 && (
            <div style={{ marginTop: 12, borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(99,102,241,0.04)', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#6366f1' }}>queue</span>
                  Fila de Importação ({fileQueue.filter(q=>q.status==='done').length}/{fileQueue.length} concluídos)
                </span>
                {!queueProcessing && (
                  <button onClick={clearQueue} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'inherit' }}>Limpar</button>
                )}
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {fileQueue.map((q, i) => (
                  <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderBottom: '1px solid rgba(0,0,0,0.04)', fontSize: '0.78rem', background: q.status === 'error' ? 'rgba(239,68,68,0.03)' : q.status === 'done' ? 'rgba(16,185,129,0.02)' : 'transparent' }}>
                    {q.status === 'pending' && <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-muted)' }}>schedule</span>}
                    {q.status === 'processing' && <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#f59e0b', animation: 'spin 1s linear infinite' }}>progress_activity</span>}
                    {q.status === 'done' && <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#10b981' }}>check_circle</span>}
                    {q.status === 'error' && <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#ef4444' }}>error</span>}
                    <span style={{ flex: 1, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>#{i+1}</span> {q.file.name}
                    </span>
                    {q.progress && <span style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 700 }}>{q.progress}</span>}
                    {q.status === 'done' && <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 700 }}>{q.itemCount} vendas</span>}
                    {q.status === 'error' && <span style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={q.error}>{q.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {extractError && <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: extractError.includes('✅') ? 'rgba(16,185,129,0.06)' : '#fee2e2', color: extractError.includes('✅') ? '#059669' : '#dc2626', fontSize: '0.85rem', fontWeight: 600 }}>{extractError}</div>}

          {extractedItems.length > 0 && (
            <div style={{ marginTop: 16 }}>
              {extractSummary && (
                <div style={{ marginBottom: 16 }}>
                  {extractSummary.period && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>📅 Período: {extractSummary.period}</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <div style={{ background: 'rgba(16,185,129,0.06)', padding: 14, borderRadius: 12, textAlign: 'center' }}><div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Clientes</div><div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#10b981' }}>{extractSummary.totalItems}</div></div>
                    <div style={{ background: 'rgba(16,185,129,0.06)', padding: 14, borderRadius: 12, textAlign: 'center' }}><div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Líquido</div><div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#10b981' }}>{fmt(extractSummary.totalLiquido)}</div></div>
                    <div style={{ background: 'rgba(239,68,68,0.06)', padding: 14, borderRadius: 12, textAlign: 'center' }}><div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Total Descontos</div><div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#ef4444' }}>{fmt(extractSummary.totalDesconto)}</div></div>
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700 }}>
                  <input type="checkbox" checked={selectedItems.size === extractedItems.length} onChange={() => { if (selectedItems.size === extractedItems.length) setSelectedItems(new Set()); else setSelectedItems(new Set(extractedItems.map((_, i) => i))); }} style={{ width: 16, height: 16, accentColor: 'var(--primary)' }} />
                  Selecionar todos ({selectedItems.size}/{extractedItems.length})
                </label>
              </div>
              <div style={{ maxHeight: 450, overflowY: 'auto', borderRadius: 12, border: '1px solid var(--border)' }}>
                {extractedItems.map((item, i) => {
                  const age = calcAge(item.birthDate);
                  const isExp = expandedItem === i;
                  return (
                    <div key={i} style={{ borderBottom: '1px solid var(--border)', background: selectedItems.has(i) ? 'rgba(230,0,126,0.03)' : 'transparent' }}>
                      <div onClick={() => toggleItem(i)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={selectedItems.has(i)} readOnly style={{ width: 16, height: 16, accentColor: 'var(--primary)', pointerEvents: 'none', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{item.clientName}</span>{age && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', background: 'rgba(99,102,241,0.08)', padding: '1px 6px', borderRadius: 5 }}>{age} anos</span>}</div>
                          <div style={{ display: 'flex', gap: 6, fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2, flexWrap: 'wrap' }}>
                            <span>{item.date ? new Date(item.date + 'T12:00:00').toLocaleDateString('pt-BR') : ''}</span>
                            {item.phone && <span>📱 {item.phone}</span>}
                            <span style={{ color: '#6366f1', fontWeight: 600 }}>{item.paymentType}{item.installments > 1 ? ` ${item.installments}x` : ''}</span>
                            {item.discountPercent > 0 && <span style={{ color: '#ef4444', fontWeight: 600 }}>-{item.discountPercent.toFixed(0)}%</span>}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}><div style={{ fontWeight: 900, fontSize: '0.95rem', color: '#10b981' }}>{fmt(item.totalLiquido)}</div>{item.discountValue > 0 && <div style={{ fontSize: '0.68rem', color: '#ef4444' }}>-{fmt(item.discountValue)}</div>}</div>
                        <button onClick={e => { e.stopPropagation(); setExpandedItem(isExp ? null : i); }} style={{...btnSmall}}><span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-muted)', transform: isExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>expand_more</span></button>
                      </div>
                      {isExp && (
                        <div style={{ padding: '0 14px 12px 42px', animation: 'fadeSlideUp 0.2s ease' }}>
                          <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: 6 }}>Procedimentos:</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {item.procedures.map((p, j) => (<div key={j} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', padding: '4px 10px', background: 'rgba(99,102,241,0.04)', borderRadius: 6 }}><span>{p.qty}x {p.name}</span><span style={{ fontWeight: 600 }}>{p.unitPrice > 0 ? fmt(p.unitPrice) : <span style={{ color: '#10b981' }}>Cortesia</span>}</span></div>))}
                          </div>
                          {item.seller && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6 }}>👤 Vendedor: {item.seller}</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={importSelected} disabled={selectedItems.size === 0} style={{ ...btnPrimary, opacity: selectedItems.size === 0 ? 0.5 : 1, cursor: selectedItems.size === 0 ? 'not-allowed' : 'pointer' }}>
                  <span className="material-symbols-outlined">download</span>
                  {registerPatients
                    ? `Importar ${selectedItems.size} venda${selectedItems.size !== 1 ? 's' : ''} + Cadastrar Pacientes`
                    : `Importar ${selectedItems.size} venda${selectedItems.size !== 1 ? 's' : ''} (somente análise)`}
                </button>
                <button onClick={() => { setExtractedItems([]); setExtractSummary(null); setSelectedItems(new Set()); setExtractError(''); }} style={{ ...btnPrimary, background: 'var(--md-error, #dc3545)' }}>
                  <span className="material-symbols-outlined">delete</span> Limpar tudo
                </button>
              </div>
              {!registerPatients && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '8px 14px', borderRadius: 10, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#f59e0b' }}>info</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#b45309' }}>Pacientes não serão cadastrados — apenas dados financeiros para o dashboard e análises.</span>
                </div>
              )}
              <p style={{ fontSize: '0.85rem', color: 'var(--md-outline, #666)', marginTop: 8 }}>
                💡 Arraste mais planilhas <strong>Excel</strong> para acumular os dados antes de importar.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Sales list with edit/delete */}
      <div style={{...cardS,marginTop:16}}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{margin:0,fontSize:'1.1rem',fontWeight:800}}>Lista de Vendas ({sales.length})</h2>
          {sales.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {confirmClear === null ? (
                <button onClick={() => setConfirmClear('pick-unit')} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.04)', color: '#ef4444', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete_sweep</span> Limpar Vendas
                </button>
              ) : confirmClear === 'pick-unit' ? (
                /* Step 1: choose unit or all */
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 700 }}>Qual unidade?</span>
                  {UNITS.map(u => (
                    <button key={u} onClick={() => setConfirmClear(`scope:${u}`)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{u}</button>
                  ))}
                  <button onClick={() => setConfirmClear('scope:__all__')} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Todas</button>
                  <button onClick={() => setConfirmClear(null)} style={{ ...btnSmall, color: 'var(--text-muted)' }}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span></button>
                </div>
              ) : confirmClear?.startsWith('scope:') ? (
                /* Step 2: choose month or all months */
                (() => {
                  const target = confirmClear.replace('scope:', '');
                  const label = target === '__all__' ? 'todas as unidades' : target;
                  return (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 700 }}>Remover de {label}:</span>
                      <button onClick={() => {
                        if (target === '__all__') clearAllSales(); else clearSalesByUnit(target);
                        setConfirmClear(null);
                      }} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.06)', color: '#3b82f6', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        📅 Apenas {MONTHS[selectedMonth]}/{selectedYear}
                      </button>
                      <button onClick={() => {
                        if (target === '__all__') clearAllSalesAllMonths(); else clearSalesByUnitAllMonths(target);
                        setConfirmClear(null);
                      }} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        ⚠️ Todos os meses
                      </button>
                      <button onClick={() => setConfirmClear('pick-unit')} style={{ ...btnSmall, color: 'var(--text-muted)' }}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span></button>
                      <button onClick={() => setConfirmClear(null)} style={{ ...btnSmall, color: 'var(--text-muted)' }}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span></button>
                    </div>
                  );
                })()
              ) : null}
            </div>
          )}
        </div>
        <ul style={{listStyle:'none',padding:0,margin:0}}>
          {sales.length===0?<p style={{textAlign:'center',color:'var(--text-muted)',padding:20}}>Nenhuma venda neste mês.</p>:sales.slice(0, visibleCount).map((item,i)=>(
            <li key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border)',gap:8}}>
              {editingIdx === i ? (
                /* Edit mode */
                <>
                  <div style={{ flex: 1, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input value={editName} onChange={e => setEditName(e.target.value)} style={{ ...inputS, flex: 1, minWidth: 120, padding: '6px 10px', fontSize: '0.82rem' }} />
                    <input value={editValue} onChange={e => setEditValue(e.target.value)} style={{ ...inputS, width: 100, padding: '6px 10px', fontSize: '0.82rem' }} placeholder="Valor" />
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => saveEdit(item)} style={{ ...btnSmall, background: '#10b981', borderRadius: 6, padding: '4px 8px' }}><span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fff' }}>check</span></button>
                    <button onClick={() => setEditingIdx(null)} style={{ ...btnSmall }}><span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-muted)' }}>close</span></button>
                  </div>
                </>
              ) : (
                /* View mode */
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{fontWeight:700,fontSize:'0.88rem',color:'var(--text-main)'}}>{item.name}</div>
                    <div style={{fontSize:'0.72rem',color:'var(--text-muted)',display:'flex',gap:6,marginTop:2,flexWrap:'wrap'}}>
                      <span>{item.date?new Date(item.date).toLocaleDateString():''}</span>
                      {item.unit&&<span style={{background:'rgba(99,102,241,0.08)',padding:'1px 6px',borderRadius:5,fontSize:'0.68rem'}}>{item.unit}</span>}
                      {item.payment&&<span style={{background:'rgba(16,185,129,0.08)',padding:'1px 6px',borderRadius:5,fontSize:'0.68rem'}}>{item.payment}</span>}
                      {item.seller&&<span style={{background:'rgba(168,85,247,0.08)',padding:'1px 6px',borderRadius:5,fontSize:'0.68rem',color:'#a855f7',fontWeight:600}}>👤 {item.seller}</span>}
                    </div>
                  </div>
                  <strong style={{color:'#10b981',fontWeight:700,flexShrink:0}}>+{fmt(item.value)}</strong>
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    <button onClick={() => startEdit(item, i)} title="Editar" style={{...btnSmall}}><span className="material-symbols-outlined" style={{ fontSize: 16, color: '#6366f1' }}>edit</span></button>
                    <button onClick={() => { if(item.date && item.name) deleteLogByDate(item.date, item.name, 'sale'); }} title="Excluir" style={{...btnSmall}}><span className="material-symbols-outlined" style={{ fontSize: 16, color: '#ef4444' }}>delete</span></button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
        {/* Infinite scroll sentinel + loading indicator */}
        {sales.length > visibleCount && (
          <div ref={sentinelRef} style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'20px 0',gap:8}}>
            <div style={{width:28,height:28,borderRadius:'50%',border:'3px solid var(--border)',borderTopColor:'var(--primary)',animation:'spin 0.8s linear infinite'}} />
            <span style={{fontSize:'0.75rem',color:'var(--text-muted)',fontWeight:600}}>Carregando mais vendas...</span>
          </div>
        )}
        {sales.length > 0 && visibleCount >= sales.length && sales.length > PAGE_SIZE && (
          <div style={{textAlign:'center',padding:'12px 0',fontSize:'0.75rem',color:'var(--text-muted)',fontWeight:600}}>
            ✅ Todas as {sales.length} vendas carregadas
          </div>
        )}
      </div>
      <style>{`@keyframes fadeSlideUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } } @keyframes spin { to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}
