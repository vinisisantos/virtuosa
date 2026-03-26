'use client';
import { UserData, UserPermissions, PERMISSION_LABELS, PERMISSION_ICONS } from '@/hooks/useUsers';

interface Props {
  showModal: boolean; setShowModal: (v: boolean) => void;
  editingUser: UserData | null; saving: boolean;
  formName: string; setFormName: (v: string) => void;
  formEmail: string; setFormEmail: (v: string) => void;
  formPassword: string; setFormPassword: (v: string) => void;
  formPhone: string; setFormPhone: (v: string) => void;
  formRole: string; setFormRole: (v: string) => void;
  formUnit: string; setFormUnit: (v: string) => void;
  formIsActive: boolean; setFormIsActive: (v: boolean) => void;
  formPermissions: UserPermissions;
  togglePermission: (key: keyof UserPermissions) => void;
  handleSave: (e: React.FormEvent) => void;
}

const inputS: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: '0.95rem', outline: 'none', background: 'rgba(249,250,251,0.8)', boxSizing: 'border-box' };
const labelS: React.CSSProperties = { display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: 6 };

export function UserFormModal(p: Props) {
  if (!p.showModal) return null;
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, animation: 'fadeInScale 0.2s ease-out' }}>
      <div style={{ background: '#fff', borderRadius: 28, maxWidth: 640, width: '95%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#fff', borderRadius: '28px 28px 0 0', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--primary)', background: 'rgba(99,102,241,0.1)', borderRadius: 10, padding: 8 }}>{p.editingUser ? 'edit' : 'person_add'}</span>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-main)' }}>{p.editingUser ? 'Editar Usuário' : 'Novo Usuário'}</h2>
          </div>
          <button onClick={() => p.setShowModal(false)} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)' }}>close</span></button>
        </div>

        <form onSubmit={p.handleSave} style={{ padding: '24px 32px 32px' }}>
          {/* Info */}
          <div style={{ marginBottom: 28 }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><span className="material-symbols-outlined" style={{ fontSize: 18 }}>badge</span> Informações Pessoais</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ gridColumn: '1 / -1' }}><label style={labelS}>Nome Completo *</label><input type="text" value={p.formName} onChange={e => p.setFormName(e.target.value)} required placeholder="Nome do colaborador" style={inputS} /></div>
              <div><label style={labelS}>E-mail *</label><input type="email" value={p.formEmail} onChange={e => p.setFormEmail(e.target.value)} required placeholder="email@virtuosa.com.br" style={inputS} /></div>
              <div><label style={labelS}>Senha {p.editingUser ? '(deixe vazio para manter)' : '*'}</label><input type="password" value={p.formPassword} onChange={e => p.setFormPassword(e.target.value)} required={!p.editingUser} placeholder={p.editingUser ? '••••••••' : 'Senha segura'} style={inputS} /></div>
              <div><label style={labelS}>Telefone</label><input type="text" value={p.formPhone} onChange={e => p.setFormPhone(e.target.value)} placeholder="(00) 00000-0000" style={inputS} /></div>
              <div><label style={labelS}>Cargo</label><select value={p.formRole} onChange={e => p.setFormRole(e.target.value)} style={inputS}><option value="ADMINISTRADOR">Administrador</option><option value="GERENTE">Gerente</option><option value="VENDEDOR">Vendedor</option><option value="ESTETICISTA">Esteticista</option></select></div>
              <div><label style={labelS}>Unidade</label><select value={p.formUnit} onChange={e => p.setFormUnit(e.target.value)} style={inputS}><option value="Barueri">Barueri</option><option value="SCS">SCS</option><option value="SBC">SBC</option><option value="Osasco">Osasco</option></select></div>
            </div>
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}><input type="checkbox" checked={p.formIsActive} onChange={e => p.setFormIsActive(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--primary)' }} /> Usuário Ativo</label>
            </div>
          </div>

          {/* Permissions */}
          <div style={{ marginBottom: 28 }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><span className="material-symbols-outlined" style={{ fontSize: 18 }}>shield</span> Níveis de Permissão</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {(Object.keys(PERMISSION_LABELS) as (keyof UserPermissions)[]).map(key => (
                <label key={key} onClick={() => p.togglePermission(key)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 14, cursor: 'pointer', transition: 'all 0.2s ease',
                  border: p.formPermissions[key] ? '2px solid var(--primary)' : '2px solid var(--border)',
                  background: p.formPermissions[key] ? 'rgba(99,102,241,0.06)' : 'rgba(249,250,251,0.8)',
                  boxShadow: p.formPermissions[key] ? '0 2px 12px rgba(99,102,241,0.15)' : 'none'
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 22, color: p.formPermissions[key] ? 'var(--primary)' : 'var(--text-muted)', background: p.formPermissions[key] ? 'rgba(99,102,241,0.12)' : 'rgba(107,114,128,0.08)', borderRadius: 8, padding: 6 }}>{PERMISSION_ICONS[key]}</span>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: p.formPermissions[key] ? 'var(--primary)' : 'var(--text-main)' }}>{PERMISSION_LABELS[key]}</div>
                    {key === 'admin' && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>Concede acesso completo</div>}
                  </div>
                  <span className="material-symbols-outlined" style={{ marginLeft: 'auto', fontSize: 22, color: p.formPermissions[key] ? 'var(--primary)' : 'var(--text-muted)' }}>{p.formPermissions[key] ? 'check_circle' : 'radio_button_unchecked'}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
            <button type="button" onClick={() => p.setShowModal(false)} style={{ padding: '12px 28px', borderRadius: 12, border: '1px solid var(--border)', background: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', color: 'var(--text-main)' }}>Cancelar</button>
            <button type="submit" disabled={p.saving} style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: p.saving ? '#a5b4fc' : 'linear-gradient(135deg, var(--primary), #7c3aed)', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: p.saving ? 'not-allowed' : 'pointer', boxShadow: '0 4px 16px rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', gap: 8 }}>
              {p.saving && <span className="material-symbols-outlined spinning" style={{ fontSize: 18 }}>progress_activity</span>}
              {p.editingUser ? 'Salvar Alterações' : 'Criar Usuário'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
