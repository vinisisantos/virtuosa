'use client';
import { UserData, UserPermissions, PERMISSION_LABELS, PERMISSION_ICONS, PERMISSION_CATEGORIES } from '@/hooks/useUsers';

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
  toggleCategory: (keys: (keyof UserPermissions)[]) => void;
  handleSave: (e: React.FormEvent) => void;
}

const inputS: React.CSSProperties = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', fontSize: '0.95rem', outline: 'none', background: 'var(--bg)', boxSizing: 'border-box', color: 'var(--text-main)', fontFamily: 'inherit', fontWeight: 600 };
const labelS: React.CSSProperties = { display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: 6 };

export function UserFormModal(p: Props) {
  if (!p.showModal) return null;

  const totalPerms = Object.values(p.formPermissions).filter(Boolean).length;
  const isAdminOn = p.formPermissions.admin;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, animation: 'fadeInScale 0.2s ease-out' }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: 28, maxWidth: 720, width: '95%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'var(--card-bg)', borderRadius: '28px 28px 0 0', zIndex: 1 }}>
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

          {/* ─── Permissions ─── */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>shield</span> Permissões do Sistema
              </h3>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: isAdminOn ? '#10b981' : 'var(--text-muted)', background: isAdminOn ? 'rgba(16,185,129,0.1)' : 'var(--bg)', padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
                {totalPerms} ativa{totalPerms !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Admin banner */}
            {isAdminOn && (
              <div style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(99,102,241,0.08))', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 14, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#8b5cf6' }}>verified_user</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#8b5cf6' }}>Administrador Total — todas as permissões estão habilitadas</span>
              </div>
            )}

            {/* Categories */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {PERMISSION_CATEGORIES.map(cat => {
                const enabledCount = cat.keys.filter(k => p.formPermissions[k]).length;
                const allOn = enabledCount === cat.keys.length;
                const someOn = enabledCount > 0 && !allOn;

                return (
                  <div key={cat.label} style={{ border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', transition: 'all 0.2s', ...(allOn ? { borderColor: `${cat.color}40`, boxShadow: `0 2px 12px ${cat.color}10` } : {}) }}>
                    {/* Category header */}
                    <div
                      onClick={() => p.toggleCategory(cat.keys)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer',
                        background: allOn ? `${cat.color}08` : someOn ? `${cat.color}04` : 'transparent',
                        borderBottom: '1px solid var(--border)', transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${cat.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 20, color: cat.color }}>{cat.icon}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-main)' }}>{cat.label}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: 1 }}>{cat.description}</div>
                      </div>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: allOn ? '#10b981' : someOn ? cat.color : 'var(--text-muted)', background: allOn ? 'rgba(16,185,129,0.1)' : someOn ? `${cat.color}12` : 'var(--bg)', padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                        {enabledCount}/{cat.keys.length}
                      </span>
                      {/* Toggle all */}
                      <div style={{
                        width: 40, height: 22, borderRadius: 11, padding: 2, cursor: 'pointer', transition: 'all 0.2s',
                        background: allOn ? cat.color : someOn ? `${cat.color}60` : 'var(--border)',
                      }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: 9, background: '#fff', transition: 'transform 0.2s',
                          transform: allOn ? 'translateX(18px)' : someOn ? 'translateX(9px)' : 'translateX(0)',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        }} />
                      </div>
                    </div>

                    {/* Individual permissions */}
                    <div style={{ padding: '6px 10px' }}>
                      {cat.keys.map(key => (
                        <div
                          key={key}
                          onClick={() => p.togglePermission(key)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10,
                            cursor: 'pointer', transition: 'all 0.15s',
                            background: p.formPermissions[key] ? `${cat.color}06` : 'transparent',
                          }}
                          onMouseEnter={e => { if (!p.formPermissions[key]) e.currentTarget.style.background = 'rgba(0,0,0,0.02)'; }}
                          onMouseLeave={e => { if (!p.formPermissions[key]) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <span className="material-symbols-outlined" style={{
                            fontSize: 18, color: p.formPermissions[key] ? cat.color : 'var(--text-muted)', transition: 'color 0.15s',
                          }}>{PERMISSION_ICONS[key]}</span>
                          <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600, color: p.formPermissions[key] ? 'var(--text-main)' : 'var(--text-muted)' }}>
                            {PERMISSION_LABELS[key]}
                          </span>
                          {key === 'admin' && <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.08)', padding: '2px 6px', borderRadius: 4 }}>SUPER</span>}
                          {/* Toggle switch */}
                          <div style={{
                            width: 34, height: 18, borderRadius: 9, padding: 2, transition: 'all 0.2s',
                            background: p.formPermissions[key] ? cat.color : 'var(--border)',
                          }}>
                            <div style={{
                              width: 14, height: 14, borderRadius: 7, background: '#fff', transition: 'transform 0.2s',
                              transform: p.formPermissions[key] ? 'translateX(16px)' : 'translateX(0)',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
            <button type="button" onClick={() => p.setShowModal(false)} style={{ padding: '12px 28px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card-bg)', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', color: 'var(--text-main)', fontFamily: 'inherit' }}>Cancelar</button>
            <button type="submit" disabled={p.saving} style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: p.saving ? '#a5b4fc' : 'linear-gradient(135deg, var(--primary), #7c3aed)', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: p.saving ? 'not-allowed' : 'pointer', boxShadow: '0 4px 16px rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit' }}>
              {p.saving && <span className="material-symbols-outlined spinning" style={{ fontSize: 18 }}>progress_activity</span>}
              {p.editingUser ? 'Salvar Alterações' : 'Criar Usuário'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
