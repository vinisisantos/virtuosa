'use client';
import { UserData } from '@/hooks/useUsers';

interface Props {
  users: UserData[]; loading: boolean;
  openEditModal: (user: UserData) => void;
  setDeleteConfirmId: (id: string | null) => void;
  formatRole: (r: string) => string;
  getInitials: (name: string) => string;
}

export function UsersTable({ users, loading, openEditModal, setDeleteConfirmId, formatRole, getInitials }: Props) {
  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <span className="material-symbols-outlined spinning" style={{ fontSize: 40, color: 'var(--primary)' }}>progress_activity</span>
        <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>Carregando usuários...</p>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-muted)' }}>person_off</span>
        <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>Nenhum usuário encontrado.</p>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'rgba(99,102,241,0.04)' }}>
            {['Usuário', 'Email', 'Cargo', 'Unidade', 'Status', 'Ações'].map(h => (
              <th key={h} style={{ padding: '14px 20px', textAlign: 'left', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.03)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <td style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, var(--primary), #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '0.85rem' }}>{getInitials(user.name)}</div>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.95rem' }}>{user.name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{user.permissions && (user.permissions as any).admin ? '👑 Admin' : formatRole(user.role)}</div>
                  </div>
                </div>
              </td>
              <td style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{user.email}</td>
              <td style={{ padding: '16px 20px' }}>
                <span style={{ padding: '4px 12px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, background: user.role === 'ADMINISTRADOR' ? 'rgba(99,102,241,0.1)' : 'rgba(107,114,128,0.1)', color: user.role === 'ADMINISTRADOR' ? 'var(--primary)' : 'var(--text-muted)' }}>{formatRole(user.role)}</span>
              </td>
              <td style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{user.unit || '—'}</td>
              <td style={{ padding: '16px 20px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 700, background: user.isActive ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: user.isActive ? '#10b981' : '#ef4444' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: user.isActive ? '#10b981' : '#ef4444' }}></span>
                  {user.isActive ? 'Ativo' : 'Inativo'}
                </span>
              </td>
              <td style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => openEditModal(user)} title="Editar" style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--primary)' }}>edit</span></button>
                  <button onClick={() => setDeleteConfirmId(user.id)} title="Excluir" style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="material-symbols-outlined" style={{ fontSize: 18, color: '#ef4444' }}>delete</span></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
