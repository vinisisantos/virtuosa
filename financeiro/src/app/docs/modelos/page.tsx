'use client';

import React, { useEffect, useState } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { useGlobalUnit } from '@/contexts/UnitContext';
import { toast } from '@/components/toast';

interface DocField {
  tag: string;
  label: string;
  type: string;
  required: boolean;
}

interface DocTemplate {
  id: string;
  name: string;
  category: string;
  description: string | null;
  fields: DocField[];
  unit: string | null;
  createdBy: string;
  createdAt: string;
}

const CATEGORIES: Record<string, { label: string; icon: string; color: string }> = {
  contrato_trabalho: { label: 'Contrato de Trabalho', icon: 'badge', color: '#3b82f6' },
  ficha_paciente: { label: 'Ficha de Paciente', icon: 'clinical_notes', color: '#10b981' },
  outro: { label: 'Outro', icon: 'description', color: '#8b5cf6' },
};

export default function DocModelosPage() {
  const { globalUnit } = useGlobalUnit();
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState('contrato_trabalho');
  const [description, setDescription] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [parsedFields, setParsedFields] = useState<DocField[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'upload' | 'fields'>('upload');

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/docs/templates?unit=${globalUnit}`);
      if (res.ok) setTemplates(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchTemplates(); }, [globalUnit]);

  const handleFileSelect = async (file: File) => {
    setPdfFile(file);
    setParsing(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);

      const fileType = file.name.toLowerCase().endsWith('.docx') ? 'docx' : 'pdf';

      const res = await fetch('/api/docs/templates/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileData: base64, fileType }),
      });

      if (res.ok) {
        const data = await res.json();
        setParsedFields(data.fields);
        if (data.fields.length > 0) {
          setStep('fields');
          toast(`${data.fields.length} campo(s) detectado(s) no arquivo!`, 'success');
        } else {
          toast('Nenhuma tag {{campo}} foi encontrada. Verifique se o arquivo contém tags no formato {{nome}}, {{cpf}}, etc.', 'warning');
        }
      } else {
        toast('Erro ao analisar o arquivo', 'error');
      }
    } catch (e) {
      console.error(e);
      toast('Erro ao processar o arquivo', 'error');
    } finally { setParsing(false); }
  };

  const handleSave = async () => {
    if (!pdfFile || !name.trim()) return;
    setSaving(true);
    try {
      const buffer = await pdfFile.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      const fileType = pdfFile.name.toLowerCase().endsWith('.docx') ? 'docx' : 'pdf';

      const user = JSON.parse(localStorage.getItem('virtuosa_user') || '{}');

      const res = await fetch('/api/docs/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, category, description: description || null,
          fileData: base64, fileType, fields: parsedFields,
          unit: globalUnit, createdBy: user.id || 'unknown',
        }),
      });

      if (res.ok) {
        toast('Modelo salvo com sucesso!', 'success');
        setShowModal(false);
        resetForm();
        fetchTemplates();
      } else {
        toast('Erro ao salvar modelo', 'error');
      }
    } catch (e) {
      console.error(e);
      toast('Erro ao salvar', 'error');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir este modelo?')) return;
    try {
      await fetch(`/api/docs/templates?id=${id}`, { method: 'DELETE' });
      toast('Modelo excluído', 'success');
      fetchTemplates();
    } catch (e) { console.error(e); }
  };

  const resetForm = () => {
    setName(''); setCategory('contrato_trabalho'); setDescription('');
    setPdfFile(null); setParsedFields([]); setStep('upload');
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 16px', borderRadius: 12,
    border: '1px solid var(--border)', fontSize: '0.9rem',
    background: 'var(--bg)', color: 'var(--text-main)',
    fontFamily: 'inherit', fontWeight: 600, outline: 'none',
    transition: 'border-color 0.2s',
  };

  return (
    <AuthGuard requiredPermission="termos">
      <main className="dashboard-container">
        <AppHeader activePage={'doc-modelos' as any} />
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 20px', minHeight: 'calc(100vh - 70px)' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg, var(--primary), #ff4db1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(230,0,126,0.25)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#fff' }}>file_copy</span>
              </div>
              <div>
                <h1 style={{ fontSize: '1.3rem', fontWeight: 900, margin: 0 }}>Modelos de Documento</h1>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Gerencie templates de contratos e fichas</p>
              </div>
            </div>
            <button
              onClick={() => { resetForm(); setShowModal(true); }}
              style={{ padding: '10px 20px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 12px rgba(230,0,126,0.25)' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span>
              Novo Modelo
            </button>
          </div>

          {/* Grid */}
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
          ) : templates.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 20px', background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 56, color: 'var(--text-muted)', display: 'block', marginBottom: 16 }}>folder_open</span>
              <h3 style={{ fontWeight: 700, marginBottom: 8 }}>Nenhum modelo cadastrado</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: '0.95rem' }}>Suba seu primeiro PDF com tags para começar a gerar documentos automaticamente.</p>
              <button onClick={() => { resetForm(); setShowModal(true); }} style={{ padding: '10px 24px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
                Criar Primeiro Modelo
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
              {templates.map(t => {
                const cat = CATEGORIES[t.category] || CATEGORIES.outro;
                return (
                  <div key={t.id} style={{ background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)', padding: 24, transition: 'box-shadow 0.2s', cursor: 'default' }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: `${cat.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 22, color: cat.color }}>{cat.icon}</span>
                        </div>
                        <div>
                          <h3 style={{ fontWeight: 700, fontSize: '1.05rem', margin: 0 }}>{t.name}</h3>
                          <span style={{ fontSize: '0.78rem', color: cat.color, fontWeight: 600, background: `${cat.color}12`, padding: '2px 8px', borderRadius: 6 }}>{cat.label}</span>
                        </div>
                      </div>
                      <button onClick={() => handleDelete(t.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }} title="Excluir">
                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>delete</span>
                      </button>
                    </div>
                    {t.description && <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: '0 0 16px', lineHeight: 1.4 }}>{t.description}</p>}
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>input</span>
                        {(t.fields as DocField[]).length} campo(s)
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>calendar_today</span>
                        {new Date(t.createdAt).toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal */}
        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, padding: 0, borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,0.5)' }}>
              {/* Header */}
              <div style={{ background: 'linear-gradient(135deg, rgba(230,0,126,0.12) 0%, rgba(99,102,241,0.08) 100%)', padding: '24px 28px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--primary)' }}>upload_file</span>
                    <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>Novo Modelo</h2>
                  </div>
                  <button onClick={() => setShowModal(false)} style={{ background: 'rgba(255,255,255,0.06)', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                  </button>
                </div>
                {/* Steps */}
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  {['upload', 'fields'].map((s, i) => (
                    <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: step === s || (step === 'fields' && s === 'upload') ? 'var(--primary)' : 'var(--border)', transition: 'background 0.3s' }} />
                  ))}
                </div>
              </div>

              {/* Body */}
              <div style={{ padding: '24px 28px', maxHeight: '60vh', overflowY: 'auto' }}>
                {step === 'upload' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Nome do Modelo</label>
                      <input type="text" placeholder="Ex: Contrato CLT Esteticista" style={inputStyle} value={name} onChange={e => setName(e.target.value)}
                        onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                        onBlur={e => e.target.style.borderColor = 'var(--border)'}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Categoria</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {Object.entries(CATEGORIES).map(([key, cat]) => (
                          <button key={key} onClick={() => setCategory(key)} style={{
                            flex: 1, padding: '10px 8px', borderRadius: 10,
                            border: category === key ? `2px solid ${cat.color}` : '1px solid var(--border)',
                            background: category === key ? `${cat.color}12` : 'transparent',
                            color: category === key ? cat.color : 'var(--text-muted)',
                            fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, transition: 'all 0.2s',
                          }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{cat.icon}</span>
                            {cat.label.split(' ').slice(-1)[0]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Descrição (opcional)</label>
                      <textarea placeholder="Breve descrição do modelo..." style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)}
                        onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                        onBlur={e => e.target.style.borderColor = 'var(--border)'}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Arquivo com Tags (PDF ou DOCX)</label>
                      <label style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        padding: '28px 20px', borderRadius: 14, border: '2px dashed var(--border)',
                        background: pdfFile ? 'rgba(16,185,129,0.05)' : 'rgba(0,0,0,0.02)',
                        cursor: 'pointer', transition: 'all 0.2s', gap: 8,
                      }}>
                        <input type="file" accept=".pdf,.docx" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }} />
                        {parsing ? (
                          <><div className="spinner" /><span style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>Analisando PDF...</span></>
                        ) : pdfFile ? (
                          <>
                            <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#10b981' }}>check_circle</span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{pdfFile.name}</span>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{(pdfFile.size / 1024).toFixed(0)} KB • {parsedFields.length} campo(s) detectado(s)</span>
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined" style={{ fontSize: 36, color: 'var(--text-muted)' }}>cloud_upload</span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Clique para selecionar o arquivo</span>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>PDF ou DOCX com tags {'{{nome}}'}, {'{{cpf}}'}, etc.</span>
                          </>
                        )}
                      </label>
                    </div>
                  </div>
                ) : (
                  /* Fields Step */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                      Foram detectados <strong style={{ color: 'var(--primary)' }}>{parsedFields.length}</strong> campos no PDF. Confira e ajuste se necessário:
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {parsedFields.map((f, i) => (
                        <div key={f.tag} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'rgba(0,0,0,0.02)', borderRadius: 10, border: '1px solid var(--border)' }}>
                          <code style={{ fontSize: '0.78rem', background: 'rgba(230,0,126,0.08)', color: 'var(--primary)', padding: '2px 8px', borderRadius: 6, fontWeight: 700, flexShrink: 0 }}>{`{{${f.tag}}}`}</code>
                          <input
                            type="text" value={f.label} style={{ ...inputStyle, padding: '8px 12px', fontSize: '0.85rem' }}
                            onChange={e => {
                              const updated = [...parsedFields];
                              updated[i] = { ...f, label: e.target.value };
                              setParsedFields(updated);
                            }}
                            onFocus={e => e.target.style.borderColor = 'var(--primary)'}
                            onBlur={e => e.target.style.borderColor = 'var(--border)'}
                          />
                          <select value={f.type} style={{ ...inputStyle, padding: '8px 12px', fontSize: '0.82rem', width: 120, flexShrink: 0 }}
                            onChange={e => {
                              const updated = [...parsedFields];
                              updated[i] = { ...f, type: e.target.value };
                              setParsedFields(updated);
                            }}
                          >
                            <option value="text">Texto</option>
                            <option value="cpf">CPF</option>
                            <option value="cnpj">CNPJ</option>
                            <option value="date">Data</option>
                            <option value="currency">Valor R$</option>
                            <option value="phone">Telefone</option>
                            <option value="email">E-mail</option>
                            <option value="cep">CEP</option>
                            <option value="number">Número</option>
                            <option value="day">Dia (1-31)</option>
                            <option value="auto_end_date">Data Fim Auto</option>
                            <option value="doc_type_selector">Tipo Doc (CPF/CNPJ)</option>
                          </select>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => setStep('upload')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span> Voltar
                    </button>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{ padding: '16px 28px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button onClick={() => setShowModal(false)} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
                  Cancelar
                </button>
                {step === 'upload' && parsedFields.length > 0 ? (
                  <button onClick={() => setStep('fields')} disabled={!name.trim()} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', opacity: !name.trim() ? 0.5 : 1 }}>
                    Próximo
                  </button>
                ) : step === 'fields' ? (
                  <button onClick={handleSave} disabled={saving || !name.trim()} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 8, opacity: saving ? 0.6 : 1 }}>
                    {saving ? <div className="spinner" style={{ width: 18, height: 18 }} /> : <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span>}
                    Salvar Modelo
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </main>
    </AuthGuard>
  );
}
