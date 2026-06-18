'use client';

import React, { useEffect, useState } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { useGlobalUnit } from '@/contexts/UnitContext';
import { toast } from '@/components/toast';

interface DocGenerated {
  id: string;
  templateId: string;
  templateName: string;
  filledData: Record<string, string>;
  unit: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export default function DocHistoricoPage() {
  const { globalUnit } = useGlobalUnit();
  const [docs, setDocs] = useState<DocGenerated[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [viewDoc, setViewDoc] = useState<DocGenerated | null>(null);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/docs/generated?unit=${globalUnit}&page=${page}&limit=15`);
      if (res.ok) {
        const data = await res.json();
        setDocs(data.documents);
        setTotal(data.total);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchDocs(); }, [globalUnit, page]);

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir este documento do histórico?')) return;
    try {
      await fetch(`/api/docs/generated?id=${id}`, { method: 'DELETE' });
      toast('Documento removido do histórico', 'success');
      fetchDocs();
    } catch (e) { console.error(e); }
  };

  const totalPages = Math.ceil(total / 15);

  return (
    <AuthGuard requiredPermission="termos">
      <main className="dashboard-container">
        <AppHeader activePage={'doc-historico' as any} />
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 20px', minHeight: 'calc(100vh - 70px)' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg, var(--primary), #ff4db1)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(230,0,126,0.25)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#fff' }}>history</span>
            </div>
            <div>
              <h1 style={{ fontSize: '1.3rem', fontWeight: 900, margin: 0 }}>Histórico de Documentos</h1>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{total} documento(s) gerado(s)</p>
            </div>
          </div>

          {/* Table */}
          <div style={{ background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
            ) : docs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-muted)', display: 'block', marginBottom: 12 }}>inbox</span>
                <h3 style={{ fontWeight: 700, marginBottom: 8 }}>Nenhum documento gerado</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Os documentos gerados aparecerão aqui. <a href="/docs/gerar" style={{ color: 'var(--primary)', fontWeight: 700 }}>Gerar documento</a>
                </p>
              </div>
            ) : (
              <>
                {/* Table Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 80px', padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.02)' }}>
                  {['Modelo', 'Gerado por', 'Unidade', 'Data', ''].map(h => (
                    <span key={h} style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</span>
                  ))}
                </div>

                {/* Rows */}
                {docs.map(doc => (
                  <div
                    key={doc.id}
                    style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 80px', padding: '14px 20px', borderBottom: '1px solid var(--border)', alignItems: 'center', transition: 'background 0.15s', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(230,0,126,0.02)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    onClick={() => setViewDoc(doc)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>description</span>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{doc.templateName}</span>
                    </div>
                    <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>{doc.createdByName}</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, background: 'rgba(230,0,126,0.06)', color: 'var(--primary)', padding: '2px 10px', borderRadius: 6, justifySelf: 'start' }}>{doc.unit}</span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{new Date(doc.createdAt).toLocaleDateString('pt-BR')} {new Date(doc.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button onClick={e => { e.stopPropagation(); handleDelete(doc.id); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }} title="Excluir">
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                      </button>
                    </div>
                  </div>
                ))}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '16px 20px' }}>
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-main)', cursor: page === 1 ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: page === 1 ? 0.4 : 1 }}>Anterior</button>
                    <span style={{ padding: '6px 16px', fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-muted)' }}>{page} / {totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-main)', cursor: page === totalPages ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: page === totalPages ? 0.4 : 1 }}>Próximo</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* View Modal */}
        {viewDoc && (
          <div className="modal-overlay" onClick={() => setViewDoc(null)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, padding: 0, borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,0.5)' }}>
              <div style={{ background: 'linear-gradient(135deg, rgba(230,0,126,0.12) 0%, rgba(99,102,241,0.08) 100%)', padding: '24px 28px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--primary)' }}>visibility</span>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>{viewDoc.templateName}</h2>
                  </div>
                  <button onClick={() => setViewDoc(null)} style={{ background: 'rgba(255,255,255,0.06)', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                  </button>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Gerado por {viewDoc.createdByName} em {new Date(viewDoc.createdAt).toLocaleDateString('pt-BR')} às {new Date(viewDoc.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div style={{ padding: '20px 28px', maxHeight: '50vh', overflowY: 'auto' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Dados Preenchidos</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {Object.entries(viewDoc.filledData as Record<string, string>).map(([key, value]) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(0,0,0,0.02)', borderRadius: 10, border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{value || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </AuthGuard>
  );
}
