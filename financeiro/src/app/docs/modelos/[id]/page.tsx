'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { toast } from '@/components/toast';
import {
  base64DocumentBlob,
  documentBlobBase64,
  editableContractParagraphs,
  extractContractTags,
  readContractMargins,
  updateContractMarginGuides,
  updateContractMargins,
  updateContractParagraphs,
  type ContractMargins,
  type EditableContractParagraph,
} from '@/lib/docx-contract-editor';
import {
  MODELO_CONTRATO_SBC_VALIDADO,
  validarLayoutContrato,
  validarPartesProtegidasContrato,
} from '@/lib/contratos/validarLayoutContrato';

interface DocField { tag: string; label: string; type: string; required: boolean; }
interface DocTemplate {
  id: string;
  name: string;
  category: string;
  description: string | null;
  fields: DocField[];
  unit: string | null;
  fileType: string;
  fileData: string;
  updatedAt: string;
}

export default function EditDocTemplatePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const templateId = params.id;
  const [template, setTemplate] = useState<DocTemplate | null>(null);
  const [templateBlob, setTemplateBlob] = useState<Blob | null>(null);
  const [paragraphs, setParagraphs] = useState<EditableContractParagraph[]>([]);
  const [paragraphChanges, setParagraphChanges] = useState<Record<number, string>>({});
  const [search, setSearch] = useState('');
  const [margins, setMargins] = useState<ContractMargins | null>(null);
  const [marginDraft, setMarginDraft] = useState<ContractMargins | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewReady, setPreviewReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [hasAppliedChanges, setHasAppliedChanges] = useState(false);
  const [error, setError] = useState('');
  const previewRef = useRef<HTMLDivElement>(null);

  const hasMarginChanges = useMemo(() => !!margins && !!marginDraft &&
    (['top', 'bottom', 'left', 'right'] as const).some(key => margins[key] !== marginDraft[key]),
  [margins, marginDraft]);
  const hasPendingChanges = Object.keys(paragraphChanges).length > 0 || hasMarginChanges;

  useEffect(() => {
    let cancelled = false;
    if (!templateId) return;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`/api/docs/templates/${encodeURIComponent(templateId)}`, { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o modelo.');
        if (data.category !== 'contrato_trabalho' || data.fileType !== 'docx' || typeof data.fileData !== 'string') {
          throw new Error('A edição no preview está disponível para modelos DOCX de contrato.');
        }
        const blob = base64DocumentBlob(data.fileData);
        const [editable, pageMargins] = await Promise.all([
          editableContractParagraphs(blob),
          readContractMargins(blob),
        ]);
        if (cancelled) return;
        setTemplate(data as DocTemplate);
        setTemplateBlob(blob);
        setParagraphs(editable);
        setMargins(pageMargins);
        setMarginDraft(pageMargins);
        setHasAppliedChanges(false);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Erro ao abrir modelo.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [templateId]);

  useEffect(() => {
    if (!templateBlob || !previewRef.current) return;
    let cancelled = false;
    const container = previewRef.current;
    container.replaceChildren();
    setPreviewReady(false);
    void (async () => {
      try {
        const [{ renderAsync }, bytes] = await Promise.all([
          import('docx-preview'),
          templateBlob.arrayBuffer(),
        ]);
        if (cancelled) return;
        await renderAsync(bytes, container, undefined, {
          className: 'docx-preview-wrapper', inWrapper: true,
          ignoreWidth: false, ignoreHeight: false, ignoreFonts: false,
          breakPages: true, ignoreLastRenderedPageBreak: false, experimental: true,
          renderHeaders: true, renderFooters: true, renderFootnotes: true,
          useBase64URL: true,
        });
        if (!cancelled) setPreviewReady(true);
      } catch (previewError) {
        console.error('Erro ao renderizar modelo DOCX', previewError);
        if (!cancelled) setError('Não foi possível montar a prévia do modelo. Baixe o DOCX para conferir no Word.');
      }
    })();
    return () => { cancelled = true; };
  }, [templateBlob]);

  useEffect(() => {
    updateContractMarginGuides(previewRef.current, marginDraft);
  }, [marginDraft, previewReady]);

  const applyDraft = useCallback(async () => {
    if (!templateBlob || applying) return;
    setApplying(true);
    setError('');
    try {
      let updated = await updateContractParagraphs(templateBlob, paragraphChanges);
      if (hasMarginChanges && marginDraft) updated = await updateContractMargins(updated, marginDraft);

      const [updatedParagraphs, updatedMargins] = await Promise.all([
        editableContractParagraphs(updated),
        readContractMargins(updated),
      ]);
      if (JSON.stringify(extractContractTags(paragraphs)) !== JSON.stringify(extractContractTags(updatedParagraphs))) {
        throw new Error('As tags {{...}} do modelo precisam permanecer iguais para as próximas gerações continuarem funcionando.');
      }
      if (template?.id === MODELO_CONTRATO_SBC_VALIDADO) {
        const [before, after] = await Promise.all([templateBlob.arrayBuffer(), updated.arrayBuffer()]);
        await validarLayoutContrato(after);
        await validarPartesProtegidasContrato(before, after);
      }

      setTemplateBlob(updated);
      setParagraphs(updatedParagraphs);
      setParagraphChanges({});
      setMargins(updatedMargins);
      setMarginDraft(updatedMargins);
      setHasAppliedChanges(true);
      toast('Prévia do modelo atualizada. Confira a paginação antes de salvar.', 'success');
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : 'Não foi possível aplicar as alterações.');
      toast('Edição bloqueada. Confira o motivo indicado na tela.', 'error');
    } finally {
      setApplying(false);
    }
  }, [applying, hasMarginChanges, marginDraft, paragraphChanges, paragraphs, template?.id, templateBlob]);

  const saveTemplate = async () => {
    if (!template || !templateBlob || saving || hasPendingChanges || !hasAppliedChanges) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/docs/templates/${encodeURIComponent(template.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileData: await documentBlobBase64(templateBlob),
          expectedUpdatedAt: template.updatedAt,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível salvar o modelo.');
      toast('Modelo atualizado. As próximas gerações usarão esta versão.', 'success');
      router.push('/docs/modelos');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Erro ao salvar modelo.');
      toast('Não foi possível salvar o modelo.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateInputStyle: React.CSSProperties = {
    width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 10,
    border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)',
    font: 'inherit', fontWeight: 600,
  };

  return (
    <AuthGuard requiredPermission="termos">
      <style>{`
        .template-editor-grid { display:grid; grid-template-columns:minmax(0,1.4fr) minmax(320px,1fr); align-items:start; gap:18px; }
        .template-editor-preview { background:#e8e8e8; border:1px solid var(--border); border-radius:14px; max-height:calc(100vh - 190px); min-height:65vh; overflow:auto; padding:16px 0; }
        .template-editor-preview .docx-preview-wrapper-wrapper { background:#fff !important; align-items:flex-start !important; }
        .template-editor-preview section.docx-preview-wrapper { margin:0 auto 20px !important; }
        .template-editor-text { width:100%; min-height:76px; resize:vertical; padding:12px; border-radius:10px; border:1px solid var(--border); background:var(--bg); color:var(--text-main); font:inherit; line-height:1.5; }
        .template-editor-toolbar button { min-height:44px; }
        @media(max-width:850px) { .template-editor-grid { grid-template-columns:minmax(0,1fr); } .template-editor-preview { max-height:65vh; min-height:45vh; } }
      `}</style>
      <main className="dashboard-container">
        <AppHeader activePage={'doc-modelos' as any} />
        <div style={{ maxWidth: 1440, margin: '0 auto', padding: '20px clamp(12px, 3vw, 28px) 40px' }}>
          <div className="template-editor-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, position: 'sticky', top: 68, zIndex: 20 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 850 }}>{template ? `Editar modelo: ${template.name}` : 'Editar modelo'}</h1>
              <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.84rem' }}>Unidade: {template?.unit || 'compartilhado'} · Novas gerações usarão este modelo. Arquivos salvos permanecem iguais; registros antigos sem arquivo próprio avisam se a origem mudou.</p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => router.push('/docs/modelos')} disabled={saving || applying} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer' }}>Voltar</button>
              <button onClick={() => void applyDraft()} disabled={loading || applying || !hasPendingChanges} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer', opacity: !hasPendingChanges ? .55 : 1 }}>{applying ? 'Atualizando prévia…' : 'Aplicar e conferir'}</button>
              <button onClick={() => void saveTemplate()} disabled={loading || saving || hasPendingChanges || !hasAppliedChanges || !previewReady} style={{ padding: '10px 16px', borderRadius: 10, border: 0, background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: hasPendingChanges || !hasAppliedChanges || !previewReady ? .55 : 1 }}>{saving ? 'Salvando…' : 'Salvar para próximas gerações'}</button>
            </div>
          </div>

          {error && <p role="alert" style={{ padding: 14, borderRadius: 10, background: 'rgba(239,68,68,.1)', color: '#b91c1c', border: '1px solid rgba(239,68,68,.25)' }}>{error}</p>}
          {loading ? (
            <div style={{ display: 'grid', placeItems: 'center', minHeight: 300 }}><div className="spinner" /></div>
          ) : template && templateBlob && (
            <div className="template-editor-grid">
              <div>
                <div className="template-editor-preview">
                  <div ref={previewRef} style={{ maxWidth: '100%', overflow: 'auto' }} />
                  {!previewReady && <p style={{ padding: 20, color: 'var(--text-muted)' }}>Carregando páginas do modelo…</p>}
                </div>
                <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: 'var(--card-bg)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: 1.5 }}>
                  A linha magenta mostra a área útil com as margens escolhidas e não aparece nos contratos baixados. As tags de mesclagem são protegidas; um parágrafo alterado adota o estilo do primeiro trecho dele, então confira destaques e negritos na prévia.
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {marginDraft && (
                  <section style={{ padding: 16, borderRadius: 14, background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
                    <h2 style={{ margin: '0 0 12px', fontSize: '1rem' }}>Margens da página (mm)</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
                      {([
                        ['top', 'Superior', 15, 80], ['bottom', 'Inferior', 15, 80],
                        ['left', 'Esquerda', 10, 55], ['right', 'Direita', 10, 55],
                      ] as const).map(([key, label, min, max]) => (
                        <label key={key} style={{ display: 'grid', gap: 5, fontSize: '.8rem', fontWeight: 700 }}>
                          {label}
                          <input type="number" min={min} max={max} step="0.5" value={marginDraft[key]}
                            onChange={event => setMarginDraft(current => current ? { ...current, [key]: Number(event.target.value) } : current)}
                            style={updateInputStyle} />
                        </label>
                      ))}
                    </div>
                    <p style={{ margin: '10px 0 0', color: 'var(--text-muted)', fontSize: '.78rem', lineHeight: 1.45 }}>A4 · área mínima de texto de 100 mm × 120 mm. Clique em “Aplicar e conferir” para atualizar a prévia.</p>
                  </section>
                )}

                <section style={{ padding: 16, borderRadius: 14, background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
                  <label htmlFor="model-paragraph-search" style={{ display: 'block', fontWeight: 750, marginBottom: 8 }}>Localizar trecho do modelo</label>
                  <input id="model-paragraph-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar cláusula ou palavra" style={updateInputStyle} />
                  <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: '.78rem' }}>{paragraphs.length} parágrafos · {Object.keys(paragraphChanges).length} alterações pendentes</p>
                </section>

                {paragraphs.filter(paragraph => !search || (paragraphChanges[paragraph.index] ?? paragraph.text).toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).map(paragraph => (
                  <div key={paragraph.index} style={{ padding: 14, borderRadius: 14, background: 'var(--card-bg)', border: `1px solid ${paragraphChanges[paragraph.index] !== undefined ? 'var(--primary)' : 'var(--border)'}` }}>
                    <label htmlFor={`model-paragraph-${paragraph.index}`} style={{ display: 'block', fontSize: '.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>Parágrafo {paragraph.index + 1}</label>
                    <textarea id={`model-paragraph-${paragraph.index}`} className="template-editor-text" rows={Math.min(8, Math.max(2, Math.ceil(paragraph.text.length / 85)))} value={paragraphChanges[paragraph.index] ?? paragraph.text}
                      onChange={event => {
                        const value = event.target.value.replace(/[\r\n]+/g, ' ');
                        setParagraphChanges(current => {
                          const next = { ...current };
                          if (value === paragraph.text) delete next[paragraph.index];
                          else next[paragraph.index] = value;
                          return next;
                        });
                      }} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </AuthGuard>
  );
}
