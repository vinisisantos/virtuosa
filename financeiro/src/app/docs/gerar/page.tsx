'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { useGlobalUnit } from '@/contexts/UnitContext';
import { toast } from '@/components/toast';
import { valorPorExtenso } from '@/lib/valor-extenso';
import { downloadDocumentBlob, generateDocxPreviewPdf } from '@/lib/docx-preview-pdf';
import {
  base64DocumentBlob,
  documentBlobBase64,
  editableContractParagraphs,
  readContractMargins,
  updateContractMarginGuides,
  updateContractMargins,
  updateContractParagraphs,
  type EditableContractParagraph,
  type ContractMargins,
} from '@/lib/docx-contract-editor';
import {
  historicalTemplateChanged,
  loadHistoricalTemplate,
  renderContractDocx,
  type ContractTemplateSource,
} from '@/lib/docx-contract-render';
import { prepararCamposContrato } from '@/lib/contratos/prepararCamposContrato';
import {
  MODELO_CONTRATO_SBC_VALIDADO,
  validarLayoutContrato,
  validarPartesProtegidasContrato,
} from '@/lib/contratos/validarLayoutContrato';

interface DocField { tag: string; label: string; type: string; required: boolean; }
interface Template { id: string; name: string; category: string; fileType?: string; fields: DocField[]; }
interface GeneratedSnapshot { templateId: string; templateName: string; filledData: Record<string, string>; unit: string; }
interface HistoricalDocument extends GeneratedSnapshot { id: string; createdAt: string; fileData: string | null; error?: string; }

const MASKS: Record<string, (v: string) => string> = {
  cpf: (v) => v.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2').slice(0, 14),
  cnpj: (v) => v.replace(/\D/g, '').replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2').slice(0, 18),
  phone: (v) => v.replace(/\D/g, '').replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2').slice(0, 15),
  cep: (v) => v.replace(/\D/g, '').replace(/(\d{5})(\d)/, '$1-$2').slice(0, 9),
  currency: (v) => {
    const digits = v.replace(/\D/g, '');
    if (!digits) return '';
    return (parseInt(digits, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },
  date: (v) => v.replace(/\D/g, '').replace(/(\d{2})(\d)/, '$1/$2').replace(/(\d{2})(\d)/, '$1/$2').slice(0, 10),
  day: (v) => {
    const n = parseInt(v.replace(/\D/g, ''), 10);
    if (isNaN(n) || n < 1) return '';
    return String(Math.min(n, 31));
  },
};

function add12Months(dateStr: string): string {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return '';
  const [d, m, y] = parts.map(Number);
  const date = new Date(y, m - 1 + 12, d);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

export default function DocGerarPage() {
  const { globalUnit } = useGlobalUnit();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<'form' | 'edit' | 'preview'>('form');
  const [generatedBlob, setGeneratedBlob] = useState<Blob | null>(null);
  const [generatedSnapshot, setGeneratedSnapshot] = useState<GeneratedSnapshot | null>(null);
  const [paragraphs, setParagraphs] = useState<EditableContractParagraph[]>([]);
  const [paragraphChanges, setParagraphChanges] = useState<Record<number, string>>({});
  const [contractMargins, setContractMargins] = useState<ContractMargins | null>(null);
  const [marginDraft, setMarginDraft] = useState<ContractMargins | null>(null);
  const [applyingChanges, setApplyingChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedDocumentId, setSavedDocumentId] = useState<string | null>(null);
  const [openedFromHistory, setOpenedFromHistory] = useState(false);
  const [reconstructedFromHistory, setReconstructedFromHistory] = useState(false);
  const [legacySourceChanged, setLegacySourceChanged] = useState(false);
  const [legacyPending, setLegacyPending] = useState<{ document: HistoricalDocument; template: ContractTemplateSource } | null>(null);
  const [paragraphSearch, setParagraphSearch] = useState('');
  const [previewReady, setPreviewReady] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [layoutError, setLayoutError] = useState('');
  const [downloading, setDownloading] = useState<'pdf' | 'docx' | null>(null);
  const downloadLock = useRef(false);
  const saveLock = useRef(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const openHistoricalDocument = useCallback(async (
    saved: HistoricalDocument,
    blob: Blob,
    reconstructed: boolean,
    modelChanged: boolean,
    isCancelled: () => boolean = () => false,
  ) => {
    const editable = await editableContractParagraphs(blob);
    const margins = await readContractMargins(blob);
    if (isCancelled()) return;
    setGeneratedBlob(blob);
    setGeneratedSnapshot({
      templateId: saved.templateId,
      templateName: saved.templateName,
      filledData: saved.filledData,
      unit: saved.unit,
    });
    setParagraphs(editable);
    setParagraphChanges({});
    setContractMargins(margins);
    setMarginDraft(margins);
    setSelectedTemplate(saved.templateId);
    setSavedDocumentId(reconstructed ? null : saved.id);
    setOpenedFromHistory(true);
    setReconstructedFromHistory(reconstructed);
    setLegacySourceChanged(modelChanged);
    setLegacyPending(null);
    setPreviewReady(false);
    setStep('preview');
  }, []);

  useEffect(() => {
    if ((step !== 'preview' && step !== 'edit') || !generatedBlob || !previewRef.current) return;
    let cancelled = false;
    const container = previewRef.current;
    container.replaceChildren();
    setPreviewReady(false);
    setPreviewError('');
    void (async () => {
      try {
        const [docxPreview, bytes] = await Promise.all([import('docx-preview'), generatedBlob.arrayBuffer()]);
        if (cancelled) return;
        await docxPreview.renderAsync(bytes, container, undefined, {
          className: 'docx-preview-wrapper', inWrapper: true,
          ignoreWidth: false, ignoreHeight: false, ignoreFonts: false,
          breakPages: true, ignoreLastRenderedPageBreak: false, experimental: true,
          renderHeaders: true, renderFooters: true, renderFootnotes: true,
          // Embedded VML/SVG images cannot resolve blob URLs when rasterized by html2canvas.
          useBase64URL: true,
        });
        if (!cancelled) setPreviewReady(true);
      } catch (error) {
        console.error('Erro ao renderizar documento', error);
        if (!cancelled) setPreviewError('Não foi possível carregar a prévia. Volte e gere novamente; os dados preenchidos foram mantidos. Você também pode baixar o DOCX.');
      }
    })();
    return () => { cancelled = true; };
  }, [generatedBlob, step]);

  useEffect(() => {
    updateContractMarginGuides(previewRef.current, step === 'edit' ? marginDraft : null);
  }, [step, marginDraft, previewReady]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/docs/templates?unit=${globalUnit}`, { cache: 'no-store' });
        if (res.ok) setTemplates(await res.json());
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [globalUnit]);

  useEffect(() => {
    const documentId = new URLSearchParams(window.location.search).get('documentId');
    if (!documentId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/docs/generated/${encodeURIComponent(documentId)}`, { cache: 'no-store' });
        const saved = await response.json() as HistoricalDocument;
        if (!response.ok) throw new Error(saved.error || 'Não foi possível abrir o documento.');
        if (saved.fileData) {
          await openHistoricalDocument(saved, base64DocumentBlob(saved.fileData), false, false, () => cancelled);
          return;
        }
        const template = await loadHistoricalTemplate(saved);
        if (cancelled) return;
        if (historicalTemplateChanged(saved, template)) {
          setLegacyPending({ document: saved, template });
          return;
        }
        const blob = await renderContractDocx(template.fileData, saved.filledData, saved.templateId);
        await openHistoricalDocument(saved, blob, true, false, () => cancelled);
      } catch (error) {
        if (!cancelled) toast(error instanceof Error ? error.message : 'Não foi possível abrir o documento.', 'error');
      }
    })();
    return () => { cancelled = true; };
  }, [openHistoricalDocument]);

  const confirmLegacyReconstruction = async () => {
    if (!legacyPending || generating) return;
    setGenerating(true);
    try {
      setLayoutError('');
      const { document, template } = legacyPending;
      const blob = await renderContractDocx(template.fileData, document.filledData, document.templateId);
      await openHistoricalDocument(document, blob, true, true);
    } catch (error) {
      setLayoutError(error instanceof Error ? error.message : 'Não foi possível reconstruir o contrato.');
    } finally {
      setGenerating(false);
    }
  };

  const currentTemplate = useMemo(() => {
    const tpl = templates.find(t => t.id === selectedTemplate);
    if (!tpl) return undefined;
    return {
      ...tpl,
      fields: tpl.fields.map(f => {
        const t = f.tag.toLowerCase();
        if (t.includes('tipo') && t.includes('documento') && f.type !== 'doc_type_selector') {
          return { ...f, type: 'doc_type_selector' };
        }
        if ((t.includes('fim') || t.includes('final')) && t.includes('contrato') && f.type !== 'auto_end_date') {
          return { ...f, type: 'auto_end_date' };
        }
        return f;
      })
    };
  }, [templates, selectedTemplate]);

  const startDateTag = useMemo(() => {
    if (!currentTemplate) return null;
    return currentTemplate.fields.find(f =>
      f.tag.toLowerCase().includes('contratacao') || f.tag.toLowerCase().includes('inicio')
    )?.tag || null;
  }, [currentTemplate]);

  useEffect(() => {
    if (!currentTemplate || !startDateTag) return;
    const startDate = formData[startDateTag];
    if (startDate && startDate.length === 10) {
      const endDateField = currentTemplate.fields.find(f => f.type === 'auto_end_date');
      if (endDateField) {
        const endDate = add12Months(startDate);
        if (endDate) setFormData(prev => ({ ...prev, [endDateField.tag]: endDate }));
      }
    }
  }, [formData[startDateTag || ''], currentTemplate, startDateTag]);

const CLINIC_DETAILS: Record<string, Record<string, string>> = {
  SBC: {
    razao_social_contratante: 'CLINICA DE ESTETICA SBC LTDA',
    cnpj_contratante: '55.176.726/0001-71',
    endereco_contratante: 'Av. das Nações Unidas',
    numero: '30',
    cidade: 'São Bernardo do Campo',
    uf: 'SP',
    cep: '09726-110',
  },
  Osasco: {
    razao_social_contratante: 'LRGUI CLINICA DE ESTETICA LTDA',
    cnpj_contratante: '51.590.266/0001-72',
    endereco_contratante: 'Rua Eloy Candido Lopes',
    numero: '61',
    cidade: 'Osasco',
    uf: 'SP',
    cep: '06010-130',
  },
  SCS: {
    razao_social_contratante: 'CLINICA DE ESTETICA ALMEIDA RIBEIRO LTDA',
    cnpj_contratante: '63.246.385/0001-91',
    endereco_contratante: 'Av. Vital Brasil Filho',
    numero: '143',
    cidade: 'São Caetano do Sul',
    uf: 'SP',
    cep: '09541-130',
  },
  Barueri: {
    razao_social_contratante: 'CLINICA DE ESTETICA FACIAL E CORPORAL LTDA',
    cnpj_contratante: '63.676.273/0001-70',
    endereco_contratante: 'Av. Vinte e Seis de Março',
    numero: '701',
    cidade: 'Barueri',
    uf: 'SP',
    cep: '06401-050',
  }
};

  useEffect(() => {
    if (!currentTemplate || !globalUnit) return;
    const details = CLINIC_DETAILS[globalUnit];
    if (!details) return;

    setFormData(prev => {
      const next = { ...prev };
      let changed = false;
      currentTemplate.fields.forEach(f => {
        const tag = f.tag.toLowerCase().trim().replace(/_/g, ' ');
        let val = undefined;
        if (tag.includes('razao social') || tag.includes('razão social') || tag.includes('nome da clinica') || tag.includes('nome clinica')) {
          val = details.razao_social_contratante || '';
        } else if (tag.includes('cnpj contratante') || tag === 'cnpj' || tag === 'cnpj clinica' || tag === 'cnpj_clinica') {
          val = details.cnpj_contratante || '';
        } else if (tag.includes('endereco contratante') || tag.includes('endereço contratante') || tag.includes('endereco clinica') || tag.includes('endereço clinica')) {
          val = details.endereco_contratante || '';
        } else if (tag === 'numero' || tag === 'número') {
          val = details.numero || '';
        } else if (tag === 'cidade') {
          val = details.cidade || '';
        } else if (tag === 'uf' || tag === 'estado') {
          val = details.uf || '';
        } else if (tag === 'cep') {
          val = details.cep || '';
        }
        if (val !== undefined && next[f.tag] !== val) {
          next[f.tag] = val;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [globalUnit, currentTemplate]);

  const handleTemplateChange = useCallback((id: string) => {
    setSelectedTemplate(id);
    setFormData({});
    setGeneratedBlob(null);
    setGeneratedSnapshot(null);
    setParagraphs([]);
    setParagraphChanges({});
    setSavedDocumentId(null);
    setOpenedFromHistory(false);
    setReconstructedFromHistory(false);
    setLegacySourceChanged(false);
    setLegacyPending(null);
    setLayoutError('');
    setStep('form');
  }, []);

  const handleFieldChange = useCallback((tag: string, value: string, type: string) => {
    const mask = MASKS[type];
    setFormData(prev => ({ ...prev, [tag]: mask ? mask(value) : value }));
  }, []);

  const buildFilledValues = useCallback(() => {
    if (!currentTemplate) return {};
    const filledValues: Record<string, string> = {};
    for (const field of currentTemplate.fields) {
      const rawValue = formData[field.tag] || '';
      if (field.type === 'currency' && rawValue) {
        const extenso = valorPorExtenso(rawValue);
        filledValues[field.tag] = `R$ ${rawValue} (${extenso})`;
      } else {
        filledValues[field.tag] = rawValue;
      }
    }
    return filledValues;
  }, [currentTemplate, formData]);

  const handleGenerate = async () => {
    if (!currentTemplate) return;
    setGenerating(true);
    try {
      setLayoutError('');
      const rawValues = buildFilledValues();
      const protectedModel = currentTemplate.id === MODELO_CONTRATO_SBC_VALIDADO;
      const filledValues = protectedModel
        ? prepararCamposContrato(currentTemplate.fields, rawValues)
        : rawValues;

      const tplRes = await fetch(`/api/docs/templates/${currentTemplate.id}`, { cache: 'no-store' });
      if (!tplRes.ok) { toast('Erro ao carregar template', 'error'); return; }
      const tpl = await tplRes.json();

      const blob = await renderContractDocx(tpl.fileData, filledValues, currentTemplate.id);
      const editable = await editableContractParagraphs(blob);
      const margins = await readContractMargins(blob);
      setGeneratedBlob(blob);
      setGeneratedSnapshot({ templateId: currentTemplate.id, templateName: currentTemplate.name, filledData: filledValues, unit: globalUnit });
      setParagraphs(editable);
      setParagraphChanges({});
      setContractMargins(margins);
      setMarginDraft(margins);
      setSavedDocumentId(null);
      setOpenedFromHistory(false);
      setReconstructedFromHistory(false);
      setLegacySourceChanged(false);
      setPreviewReady(false);
      setPreviewError('');
      setStep('preview');
    } catch (e) {
      console.error(e);
      setLayoutError(e instanceof Error ? e.message : 'Erro ao gerar documento.');
      toast('Não foi possível gerar o contrato. Confira o motivo indicado na tela.', 'error');
    } finally { setGenerating(false); }
  };

  const handleApplyChanges = async () => {
    if (!generatedBlob || applyingChanges) return;
    setApplyingChanges(true);
    try {
      setLayoutError('');
      const marginsChanged = !!marginDraft && !!contractMargins &&
        (['top', 'bottom', 'left', 'right'] as const).some(key => marginDraft[key] !== contractMargins[key]);
      let updated = await updateContractParagraphs(generatedBlob, paragraphChanges);
      if (marginsChanged && marginDraft) updated = await updateContractMargins(updated, marginDraft);
      if (generatedSnapshot?.templateId === MODELO_CONTRATO_SBC_VALIDADO) {
        const [before, after] = await Promise.all([generatedBlob.arrayBuffer(), updated.arrayBuffer()]);
        await validarLayoutContrato(after);
        await validarPartesProtegidasContrato(before, after);
      }
      setGeneratedBlob(updated);
      setParagraphs(await editableContractParagraphs(updated));
      if (marginsChanged && marginDraft) setContractMargins(marginDraft);
      if (Object.keys(paragraphChanges).length || marginsChanged) setSavedDocumentId(null);
      setParagraphChanges({});
      setPreviewReady(false);
      setStep('preview');
    } catch (error) {
      setLayoutError(error instanceof Error ? error.message : 'Não foi possível aplicar as edições.');
      toast('Edição bloqueada. Confira o motivo indicado na tela.', 'error');
    } finally {
      setApplyingChanges(false);
    }
  };

  const saveDocument = async (): Promise<string | null> => {
    if (savedDocumentId) return savedDocumentId;
    if (saveLock.current || !generatedBlob || !generatedSnapshot) return null;
    saveLock.current = true;
    setSaving(true);
    try {
      setLayoutError('');
      if (generatedSnapshot.templateId === MODELO_CONTRATO_SBC_VALIDADO) {
        await validarLayoutContrato(await generatedBlob.arrayBuffer());
      }
      const fileData = await documentBlobBase64(generatedBlob);
      const response = await fetch('/api/docs/generated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...generatedSnapshot, fileData }),
      });
      const saved = await response.json();
      if (!response.ok) throw new Error(saved.error || 'Não foi possível salvar o contrato.');
      setSavedDocumentId(saved.id);
      setReconstructedFromHistory(false);
      setLegacySourceChanged(false);
      toast('Contrato salvo no histórico. Você pode reabri-lo e baixar o arquivo.', 'success');
      return saved.id;
    } catch (error) {
      setLayoutError(error instanceof Error ? error.message : 'Não foi possível salvar no histórico.');
      toast(`Não foi possível salvar no histórico: ${error instanceof Error ? error.message : 'tente novamente.'}`, 'error');
      return null;
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const handleDownload = async (format: 'pdf' | 'docx') => {
    if (downloadLock.current || !generatedBlob || !generatedSnapshot) return;
    const protectedModel = generatedSnapshot.templateId === MODELO_CONTRATO_SBC_VALIDADO;
    if (format === 'pdf' && (!previewReady || !previewRef.current)) return;
    downloadLock.current = true;
    setDownloading(format);
    try {
      setLayoutError('');
      if (protectedModel) {
        await validarLayoutContrato(await generatedBlob.arrayBuffer());
      }
      const blob = format === 'pdf'
        ? await generateDocxPreviewPdf(previewRef.current!)
        : generatedBlob;
      const dateStr = new Date().toLocaleDateString('pt-BR').replace(/\//g, '_');
      downloadDocumentBlob(blob, `${generatedSnapshot.templateName} - ${dateStr}.${format}`);
      toast(format === 'pdf' ? 'PDF baixado com sucesso!' : 'Documento baixado com sucesso!', 'success');
      // O arquivo ainda deve ser entregue quando o histórico estiver indisponível.
      if (!savedDocumentId && !reconstructedFromHistory) void saveDocument();
    } catch (error) {
      console.error('Erro ao baixar documento', error);
      setLayoutError(error instanceof Error ? error.message : 'Erro ao baixar documento.');
      toast(format === 'pdf' ? 'Erro ao gerar PDF. Os dados foram mantidos; tente novamente ou baixe o DOCX.' : 'Erro ao baixar documento. Tente novamente.', 'error');
    } finally {
      downloadLock.current = false;
      setDownloading(null);
    }
  };

  // Editable fields = all except auto_end_date
  const editableFields = currentTemplate?.fields.filter(f => f.type !== 'auto_end_date') || [];
  const allFieldsFilled = editableFields.every(f => formData[f.tag]?.trim());

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 16px', borderRadius: 12,
    border: '1px solid var(--border)', fontSize: '0.9rem',
    background: 'var(--bg)', color: 'var(--text-main)',
    fontFamily: "'Courier New', Courier, monospace", fontWeight: 600, outline: 'none',
    transition: 'border-color 0.2s',
  };

  const CATEGORIES: Record<string, { icon: string; color: string }> = {
    contrato_trabalho: { icon: 'badge', color: '#3b82f6' },
    ficha_paciente: { icon: 'clinical_notes', color: '#10b981' },
    outro: { icon: 'description', color: '#8b5cf6' },
  };

  return (
    <AuthGuard requiredPermission="termos">
      <style>{`
        .docx-preview-wrapper-wrapper { background: white !important; }
        section.docx-preview-wrapper {
          margin: 0 auto !important; 
          box-shadow: 0 2px 12px rgba(0,0,0,0.1) !important; 
          margin-bottom: 20px !important;
        }
        .doc-editor-actions { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
        .doc-editor-actions button { min-height:44px; }
        .doc-editor-textarea { width:100%; min-height:76px; resize:vertical; padding:12px; border-radius:10px; border:1px solid var(--border); background:var(--bg); color:var(--text-main); font:inherit; line-height:1.5; }
        @media (max-width: 600px) {
          .doc-editor-actions, .doc-editor-actions button { width:100%; }
          .doc-editor-toolbar { position:static !important; }
        }
      `}</style>
      <main className="dashboard-container">
        <AppHeader activePage={'doc-gerar' as any} />
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 20px', minHeight: 'calc(100vh - 70px)' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg, var(--primary), #ff4db1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(230,0,126,0.25)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#fff' }}>edit_document</span>
            </div>
            <div>
              <h1 style={{ fontSize: '1.3rem', fontWeight: 900, margin: 0 }}>Gerar Documento</h1>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {step === 'form' ? 'Preencha os campos e gere o documento' : step === 'edit' ? 'Ajuste o texto do contrato antes de salvar' : 'Confira, salve e baixe o documento'}
              </p>
            </div>
          </div>

          {layoutError && (
            <div role="alert" style={{
              marginBottom: 20, padding: '14px 16px', borderRadius: 12,
              border: '1px solid #fca5a5', background: 'rgba(239,68,68,0.08)',
              color: 'var(--text-main)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
              fontSize: '0.85rem', lineHeight: 1.5,
            }}>
              {layoutError}
            </div>
          )}

          {reconstructedFromHistory && (
            <div role="status" style={{ marginBottom: 20, padding: '14px 16px', borderRadius: 12, border: '1px solid #eab308', background: 'rgba(234,179,8,0.1)', color: 'var(--text-main)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
              Este registro antigo não guardou o arquivo DOCX. {legacySourceChanged
                ? 'O modelo mudou depois da geração: esta é uma nova versão baseada no modelo atual, não uma cópia exata do contrato original.'
                : 'O documento foi reconstruído com os dados salvos e o modelo disponível.'} Revise o conteúdo antes de usar. O registro original permanece inalterado; salve esta versão se quiser mantê-la no histórico.
            </div>
          )}

          {/* Steps indicator */}
          {currentTemplate && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {['form', 'edit', 'preview'].map((s) => (
                <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: step === s || (step === 'preview' && s === 'form') ? 'var(--primary)' : 'var(--border)', transition: 'background 0.3s' }} />
              ))}
            </div>
          )}

          {legacyPending ? (
            <div role="alert" style={{ background: 'var(--card-bg)', borderRadius: 16, border: '1px solid #eab308', padding: 24, lineHeight: 1.6, overflowWrap: 'anywhere' }}>
              <h2 style={{ fontSize: '1.1rem', margin: '0 0 8px' }}>Este contrato antigo precisa ser recriado</h2>
              <p style={{ margin: '0 0 16px' }}>O arquivo DOCX original não foi salvo e o modelo foi alterado depois da geração. Recriar com o modelo atual pode mudar cláusulas e formatação. O registro original não será substituído. Revise o resultado e salve como uma nova versão somente se estiver correto.</p>
              <div className="doc-editor-actions">
                <button type="button" onClick={() => void confirmLegacyReconstruction()} disabled={generating} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  {generating ? 'Recriando...' : 'Criar nova versão com o modelo atual'}
                </button>
                <a href="/docs/historico" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '10px 18px', borderRadius: 10, border: '1px solid var(--border)', color: 'var(--text-main)', textDecoration: 'none', fontWeight: 700 }}>Voltar ao histórico</a>
              </div>
            </div>
          ) : step === 'form' ? (
            <>
              {/* Template Selection */}
              <div style={{ background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)', padding: 24, marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>
                  Selecione o Modelo
                </label>
                {loading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><div className="spinner" /></div>
                ) : templates.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', margin: 0, textAlign: 'center', padding: '20px 0' }}>
                    Nenhum modelo cadastrado. <a href="/docs/modelos" style={{ color: 'var(--primary)', fontWeight: 700 }}>Criar modelo</a>
                  </p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                    {templates.map(t => {
                      const cat = CATEGORIES[t.category] || CATEGORIES.outro;
                      const isSelected = selectedTemplate === t.id;
                      return (
                        <button key={t.id} onClick={() => handleTemplateChange(t.id)} style={{
                          padding: '14px 16px', borderRadius: 12, textAlign: 'left',
                          border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                          background: isSelected ? 'rgba(230,0,126,0.05)' : 'transparent',
                          cursor: 'pointer', transition: 'all 0.2s',
                          display: 'flex', alignItems: 'center', gap: 10,
                        }}
                          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(0,0,0,0.02)'; }}
                          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 20, color: isSelected ? 'var(--primary)' : cat.color }}>{cat.icon}</span>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: isSelected ? 'var(--primary)' : 'var(--text-main)' }}>{t.name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.fields.length} campos</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Dynamic Form - only show editable fields (auto_end_date is hidden) */}
              {currentTemplate && (
                <div style={{ background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)', padding: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>edit_note</span>
                    <h3 style={{ fontWeight: 700, fontSize: '1.05rem', margin: 0 }}>Preencha os Dados</h3>
                    <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 600, background: 'rgba(230,0,126,0.08)', color: 'var(--primary)', padding: '3px 10px', borderRadius: 6 }}>
                      Courier New 11,5pt
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                    {editableFields.map(field => {
                      // ─── Document Type Selector (CPF / CNPJ) ───
                      if (field.type === 'doc_type_selector') {
                        return (
                          <div key={field.tag}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                              {field.label}
                            </label>
                            <div style={{ position: 'relative' }}>
                              <select
                                value={formData[field.tag] || ''}
                                onChange={(e) => {
                                  const opt = e.target.value;
                                  setFormData(prev => {
                                    const next = { ...prev, [field.tag]: opt };
                                    // Clear linked document field when switching
                                    const docField = currentTemplate?.fields.find(f =>
                                      f.tag.toLowerCase().includes('documento') && !f.tag.toLowerCase().includes('tipo')
                                    );
                                    if (docField) next[docField.tag] = '';
                                    return next;
                                  });
                                }}
                                style={{
                                  width: '100%', padding: '12px 16px', borderRadius: 12,
                                  border: '1px solid var(--border)',
                                  background: 'transparent',
                                  color: formData[field.tag] ? 'var(--text-main)' : 'var(--text-muted)',
                                  fontWeight: 500, fontSize: '0.95rem', cursor: 'pointer',
                                  fontFamily: "'Courier New', Courier, monospace",
                                  appearance: 'none',
                                }}
                              >
                                <option value="" disabled>Selecione (CPF ou CNPJ)</option>
                                <option value="CPF">CPF</option>
                                <option value="CNPJ">CNPJ</option>
                              </select>
                              <span className="material-symbols-outlined" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }}>expand_more</span>
                            </div>
                          </div>
                        );
                      }

                      // ─── Dynamic Document Field (uses selected type's mask) ───
                      const isDynamicDoc = field.tag.toLowerCase().includes('documento') && !field.tag.toLowerCase().includes('tipo');
                      const docTypeField = editableFields.find(f => f.type === 'doc_type_selector');
                      const selectedDocType = docTypeField ? (formData[docTypeField.tag] || '').toLowerCase() : '';
                      const effectiveType = isDynamicDoc && selectedDocType ? selectedDocType : field.type;
                      const effectiveMask = MASKS[effectiveType];

                      // Check if it's an auto-filled clinic field
                      const tagLower = field.tag.toLowerCase().trim().replace(/_/g, ' ');
                      const isClinicField = tagLower.includes('razao social') || tagLower.includes('razão social') || tagLower.includes('nome da clinica') || tagLower.includes('nome clinica') ||
                        tagLower.includes('cnpj contratante') || tagLower === 'cnpj' || tagLower === 'cnpj clinica' || tagLower === 'cnpj_clinica' ||
                        tagLower.includes('endereco contratante') || tagLower.includes('endereço contratante') || tagLower.includes('endereco clinica') || tagLower.includes('endereço clinica') ||
                        tagLower === 'numero' || tagLower === 'número' || tagLower === 'cidade' || tagLower === 'uf' || tagLower === 'estado' || tagLower === 'cep';

                      return (
                        <div key={field.tag}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                            {field.label}
                            {effectiveType === 'currency' && (
                              <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#10b981', background: 'rgba(16,185,129,0.08)', padding: '1px 6px', borderRadius: 4, textTransform: 'none' }}>+ por extenso</span>
                            )}
                            {effectiveType === 'day' && (
                              <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#f59e0b', background: 'rgba(245,158,11,0.08)', padding: '1px 6px', borderRadius: 4, textTransform: 'none' }}>dia (1-31)</span>
                            )}
                            {isDynamicDoc && selectedDocType && (
                              <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#3b82f6', background: 'rgba(59,130,246,0.08)', padding: '1px 6px', borderRadius: 4, textTransform: 'none' }}>
                                {selectedDocType.toUpperCase()}
                              </span>
                            )}
                            {isClinicField && (
                              <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-muted)', marginLeft: 'auto' }} title="Preenchimento Automático da Clínica">lock</span>
                            )}
                          </label>
                          <div style={{ position: 'relative' }}>
                            {effectiveType === 'currency' && (
                              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.9rem', fontFamily: "'Courier New', Courier, monospace" }}>R$</span>
                            )}
                            <input
                              type={effectiveType === 'email' ? 'email' : (effectiveType === 'day' || effectiveType === 'number') ? 'number' : 'text'}
                              min={effectiveType === 'day' ? 1 : undefined}
                              max={effectiveType === 'day' ? 31 : undefined}
                              placeholder={
                                effectiveType === 'cpf' ? '000.000.000-00' :
                                effectiveType === 'cnpj' ? '00.000.000/0000-00' :
                                effectiveType === 'date' ? 'DD/MM/AAAA' :
                                effectiveType === 'currency' ? '0,00' :
                                effectiveType === 'phone' ? '(00) 00000-0000' :
                                effectiveType === 'cep' ? '00000-000' :
                                effectiveType === 'day' ? 'Ex: 15' :
                                effectiveType === 'number' ? 'Ex: 30' :
                                `Insira ${field.label.toLowerCase()}`
                              }
                              style={{ 
                                ...inputStyle, 
                                paddingLeft: effectiveType === 'currency' ? 46 : 16,
                                background: isClinicField ? 'rgba(0,0,0,0.02)' : 'transparent',
                                color: isClinicField ? 'var(--text-muted)' : 'var(--text-main)',
                                cursor: isClinicField ? 'not-allowed' : 'text'
                              }}
                              value={formData[field.tag] || ''}
                              readOnly={isClinicField}
                              onChange={e => {
                                if (isClinicField) return;
                                const val = e.target.value;
                                const masked = effectiveMask ? effectiveMask(val) : (MASKS[field.type] ? MASKS[field.type](val) : val);
                                setFormData(prev => ({ ...prev, [field.tag]: masked }));
                              }}
                              onFocus={e => { if (!isClinicField) e.target.style.borderColor = 'var(--primary)' }}
                              onBlur={e => { if (!isClinicField) e.target.style.borderColor = 'var(--border)' }}
                            />
                          </div>
                          {effectiveType === 'currency' && formData[field.tag] && (
                            <div style={{ marginTop: 6, fontSize: '0.78rem', color: '#10b981', fontFamily: "'Courier New', Courier, monospace" }}>
                              → R$ {formData[field.tag]} <strong>({valorPorExtenso(formData[field.tag])})</strong>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Auto end date info */}
                  {currentTemplate.fields.some(f => f.type === 'auto_end_date') && (
                    <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(99,102,241,0.05)', borderRadius: 10, border: '1px solid rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#6366f1' }}>auto_fix_high</span>
                      <span style={{ fontSize: '0.82rem', color: '#6366f1', fontWeight: 600 }}>
                        Data final do contrato será calculada automaticamente (+12 meses)
                        {formData[currentTemplate.fields.find(f => f.type === 'auto_end_date')?.tag || ''] && (
                          <> → <strong>{formData[currentTemplate.fields.find(f => f.type === 'auto_end_date')?.tag || '']}</strong></>
                        )}
                      </span>
                    </div>
                  )}

                  {/* Output Format + Generate */}
                  <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {Object.keys(formData).filter(k => formData[k]?.trim()).length} / {editableFields.length} campos preenchidos
                      </span>
                      <button onClick={handleGenerate} disabled={generating || !allFieldsFilled} style={{
                        padding: '12px 28px', borderRadius: 12, border: 'none',
                        background: allFieldsFilled ? 'linear-gradient(135deg, var(--primary), #ff4db1)' : 'var(--border)',
                        color: '#fff', fontWeight: 700, cursor: allFieldsFilled ? 'pointer' : 'not-allowed',
                        fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8,
                        boxShadow: allFieldsFilled ? '0 4px 12px rgba(230,0,126,0.25)' : 'none',
                        opacity: generating ? 0.6 : 1,
                      }}>
                        {generating ? (
                          <><div className="spinner" style={{ width: 18, height: 18 }} /> Gerando preview...</>
                        ) : (
                          <><span className="material-symbols-outlined" style={{ fontSize: 20 }}>visibility</span> Gerar Preview</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : step === 'edit' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="doc-editor-toolbar" style={{ position: 'sticky', top: 70, zIndex: 10, padding: 18, borderRadius: 14, background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong>Editar contrato e margens</strong>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Edite os parágrafos e ajuste as margens. A linha magenta indica a área útil; um parágrafo alterado usa o estilo do primeiro trecho.</p>
                  </div>
                  <div className="doc-editor-actions">
                    <button onClick={() => { setParagraphChanges({}); setStep('preview'); }} disabled={applyingChanges} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
                    <button onClick={handleApplyChanges} disabled={applyingChanges} style={{ padding: '10px 18px', borderRadius: 10, border: 0, background: 'var(--primary)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                      {applyingChanges ? 'Aplicando...' : `Aplicar e conferir${Object.keys(paragraphChanges).length ? ` (${Object.keys(paragraphChanges).length})` : ''}`}
                    </button>
                  </div>
                </div>
              </div>
              {marginDraft && (
                <section style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px clamp(14px, 4vw, 24px)' }}>
                  <h2 style={{ fontSize: '1rem', margin: '0 0 12px' }}>Margens da página (mm)</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
                    {([
                      ['top', 'Superior', 15, 80],
                      ['bottom', 'Inferior', 15, 80],
                      ['left', 'Esquerda', 10, 55],
                      ['right', 'Direita', 10, 55],
                    ] as const).map(([key, label, min, max]) => (
                      <label key={key} style={{ display: 'grid', gap: 6, fontSize: '0.82rem', fontWeight: 700 }}>
                        {label}
                        <input
                          type="number"
                          min={min}
                          max={max}
                          step="0.5"
                          value={marginDraft[key]}
                          onChange={event => setMarginDraft(current => current ? { ...current, [key]: Number(event.target.value) } : current)}
                          style={{ ...inputStyle, padding: '10px 12px' }}
                        />
                      </label>
                    ))}
                  </div>
                  <p style={{ margin: '10px 0 0', color: 'var(--text-muted)', fontSize: '0.78rem', lineHeight: 1.45 }}>
                    Área mínima para o texto: 100 mm de largura e 120 mm de altura. Clique em “Aplicar e conferir” para atualizar a página.
                  </p>
                </section>
              )}
              <div style={{ background: '#e8e8e8', borderRadius: 14, border: '1px solid var(--border)', maxHeight: '75vh', overflow: 'auto', padding: '16px 0' }}>
                <div ref={previewRef} style={{ maxWidth: '100%', overflow: 'auto' }} />
              </div>
              <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px clamp(14px, 4vw, 24px)' }}>
                <label htmlFor="contract-paragraph-search" style={{ display: 'block', fontWeight: 700, marginBottom: 8 }}>Localizar trecho</label>
                <input id="contract-paragraph-search" type="search" value={paragraphSearch} onChange={event => setParagraphSearch(event.target.value)} placeholder="Buscar uma cláusula ou palavra" style={{ ...inputStyle, fontFamily: 'inherit' }} />
                <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{paragraphs.length} parágrafos com texto · {Object.keys(paragraphChanges).length} alterados</p>
              </div>
              {paragraphs.filter(paragraph => !paragraphSearch || (paragraphChanges[paragraph.index] ?? paragraph.text).toLocaleLowerCase('pt-BR').includes(paragraphSearch.toLocaleLowerCase('pt-BR'))).map((paragraph) => (
                <div key={paragraph.index} style={{ background: 'var(--card-bg)', border: `1px solid ${paragraphChanges[paragraph.index] !== undefined ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 14, padding: '16px clamp(14px, 4vw, 24px)' }}>
                  <label htmlFor={`contract-paragraph-${paragraph.index}`} style={{ display: 'block', fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8 }}>Trecho {paragraph.index + 1}</label>
                  <textarea
                    id={`contract-paragraph-${paragraph.index}`}
                    className="doc-editor-textarea"
                    rows={Math.min(8, Math.max(2, Math.ceil(paragraph.text.length / 85)))}
                    value={paragraphChanges[paragraph.index] ?? paragraph.text}
                    onChange={event => {
                      const value = event.target.value.replace(/[\r\n]+/g, ' ');
                      setParagraphChanges(current => {
                        const next = { ...current };
                        if (value === paragraph.text) delete next[paragraph.index];
                        else next[paragraph.index] = value;
                        return next;
                      });
                    }}
                  />
                </div>
              ))}
            </div>
          ) : (
            /* ─── Preview Step ─── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Action bar */}
              <div className="doc-editor-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--card-bg)', borderRadius: 14, border: '1px solid var(--border)', padding: '14px 20px', flexWrap: 'wrap', gap: 10, position: 'sticky', top: 70, zIndex: 10 }}>
                <div className="doc-editor-actions">
                {!openedFromHistory && <button disabled={!!downloading || saving} onClick={() => { setPreviewReady(false); setStep('form'); }} style={{
                  padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--text-main)', fontWeight: 700,
                  cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
                  Editar dados
                </button>}
                <button disabled={!!downloading || saving} onClick={() => { setMarginDraft(contractMargins); setStep('edit'); }} style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit_document</span>Editar texto e margens
                </button>
                </div>

                <div className="doc-editor-actions">
                  <button disabled={!!downloading || saving || !!savedDocumentId} onClick={() => void saveDocument()} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: savedDocumentId ? 'rgba(16,185,129,0.12)' : 'var(--primary)', color: savedDocumentId ? '#10b981' : '#fff', fontWeight: 700, cursor: savedDocumentId ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{savedDocumentId ? 'check_circle' : 'save'}</span>
                    {saving ? 'Salvando...' : savedDocumentId ? 'Salvo no histórico' : reconstructedFromHistory ? 'Salvar nova versão' : 'Salvar contrato'}
                  </button>
                  <button disabled={!!downloading} onClick={() => handleDownload('docx')} style={{
                    padding: '10px 24px', borderRadius: 10, border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
                    {downloading === 'docx' ? 'Baixando DOCX...' : 'Baixar DOCX'}
                  </button>
                  <button disabled={!!downloading || !previewReady} onClick={() => handleDownload('pdf')} style={{
                    padding: '10px 24px', borderRadius: 10, border: 'none',
                    background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
                    color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem',
                    display: 'flex', alignItems: 'center', gap: 6, opacity: downloading || !previewReady ? 0.6 : 1,
                    boxShadow: '0 4px 12px rgba(230,0,126,0.25)',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>picture_as_pdf</span>
                    {downloading === 'pdf' ? 'Gerando PDF...' : 'Baixar PDF'}
                  </button>
                </div>
              </div>

              {/* DOCX Preview - rendered by docx-preview */}
              <div style={{
                background: '#e8e8e8', borderRadius: 16, border: '1px solid var(--border)',
                overflow: 'hidden', minHeight: 600, padding: '20px 0',
              }}>
                <div ref={previewRef} style={{ maxWidth: '100%', overflow: 'auto' }} />
                {previewError && <p role="alert" style={{ padding: 24, color: '#b91c1c', background: '#fff' }}>{previewError}</p>}
                {!previewReady && !previewError && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                    <div className="spinner" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </AuthGuard>
  );
}
