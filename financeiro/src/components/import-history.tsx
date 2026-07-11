'use client';

import { useState } from 'react';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import type { PayrollImportData } from '@/lib/types';

interface ImportRecord {
  id: string;
  fileName: string;
  uploadDate: string;
  competenceMonth: number;
  competenceYear: number;
  unit?: string;
  processingStatus: string;
  _count?: { entries: number };
}

const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export function ImportHistory({ imports: sourceImports, onRefresh }: {
  imports: PayrollImportData[];
  onRefresh: () => void | Promise<void>;
}) {
  const imports: ImportRecord[] = sourceImports.map((imp) => ({
    ...imp,
    _count: { entries: imp.entries.length },
  }));
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('virtuosa_import_history_collapsed') !== 'false';
    return true;
  });

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('virtuosa_import_history_collapsed', String(next));
      return next;
    });
  };

  const handleDelete = async (id: string) => {
    if (!await confirmDialog({ title: 'Excluir Importação', message: 'Excluir esta importação e todos os seus registros? Esta ação não pode ser desfeita.', confirmText: 'Sim, excluir', variant: 'danger' })) return;
    try {
      const res = await fetch(`/api/payroll/entries?importId=${id}`, { method: 'DELETE' });
      if (res.ok) {
        await onRefresh();
      }
    } catch {}
  };

  if (imports.length === 0) return null;

  const cardS: React.CSSProperties = {
    background: 'var(--card-bg)', backdropFilter: 'blur(20px)', borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', marginBottom: 24,
  };

  return (
    <div style={cardS}>
      <div onClick={toggleCollapsed} style={{
        padding: '14px 20px', cursor: 'pointer', userSelect: 'none',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: collapsed ? 'none' : '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>history</span>
          <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>Histórico de Importações</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)',
            background: 'var(--primary-light)', padding: '3px 10px', borderRadius: 20,
          }}>
            {imports.length} importaç{imports.length === 1 ? 'ão' : 'ões'}
          </span>
          <span className="material-symbols-outlined" style={{
            fontSize: 20, color: 'var(--text-muted)',
            transition: 'transform 0.3s', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
          }}>expand_more</span>
        </div>
      </div>

      <div style={{ maxHeight: collapsed ? 0 : 2000, opacity: collapsed ? 0 : 1, overflow: 'hidden', transition: 'max-height 0.4s ease, opacity 0.3s ease' }}>
        <div style={{ padding: '12px 20px' }}>
          {imports.map(imp => (
            <div key={imp.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderRadius: 12, marginBottom: 8,
              border: '1px solid var(--border)', background: 'var(--bg)',
              gap: 12, flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 200 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>description</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-main)' }}>{imp.fileName}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {new Date(imp.uploadDate).toLocaleDateString('pt-BR')} às {new Date(imp.uploadDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {imp.unit && (
                  <span style={{
                    padding: '3px 10px', borderRadius: 8, fontSize: '0.72rem',
                    fontWeight: 700, background: 'rgba(99,102,241,0.1)', color: '#6366f1',
                  }}>
                    {imp.unit}
                  </span>
                )}
                <span style={{
                  padding: '3px 10px', borderRadius: 8, fontSize: '0.72rem',
                  fontWeight: 700, background: 'rgba(16,185,129,0.1)', color: '#10b981',
                }}>
                  {imp._count?.entries || 0} registros
                </span>
                <span style={{
                  padding: '3px 10px', borderRadius: 8, fontSize: '0.72rem',
                  fontWeight: 700, background: 'var(--primary-light)', color: 'var(--primary)',
                }}>
                  {MONTHS[imp.competenceMonth - 1]}/{imp.competenceYear}
                </span>
                <button onClick={() => handleDelete(imp.id)} title="Excluir importação" style={{
                  width: 28, height: 28, borderRadius: 6, border: 'none',
                  background: 'transparent', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--danger)' }}>delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
