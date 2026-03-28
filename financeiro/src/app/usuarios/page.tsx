'use client';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { useUsers } from '@/hooks/useUsers';
import { UsersTable } from '@/components/users/users-table';
import { UserFormModal } from '@/components/users/user-form-modal';

export default function UsuariosPage() {
  const u = useUsers();

  return (
    <AuthGuard allowedRoles={['ADMINISTRADOR']} requiredPermission="admin">
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <AppHeader activePage="usuarios" />

        {/* Feedback Toast */}
        {u.feedback && (
          <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 9999, padding: '16px 24px', borderRadius: 16, color: '#fff', fontWeight: 700, fontSize: '0.95rem', backdropFilter: 'blur(20px)', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', gap: 10, animation: 'fadeInScale 0.3s ease-out', background: u.feedback.type === 'success' ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
            <span className="material-symbols-outlined">{u.feedback.type === 'success' ? 'check_circle' : 'error'}</span>
            {u.feedback.message}
          </div>
        )}

        <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 20px' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
            <div>
              <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-main)', margin: 0 }}>Gestão de Usuários</h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: 4 }}>Gerencie os acessos e permissões da equipe Virtuosa.</p>
            </div>
            <button onClick={u.openCreateModal} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', background: 'linear-gradient(135deg, var(--primary), #7c3aed)', color: '#fff', border: 'none', borderRadius: 14, fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', boxShadow: '0 4px 16px rgba(99,102,241,0.3)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>person_add</span> Novo Usuário
            </button>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
            {[
              { label: 'Total de Usuários', value: u.users.length, icon: 'group', color: '#6366f1' },
              { label: 'Ativos', value: u.users.filter(x => x.isActive).length, icon: 'verified_user', color: '#10b981' },
              { label: 'Inativos', value: u.users.filter(x => !x.isActive).length, icon: 'person_off', color: '#ef4444' },
              { label: 'Administradores', value: u.users.filter(x => x.permissions && (x.permissions as any).admin).length, icon: 'shield_person', color: '#f59e0b' },
            ].map((stat, i) => (
              <div key={i} style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(20px)', borderRadius: 20, padding: '20px 24px', border: '1px solid var(--glass-border)', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 28, color: stat.color, background: `${stat.color}15`, borderRadius: 12, padding: 8 }}>{stat.icon}</span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>{stat.label}</span>
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-main)' }}>{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(20px)', borderRadius: 24, border: '1px solid var(--glass-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--primary)', fontSize: 24 }}>group</span>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>Usuários Registrados</h2>
              <span style={{ marginLeft: 'auto', background: 'var(--primary)', color: '#fff', borderRadius: 20, padding: '4px 14px', fontSize: '0.8rem', fontWeight: 700 }}>{u.users.length}</span>
            </div>
            <UsersTable users={u.users} loading={u.loading} openEditModal={u.openEditModal} setDeleteConfirmId={u.setDeleteConfirmId} formatRole={u.formatRole} getInitials={u.getInitials} />
          </div>
        </main>

        {/* Delete Modal */}
        {u.deleteConfirmId && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
            <div style={{ background: 'var(--card-bg)', borderRadius: 24, padding: 32, maxWidth: 420, width: '90%', textAlign: 'center', boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#ef4444', marginBottom: 16 }}>warning</span>
              <h3 style={{ margin: '0 0 8px', fontSize: '1.2rem', fontWeight: 800 }}>Confirmar Exclusão</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: 24 }}>Tem certeza? Esta ação é <strong>irreversível</strong>.</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button onClick={() => u.setDeleteConfirmId(null)} style={{ padding: '12px 28px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card-bg)', fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={() => u.handleDelete(u.deleteConfirmId!)} style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Sim, Excluir</button>
              </div>
            </div>
          </div>
        )}

        <UserFormModal showModal={u.showModal} setShowModal={u.setShowModal} editingUser={u.editingUser} saving={u.saving}
          formName={u.formName} setFormName={u.setFormName} formEmail={u.formEmail} setFormEmail={u.setFormEmail}
          formPassword={u.formPassword} setFormPassword={u.setFormPassword} formPhone={u.formPhone} setFormPhone={u.setFormPhone}
          formRole={u.formRole} setFormRole={u.setFormRole} formUnit={u.formUnit} setFormUnit={u.setFormUnit}
          formIsActive={u.formIsActive} setFormIsActive={u.setFormIsActive}
          formPermissions={u.formPermissions} togglePermission={u.togglePermission} toggleCategory={u.toggleCategory} handleSave={u.handleSave} />
      </div>
    </AuthGuard>
  );
}
