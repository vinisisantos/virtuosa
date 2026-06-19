'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { useGlobalUnit } from '@/contexts/UnitContext';
import { toast } from '@/components/toast';
import { valorPorExtenso } from '@/lib/valor-extenso';

interface DocField { tag: string; label: string; type: string; required: boolean; }
interface Template { id: string; name: string; category: string; fileType?: string; fields: DocField[]; }

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
  const [outputFormat, setOutputFormat] = useState<'docx' | 'pdf'>('docx');
  const [step, setStep] = useState<'form' | 'preview'>('form');
  const [generatedBlob, setGeneratedBlob] = useState<Blob | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/docs/templates?unit=${globalUnit}`);
        if (res.ok) setTemplates(await res.json());
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [globalUnit]);

  const currentTemplate = templates.find(t => t.id === selectedTemplate);

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
    razao_social_contratante: 'Virtuosa São Bernardo',
    cnpj_contratante: '55.176.726/0001-71',
    endereco_contratante: 'Av. das Nações Unidas',
    numero: '30',
    cidade: 'São Bernardo do Campo',
    uf: 'SP',
    cep: '09726-110',
  },
  Osasco: {
    razao_social_contratante: 'Virtuosa Osasco',
    cnpj_contratante: '51.590.266/0001-72',
    endereco_contratante: 'Rua Eloy Candido Lopes',
    numero: '61',
    cidade: 'Osasco',
    uf: 'SP',
    cep: '06010-130',
  },
  SCS: {
    razao_social_contratante: 'Virtuosa São Caetano do Sul',
    cnpj_contratante: '54.516.326/0001-52',
    endereco_contratante: 'Av. Vital Brasil Filho',
    numero: '143',
    cidade: 'São Caetano do Sul',
    uf: 'SP',
    cep: '09541-130',
  },
  Barueri: {
    razao_social_contratante: 'Virtuosa Barueri',
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
      const filledValues = buildFilledValues();

      const tplRes = await fetch(`/api/docs/templates/${currentTemplate.id}`);
      if (!tplRes.ok) { toast('Erro ao carregar template', 'error'); return; }
      const tpl = await tplRes.json();

      const PizZip = (await import('pizzip')).default;
      const Docxtemplater = (await import('docxtemplater')).default;

      const binaryStr = atob(tpl.fileData);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      const zip = new PizZip(bytes);
      const doc = new Docxtemplater(zip, {
        delimiters: { start: '{{', end: '}}' },
        paragraphLoop: true,
        linebreaks: true,
      });

      doc.render(filledValues);

      const outputBuf = doc.getZip().generate({ type: 'arraybuffer' });
      const blob = new Blob([outputBuf], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      setGeneratedBlob(blob);
      setStep('preview');

      // Render preview using docx-preview
      setTimeout(async () => {
        if (previewRef.current) {
          previewRef.current.innerHTML = '';
          const docxPreview = await import('docx-preview');
          await docxPreview.renderAsync(outputBuf, previewRef.current, undefined, {
            className: 'docx-preview-wrapper',
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            ignoreFonts: false,
            breakPages: true,
            ignoreLastRenderedPageBreak: false,
            experimental: true,
            renderHeaders: true,
            renderFooters: true,
            renderFootnotes: true,
          });
        }
      }, 100);

      toast('Preview gerado! Confira antes de baixar.', 'success');
    } catch (e) {
      console.error(e);
      toast('Erro ao gerar documento', 'error');
    } finally { setGenerating(false); }
  };

  const handleDownload = async () => {
    if (!generatedBlob || !currentTemplate) return;

    const user = JSON.parse(localStorage.getItem('virtuosa_user') || '{}');
    const filledValues = buildFilledValues();
    await fetch('/api/docs/generated', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId: currentTemplate.id,
        templateName: currentTemplate.name,
        filledData: filledValues,
        unit: globalUnit,
        createdBy: user.id || 'unknown',
        createdByName: user.name || 'Desconhecido',
      }),
    });

    const dateStr = new Date().toLocaleDateString('pt-BR').replace(/\//g, '_');
    const url = URL.createObjectURL(generatedBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentTemplate.name} - ${dateStr}.${outputFormat}`;
    link.click();
    URL.revokeObjectURL(url);
    toast('Documento baixado com sucesso!', 'success');
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
        .docx-preview-wrapper { background: white !important; }
        .docx-preview-wrapper section.docx { 
          margin: 0 auto !important; 
          box-shadow: 0 2px 12px rgba(0,0,0,0.1) !important; 
          margin-bottom: 20px !important;
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
                {step === 'form' ? 'Preencha os campos e gere o documento' : 'Confira o preview antes de baixar'}
              </p>
            </div>
          </div>

          {/* Steps indicator */}
          {currentTemplate && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {['form', 'preview'].map((s) => (
                <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: step === s || (step === 'preview' && s === 'form') ? 'var(--primary)' : 'var(--border)', transition: 'background 0.3s' }} />
              ))}
            </div>
          )}

          {step === 'form' ? (
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
                            <div style={{ display: 'flex', gap: 8 }}>
                              {['CPF', 'CNPJ'].map(opt => {
                                const isActive = formData[field.tag] === opt;
                                return (
                                  <button key={opt} onClick={() => {
                                    setFormData(prev => {
                                      const next = { ...prev, [field.tag]: opt };
                                      // Clear linked document field when switching
                                      const docField = currentTemplate?.fields.find(f =>
                                        f.tag.toLowerCase().includes('documento') && !f.tag.toLowerCase().includes('tipo')
                                      );
                                      if (docField) next[docField.tag] = '';
                                      return next;
                                    });
                                  }} style={{
                                    flex: 1, padding: '12px 16px', borderRadius: 12,
                                    border: isActive ? '2px solid var(--primary)' : '1px solid var(--border)',
                                    background: isActive ? 'rgba(230,0,126,0.06)' : 'transparent',
                                    color: isActive ? 'var(--primary)' : 'var(--text-main)',
                                    fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
                                    fontFamily: "'Courier New', Courier, monospace",
                                    transition: 'all 0.2s',
                                  }}>
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }

                      // ─── Dynamic Document Field (uses selected type's mask) ───
                      const isDynamicDoc = field.tag.toLowerCase().includes('documento') && !field.tag.toLowerCase().includes('tipo');
                      const docTypeField = currentTemplate?.fields.find(f => f.type === 'doc_type_selector');
                      const selectedDocType = docTypeField ? (formData[docTypeField.tag] || '').toLowerCase() : '';
                      const effectiveType = isDynamicDoc && selectedDocType ? selectedDocType : field.type;
                      const effectiveMask = MASKS[effectiveType];

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
                              style={{ ...inputStyle, paddingLeft: effectiveType === 'currency' ? 46 : 16 }}
                              value={formData[field.tag] || ''}
                              onChange={e => {
                                const val = e.target.value;
                                const masked = effectiveMask ? effectiveMask(val) : (MASKS[field.type] ? MASKS[field.type](val) : val);
                                setFormData(prev => ({ ...prev, [field.tag]: masked }));
                              }}
                              onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                              onBlur={e => e.target.style.borderColor = 'var(--border)'}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Formato de saída:</span>
                      {(['docx', 'pdf'] as const).map(fmt => (
                        <button key={fmt} onClick={() => setOutputFormat(fmt)} style={{
                          padding: '8px 16px', borderRadius: 8,
                          border: outputFormat === fmt ? '2px solid var(--primary)' : '1px solid var(--border)',
                          background: outputFormat === fmt ? 'rgba(230,0,126,0.05)' : 'transparent',
                          color: outputFormat === fmt ? 'var(--primary)' : 'var(--text-muted)',
                          fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s',
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{fmt === 'docx' ? 'description' : 'picture_as_pdf'}</span>
                          {fmt.toUpperCase()}
                        </button>
                      ))}
                    </div>

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
          ) : (
            /* ─── Preview Step ─── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Action bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--card-bg)', borderRadius: 14, border: '1px solid var(--border)', padding: '14px 20px', flexWrap: 'wrap', gap: 10, position: 'sticky', top: 70, zIndex: 10 }}>
                <button onClick={() => { setStep('form'); }} style={{
                  padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--text-main)', fontWeight: 700,
                  cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
                  Voltar e Editar
                </button>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {(['docx', 'pdf'] as const).map(fmt => (
                    <button key={fmt} onClick={() => setOutputFormat(fmt)} style={{
                      padding: '8px 14px', borderRadius: 8,
                      border: outputFormat === fmt ? '2px solid var(--primary)' : '1px solid var(--border)',
                      background: outputFormat === fmt ? 'rgba(230,0,126,0.05)' : 'transparent',
                      color: outputFormat === fmt ? 'var(--primary)' : 'var(--text-muted)',
                      fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer',
                    }}>
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                  <button onClick={handleDownload} style={{
                    padding: '10px 24px', borderRadius: 10, border: 'none',
                    background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
                    color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem',
                    display: 'flex', alignItems: 'center', gap: 6,
                    boxShadow: '0 4px 12px rgba(230,0,126,0.25)',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
                    Baixar {outputFormat.toUpperCase()}
                  </button>
                </div>
              </div>

              {/* DOCX Preview - rendered by docx-preview */}
              <div style={{
                background: '#e8e8e8', borderRadius: 16, border: '1px solid var(--border)',
                overflow: 'hidden', minHeight: 600, padding: '20px 0',
              }}>
                <div ref={previewRef} style={{ maxWidth: '100%', overflow: 'auto' }} />
                {!previewRef.current?.innerHTML && (
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
