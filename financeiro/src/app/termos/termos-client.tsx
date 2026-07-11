'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { DatePicker } from '@/components/date-picker';
import { DOCUMENT_BACKGROUND_URL } from '@/hooks/useCancelamento';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import mammoth from 'mammoth';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import {
  detectFontFromHtml,
  generatePdfWithBackground,
  htmlToPlainText,
} from './terms-document-engine';
import {
  btnPrimary,
  cardS,
  DEFAULT_CONTRACT_HTML,
  DOC_TYPES,
  EDITOR_FONTS,
  focusIn,
  focusOut,
  inputS,
  labelS,
  STORAGE_GENERATED,
  STORAGE_TEMPLATES,
  TABLE_VARIABLES,
  UNIT_PROFILES,
  VARIABLES,
  VAR_GROUPS,
} from './terms-shared';
import type { DocTemplate, GeneratedDoc } from './terms-shared';


/* ──────────── Component ──────────── */
export function TermosClient() {
  // Data
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [generated, setGenerated] = useState<GeneratedDoc[]>([]);

  // Views
  type View = 'list' | 'editor' | 'generator' | 'preview' | 'history';
  const [view, setView] = useState<View>('list');
  const [editingTemplate, setEditingTemplate] = useState<DocTemplate | null>(null);

  // List state
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage] = useState(1);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const perPage = 8;

  // Editor state
  const [edName, setEdName] = useState('');
  const [edType, setEdType] = useState(DOC_TYPES[0]);
  const [edActive, setEdActive] = useState(true);
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docxPreviewRef = useRef<HTMLDivElement>(null);
  const docxPreviewPreviewRef = useRef<HTMLDivElement>(null);

  // Generator state
  const [genTemplate, setGenTemplate] = useState<DocTemplate | null>(null);
  const [genStep, setGenStep] = useState(0);
  const [genData, setGenData] = useState<Record<string, string>>({});
  const [genHtml, setGenHtml] = useState('');
  const [genUnidade, setGenUnidade] = useState('SCS');
  const [showVars, setShowVars] = useState(false);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [tableHover, setTableHover] = useState<[number, number]>([0, 0]);

  // Formatting state tracking (reflects cursor position)
  const [curFont, setCurFont] = useState('');
  const [curSize, setCurSize] = useState('');
  const [curFmt, setCurFmt] = useState<Record<string, boolean>>({});

  const updateFormattingState = useCallback(() => {
    try {
      // Font name
      const rawFont = document.queryCommandValue('fontName') || '';
      const cleanFont = rawFont.replace(/["']/g, '').split(',')[0].trim();
      // Match to EDITOR_FONTS
      const matched = EDITOR_FONTS.find(f => 
        f.family.toLowerCase().includes(cleanFont.toLowerCase()) ||
        f.name.toLowerCase() === cleanFont.toLowerCase()
      );
      setCurFont(matched ? matched.family : '');

      // Font size — read actual computed size in px
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        let node: Node | null = sel.anchorNode;
        if (node && node.nodeType === 3) node = node.parentElement;
        if (node && node instanceof HTMLElement) {
          const computed = window.getComputedStyle(node).fontSize;
          const px = parseFloat(computed);
          // Convert px to pt (1pt = 1.333px)
          const pt = Math.round(px * 0.75);
          setCurSize(String(pt));
        }
      } else {
        setCurSize('');
      }

      // Toggle states
      setCurFmt({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikeThrough: document.queryCommandState('strikeThrough'),
        justifyLeft: document.queryCommandState('justifyLeft'),
        justifyCenter: document.queryCommandState('justifyCenter'),
        justifyRight: document.queryCommandState('justifyRight'),
        justifyFull: document.queryCommandState('justifyFull'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        insertOrderedList: document.queryCommandState('insertOrderedList'),
      });
    } catch { /* ignore errors when editor not focused */ }
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', updateFormattingState);
    return () => document.removeEventListener('selectionchange', updateFormattingState);
  }, [updateFormattingState]);

  // History state
  const [dbHistory, setDbHistory] = useState<any[]>([]);
  const [historyUnitFilter, setHistoryUnitFilter] = useState('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const fetchHistory = useCallback((unitFilter?: string) => {
    setIsLoadingHistory(true);
    const url = unitFilter ? `/api/termos?unit=${unitFilter}` : '/api/termos';
    fetch(url)
      .then(res => res.json())
      .then(data => { setDbHistory(Array.isArray(data) ? data : []); setIsLoadingHistory(false); })
      .catch(() => { setDbHistory([]); setIsLoadingHistory(false); });
  }, []);

  // Auth state
  const [isAdmin, setIsAdmin] = useState(false);

  // Digital Signature
  const [showSignModal, setShowSignModal] = useState(false);
  const [signEmail, setSignEmail] = useState('');
  const [signSending, setSignSending] = useState(false);
  const [signResult, setSignResult] = useState<{ url: string; documentId: string } | null>(null);
  const [signStep, setSignStep] = useState('');
  const [hasDrawn, setHasDrawn] = useState(false);

  // Load
  useEffect(() => {
    // Check admin role
    fetch('/api/auth/me').then(r => r.json()).then(u => {
      if (u?.role === 'ADMINISTRADOR' || u?.permissions?.admin === true) setIsAdmin(true);
    }).catch(() => {});

    // Fetch procedure suggestions
    fetch('/api/procedimentos').then(r => r.json()).then(list => {
      if (Array.isArray(list)) {
        setGenData(prev => ({ ...prev, _procSuggestions: JSON.stringify(list) }));
      }
    }).catch(() => {});
    async function loadTemplates() {
      // 1. Fetch from Database
      let networkTemplates: DocTemplate[] = [];
      try {
        const res = await fetch('/api/contract-templates');
        if (res.ok) {
          networkTemplates = await res.json();
          // The API returns the fields matching DocTemplate
          setTemplates(networkTemplates);
        }
      } catch (err) {
        console.error('Failed to load templates from DB', err);
      }

      // 2. Auto-Migrate missing templates from LocalStorage to Database (ONE BY ONE to avoid payload size limits!)
      try {
        const localT = localStorage.getItem(STORAGE_TEMPLATES);
        if (localT) {
          const parsed = JSON.parse(localT) as DocTemplate[];
          if (parsed && Array.isArray(parsed) && parsed.length > 0) {
            // Find templates that exist locally but NOT in the database network array yet (by Name)
            const toMigrate = parsed.filter(pt => !networkTemplates.some(nt => nt.name === pt.name));
            if (toMigrate.length > 0) {
              console.log('Migrating local templates to DB sequentially...', toMigrate.length);
              let anySuccess = false;
              
              for (const template of toMigrate) {
                try {
                  const res = await fetch('/api/contract-templates', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(template) // Send one by one!
                  });
                  if (res.ok) {
                    anySuccess = true;
                    console.log(`Migrated template: ${template.name}`);
                  } else {
                    console.error(`Failed to migrate template: ${template.name}`, await res.text());
                  }
                } catch (e) {
                  console.error(`Network error migrating template: ${template.name}`, e);
                }
              }
              
              if (anySuccess) {
                // Reload the list from the database
                const r2 = await fetch('/api/contract-templates');
                if (r2.ok) setTemplates(await r2.json());
              }
            }
          }
        }
      } catch (err) {
        console.error('Auto migration failed', err);
      }
      
      // Fallback: If DB is empty and local was empty, create a default local memory so UI doesn't break
      setTemplates(prev => {
        if (prev.length === 0) {
          const now = new Date().toISOString();
          return [{
            id: 1, name: 'Contrato de Prestação de Serviços', type: 'Contrato de prestação de serviço',
            content: DEFAULT_CONTRACT_HTML, active: true, createdAt: now, updatedAt: now,
          }];
        }
        return prev;
      });

      // Load generation history strictly local for now
      try {
        const g = localStorage.getItem(STORAGE_GENERATED);
        if (g) setGenerated(JSON.parse(g));
      } catch {}
    }
    loadTemplates();
  }, []);

  // Auto-open generator with pre-filled data from URL params (e.g. from Ficha do Paciente)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('generate') !== '1') return;
    // Wait for templates to load
    if (templates.length === 0) return;

    const unit = params.get('unidade') || 'SCS';
    const profile = UNIT_PROFILES[unit] || UNIT_PROFILES.Barueri;

    const prefilled: Record<string, string> = {
      nome_completo: params.get('nome_completo') || '',
      cpf: params.get('cpf') || '',
      rg: params.get('rg') || '',
      telefone: params.get('telefone') || '',
      email: params.get('email') || '',
      data_nascimento: params.get('data_nascimento') || '',
      sexo: params.get('sexo') || '',
      estado_civil: params.get('estado_civil') || '',
      profissao: params.get('profissao') || '',
      endereco_completo: params.get('endereco_completo') || '',
      data_hoje: new Date().toLocaleDateString('pt-BR'),
      nome_clinica: profile.nome_clinica,
      endereco_clinica: profile.endereco_clinica,
      cidade_clinica: profile.cidade_clinica,
      cnpj_clinica: profile.cnpj_clinica,
    };

    // Pre-fill procedures from procs param
    const procsParam = params.get('procs');
    if (procsParam) {
      prefilled._procs = procsParam;
      try {
        const procs = JSON.parse(procsParam);
        const subTotal = procs.reduce((s: number, p: any) => s + (p.subtotal || 0), 0);
        const totalDisc = procs.reduce((s: number, p: any) => s + (p.discount || 0), 0);
        const totalSale = procs.reduce((s: number, p: any) => s + (p.total || 0), 0);
        prefilled.subtotal_venda = `R$ ${subTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        prefilled.valor_desconto = `R$ ${totalDisc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        prefilled.total_venda = `R$ ${totalSale.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      } catch {}
    }

    const pagamento = params.get('pagamento');
    if (pagamento) prefilled.condicoes_pagamento = pagamento;

    // Pre-fill payments table
    const paymentsParam = params.get('payments');
    if (paymentsParam) {
      prefilled._payments = paymentsParam;
    }

    // Data da venda = hoje
    prefilled.data_venda = new Date().toLocaleDateString('pt-BR');

    // Auto-select first template and open generator
    setGenTemplate(templates[0]);
    setGenStep(0);
    setGenUnidade(unit);
    setGenData(prefilled);
    setView('generator');

    // Clean URL params
    window.history.replaceState({}, '', '/termos');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates]);

  const saveTemplates = useCallback((ts: DocTemplate[]) => {
    setTemplates(ts);
    localStorage.setItem(STORAGE_TEMPLATES, JSON.stringify(ts));
  }, []);
  const saveGenerated = useCallback((gs: GeneratedDoc[]) => {
    setGenerated(gs);
    localStorage.setItem(STORAGE_GENERATED, JSON.stringify(gs));
  }, []);

  /* ── Filtered / Paginated ── */
  const filtered = templates.filter(t => {
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterType !== 'all' && t.type !== filterType) return false;
    if (filterStatus === 'active' && !t.active) return false;
    if (filterStatus === 'inactive' && t.active) return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);
  const activeCount = templates.filter(t => t.active).length;

  /* ── Template CRUD ── */
  const openNewEditor = () => {
    setEditingTemplate(null);
    setEdName(''); setEdType(DOC_TYPES[0]); setEdActive(true);
    setView('editor');
    setTimeout(() => { if (editorRef.current) editorRef.current.innerHTML = ''; }, 50);
  };
  const openEditTemplate = (tpl: DocTemplate) => {
    setEditingTemplate(tpl);
    setEdName(tpl.name); setEdType(tpl.type); setEdActive(tpl.active);
    setView('editor');
    if (tpl.fileBase64) {
      // Render the DOCX with docx-preview for high-fidelity view
      setTimeout(async () => {
        if (docxPreviewRef.current) {
          try {
            const { renderAsync } = await import('docx-preview');
            const binary = atob(tpl.fileBase64!);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            await renderAsync(bytes.buffer, docxPreviewRef.current, undefined, {
              className: 'docx-preview-wrapper',
              inWrapper: true,
              ignoreWidth: false,
              ignoreHeight: false,
              ignoreFonts: false,
              breakPages: true,
              ignoreLastRenderedPageBreak: true,
              experimental: true,
              useBase64URL: true,
              renderHeaders: true,
              renderFooters: true,
              renderEndnotes: true,
              renderFootnotes: true,
            });
          } catch (err) {
            console.error('docx-preview error:', err);
            docxPreviewRef.current.innerHTML = '<p style="padding:40px;color:#666;text-align:center">Não foi possível renderizar o preview do Word. O arquivo original continua intacto para geração.</p>';
          }
        }
      }, 100);
    } else {
      setTimeout(() => { if (editorRef.current) editorRef.current.innerHTML = tpl.content; }, 50);
    }
  };
  const saveTemplate = async () => {
    if (!edName.trim()) return;
    const content = editingTemplate?.fileBase64 ? editingTemplate.content : (editorRef.current?.innerHTML || '');
    const now = new Date().toISOString();
    
    const payload = {
      id: editingTemplate ? editingTemplate.id : undefined,
      name: edName.trim(),
      type: edType,
      active: edActive,
      htmlContent: content,
      fileName: editingTemplate?.fileName || undefined,
      fileBase64: editingTemplate?.fileBase64 || undefined,
      backgroundPdf: editingTemplate?.backgroundPdf || undefined,
      backgroundPdfName: editingTemplate?.backgroundPdfName || undefined,
    };

    try {
      const res = await fetch('/api/contract-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const saved = await res.json();
        setTemplates(prev => {
          if (editingTemplate) return prev.map(t => String(t.id) === String(saved.id) ? saved : t);
          return [saved, ...prev];
        });
      }
    } catch (e) {
      console.error('Error saving template:', e);
    }
    setView('list');
  };

  const deleteTemplate = async (id: number | string) => {
    if (!await confirmDialog({ title: 'Excluir Modelo', message: 'Excluir este modelo? Esta ação não pode ser desfeita.', confirmText: 'Sim, excluir', variant: 'danger' })) return;
    try {
      const res = await fetch(`/api/contract-templates?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setTemplates(prev => prev.filter(t => String(t.id) !== String(id)));
      }
    } catch (e) {
      console.error('Error deleting template:', e);
    }
  };
  const duplicateTemplate = async (tpl: DocTemplate) => {
    const dupPayload = {
      ...tpl,
      id: undefined, // Let the backend generate a new ID
      name: `${tpl.name} (cópia)`,
    };
    try {
      const res = await fetch('/api/contract-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dupPayload)
      });
      if (res.ok) {
        const saved = await res.json();
        setTemplates(prev => [...prev, saved]);
      }
    } catch (e) {
      console.error('Error duplicating template:', e);
    }
  };

  const toggleActive = async (id: number | string) => {
    const tpl = templates.find(t => String(t.id) === String(id));
    if (!tpl) return;
    try {
      const res = await fetch('/api/contract-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...tpl, active: !tpl.active })
      });
      if (res.ok) {
        setTemplates(prev => prev.map(t => String(t.id) === String(id) ? { ...t, active: !t.active } : t));
      }
    } catch (e) {
      console.error('Error toggling active status:', e);
    }
  };

  /* ── Rich Editor ── */
  const execCmd = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    editorRef.current?.focus();
    setTimeout(updateFormattingState, 10);
  };
  const insertVariable = (varKey: string) => {
    const tag = `<span contenteditable="false" style="background:linear-gradient(135deg,rgba(230,0,126,0.12),rgba(230,0,126,0.06));color:var(--primary);padding:2px 8px;border-radius:6px;font-weight:700;font-size:0.85em;border:1px solid rgba(230,0,126,0.2);cursor:default;white-space:nowrap;display:inline-block;margin:0 2px" data-var="${varKey}">{{${varKey}}}</span>&nbsp;`;
    document.execCommand('insertHTML', false, tag);
    editorRef.current?.focus();
  };
  const insertTable = (rows: number, cols: number) => {
    if (!editorRef.current) return;
    const thCells = Array.from({ length: cols }, (_, i) => `<th style="text-align:left;padding:10px 12px;font-weight:700;border:1px solid #e5e7eb">Coluna ${i + 1}</th>`).join('');
    const tdCells = Array.from({ length: cols }, () => `<td style="padding:10px 12px;border:1px solid #e5e7eb">&nbsp;</td>`).join('');
    const bodyRows = Array.from({ length: rows - 1 }, () => `<tr>${tdCells}</tr>`).join('');
    const tableHtml = `<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:0.9em"><thead><tr style="background:#f3f4f6;border-bottom:2px solid #e5e7eb">${thCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = tableHtml;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const frag = document.createDocumentFragment();
      while (wrapper.firstChild) frag.appendChild(wrapper.firstChild);
      frag.appendChild(document.createElement('br'));
      range.insertNode(frag);
      range.collapse(false);
    } else {
      editorRef.current.innerHTML += tableHtml + '<br>';
    }
    editorRef.current.focus();
    setShowTablePicker(false);
  };
  const insertTableVariable = (varKey: string) => {
    if (!editorRef.current) return;
    const label = VARIABLES.find(v => v.key === varKey)?.label || varKey;
    const varTag = `<span contenteditable="false" style="background:linear-gradient(135deg,rgba(139,92,246,0.15),rgba(139,92,246,0.06));color:#8b5cf6;padding:2px 10px;border-radius:6px;font-weight:700;font-size:0.82em;border:1px solid rgba(139,92,246,0.2);cursor:default;white-space:nowrap;display:inline-block;margin:4px 0;font-style:italic" data-var="${varKey}">{{${label} (Exemplo)}}</span>`;
    const tableHtml = TABLE_VARIABLES[varKey] || '';
    const wrapper = document.createElement('div');
    wrapper.innerHTML = varTag + tableHtml;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const frag = document.createDocumentFragment();
      while (wrapper.firstChild) frag.appendChild(wrapper.firstChild);
      frag.appendChild(document.createElement('br'));
      range.insertNode(frag);
      range.collapse(false);
    } else {
      editorRef.current.innerHTML += varTag + tableHtml + '<br>';
    }
    editorRef.current.focus();
  };

  /* ── Generator ── */
  const applyUnitProfile = (unit: string, prevData?: Record<string, string>) => {
    const profile = UNIT_PROFILES[unit] || UNIT_PROFILES.Barueri;
    const base = prevData || {};
    return {
      ...base,
      nome_clinica: profile.nome_clinica,
      endereco_clinica: profile.endereco_clinica,
      cidade_clinica: profile.cidade_clinica,
      cnpj_clinica: profile.cnpj_clinica,
      data_hoje: base.data_hoje || new Date().toLocaleDateString('pt-BR'),
    };
  };
  const openGenerator = (tpl?: DocTemplate) => {
    setGenTemplate(tpl || null);
    setGenStep(0);
    setGenData(applyUnitProfile(genUnidade));
    setView('generator');
  };
  const generateDocument = () => {
    if (!genTemplate) return;
    // If template has a PDF background but only has the placeholder content,
    // use the default contract HTML as the text overlay for the PDF
    const isPlaceholderContent = genTemplate.content.includes('Este modelo usa um PDF de fundo');
    let html = (genTemplate.backgroundPdf && isPlaceholderContent)
      ? DEFAULT_CONTRACT_HTML
      : genTemplate.content;

    // Convert escaped template literal syntax ${V('key')} to actual data-var spans
    // This happens when DEFAULT_CONTRACT_HTML is used as fallback
    html = html.replace(/\$\{V\('([^']+)'\)\}/g, (_match, key) => {
      return `<span contenteditable="false" data-var="${key}">{{${key}}}</span>`;
    });
    // Remove ${TABLE_VARIABLES.key} placeholders (they are sample tables for the editor only)
    // The actual data tables are generated from the ${V('key')} spans above
    html = html.replace(/\$\{TABLE_VARIABLES\.[a-z_]+\}/g, '');
    // Remove the logo template literal (will use PDF background instead)
    html = html.replace(/\$\{DOCUMENT_BACKGROUND_URL\}/g, '');

    // Build procedure table data from _procs
    const procs: { name: string; sessions: number; subtotal: number; discount: number; total: number }[] = (() => {
      try {
        const raw = JSON.parse(genData._procs || '[]');
        return raw.map((p: any) => ({
          name: p.name || '',
          sessions: Number(p.sessions) || 1,
          subtotal: Number(p.subtotal) || 0,
          discount: Number(p.discount) || 0,
          total: Number(p.total) || 0,
        }));
      } catch { return []; }
    })();
    const payments: { method: string; installments: number; value: number; date: string }[] = (() => {
      try {
        const raw = JSON.parse(genData._payments || '[]');
        return raw.map((p: any) => ({
          method: p.method || 'Pix',
          installments: Number(p.installments) || 1,
          value: Number(p.value) || 0,
          date: p.date || '',
        }));
      } catch { return []; }
    })();

    // Populate sale-related variables from procedures
    const subTotal = procs.reduce((s, p) => s + (p.subtotal || 0), 0);
    const totalDisc = procs.reduce((s, p) => s + (p.discount || 0), 0);
    const totalSale = procs.reduce((s, p) => s + (p.total || 0), 0);
    const dataWithCalc: Record<string, string> = {
      ...genData,
      subtotal_venda: `R$ ${subTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      valor_desconto: `R$ ${totalDisc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      total_venda: `R$ ${totalSale.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      condicoes_pagamento: payments.map(p => `${p.method}${p.installments > 1 ? ` ${p.installments}x` : ''} R$ ${(p.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`).join(', '),
    };

    // Replace all {{var}} with data values
    VARIABLES.forEach(v => {
      const regex = new RegExp(`\\{\\{${v.key}\\}\\}`, 'g');
      html = html.replace(regex, dataWithCalc[v.key] || `[${v.label}]`);
    });
    // Also handle variables inside span tags
    const spanRegex = /<span[^>]*data-var="([^"]*)"[^>]*>[^<]*<\/span>/g;
    html = html.replace(spanRegex, (_, varKey) => {
      const TF = `font-family:'Courier New',Courier,monospace;color:#000 !important`;
      // For table variables, build actual tables from proc/payment data
      if (varKey === 'itens_da_venda' && procs.length > 0) {
        const rows = procs.map(p => `<tr><td style="border:1px solid #000;padding:8px;color:#000;${TF}">${p.name || '-'}</td><td style="border:1px solid #000;padding:8px;color:#000;${TF}">${p.sessions}</td><td style="border:1px solid #000;padding:8px;color:#000;${TF}">${p.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td style="border:1px solid #000;padding:8px;color:#000;${TF}">${p.discount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td style="border:1px solid #000;padding:8px;color:#000;${TF}">${p.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td></tr>`).join('');
        return `<table style="width:100%;border-collapse:collapse;margin:16px 0;${TF};color:#000;border:1px solid #000"><thead><tr><th style="border:1px solid #000;padding:8px;text-align:left;font-weight:bold;color:#000;${TF}">Item</th><th style="border:1px solid #000;padding:8px;text-align:left;font-weight:bold;color:#000;${TF}">Quantidade</th><th style="border:1px solid #000;padding:8px;text-align:left;font-weight:bold;color:#000;${TF}">Valor unitário (R$)</th><th style="border:1px solid #000;padding:8px;text-align:left;font-weight:bold;color:#000;${TF}">Desconto unitário (R$)</th><th style="border:1px solid #000;padding:8px;text-align:left;font-weight:bold;color:#000;${TF}">Valor (R$)</th></tr></thead><tbody>${rows}</tbody></table>`;
      }
      if (varKey === 'condicoes_pagamento_venda' && payments.length > 0) {
        const flatPayments: { label: number; method: string; value: number; date: string }[] = [];
        let parcelCounter = 1;
        payments.forEach(p => {
          if (p.installments > 1) {
            const valPerInst = p.value / p.installments;
            const dates = p.date.split('/');
            let dateObj = new Date();
            if (dates.length === 3) {
              dateObj = new Date(parseInt(dates[2]), parseInt(dates[1]) - 1, parseInt(dates[0]));
            }
            for (let i = 0; i < p.installments; i++) {
              const currentD = new Date(dateObj);
              currentD.setMonth(currentD.getMonth() + i);
              const dateStr = `${String(currentD.getDate()).padStart(2, '0')}/${String(currentD.getMonth() + 1).padStart(2, '0')}/${currentD.getFullYear()}`;
              flatPayments.push({ label: parcelCounter++, method: p.method, value: valPerInst, date: dateStr });
            }
          } else {
            flatPayments.push({ label: parcelCounter++, method: p.method, value: p.value, date: p.date || '-' });
          }
        });

        const rows = flatPayments.map(p => `<tr><td style="border:1px solid #000;padding:8px;color:#000;${TF}">${p.label}</td><td style="border:1px solid #000;padding:8px;color:#000;${TF}">${p.method}</td><td style="border:1px solid #000;padding:8px;color:#000;${TF}">${p.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td style="border:1px solid #000;padding:8px;color:#000;${TF}">${p.date}</td></tr>`).join('');
        return `<table style="width:100%;border-collapse:collapse;margin:16px 0;${TF};color:#000;border:1px solid #000"><thead><tr><th style="border:1px solid #000;padding:8px;text-align:left;font-weight:bold;color:#000;${TF}">Parcela</th><th style="border:1px solid #000;padding:8px;text-align:left;font-weight:bold;color:#000;${TF}">Método de Pagamento</th><th style="border:1px solid #000;padding:8px;text-align:left;font-weight:bold;color:#000;${TF}">Valor (R$)</th><th style="border:1px solid #000;padding:8px;text-align:left;font-weight:bold;color:#000;${TF}">Vencimento</th></tr></thead><tbody>${rows}</tbody></table>`;
      }
      const val = dataWithCalc[varKey];
      return val || `[${VARIABLES.find(v => v.key === varKey)?.label || varKey}]`;
    });

    // Strip HTML tags from inside {{...}} blocks (DOCX conversion can split variables across spans)
    html = html.replace(/\{\{([^}]*(<[^>]+>)[^}]*)\}\}/g, (match) => {
      const stripped = match.replace(/<[^>]+>/g, '');
      return stripped;
    });

    // Catch-all: replace any remaining {{...}} placeholders by matching labels to variable keys
    const labelToKey: Record<string, string> = {};
    VARIABLES.forEach(v => {
      labelToKey[v.label.toLowerCase()] = v.key;
      labelToKey[v.key.toLowerCase()] = v.key;
    });

    // Helper: build payment table HTML from payments data
    const buildPaymentTable = (): string | null => {
      if (payments.length === 0) return null;
      const TF = `font-family:'Courier New',Courier,monospace;color:#000 !important`;
      const flatPayments: { label: number; method: string; value: number; date: string }[] = [];
      let parcelCounter = 1;
      payments.forEach(p => {
        if (p.installments > 1) {
          const valPerInst = p.value / p.installments;
          const dates = p.date.split('/');
          let dateObj = new Date();
          if (dates.length === 3) {
            dateObj = new Date(parseInt(dates[2]), parseInt(dates[1]) - 1, parseInt(dates[0]));
          }
          for (let i = 0; i < p.installments; i++) {
            const currentD = new Date(dateObj);
            currentD.setMonth(currentD.getMonth() + i);
            const dateStr = `${String(currentD.getDate()).padStart(2, '0')}/${String(currentD.getMonth() + 1).padStart(2, '0')}/${currentD.getFullYear()}`;
            flatPayments.push({ label: parcelCounter++, method: p.method, value: valPerInst, date: dateStr });
          }
        } else {
          flatPayments.push({ label: parcelCounter++, method: p.method, value: p.value, date: p.date || '-' });
        }
      });
      const rows = flatPayments.map(p => `<tr><td style="border:1px solid #000;padding:8px;${TF}">${p.label}</td><td style="border:1px solid #000;padding:8px;${TF}">${p.method}</td><td style="border:1px solid #000;padding:8px;${TF}">R$ ${p.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td style="border:1px solid #000;padding:8px;${TF}">${p.date}</td></tr>`).join('');
      return `<table style="width:100%;border-collapse:collapse;margin:16px 0;${TF};border:1px solid #000"><thead><tr><th style="border:1px solid #000;padding:8px;text-align:left;font-weight:bold;${TF}">Parcela</th><th style="border:1px solid #000;padding:8px;text-align:left;font-weight:bold;${TF}">Método</th><th style="border:1px solid #000;padding:8px;text-align:left;font-weight:bold;${TF}">Valor (R$)</th><th style="border:1px solid #000;padding:8px;text-align:left;font-weight:bold;${TF}">Vencimento</th></tr></thead><tbody>${rows}</tbody></table>`;
    };

    html = html.replace(/\{\{([^}]+)\}\}/g, (match, label) => {
      const cleanLabel = label.trim().replace(/\s*\(Exemplo\)/gi, '').replace(/\s*\(exemplo\)/gi, '').trim();
      const snake = cleanLabel.toLowerCase().replace(/[\s]+/g, '_').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      // Check if this is a payment conditions variable — generate table instead of text
      if (snake.includes('condicoes') && snake.includes('pagamento')) {
        const table = buildPaymentTable();
        if (table) return table;
      }

      // Try matching by exact key
      if (dataWithCalc[cleanLabel]) return dataWithCalc[cleanLabel];
      // Try matching by label
      const key = labelToKey[cleanLabel.toLowerCase()];
      if (key && dataWithCalc[key]) return dataWithCalc[key];
      // Try fuzzy match
      if (dataWithCalc[snake]) return dataWithCalc[snake];
      const keyFromSnake = labelToKey[snake];
      if (keyFromSnake && dataWithCalc[keyFromSnake]) return dataWithCalc[keyFromSnake];
      // Try partial match
      for (const [lbl, k] of Object.entries(labelToKey)) {
        if (snake.includes(lbl.replace(/[\s]+/g, '_').normalize('NFD').replace(/[\u0300-\u036f]/g, '')) && dataWithCalc[k]) {
          return dataWithCalc[k];
        }
      }
      return match;
    });
    setGenHtml(html);
    setView('preview');
  };
  const saveGeneratedDoc = async () => {
    if (!genTemplate) return;
    const doc: GeneratedDoc = {
      id: Date.now(), templateId: genTemplate.id, templateName: genTemplate.name,
      clientName: genData.nome_completo || 'Sem nome', html: genHtml, createdAt: new Date().toISOString(),
    };
    saveGenerated([...generated, doc]);

    // Save to database
    try {
      await fetch('/api/termos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateName: genTemplate.name,
          clientName: genData.nome_completo || 'Sem nome',
          unit: genUnidade,
          docType: genTemplate.type,
          html: genHtml,
        }),
      });
    } catch (err) {
      console.error('Failed to save termo history', err);
    }
    alert('Documento salvo no histórico!');
  };
  const printDocument = async () => {
    // If template has PDF background, generate full branded PDF and open for printing
    if (genTemplate?.backgroundPdf) {
      try {
        const detectedFont = detectFontFromHtml(genHtml);
        const pdfBytes = await generatePdfWithBackground(genTemplate.backgroundPdf, genHtml, detectedFont);
        const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const w = window.open(url, '_blank');
        if (w) {
          w.addEventListener('load', () => { setTimeout(() => w.print(), 800); });
        }
      } catch (err) {
        console.error('PDF print error:', err);
        alert('Erro ao gerar PDF para impressão');
      }
      return;
    }
    // Fallback: HTML print for templates without PDF background
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>Documento</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  @page{size:A4 portrait;margin:0;}
  html,body{width:794px;margin:0 auto;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#1a1a1a;background-color:#fff;background-image:url('${DOCUMENT_BACKGROUND_URL}');background-size:100% 1123px;background-position:top left;background-repeat:repeat-y;}
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  h1,h2,h3{margin-top:24px}
  p{margin-bottom:12px;line-height:1.6}
</style></head><body>
<table style="width:100%; border:none; table-layout:fixed; border-collapse:collapse;">
  <thead><tr><td style="height:120px; border:none;"></td></tr></thead>
  <tbody><tr><td style="border:none; padding: 0 40px; vertical-align: top; line-height:1.6; font-size:15px;">
    ${genHtml}
  </td></tr></tbody>
  <tfoot><tr><td style="height:160px; border:none;"></td></tr></tfoot>
</table>
</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 500);
  };

  /* ──────────── RENDER ──────────── */

  /* ── History View ── */
  if (view === 'history') {
    return (
      <div style={{ padding: '20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--primary)' }}>history</span>
            Histórico de Documentos
          </h1>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.85rem' }}>Unidade:</span>
              <select value={historyUnitFilter} onChange={e => { setHistoryUnitFilter(e.target.value); fetchHistory(e.target.value); }} style={{ ...inputS, width: 'auto', minWidth: 140 }}>
                <option value="">Todas</option>
                <option value="SCS">SCS</option>
                <option value="SBC">SBC</option>
                <option value="Osasco">Osasco</option>
              </select>
            </div>
            <button onClick={() => setView('list')} style={{ ...btnPrimary, padding: '10px 20px', background: 'var(--bg)', color: 'var(--text-main)', border: '2px solid var(--border)', boxShadow: 'none' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span> Voltar
            </button>
          </div>
        </div>
        {isLoadingHistory ? (
          <div style={{ ...cardS, textAlign: 'center', padding: 60 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 32, animation: 'spin 1s linear infinite', color: 'var(--primary)' }}>sync</span>
            <p style={{ marginTop: 12 }}>Carregando histórico...</p>
          </div>
        ) : dbHistory.length === 0 ? (
          <div style={{ ...cardS, textAlign: 'center', padding: 60 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-muted)', marginBottom: 12, display: 'block' }}>folder_open</span>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Nenhum documento encontrado.</p>
          </div>
        ) : (
          <div style={{ ...cardS, padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead style={{ background: 'rgba(99,102,241,0.04)' }}>
                <tr>
                  {['Data', 'Cliente', 'Modelo', 'Unidade', 'Status'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dbHistory.map((doc: any) => (
                  <tr key={doc.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>{new Date(doc.createdAt).toLocaleDateString('pt-BR')} {new Date(doc.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-main)', fontWeight: 600 }}>{doc.clientName}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-main)' }}>{doc.templateName}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{doc.unit}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700,
                        background: doc.contractStatus === 'assinado' ? 'rgba(16,185,129,0.08)' : doc.contractStatus === 'pendente' ? 'rgba(245,158,11,0.08)' : 'rgba(99,102,241,0.08)',
                        color: doc.contractStatus === 'assinado' ? '#10b981' : doc.contractStatus === 'pendente' ? '#f59e0b' : '#6366f1',
                      }}>
                        {doc.contractStatus === 'assinado' ? '✅ Assinado' : doc.contractStatus === 'pendente' ? '⏳ Pendente' : '📄 Gerado'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  /* ── Preview View ── */
  if (view === 'preview') {
    // Render DOCX using docx-preview library for high-fidelity preview
    const renderDocxPreview = async (container: HTMLDivElement, base64: string) => {
      if (container.dataset.rendered === 'true') return;
      container.dataset.rendered = 'true';
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:400px;gap:12px"><div class="material-symbols-outlined" style="font-size:32px;color:var(--primary);animation:spin 1s linear infinite">progress_activity</div><span style="color:var(--text-muted);font-size:0.9rem">Renderizando documento...</span></div>';
      try {
        const { renderAsync } = await import('docx-preview');
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        container.innerHTML = '';
        await renderAsync(bytes.buffer, container, undefined, {
          className: 'docx-preview-wrapper',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          experimental: true,
          useBase64URL: true,
          renderHeaders: true,
          renderFooters: true,
          renderEndnotes: true,
          renderFootnotes: true,
        });
      } catch (err) {
        console.error('docx-preview error:', err);
        container.innerHTML = '<p style="padding:40px;color:#666;text-align:center">Não foi possível renderizar o preview.</p>';
      }
    };

    return (
      <div style={{ padding: '20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--primary)' }}>description</span>
            Visualizar Documento
          </h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setView('generator')} style={{ ...btnPrimary, padding: '10px 20px', background: 'var(--bg)', color: 'var(--text-main)', border: '2px solid var(--border)', boxShadow: 'none' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span> Voltar
            </button>
            <button onClick={printDocument} style={{ ...btnPrimary, padding: '10px 20px', background: 'linear-gradient(135deg,#3b82f6,#60a5fa)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>print</span> Imprimir / PDF
            </button>
            <button onClick={async () => {
              try {
                const procs: { name: string; sessions: number; subtotal: number; discount: number; total: number }[] = (() => { try { return JSON.parse(genData._procs || '[]'); } catch { return []; } })();
                const payments: { method: string; installments: number; value: number; date: string }[] = (() => { try { return JSON.parse(genData._payments || '[]'); } catch { return []; } })();
                const itensText = procs.length > 0
                  ? procs.map(p => `${p.name || '-'} — Qtd: ${p.sessions} — Valor: R$ ${p.subtotal.toLocaleString('pt-BR', {minimumFractionDigits:2})} — Desc: R$ ${p.discount.toLocaleString('pt-BR', {minimumFractionDigits:2})} — Total: R$ ${p.total.toLocaleString('pt-BR', {minimumFractionDigits:2})}`).join('\n')
                  : '';
                const flatPayments: { label: number; method: string; value: number; date: string }[] = [];
                let pc = 1;
                payments.forEach(p => {
                  if (p.installments > 1) {
                    const vpi = p.value / p.installments;
                    const parts = p.date.split('/');
                    let d = new Date();
                    if (parts.length === 3) d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
                    for (let i = 0; i < p.installments; i++) {
                      const cd = new Date(d); cd.setMonth(cd.getMonth() + i);
                      flatPayments.push({ label: pc++, method: p.method, value: vpi, date: `${String(cd.getDate()).padStart(2,'0')}/${String(cd.getMonth()+1).padStart(2,'0')}/${cd.getFullYear()}` });
                    }
                  } else {
                    flatPayments.push({ label: pc++, method: p.method, value: p.value, date: p.date || '-' });
                  }
                });
                const condText = flatPayments.length > 0
                  ? flatPayments.map(p => `Parcela ${p.label}: ${p.method} — R$ ${p.value.toLocaleString('pt-BR', {minimumFractionDigits:2})} — Venc: ${p.date}`).join('\n')
                  : '';
                const res = await fetch('/api/contrato/generate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    templateFileName: genTemplate?.fileName,
                    templateBase64: genTemplate?.fileBase64,
                    nome_completo: genData.nome_completo || '',
                    estado_civil: genData.estado_civil || '',
                    profissao: genData.profissao || '',
                    cpf: genData.cpf || '',
                    rg: genData.rg || '',
                    endereco_completo: genData.endereco_completo || '',
                    nome_clinica: genData.nome_clinica || '',
                    cnpj_clinica: genData.cnpj_clinica || '',
                    endereco_clinica: genData.endereco_clinica || '',
                    data_venda: genData.data_venda || genData.data_hoje || new Date().toLocaleDateString('pt-BR'),
                    itens_da_venda: itensText,
                    condicoes_pagamento_venda: condText,
                  }),
                });
                if (!res.ok) { const err = await res.json(); alert(err.error || 'Erro ao gerar contrato'); return; }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Contrato_${(genData.nome_completo || 'Cliente').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.docx`;
                a.click();
                URL.revokeObjectURL(url);
              } catch (err) { console.error(err); alert('Erro ao gerar contrato DOCX'); }
            }} style={{ ...btnPrimary, padding: '10px 20px', background: 'linear-gradient(135deg,#10b981,#34d399)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>description</span> Baixar Contrato DOCX
            </button>
            {genTemplate?.backgroundPdf && (
              <button onClick={async () => {
                try {
                  const detectedFont = detectFontFromHtml(genHtml);
                  const pdfBytes = await generatePdfWithBackground(genTemplate.backgroundPdf!, genHtml, detectedFont);
                  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `Contrato_${(genData.nome_completo || 'Cliente').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch (err) { console.error(err); alert('Erro ao gerar contrato PDF'); }
              }} style={{ ...btnPrimary, padding: '10px 20px', background: 'linear-gradient(135deg,#f59e0b,#fbbf24)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>picture_as_pdf</span> Baixar Contrato PDF
              </button>
            )}
            <button onClick={saveGeneratedDoc} style={{ ...btnPrimary, padding: '10px 20px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span> Salvar
            </button>
            <button onClick={() => { setSignEmail(genData.email || ''); setSignResult(null); setSignStep(''); setShowSignModal(true); }} style={{ ...btnPrimary, padding: '10px 20px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>draw</span> Enviar para Assinatura
            </button>
          </div>

          {/* ══════ Signature Modal ══════ */}
          {showSignModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => !signSending && setShowSignModal(false)}>
              <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 24, padding: 32, maxWidth: 520, width: '100%', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#fff' }}>draw</span>
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>Assinatura Digital</h3>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{genData.nome_completo || 'Cliente'} • {genTemplate?.name || 'Contrato'}</p>
                  </div>
                  <button onClick={() => !signSending && setShowSignModal(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)' }}>close</span>
                  </button>
                </div>

                {/* ── Signed Success ── */}
                {signResult ? (
                  signResult.url ? (
                    /* Link generated */
                    <div>
                      <div style={{ textAlign: 'center', marginBottom: 20 }}>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(16,185,129,0.1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#10b981' }}>check_circle</span>
                        </div>
                        <h4 style={{ margin: '0 0 4px', fontWeight: 900, fontSize: '1rem' }}>Link gerado com sucesso!</h4>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>Envie o link para o cliente assinar</p>
                      </div>
                      <div style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border)', marginBottom: 16, wordBreak: 'break-all', fontSize: '0.78rem', fontFamily: 'monospace', color: '#6366f1', fontWeight: 600 }}>
                        {signResult.url}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => { navigator.clipboard.writeText(signResult.url); alert('Link copiado!'); }} style={{ flex: 1, padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>content_copy</span> Copiar
                        </button>
                        <button onClick={() => { window.open(`https://wa.me/?text=${encodeURIComponent(`Olá ${genData.nome_completo || ''}! Segue o link para assinar seu contrato:\n${signResult.url}`)}`, '_blank'); }} style={{ flex: 1, padding: '12px 16px', borderRadius: 12, border: 'none', background: '#25D366', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chat</span> WhatsApp
                        </button>
                      </div>
                      <button onClick={() => setShowSignModal(false)} style={{ width: '100%', marginTop: 10, padding: '12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', fontFamily: 'inherit' }}>
                        Fechar
                      </button>
                    </div>
                  ) : (
                    /* Signed in-place */
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#dcfce7', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 44, color: '#16a34a' }}>verified</span>
                      </div>
                      <h4 style={{ margin: '0 0 6px', fontWeight: 900, fontSize: '1.2rem', color: '#166534' }}>Contrato Assinado!</h4>
                      <p style={{ margin: '0 0 20px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>A assinatura de <strong>{genData.nome_completo}</strong> foi registrada com sucesso.</p>
                      <button onClick={() => { setShowSignModal(false); setSignResult(null); }} style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.9rem' }}>
                        Fechar
                      </button>
                    </div>
                  )
                ) : signStep === 'signHere' ? (
                  /* ── In-Place Signing Canvas ── */
                  <div>
                    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', marginBottom: 16, overflow: 'hidden', maxHeight: '35vh', overflowY: 'auto' }}>
                      <div style={{ padding: '8px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#64748b' }}>description</span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const }}>Contrato</span>
                      </div>
                      {genTemplate?.backgroundPdf ? (
                        <div ref={el => {
                          if (el && !el.dataset.rendered) {
                            el.dataset.rendered = '1';
                            const detectedFont = detectFontFromHtml(genHtml);
                            generatePdfWithBackground(genTemplate.backgroundPdf!, genHtml, detectedFont).then(pdfBytes => {
                              const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
                              const url = URL.createObjectURL(blob);
                              el.innerHTML = '';
                              const iframe = document.createElement('iframe');
                              iframe.src = url;
                              iframe.style.cssText = 'width:100%;height:250px;border:none;';
                              el.appendChild(iframe);
                            }).catch(() => { el.innerHTML = '<p style="padding:20px;text-align:center;color:#999">Erro ao carregar preview</p>'; });
                          }
                        }} style={{ minHeight: 100 }} />
                      ) : (
                        <div style={{ padding: '20px 24px', fontSize: '0.75rem', lineHeight: 1.5, color: '#333', maxHeight: 200, overflowY: 'auto' }} dangerouslySetInnerHTML={{ __html: genHtml }} />
                      )}
                    </div>

                    <div style={{ border: '2px solid #6366f1', borderRadius: 16, padding: '16px 20px', marginBottom: 16, background: '#fafbfc' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>Assine aqui</h4>
                          <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: '#64748b' }}>Desenhe sua assinatura no campo abaixo</p>
                        </div>
                        <button onClick={() => {
                          const c = document.getElementById('signCanvasInPlace') as HTMLCanvasElement;
                          if (c) { const ctx = c.getContext('2d'); if (ctx) { ctx.clearRect(0, 0, c.width, c.height); setHasDrawn(false); } }
                        }} style={{ padding: '4px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, fontFamily: 'inherit', color: '#64748b' }}>
                          Limpar
                        </button>
                      </div>
                      <div style={{ position: 'relative', borderRadius: 12, border: '2px dashed #cbd5e1', background: '#fff', overflow: 'hidden' }}>
                        <canvas
                          id="signCanvasInPlace"
                          ref={el => {
                            if (el && !el.dataset.init) {
                              el.dataset.init = '1';
                              const rect = el.getBoundingClientRect();
                              el.width = rect.width * 2;
                              el.height = 160 * 2;
                              const ctx = el.getContext('2d')!;
                              ctx.scale(2, 2);
                              ctx.lineCap = 'round';
                              ctx.lineJoin = 'round';
                              ctx.strokeStyle = '#1a1a2e';
                              ctx.lineWidth = 2.5;
                              let drawing = false;
                              const getPos = (e: MouseEvent | Touch) => {
                                const r = el.getBoundingClientRect();
                                return { x: e.clientX - r.left, y: e.clientY - r.top };
                              };
                              const start = (e: any) => { e.preventDefault(); drawing = true; const p = e.touches ? getPos(e.touches[0]) : getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
                              const move = (e: any) => { if (!drawing) return; e.preventDefault(); const p = e.touches ? getPos(e.touches[0]) : getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); setHasDrawn(true); };
                              const stop = () => { drawing = false; };
                              el.addEventListener('mousedown', start);
                              el.addEventListener('mousemove', move);
                              el.addEventListener('mouseup', stop);
                              el.addEventListener('mouseleave', stop);
                              el.addEventListener('touchstart', start, { passive: false });
                              el.addEventListener('touchmove', move, { passive: false });
                              el.addEventListener('touchend', stop);
                            }
                          }}
                          style={{ width: '100%', height: 160, display: 'block', cursor: 'crosshair', touchAction: 'none' }}
                        />
                        {!hasDrawn && (
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                            <p style={{ color: '#94a3b8', fontWeight: 600, fontSize: '0.82rem' }}>✏️ Desenhe sua assinatura</p>
                          </div>
                        )}
                      </div>
                      <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12 }}>👤</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155' }}>{genData.nome_completo || 'Cliente'}</span>
                      </div>
                    </div>

                    <button disabled={!hasDrawn || signSending} onClick={async () => {
                      const canvas = document.getElementById('signCanvasInPlace') as HTMLCanvasElement;
                      if (!canvas || !hasDrawn) return;
                      setSignSending(true);
                      try {
                        const signatureImage = canvas.toDataURL('image/png');
                        // Generate PDF
                        let pdfBase64 = '';
                        if (genTemplate?.backgroundPdf) {
                          const detectedFont = detectFontFromHtml(genHtml);
                          const pdfBytes = await generatePdfWithBackground(genTemplate.backgroundPdf, genHtml, detectedFont);
                          pdfBase64 = btoa(String.fromCharCode(...pdfBytes));
                        } else {
                          const pdfDoc = await PDFDocument.create();
                          const font = await pdfDoc.embedFont(StandardFonts.Courier);
                          const plainText = htmlToPlainText(genHtml);
                          const lines = plainText.split('\n');
                          let page = pdfDoc.addPage([595, 842]);
                          let y = 800;
                          for (const line of lines) {
                            if (y < 40) { page = pdfDoc.addPage([595, 842]); y = 800; }
                            page.drawText(line.substring(0, 80), { x: 50, y, size: 9, font, color: rgb(0, 0, 0) });
                            y -= 14;
                          }
                          const bytes = await pdfDoc.save();
                          pdfBase64 = btoa(String.fromCharCode(...bytes));
                        }
                        // Save contract + sign immediately
                        const saveRes = await fetch('/api/signatures', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: 'create',
                            clientName: genData.nome_completo || 'Cliente',
                            clientCpf: genData.cpf || '',
                            clientEmail: signEmail || '',
                            templateName: genTemplate?.name || 'Contrato',
                            content: genHtml,
                            pdfContent: pdfBase64,
                            unit: genData.nome_clinica || 'SCS',
                          }),
                        });
                        const saveData = await saveRes.json();
                        if (!saveData.success) throw new Error(saveData.error || 'Erro ao salvar');
                        // Now sign it
                        let signerIp = '';
                        try { const ipRes = await fetch('https://api.ipify.org?format=json'); const ipData = await ipRes.json(); signerIp = ipData.ip; } catch {}
                        const signRes = await fetch('/api/signatures', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'sign', token: saveData.contract.signingToken, signatureImage, signerIp }),
                        });
                        const signData = await signRes.json();
                        if (!signData.success) throw new Error(signData.error || 'Erro ao assinar');
                        setSignResult({ url: '', documentId: saveData.contract.id });
                      } catch (err: any) {
                        console.error('[Sign]', err);
                        alert(`Erro: ${err.message}`);
                      }
                      setSignSending(false);
                    }} style={{
                      width: '100%', padding: '16px', borderRadius: 14, border: 'none',
                      background: !hasDrawn || signSending ? '#94a3b8' : 'linear-gradient(135deg,#10b981,#059669)',
                      color: '#fff', fontWeight: 800, cursor: !hasDrawn || signSending ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{signSending ? 'hourglass_top' : 'verified'}</span>
                      {signSending ? 'Registrando...' : hasDrawn ? 'Confirmar Assinatura' : 'Desenhe sua assinatura acima'}
                    </button>
                    <button onClick={() => { setSignStep(''); setHasDrawn(false); }} style={{ width: '100%', marginTop: 8, padding: '10px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', fontFamily: 'inherit', color: 'var(--text-muted)' }}>
                      ← Voltar
                    </button>
                  </div>
                ) : signStep === 'sendLink' ? (
                  /* ── Generate Link Flow ── */
                  <div>
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>Nome do Signatário</label>
                      <input value={genData.nome_completo || ''} disabled style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: '0.88rem', background: 'var(--bg)', boxSizing: 'border-box', color: 'var(--text-main)', fontFamily: 'inherit', fontWeight: 600, opacity: 0.7 }} />
                    </div>

                    {signStep === 'sendLink' && !signSending && (
                      <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.1)', marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#6366f1' }}>info</span>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6366f1' }}>Como funciona</span>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Um link será gerado para o cliente abrir e assinar o contrato digitalmente. Você poderá copiar ou enviar por WhatsApp.
                        </p>
                      </div>
                    )}

                    <button disabled={signSending} onClick={async () => {
                      setSignSending(true);
                      try {
                        let pdfBase64 = '';
                        if (genTemplate?.backgroundPdf) {
                          const detectedFont = detectFontFromHtml(genHtml);
                          const pdfBytes = await generatePdfWithBackground(genTemplate.backgroundPdf, genHtml, detectedFont);
                          pdfBase64 = btoa(String.fromCharCode(...pdfBytes));
                        } else {
                          const pdfDoc = await PDFDocument.create();
                          const font = await pdfDoc.embedFont(StandardFonts.Courier);
                          const plainText = htmlToPlainText(genHtml);
                          const lines = plainText.split('\n');
                          let page = pdfDoc.addPage([595, 842]);
                          let y = 800;
                          for (const line of lines) {
                            if (y < 40) { page = pdfDoc.addPage([595, 842]); y = 800; }
                            page.drawText(line.substring(0, 80), { x: 50, y, size: 9, font, color: rgb(0, 0, 0) });
                            y -= 14;
                          }
                          const bytes = await pdfDoc.save();
                          pdfBase64 = btoa(String.fromCharCode(...bytes));
                        }
                        const saveRes = await fetch('/api/signatures', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: 'create',
                            clientName: genData.nome_completo || 'Cliente',
                            clientCpf: genData.cpf || '',
                            clientEmail: signEmail || '',
                            templateName: genTemplate?.name || 'Contrato',
                            content: genHtml,
                            pdfContent: pdfBase64,
                            unit: genData.nome_clinica || 'SCS',
                          }),
                        });
                        const saveData = await saveRes.json();
                        if (!saveData.success) throw new Error(saveData.error || 'Erro ao salvar contrato');
                        setSignResult({ url: saveData.signingUrl || '', documentId: saveData.contract.id });
                      } catch (err: any) {
                        console.error('[Signature]', err);
                        alert(`Erro: ${err.message}`);
                      }
                      setSignSending(false);
                    }} style={{
                      width: '100%', padding: '14px', borderRadius: 14, border: 'none',
                      background: signSending ? '#94a3b8' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                      color: '#fff', fontWeight: 800, cursor: signSending ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{signSending ? 'hourglass_top' : 'link'}</span>
                      {signSending ? 'Gerando...' : 'Gerar Link de Assinatura'}
                    </button>
                    <button onClick={() => setSignStep('')} style={{ width: '100%', marginTop: 8, padding: '10px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', fontFamily: 'inherit', color: 'var(--text-muted)' }}>
                      ← Voltar
                    </button>
                  </div>
                ) : (
                  /* ── Choice Screen ── */
                  <div>
                    <p style={{ margin: '0 0 20px', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>Como deseja coletar a assinatura?</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <button onClick={() => { setSignStep('signHere'); setHasDrawn(false); }} style={{
                        padding: '20px 24px', borderRadius: 16, border: '2px solid var(--border)',
                        background: 'var(--card-bg)', cursor: 'pointer', textAlign: 'left',
                        transition: 'all 0.2s', fontFamily: 'inherit',
                      }} onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = '#6366f1'; }} onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'var(--border)'; }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#10b981,#059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#fff' }}>draw</span>
                          </div>
                          <div>
                            <h4 style={{ margin: '0 0 2px', fontSize: '0.95rem', fontWeight: 800 }}>Assinar aqui mesmo</h4>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>O cliente assina diretamente nesta tela</p>
                          </div>
                        </div>
                      </button>
                      <button onClick={() => setSignStep('sendLink')} style={{
                        padding: '20px 24px', borderRadius: 16, border: '2px solid var(--border)',
                        background: 'var(--card-bg)', cursor: 'pointer', textAlign: 'left',
                        transition: 'all 0.2s', fontFamily: 'inherit',
                      }} onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = '#6366f1'; }} onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'var(--border)'; }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#fff' }}>link</span>
                          </div>
                          <div>
                            <h4 style={{ margin: '0 0 2px', fontSize: '0.95rem', fontWeight: 800 }}>Enviar link de assinatura</h4>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Gere um link para enviar por WhatsApp ou copiar</p>
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {genTemplate?.backgroundPdf ? (
          <div
            ref={(el) => {
              if (el && genTemplate?.backgroundPdf && el.dataset.rendered !== 'true') {
                el.dataset.rendered = 'true';
                el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:500px;gap:12px"><div class="material-symbols-outlined" style="font-size:32px;color:var(--primary);animation:spin 1s linear infinite">progress_activity</div><span style="color:var(--text-muted)">Gerando preview do PDF...</span></div>';
                // Generate PDF with background + contract text
                const detectedFont = detectFontFromHtml(genHtml);
                generatePdfWithBackground(genTemplate.backgroundPdf, genHtml, detectedFont).then(pdfBytes => {
                  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
                  const url = URL.createObjectURL(blob);
                  el.innerHTML = '';
                  const iframe = document.createElement('iframe');
                  iframe.src = url;
                  iframe.style.cssText = 'width:100%;height:900px;border:none;border-radius:14px;';
                  el.appendChild(iframe);
                }).catch(err => {
                  console.error('PDF generation error:', err);
                  el.innerHTML = '<p style="padding:40px;color:#666;text-align:center">Erro ao gerar preview do PDF.</p>';
                });
              }
            }}
            style={{ ...cardS, padding: 0, maxWidth: 900, margin: '0 auto', background: '#fff', overflow: 'hidden', minHeight: 500 }}
          />
        ) : genTemplate?.fileBase64 ? (
          <div
            ref={(el) => {
              if (el && genTemplate?.fileBase64) {
                renderDocxPreview(el, genTemplate.fileBase64);
              }
            }}
            style={{ ...cardS, padding: 0, maxWidth: 900, margin: '0 auto', background: '#fff', overflow: 'hidden', minHeight: 500 }}
          />
        ) : (
          <div style={{ ...cardS, padding: '40px 60px', maxWidth: 900, margin: '0 auto', lineHeight: 1.7, fontSize: '0.95rem' }} dangerouslySetInnerHTML={{ __html: genHtml }} />
        )}
      </div>
    );
  }

  /* ── Generator View ── */
  if (view === 'generator') {
    const activeTemplates = templates.filter(t => t.active);
    const steps = ['Modelo', 'Cliente', 'Clínica', 'Pagamento'];
    const updateGen = (key: string, val: string) => setGenData(prev => ({ ...prev, [key]: val }));

    // Procedures state
    const procs: { name: string; sessions: number; subtotal: number; discount: number; total: number }[] = (() => {
      try {
        const raw = JSON.parse(genData._procs || '[]');
        return raw.map((p: any) => ({
          name: p.name || '',
          sessions: Number(p.sessions) || 1,
          subtotal: Number(p.subtotal) || 0,
          discount: Number(p.discount) || 0,
          total: Number(p.total) || 0,
        }));
      } catch { return []; }
    })();
    const setProcs = (p: typeof procs) => updateGen('_procs', JSON.stringify(p));
    const addProc = () => setProcs([...procs, { name: '', sessions: 1, subtotal: 0, discount: 0, total: 0 }]);
    const updateProc = (i: number, field: string, val: any) => {
      const updated = [...procs];
      (updated[i] as any)[field] = val;
      if (field === 'subtotal' || field === 'discount') {
        updated[i].total = Math.max(0, (updated[i].subtotal || 0) - (updated[i].discount || 0));
      }
      setProcs(updated);
      if (field === 'name' && val.trim().length > 2) {
        fetch('/api/procedimentos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: val.trim() }) }).catch(() => {});
      }
    };
    const removeProc = (i: number) => setProcs(procs.filter((_, idx) => idx !== i));

    const fmtBRL = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const parseBRL = (v: string) => { const cleaned = v.replace(/[^\d,]/g, '').replace(',', '.'); return parseFloat(cleaned) || 0; };
    // Raw display for editable inputs: no thousand separators, comma decimal (e.g. 1000.5 → "1000,5")
    const rawBRL = (n: number) => n ? String(n).replace('.', ',') : '';
    const procTotal = procs.reduce((s, p) => s + (p.total || 0), 0);

    // Payments state
    const payments: { method: string; installments: number; value: number; date: string }[] = (() => {
      try {
        const raw = JSON.parse(genData._payments || '[]');
        return raw.map((p: any) => ({
          method: p.method || 'Pix',
          installments: Number(p.installments) || 1,
          value: Number(p.value) || 0,
          date: p.date || '',
        }));
      } catch { return []; }
    })();
    const setPayments = (p: typeof payments) => updateGen('_payments', JSON.stringify(p));
    const todayStr = (() => { const t = new Date(); return `${String(t.getDate()).padStart(2,'0')}/${String(t.getMonth()+1).padStart(2,'0')}/${t.getFullYear()}`; })();
    const addPayment = () => setPayments([...payments, { method: 'Pix', installments: 1, value: procTotal, date: todayStr }]);
    const updatePayment = (i: number, field: string, val: any) => {
      const updated = [...payments];
      (updated[i] as any)[field] = val;
      if (field === 'method' && val !== 'Crédito' && val !== 'Link de Pagamento') { updated[i].installments = 1; }
      setPayments(updated);
    };
    const removePayment = (i: number) => setPayments(payments.filter((_, idx) => idx !== i));
    const PAYMENT_METHODS = ['Pix', 'Débito', 'Crédito', 'Link de Pagamento', 'Boleto', 'Dinheiro'];

    // Masks
    const maskCpf = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 11); return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); };
    const maskRg = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 9); return d.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1})$/, '$1-$2'); };
    const maskTel = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 11); if (d.length <= 2) return d.length ? `(${d}` : ''; if (d.length <= 3) return `(${d.slice(0,2)}) ${d.slice(2)}`; if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2,3)} ${d.slice(3)}`; return `(${d.slice(0,2)}) ${d.slice(2,3)} ${d.slice(3,7)}-${d.slice(7)}`; };

    // Stepper helper
    const getStepClass = (i: number) => {
      if (i < genStep) return 'gen-step-item completed';
      if (i === genStep) return 'gen-step-item active';
      return 'gen-step-item';
    };

    return (
      <div className="gen-wrapper">
        {/* ── Header ── */}
        <div className="gen-header">
          <h1 className="gen-header-title">
            <span className="material-symbols-outlined" style={{ fontSize: 26, color: 'var(--primary)' }}>magic_button</span>
            Gerar Documento
          </h1>
          <button onClick={() => setView('list')} className="gen-cancel-btn">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
            Cancelar
          </button>
        </div>

        {/* ── Stepper visual ── */}
        <div className="gen-stepper">
          {steps.map((s, i) => (
            <div key={i} className={getStepClass(i)} onClick={() => setGenStep(i)} style={{ cursor: 'pointer' }}>
              <div className="gen-step-circle">
                {i < genStep
                  ? <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check</span>
                  : i + 1
                }
              </div>
              <span className="gen-step-label">{s}</span>
            </div>
          ))}
        </div>

        {/* ── Step content card ── */}
        <div className="gen-card">

          {/* ── Step 0: Modelo + Unidade ── */}
          {genStep === 0 && (
            <div>
              <div className="gen-unidade-wrap">
                <label className="gen-label">Unidade</label>
                <select
                  value={genUnidade}
                  onChange={e => { const u = e.target.value; setGenUnidade(u); setGenData(prev => applyUnitProfile(u, prev)); }}
                  className="gen-input gen-select"
                >
                  <option value="SCS">SCS</option>
                  <option value="SBC">SBC</option>
                  <option value="Osasco">Osasco</option>
                </select>
              </div>

              <h3 className="gen-card-title">
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#8b5cf6' }}>article</span>
                Escolha o modelo
              </h3>

              {activeTemplates.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 40, display: 'block', marginBottom: 8, opacity: 0.4 }}>description</span>
                  <p style={{ fontSize: '0.88rem' }}>Nenhum modelo ativo. Crie um modelo primeiro.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {activeTemplates.map(tpl => (
                    <div
                      key={tpl.id}
                      onClick={() => { setGenTemplate(tpl); setGenStep(1); }}
                      className={`gen-template-card${genTemplate?.id === tpl.id ? ' selected' : ''}`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: genTemplate?.id === tpl.id ? 'rgba(230,0,126,0.12)' : 'rgba(139,92,246,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: genTemplate?.id === tpl.id ? 'var(--primary)' : '#8b5cf6' }}>description</span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="gen-template-name">{tpl.name}</div>
                          <div className="gen-template-type">{tpl.type}</div>
                        </div>
                        {genTemplate?.id === tpl.id && (
                          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)', flexShrink: 0 }}>check_circle</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Step 1: Dados do Cliente ── */}
          {genStep === 1 && (
            <div>
              <h3 className="gen-card-title">
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>person</span>
                Dados do Cliente
              </h3>
              <div className="gen-form-grid">
                {/* Nome Completo — full width */}
                <div className="gen-field-full">
                  <label className="gen-label">Nome Completo <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    value={genData.nome_completo || ''}
                    onChange={e => updateGen('nome_completo', e.target.value)}
                    placeholder="Nome completo do cliente"
                    className="gen-input"
                    onFocus={focusIn as any}
                    onBlur={focusOut as any}
                  />
                </div>

                <div>
                  <label className="gen-label">CPF <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    value={genData.cpf || ''}
                    onChange={e => updateGen('cpf', maskCpf(e.target.value))}
                    placeholder="000.000.000-00"
                    className="gen-input"
                    onFocus={focusIn as any}
                    onBlur={focusOut as any}
                  />
                </div>

                <div>
                  <label className="gen-label">RG <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    value={genData.rg || ''}
                    onChange={e => updateGen('rg', maskRg(e.target.value))}
                    placeholder="00.000.000-0"
                    className="gen-input"
                    onFocus={focusIn as any}
                    onBlur={focusOut as any}
                  />
                </div>

                <div>
                  <label className="gen-label">Data de Nascimento <span style={{ color: '#ef4444' }}>*</span></label>
                  <DatePicker value={genData.data_nascimento || ''} onChange={v => updateGen('data_nascimento', v)} />
                </div>

                <div>
                  <label className="gen-label">Telefone <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    value={genData.telefone || ''}
                    onChange={e => updateGen('telefone', maskTel(e.target.value))}
                    placeholder="(11) 9 9442-1525"
                    className="gen-input"
                    onFocus={focusIn as any}
                    onBlur={focusOut as any}
                  />
                </div>

                <div>
                  <label className="gen-label">E-mail <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    value={genData.email || ''}
                    onChange={e => updateGen('email', e.target.value)}
                    placeholder="exemplo@email.com"
                    type="email"
                    className="gen-input"
                    onFocus={focusIn as any}
                    onBlur={focusOut as any}
                  />
                </div>

                {/* Endereço — full width */}
                <div className="gen-field-full">
                  <label className="gen-label">Endereço Completo <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    value={genData.endereco_completo || ''}
                    onChange={e => updateGen('endereco_completo', e.target.value)}
                    placeholder="Rua, número, bairro, cidade - UF"
                    className="gen-input"
                    onFocus={focusIn as any}
                    onBlur={focusOut as any}
                  />
                </div>

                <div>
                  <label className="gen-label">Sexo <span style={{ color: '#ef4444' }}>*</span></label>
                  <select
                    value={genData.sexo || ''}
                    onChange={e => updateGen('sexo', e.target.value)}
                    className="gen-input gen-select"
                  >
                    <option value="" disabled>Selecione</option>
                    <option value="Masculino">Masculino</option>
                    <option value="Feminino">Feminino</option>
                  </select>
                </div>

                <div>
                  <label className="gen-label">Estado Civil <span style={{ color: '#ef4444' }}>*</span></label>
                  <select
                    value={genData.estado_civil || ''}
                    onChange={e => updateGen('estado_civil', e.target.value)}
                    className="gen-input gen-select"
                  >
                    <option value="" disabled>Selecione</option>
                    <option value="Solteiro(a)">Solteiro(a)</option>
                    <option value="Casado(a)">Casado(a)</option>
                    <option value="Viúvo(a)">Viúvo(a)</option>
                    <option value="Prefiro não informar">Prefiro não informar</option>
                  </select>
                </div>

                <div>
                  <label className="gen-label">Profissão <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    value={genData.profissao || ''}
                    onChange={e => updateGen('profissao', e.target.value)}
                    placeholder="Ex: Empresário"
                    className="gen-input"
                    onFocus={focusIn as any}
                    onBlur={focusOut as any}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Dados da Clínica ── */}
          {genStep === 2 && (
            <div>
              <h3 className="gen-card-title">
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#6366f1' }}>business</span>
                Dados da Clínica
              </h3>
              {!isAdmin && (
                <div className="gen-admin-notice">
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>lock</span>
                  Somente administradores podem editar estes dados
                </div>
              )}
              <div className="gen-form-grid">
                <div className="gen-field-full">
                  <label className="gen-label">Nome da Clínica</label>
                  <input
                    value={genData.nome_clinica || ''}
                    onChange={e => updateGen('nome_clinica', e.target.value)}
                    placeholder="Nome da clínica"
                    className="gen-input"
                    readOnly={!isAdmin}
                    onFocus={focusIn as any}
                    onBlur={focusOut as any}
                  />
                </div>
                <div className="gen-field-full">
                  <label className="gen-label">Endereço da Clínica</label>
                  <input
                    value={genData.endereco_clinica || ''}
                    onChange={e => updateGen('endereco_clinica', e.target.value)}
                    placeholder="Endereço da clínica"
                    className="gen-input"
                    readOnly={!isAdmin}
                    onFocus={focusIn as any}
                    onBlur={focusOut as any}
                  />
                </div>
                <div>
                  <label className="gen-label">Cidade da Clínica</label>
                  <input
                    value={genData.cidade_clinica || ''}
                    onChange={e => updateGen('cidade_clinica', e.target.value)}
                    placeholder="Cidade - UF"
                    className="gen-input"
                    readOnly={!isAdmin}
                    onFocus={focusIn as any}
                    onBlur={focusOut as any}
                  />
                </div>
                <div>
                  <label className="gen-label">CNPJ da Clínica</label>
                  <input
                    value={genData.cnpj_clinica || ''}
                    onChange={e => updateGen('cnpj_clinica', e.target.value)}
                    placeholder="00.000.000/0001-00"
                    className="gen-input"
                    readOnly={!isAdmin}
                    onFocus={focusIn as any}
                    onBlur={focusOut as any}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Procedimentos & Pagamento ── */}
          {genStep === 3 && (
            <div>
              {/* Procedimentos */}
              <h3 className="gen-card-title">
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#f59e0b' }}>medical_services</span>
                Procedimentos
              </h3>

              {/* Datalist sugestões */}
              <datalist id="proc-suggestions">
                {(JSON.parse(genData._procSuggestions || '[]') as string[]).map((s, i) => <option key={i} value={s} />)}
              </datalist>

              {/* Cards de procedimento (mobile-first) */}
              {procs.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                  {procs.map((proc, i) => (
                    <div key={i} className="gen-proc-card">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <label className="gen-label">Procedimento</label>
                          <input
                            list="proc-suggestions"
                            value={proc.name}
                            onChange={e => updateProc(i, 'name', e.target.value)}
                            placeholder="Nome do procedimento"
                            className="gen-input"
                            onFocus={focusIn as any}
                            onBlur={focusOut as any}
                          />
                        </div>
                        <button
                          onClick={() => removeProc(i)}
                          style={{ background: 'rgba(239,68,68,0.07)', border: 'none', borderRadius: 10, padding: '8px', cursor: 'pointer', color: '#ef4444', display: 'flex', alignItems: 'center', marginTop: 20, flexShrink: 0 }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                        </button>
                      </div>
                      <div className="gen-form-grid" style={{ marginTop: 0 }}>
                        <div>
                          <label className="gen-label">Sessões</label>
                          <input
                            type="number"
                            min={1}
                            value={proc.sessions}
                            onChange={e => updateProc(i, 'sessions', Number(e.target.value))}
                            className="gen-input"
                            style={{ textAlign: 'center' }}
                            onFocus={focusIn as any}
                            onBlur={focusOut as any}
                          />
                        </div>
                        <div>
                          <label className="gen-label">Subtotal (R$)</label>
                          <input
                            value={rawBRL(proc.subtotal)}
                            onChange={e => updateProc(i, 'subtotal', parseBRL(e.target.value))}
                            placeholder="0,00"
                            className="gen-input"
                            onFocus={focusIn as any}
                            onBlur={focusOut as any}
                          />
                        </div>
                        <div>
                          <label className="gen-label">Desconto (R$)</label>
                          <input
                            value={rawBRL(proc.discount)}
                            onChange={e => updateProc(i, 'discount', parseBRL(e.target.value))}
                            placeholder="0,00"
                            className="gen-input"
                            onFocus={focusIn as any}
                            onBlur={focusOut as any}
                          />
                        </div>
                        <div>
                          <label className="gen-label">Total</label>
                          <div className="gen-proc-total-badge" style={{ width: '100%', height: 52, justifyContent: 'center', fontSize: '0.95rem' }}>
                            R$ {fmtBRL(proc.total || 0)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={addProc} className="gen-add-btn" style={{ marginBottom: 24 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
                Adicionar Procedimento
              </button>

              {/* Totals summary */}
              {procs.length > 0 && (
                <div className="gen-totals-row">
                  {[
                    { label: 'Subtotal', value: procs.reduce((s, p) => s + (p.subtotal || 0), 0), color: '#6366f1' },
                    { label: 'Desconto', value: procs.reduce((s, p) => s + (p.discount || 0), 0), color: '#f59e0b' },
                    { label: 'Total', value: procs.reduce((s, p) => s + (p.total || 0), 0), color: '#10b981' },
                  ].map(t => (
                    <div key={t.label} className="gen-total-card" style={{ background: `${t.color}08` }}>
                      <div className="gen-total-label">{t.label}</div>
                      <div className="gen-total-value" style={{ color: t.color }}>
                        R$ {fmtBRL(t.value)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Divider pagamento */}
              <div className="gen-section-divider">
                <div className="gen-section-divider-line" />
                <div className="gen-section-divider-label">
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--primary)' }}>payments</span>
                  Pagamento
                </div>
                <div className="gen-section-divider-line" />
              </div>

              {/* Payment cards */}
              {payments.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                  {payments.map((pay, i) => {
                    const installmentsEnabled = pay.method === 'Crédito' || pay.method === 'Link de Pagamento';
                    return (
                      <div key={i} className="gen-payment-card">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)' }}>Pagamento #{i + 1}</span>
                          <button onClick={() => removePayment(i)} style={{ background: 'rgba(239,68,68,0.07)', border: 'none', borderRadius: 8, padding: '6px', cursor: 'pointer', color: '#ef4444', display: 'flex' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                          </button>
                        </div>
                        <div className="gen-form-grid">
                          <div className="gen-field-full">
                            <label className="gen-label">Meio de Pagamento</label>
                            <select
                              value={pay.method}
                              onChange={e => updatePayment(i, 'method', e.target.value)}
                              className="gen-input gen-select"
                            >
                              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="gen-label">Parcelas</label>
                            <select
                              value={pay.installments}
                              onChange={e => updatePayment(i, 'installments', Number(e.target.value))}
                              disabled={!installmentsEnabled}
                              className="gen-input gen-select"
                              style={{ opacity: installmentsEnabled ? 1 : 0.4 }}
                            >
                              {Array.from({ length: 18 }, (_, n) => <option key={n + 1} value={n + 1}>{n + 1}x</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="gen-label">Valor (R$)</label>
                            <input
                              value={rawBRL(pay.value)}
                              onChange={e => updatePayment(i, 'value', parseBRL(e.target.value))}
                              placeholder="0,00"
                              className="gen-input"
                              onFocus={focusIn as any}
                              onBlur={focusOut as any}
                            />
                          </div>
                          <div>
                            <label className="gen-label">Data</label>
                            <DatePicker value={pay.date} onChange={v => updatePayment(i, 'date', v)} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <button onClick={addPayment} className="gen-add-btn is-payment">
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
                Adicionar Pagamento
              </button>
            </div>
          )}

          {/* ── Navigation ── */}
          <div className="gen-nav-row">
            <button
              onClick={() => setGenStep(Math.max(0, genStep - 1))}
              disabled={genStep === 0}
              className="gen-btn-prev"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_left</span>
              Anterior
            </button>
            {genStep < 3 ? (
              <button onClick={() => setGenStep(genStep + 1)} className="gen-btn-next">
                Próximo
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_right</span>
              </button>
            ) : (
              <button
                onClick={() => { if (!genTemplate) { alert('Selecione um modelo primeiro no Step 1'); setGenStep(0); return; } generateDocument(); }}
                className="gen-btn-next gen-btn-generate"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>auto_awesome</span>
                Gerar Documento
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }



  /* ── Editor View ── */
  if (view === 'editor') {
    const toolBtn = (icon: string, cmd: string, val?: string, title?: string) => {
      const isActive = curFmt[cmd] || false;
      return (
      <button key={cmd + (val || '')} title={title || cmd} onClick={() => execCmd(cmd, val)} style={{
        width: 36, height: 36, borderRadius: 8,
        border: isActive ? '2px solid var(--primary)' : '1px solid var(--border)',
        background: isActive ? 'rgba(230,0,126,0.1)' : 'var(--bg)',
        color: isActive ? 'var(--primary)' : 'var(--text-main)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontFamily: 'inherit', transition: 'all 0.15s', fontWeight: isActive ? 700 : 400,
      }} onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(230,0,126,0.06)'; e.currentTarget.style.borderColor = 'var(--primary)'; } }}
         onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.borderColor = 'var(--border)'; } }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{icon}</span>
      </button>
      );
    };

    return (
      <div style={{ padding: '20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#8b5cf6' }}>edit_document</span>
            {editingTemplate ? 'Editar Modelo' : 'Novo Modelo'}
          </h1>
          <button onClick={() => setView('list')} style={{ ...btnPrimary, padding: '10px 20px', background: 'var(--bg)', color: 'var(--text-main)', border: '2px solid var(--border)', boxShadow: 'none' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span> Cancelar
          </button>
        </div>

        {/* Meta fields */}
        <div style={{ ...cardS, display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 16, alignItems: 'end', marginBottom: 16 }}>
          <div>
            <label style={labelS}>Nome do Modelo</label>
            <input value={edName} onChange={e => setEdName(e.target.value)} placeholder="Ex: Contrato de serviço" style={inputS} onFocus={focusIn as any} onBlur={focusOut as any} />
          </div>
          <div>
            <label style={labelS}>Tipo</label>
            <select value={edType} onChange={e => setEdType(e.target.value)} style={{ ...inputS, height: 48, appearance: 'auto' as any }}>
              {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 4 }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: edActive ? '#10b981' : 'var(--text-muted)' }}>{edActive ? 'Ativo' : 'Inativo'}</span>
            <div onClick={() => setEdActive(!edActive)} style={{
              width: 48, height: 26, borderRadius: 13, cursor: 'pointer', transition: 'all 0.3s',
              background: edActive ? '#10b981' : 'var(--border)', position: 'relative',
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute',
                top: 3, left: edActive ? 25 : 3, transition: 'left 0.3s', boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
              }} />
            </div>
          </div>
        </div>

        {/* Rich text editor */}
        <div style={cardS}>
          {editingTemplate?.fileBase64 && (
            <div style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid #3b82f6', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="material-symbols-outlined" style={{ color: '#3b82f6', fontSize: 24 }}>lock</span>
              <div>
                <strong style={{ color: '#3b82f6', display: 'block', fontSize: '0.9rem' }}>Modelo com Arquivo Original (Word)</strong>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>A visualização abaixo mostra o documento original com toda a formatação. O design real do Word será mantido 100% fiel na geração do DOCX.</span>
              </div>
            </div>
          )}
          {/* Toolbar - hide for native DOCX templates */}
          {!editingTemplate?.fileBase64 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '8px 0', marginBottom: 8, borderBottom: '1px solid var(--border)' }}>
            <select value={curFont} onChange={e => { if (e.target.value) { document.execCommand('fontName', false, e.target.value); setTimeout(updateFormattingState, 10); } }} style={{
              padding: '6px 10px', borderRadius: 8, border: curFont ? '2px solid var(--primary)' : '1px solid var(--border)', background: curFont ? 'rgba(230,0,126,0.05)' : 'var(--bg)',
              color: 'var(--text-main)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', maxWidth: 170, fontFamily: curFont || 'inherit',
            }}>
              <option value="">Fonte</option>
              {EDITOR_FONTS.map(f => (
                <option key={f.name} value={f.family} style={{ fontFamily: f.family }}>{f.name}</option>
              ))}
            </select>
            {toolBtn('format_bold', 'bold', undefined, 'Negrito')}
            {toolBtn('format_italic', 'italic', undefined, 'Itálico')}
            {toolBtn('format_underlined', 'underline', undefined, 'Sublinhado')}
            {toolBtn('format_strikethrough', 'strikeThrough', undefined, 'Tachado')}
            <div style={{ width: 1, height: 28, background: 'var(--border)', margin: '0 4px', alignSelf: 'center' }} />
            {toolBtn('format_align_left', 'justifyLeft', undefined, 'Alinhar esquerda')}
            {toolBtn('format_align_center', 'justifyCenter', undefined, 'Centralizar')}
            {toolBtn('format_align_right', 'justifyRight', undefined, 'Alinhar direita')}
            {toolBtn('format_align_justify', 'justifyFull', undefined, 'Justificar')}
            <div style={{ width: 1, height: 28, background: 'var(--border)', margin: '0 4px', alignSelf: 'center' }} />
            {toolBtn('format_list_bulleted', 'insertUnorderedList', undefined, 'Lista')}
            {toolBtn('format_list_numbered', 'insertOrderedList', undefined, 'Lista numerada')}
            <div style={{ width: 1, height: 28, background: 'var(--border)', margin: '0 4px', alignSelf: 'center' }} />
            {/* Table insert button */}
            <div style={{ position: 'relative' }}>
              <button title="Inserir tabela" onClick={() => setShowTablePicker(!showTablePicker)} style={{
                width: 36, height: 36, borderRadius: 8, border: showTablePicker ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: showTablePicker ? 'rgba(230,0,126,0.06)' : 'var(--bg)', color: 'var(--text-main)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', transition: 'all 0.15s',
              }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(230,0,126,0.06)'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
                 onMouseLeave={e => { if (!showTablePicker) { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.borderColor = 'var(--border)'; } }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>table</span>
              </button>
              {showTablePicker && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: 4, background: 'var(--card-bg)',
                  border: '1px solid var(--border)', borderRadius: 12, padding: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100,
                }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textAlign: 'center' }}>
                    {tableHover[0] > 0 ? `${tableHover[0]} × ${tableHover[1]}` : 'Selecione o tamanho'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 28px)', gap: 3 }}>
                    {Array.from({ length: 25 }, (_, i) => {
                      const r = Math.floor(i / 5) + 1;
                      const c = (i % 5) + 1;
                      const active = r <= tableHover[0] && c <= tableHover[1];
                      return (
                        <div key={i}
                          onMouseEnter={() => setTableHover([r, c])}
                          onMouseLeave={() => setTableHover([0, 0])}
                          onClick={() => insertTable(r, c)}
                          style={{
                            width: 28, height: 28, borderRadius: 4, cursor: 'pointer', transition: 'all 0.1s',
                            border: active ? '2px solid var(--primary)' : '1px solid var(--border)',
                            background: active ? 'rgba(230,0,126,0.1)' : 'var(--bg)',
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div style={{ width: 1, height: 28, background: 'var(--border)', margin: '0 4px', alignSelf: 'center' }} />
            <select onChange={e => { if (e.target.value) execCmd('formatBlock', e.target.value); e.target.value = ''; }} style={{
              padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text-main)', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
            }}>
              <option value="">Título</option>
              <option value="h1">Título 1</option>
              <option value="h2">Título 2</option>
              <option value="h3">Título 3</option>
              <option value="p">Parágrafo</option>
            </select>
            <select value={curSize} onChange={e => {
              if (e.target.value) {
                const ptVal = e.target.value;
                const pxVal = Math.round(parseInt(ptVal) * 1.333);
                document.execCommand('fontSize', false, '7');
                // Replace the font size=7 elements with actual px size
                const editor = editorRef.current;
                if (editor) {
                  const fontEls = editor.querySelectorAll('font[size="7"]');
                  fontEls.forEach((el: Element) => {
                    (el as HTMLElement).removeAttribute('size');
                    (el as HTMLElement).style.fontSize = pxVal + 'px';
                  });
                }
                updateFormattingState();
              }
            }} style={{
              padding: '6px 10px', borderRadius: 8, border: curSize ? '2px solid var(--primary)' : '1px solid var(--border)', background: curSize ? 'rgba(230,0,126,0.05)' : 'var(--bg)',
              color: 'var(--text-main)', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', minWidth: 70,
            }}>
              <option value="">Tamanho</option>
              {[8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72].map(pt => (
                <option key={pt} value={String(pt)}>{pt}</option>
              ))}
            </select>
            <div style={{ width: 1, height: 28, background: 'var(--border)', margin: '0 4px', alignSelf: 'center' }} />
            {/* Variables button */}
            <button onClick={() => setShowVars(!showVars)} style={{
              padding: '6px 14px', borderRadius: 8, border: '2px solid var(--primary)',
              background: showVars ? 'rgba(230,0,126,0.08)' : 'var(--bg)',
              color: 'var(--primary)', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>data_object</span>
              Variáveis
            </button>
          </div>
          )}

          {/* Variables Panel */}
          {showVars && !editingTemplate?.fileBase64 && (
            <div style={{
              background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 12,
              maxHeight: 250, overflowY: 'auto',
            }}>
              {VAR_GROUPS.map(group => (
                <div key={group} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{group}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {VARIABLES.filter(v => v.group === group).map(v => (
                      <button key={v.key} onClick={() => TABLE_VARIABLES[v.key] ? insertTableVariable(v.key) : insertVariable(v.key)} style={{
                        padding: '5px 10px', borderRadius: 6,
                        border: TABLE_VARIABLES[v.key] ? '1px solid rgba(139,92,246,0.2)' : '1px solid rgba(230,0,126,0.15)',
                        background: TABLE_VARIABLES[v.key] ? 'rgba(139,92,246,0.06)' : 'rgba(230,0,126,0.04)',
                        color: TABLE_VARIABLES[v.key] ? '#8b5cf6' : 'var(--primary)', fontWeight: 700,
                        fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                      }} onMouseEnter={e => e.currentTarget.style.background = TABLE_VARIABLES[v.key] ? 'rgba(139,92,246,0.12)' : 'rgba(230,0,126,0.1)'}
                         onMouseLeave={e => e.currentTarget.style.background = TABLE_VARIABLES[v.key] ? 'rgba(139,92,246,0.06)' : 'rgba(230,0,126,0.04)'}>
                        {TABLE_VARIABLES[v.key] ? `📊 {{${v.key}}}` : `{{${v.key}}}`}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Content: DOCX Preview for native templates, ContentEditable for HTML templates */}
          {editingTemplate?.fileBase64 ? (
            <div ref={docxPreviewRef} style={{
              minHeight: 450, border: '2px solid var(--border)', borderRadius: 14,
              background: '#fff', overflow: 'auto', padding: 0,
            }} />
          ) : (
            <div ref={editorRef} contentEditable suppressContentEditableWarning
              style={{
                minHeight: 450, padding: '20px 24px', border: '2px solid var(--border)', borderRadius: 14,
                outline: 'none', lineHeight: 1.4, fontSize: '0.95rem', color: 'var(--text-main)',
                background: 'var(--bg)', overflowY: 'auto',
              }}
              onFocus={e => { (e.target as HTMLElement).style.borderColor = 'var(--primary)'; (e.target as HTMLElement).style.boxShadow = '0 0 0 4px rgba(230,0,126,0.08)'; }}
              onBlur={e => { (e.target as HTMLElement).style.borderColor = 'var(--border)'; (e.target as HTMLElement).style.boxShadow = 'none'; }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  document.execCommand('insertLineBreak');
                }
              }}
            />
          )}

          {/* Save */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={saveTemplate} style={{ ...btnPrimary, padding: '14px 32px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>save</span> Salvar Modelo
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── List View (default) ── */
  return (
    <div style={{ padding: '20px 0' }}>
      {/* Hero */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 30, color: 'var(--primary)' }}>gavel</span>
          Termos e Contratos
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
          Gerencie modelos de documentos, gere contratos e termos com preenchimento automático
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Modelos', value: String(templates.length), icon: 'description', color: '#6366f1' },
          { label: 'Ativos', value: String(activeCount), icon: 'check_circle', color: '#10b981' },
          { label: 'Inativos', value: String(templates.length - activeCount), icon: 'cancel', color: '#ef4444' },
          { label: 'Docs Gerados', value: String(generated.length), icon: 'history', color: '#f59e0b' },
        ].map((kpi, i) => (
          <div key={i} onClick={kpi.label === 'Docs Gerados' ? () => { setView('history'); fetchHistory(''); } : undefined} style={{
            ...cardS, padding: 16, position: 'relative', overflow: 'hidden', transition: 'all 0.2s',
            cursor: kpi.label === 'Docs Gerados' ? 'pointer' : 'default',
          }} onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'}
             onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${kpi.color},${kpi.color}66)` }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{kpi.label}</span>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: `${kpi.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: kpi.color }}>{kpi.icon}</span>
              </div>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Actions bar */}
      <div style={{ ...cardS, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, flex: 1, minWidth: 200, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 350 }}>
            <span className="material-symbols-outlined" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 20, color: 'var(--text-muted)' }}>search</span>
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar modelo..." style={{ ...inputS, paddingLeft: 42 }} />
          </div>
          <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }} style={{ ...inputS, width: 'auto', minWidth: 180 }}>
            <option value="all">Todos os tipos</option>
            {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value as any); setPage(1); }} style={{ ...inputS, width: 'auto', minWidth: 130 }}>
            <option value="all">Todos</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input ref={fileInputRef} type="file" accept=".docx,.html,.htm,.pdf" style={{ display: 'none' }} onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const now = new Date().toISOString();
            const fileName = file.name.replace(/\.[^.]+$/, '');
            let htmlContent = '';
            let fileBase64: string | undefined = undefined;
            let backgroundPdf: string | undefined = undefined;
            let backgroundPdfName: string | undefined = undefined;
            try {
              if (file.name.toLowerCase().endsWith('.pdf')) {
                // PDF background template
                const arrayBuffer = await file.arrayBuffer();
                const bytes = new Uint8Array(arrayBuffer);
                let binary = '';
                for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                backgroundPdf = btoa(binary);
                backgroundPdfName = file.name;
                htmlContent = '<p style="text-align:center;color:#666;padding:40px">Este modelo usa um PDF de fundo. O texto do contrato será escrito por cima do design.</p>';
              } else if (file.name.endsWith('.docx')) {
                // Read file as base64 for serverless-compatible storage
                const arrayBuffer = await file.arrayBuffer();
                const bytes = new Uint8Array(arrayBuffer);
                let binary = '';
                for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                fileBase64 = btoa(binary);
                
                // Use mammoth for a visual preview in the editor
                try {
                  const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer.slice(0) });
                  htmlContent = result.value || '<p style="text-align:center;color:#666;padding:40px">Preview indisponível. O arquivo original será usado na geração.</p>';
                } catch {
                  htmlContent = '<p style="text-align:center;color:#666;padding:40px">Preview indisponível. O arquivo original será usado na geração do DOCX.</p>';
                }
              } else {
                htmlContent = await file.text();
              }
              const newTpl: DocTemplate = { 
                id: Date.now(), 
                name: fileName, 
                type: 'Contrato de prestação de serviço', 
                content: htmlContent, 
                fileBase64,
                fileName: fileBase64 ? file.name : undefined,
                backgroundPdf,
                backgroundPdfName,
                active: true, 
                createdAt: now, 
                updatedAt: now 
              };
              saveTemplates([...templates, newTpl]);
              alert(`✅ Modelo "${fileName}" importado com sucesso!`);
            } catch (err) {
              console.error('Erro ao importar arquivo:', err);
              alert('❌ Erro ao importar o arquivo. Verifique se o formato é válido (.docx ou .html).');
            }
            if (fileInputRef.current) fileInputRef.current.value = '';
          }} />
          <button onClick={() => fileInputRef.current?.click()} style={{ ...btnPrimary, padding: '12px 20px', background: 'linear-gradient(135deg,#3b82f6,#60a5fa)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>upload_file</span> Importar do Computador
          </button>
          <button onClick={() => {
            const now = new Date().toISOString();
            const newTpl: DocTemplate = { id: Date.now(), name: 'Contrato de Prestação de Serviços', type: 'Contrato de prestação de serviço', content: DEFAULT_CONTRACT_HTML, active: true, createdAt: now, updatedAt: now };
            saveTemplates([...templates, newTpl]);
          }} style={{ ...btnPrimary, padding: '12px 20px', background: 'linear-gradient(135deg,#8b5cf6,#a78bfa)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span> Importar Modelo Pronto
          </button>
          <button onClick={() => openGenerator()} style={{ ...btnPrimary, padding: '12px 20px', background: 'linear-gradient(135deg,#10b981,#34d399)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>auto_awesome</span> Gerar Doc
          </button>
          <button onClick={openNewEditor} style={{ ...btnPrimary, padding: '12px 20px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span> Novo Modelo
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ ...cardS, padding: 0, overflow: 'visible' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-muted)', marginBottom: 12, display: 'block' }}>article</span>
            <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-muted)' }}>Nenhum modelo encontrado</p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Clique em &quot;Novo Modelo&quot; para criar seu primeiro</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 80px 1fr 1fr 100px', padding: '14px 24px', borderBottom: '2px solid var(--border)', fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <div>Nome</div>
              <div>Tipo</div>
              <div style={{ textAlign: 'center' }}>Status</div>
              <div>Criado</div>
              <div>Atualizado</div>
              <div style={{ textAlign: 'center' }}>Ações</div>
            </div>
            {/* Rows */}
            {paginated.map(tpl => (
              <div key={tpl.id} style={{
                display: 'grid', gridTemplateColumns: '2fr 1.5fr 80px 1fr 1fr 100px', padding: '16px 24px',
                borderBottom: '1px solid var(--border)', alignItems: 'center', transition: 'background 0.15s',
              }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(230,0,126,0.015)'}
                 onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{tpl.name}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{tpl.type}</div>
                <div style={{ textAlign: 'center' }}>
                  <div onClick={() => toggleActive(tpl.id)} style={{
                    width: 44, height: 24, borderRadius: 12, cursor: 'pointer', transition: 'all 0.3s',
                    background: tpl.active ? '#10b981' : 'var(--border)', position: 'relative', margin: '0 auto',
                  }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute',
                      top: 3, left: tpl.active ? 23 : 3, transition: 'left 0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                    }} />
                  </div>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{new Date(tpl.createdAt).toLocaleDateString('pt-BR')}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{new Date(tpl.updatedAt).toLocaleDateString('pt-BR')}</div>
                <div style={{ textAlign: 'center', position: 'relative' }}>
                  <button onClick={() => setMenuOpen(menuOpen === tpl.id ? null : tpl.id)} style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: 'var(--text-muted)',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>more_vert</span>
                  </button>
                  {menuOpen === tpl.id && (
                    <div style={{
                      position: 'absolute', right: 0, bottom: '100%', background: 'var(--card-bg)', border: '1px solid var(--border)',
                      borderRadius: 14, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', padding: 6, zIndex: 9999, minWidth: 170,
                    }}>
                      {[
                        { icon: 'edit', label: 'Editar', action: () => { openEditTemplate(tpl); setMenuOpen(null); } },
                        { icon: 'content_copy', label: 'Duplicar', action: () => { duplicateTemplate(tpl); setMenuOpen(null); } },
                        { icon: 'auto_awesome', label: 'Gerar Doc', action: () => { openGenerator(tpl); setMenuOpen(null); } },
                        { icon: 'delete', label: 'Excluir', action: () => { deleteTemplate(tpl.id); setMenuOpen(null); }, danger: true },
                      ].map((act, i) => (
                        <button key={i} onClick={act.action} style={{
                          display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', borderRadius: 10,
                          border: 'none', background: 'transparent', color: (act as any).danger ? '#ef4444' : 'var(--text-main)',
                          fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                        }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                           onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{act.icon}</span> {act.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {/* Pagination */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>{filtered.length} modelo(s)</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {Array.from({ length: totalPages }, (_, i) => (
                  <button key={i} onClick={() => setPage(i + 1)} style={{
                    width: 36, height: 36, borderRadius: 10, border: page === i + 1 ? '2px solid var(--primary)' : '1px solid var(--border)',
                    background: page === i + 1 ? 'rgba(230,0,126,0.08)' : 'var(--bg)', color: page === i + 1 ? 'var(--primary)' : 'var(--text-muted)',
                    fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
                  }}>{i + 1}</button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Click outside to close menus */}
      {menuOpen !== null && <div onClick={() => setMenuOpen(null)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />}
    </div>
  );
}
