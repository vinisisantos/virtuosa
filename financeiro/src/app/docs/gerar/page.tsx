'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { useGlobalUnit } from '@/contexts/UnitContext';
import { toast } from '@/components/toast';

interface DocField { tag: string; label: string; type: string; required: boolean; }
interface Template { id: string; name: string; category: string; fields: DocField[]; }

const MASKS: Record<string, (v: string) => string> = {
  cpf: (v) => v.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2').slice(0, 14),
  phone: (v) => v.replace(/\D/g, '').replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2').slice(0, 15),
  cep: (v) => v.replace(/\D/g, '').replace(/(\d{5})(\d)/, '$1-$2').slice(0, 9),
  currency: (v) => {
    const digits = v.replace(/\D/g, '');
    if (!digits) return '';
    return (parseInt(digits, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },
  date: (v) => v.replace(/\D/g, '').replace(/(\d{2})(\d)/, '$1/$2').replace(/(\d{2})(\d)/, '$1/$2').slice(0, 10),
};

export default function DocGerarPage() {
  const { globalUnit } = useGlobalUnit();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);

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

  const handleTemplateChange = useCallback((id: string) => {
    setSelectedTemplate(id);
    setFormData({});
  }, []);

  const handleFieldChange = useCallback((tag: string, value: string, type: string) => {
    const mask = MASKS[type];
    setFormData(prev => ({ ...prev, [tag]: mask ? mask(value) : value }));
  }, []);

  const handleGenerate = async () => {
    if (!currentTemplate) return;
    setGenerating(true);
    try {
      // Build filled values
      const filledValues: Record<string, string> = {};
      for (const field of currentTemplate.fields) {
        filledValues[field.tag] = formData[field.tag] || '';
      }

      // Save the generated document record
      const user = JSON.parse(localStorage.getItem('virtuosa_user') || '{}');
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

      // Fetch full template with PDF data
      const tplRes = await fetch(`/api/docs/templates/${currentTemplate.id}`);
      if (!tplRes.ok) { toast('Erro ao carregar template', 'error'); return; }
      const tpl = await tplRes.json();

      // Use pdf-lib to load and modify the PDF
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
      const pdfBytes = Uint8Array.from(atob(tpl.pdfData), c => c.charCodeAt(0));
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      // Save and download
      const modifiedBytes = await pdfDoc.save();
      const blob = new Blob([new Uint8Array(modifiedBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${currentTemplate.name} - ${new Date().toLocaleDateString('pt-BR')}.pdf`;
      link.click();
      URL.revokeObjectURL(url);

      toast('Documento gerado e registro salvo com sucesso!', 'success');
    } catch (e) {
      console.error(e);
      toast('Erro ao gerar documento', 'error');
    } finally { setGenerating(false); }
  };

  const allFieldsFilled = currentTemplate?.fields.every(f => formData[f.tag]?.trim());

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 16px', borderRadius: 12,
    border: '1px solid var(--border)', fontSize: '0.9rem',
    background: 'var(--bg)', color: 'var(--text-main)',
    fontFamily: 'inherit', fontWeight: 600, outline: 'none',
    transition: 'border-color 0.2s',
  };

  const CATEGORIES: Record<string, { icon: string; color: string }> = {
    contrato_trabalho: { icon: 'badge', color: '#3b82f6' },
    ficha_paciente: { icon: 'clinical_notes', color: '#10b981' },
    outro: { icon: 'description', color: '#8b5cf6' },
  };

  return (
    <AuthGuard requiredPermission="termos">
      <main className="dashboard-container">
        <AppHeader activePage={'doc-gerar' as any} />
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px 20px', minHeight: 'calc(100vh - 70px)' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg, var(--primary), #ff4db1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(230,0,126,0.25)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#fff' }}>edit_document</span>
            </div>
            <div>
              <h1 style={{ fontSize: '1.3rem', fontWeight: 900, margin: 0 }}>Gerar Documento</h1>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Preencha os campos e gere o PDF automaticamente</p>
            </div>
          </div>

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
                      border: isSelected ? `2px solid var(--primary)` : '1px solid var(--border)',
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

          {/* Dynamic Form */}
          {currentTemplate && (
            <div style={{ background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)', padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>edit_note</span>
                <h3 style={{ fontWeight: 700, fontSize: '1.05rem', margin: 0 }}>Preencha os Dados</h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {currentTemplate.fields.map(field => (
                  <div key={field.tag}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{field.label}</label>
                    <input
                      type={field.type === 'email' ? 'email' : 'text'}
                      placeholder={field.type === 'cpf' ? '000.000.000-00' : field.type === 'date' ? 'DD/MM/AAAA' : field.type === 'currency' ? '0,00' : field.type === 'phone' ? '(00) 00000-0000' : field.type === 'cep' ? '00000-000' : `Insira ${field.label.toLowerCase()}`}
                      style={inputStyle}
                      value={formData[field.tag] || ''}
                      onChange={e => handleFieldChange(field.tag, e.target.value, field.type)}
                      onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                      onBlur={e => e.target.style.borderColor = 'var(--border)'}
                    />
                  </div>
                ))}
              </div>

              {/* Divider + Generate Button */}
              <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {Object.keys(formData).filter(k => formData[k]?.trim()).length} / {currentTemplate.fields.length} campos preenchidos
                </span>
                <button
                  onClick={handleGenerate}
                  disabled={generating || !allFieldsFilled}
                  style={{
                    padding: '12px 28px', borderRadius: 12, border: 'none',
                    background: allFieldsFilled ? 'linear-gradient(135deg, var(--primary), #ff4db1)' : 'var(--border)',
                    color: '#fff', fontWeight: 700, cursor: allFieldsFilled ? 'pointer' : 'not-allowed',
                    fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8,
                    boxShadow: allFieldsFilled ? '0 4px 12px rgba(230,0,126,0.25)' : 'none',
                    opacity: generating ? 0.6 : 1,
                  }}
                >
                  {generating ? (
                    <><div className="spinner" style={{ width: 18, height: 18 }} /> Gerando...</>
                  ) : (
                    <><span className="material-symbols-outlined" style={{ fontSize: 20 }}>picture_as_pdf</span> Gerar Documento</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </AuthGuard>
  );
}
