'use client';
import React, { useState, useEffect } from 'react';
import { Skeleton } from '@/components/skeleton';

const cardS: React.CSSProperties = { background: 'var(--card-bg)', borderRadius: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)', padding: 24 };

interface BackupInfo {
  exists: boolean;
  id?: string;
  updatedAt?: string;
  isAuto?: boolean;
}

export function BackupHistoryView() {
  const [backup, setBackup] = useState<BackupInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetchBackup();
  }, []);

  const fetchBackup = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/backup');
      const data = await res.json();
      setBackup(data);
    } catch { setBackup(null); }
    finally { setLoading(false); }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      // Read from localStorage
      const logs = localStorage.getItem('virtuosa_finance_logs_v2');
      const goals = localStorage.getItem('virtuosa_goals_v3');
      const fixed = localStorage.getItem('virtuosa_fixed_expenses_v2');
      const bills = localStorage.getItem('virtuosa_bills_v2');

      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logs: logs ? JSON.parse(logs) : [],
          goals: goals ? JSON.parse(goals) : {},
          fixed: fixed ? JSON.parse(fixed) : [],
          bills: bills ? JSON.parse(bills) : [],
          isAuto: false,
        }),
      });
      if (res.ok) {
        await fetchBackup();
      }
    } catch { }
    finally { setSyncing(false); }
  };

  const handleRestore = async () => {
    if (!confirm('Isso substituirá todos os dados financeiros locais. Continuar?')) return;
    try {
      const res = await fetch('/api/backup');
      const data = await res.json();
      if (data.exists) {
        localStorage.setItem('virtuosa_finance_logs_v2', JSON.stringify(data.logs));
        localStorage.setItem('virtuosa_goals_v3', JSON.stringify(data.goals));
        localStorage.setItem('virtuosa_fixed_expenses_v2', JSON.stringify(data.fixed));
        localStorage.setItem('virtuosa_bills_v2', JSON.stringify(data.bills));
        window.location.reload();
      }
    } catch { }
  };

  const lastSync = backup?.updatedAt ? new Date(backup.updatedAt) : null;
  const syncAgo = lastSync ? getTimeAgo(lastSync) : null;

  return (
    <div style={cardS}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#6366f1' }}>backup</span>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', flex: 1 }}>Backup & Sincronização</h2>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Skeleton width="100%" height={60} style={{ borderRadius: 14 }} />
          <Skeleton width="100%" height={60} style={{ borderRadius: 14 }} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Status */}
          <div style={{ background: backup?.exists ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, border: `1px solid ${backup?.exists ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}` }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: backup?.exists ? '#10b981' : '#ef4444' }}>{backup?.exists ? 'cloud_done' : 'cloud_off'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-main)' }}>{backup?.exists ? 'Backup Ativo' : 'Sem Backup'}</div>
              {backup?.exists && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>Última sincronização: {syncAgo} • {backup.isAuto ? '⚡ Auto' : '🔧 Manual'}</div>}
            </div>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: backup?.exists ? '#10b981' : '#ef4444', animation: backup?.exists ? 'pulse 2s infinite' : 'none' }} />
          </div>

          {/* Last sync time card */}
          {lastSync && (
            <div style={{ background: 'var(--bg)', borderRadius: 14, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)' }}>schedule</span>
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  {lastSync.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  às {lastSync.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
            <button onClick={handleManualSync} disabled={syncing} style={{
              padding: '14px', borderRadius: 14, border: 'none', background: syncing ? '#a5b4fc' : 'linear-gradient(135deg, #6366f1, #7c3aed)',
              color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: syncing ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {syncing ? <span className="material-symbols-outlined spinning" style={{ fontSize: 18 }}>progress_activity</span> : <span className="material-symbols-outlined" style={{ fontSize: 18 }}>cloud_upload</span>}
              Salvar Agora
            </button>
            <button onClick={handleRestore} disabled={!backup?.exists} style={{
              padding: '14px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card-bg)',
              color: 'var(--text-main)', fontWeight: 700, fontSize: '0.85rem', cursor: backup?.exists ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: backup?.exists ? 1 : 0.5,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>cloud_download</span> Restaurar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function getTimeAgo(d: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins} min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days} dia${days > 1 ? 's' : ''} atrás`;
}
