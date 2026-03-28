'use client';

import React, { useState, useEffect } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { toast } from '@/components/toast';
import { Skeleton } from '@/components/skeleton';

const GRADIENT_COLORS = [
  'linear-gradient(135deg, #6366f1, #8b5cf6)',
  'linear-gradient(135deg, #e600a0, #f43f5e)',
  'linear-gradient(135deg, #10b981, #059669)',
  'linear-gradient(135deg, #f59e0b, #d97706)',
  'linear-gradient(135deg, #3b82f6, #2563eb)',
];

function getAvatarGradient(name: string) {
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return GRADIENT_COLORS[hash % GRADIENT_COLORS.length];
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [userId, setUserId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [unit, setUnit] = useState('Barueri');
  const [role, setRole] = useState('VENDEDOR');
  const [createdAt, setCreatedAt] = useState('');
  const [permissionsCount, setPermissionsCount] = useState(0);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const userDataRaw = localStorage.getItem('virtuosa_user');
    if (userDataRaw) {
      try {
        const user = JSON.parse(userDataRaw);
        setUserId(user.id || '');
        setName(user.name || '');
        setEmail(user.email || '');
        setPhone(user.phone || '');
        setUnit(user.unit || 'Barueri');
        setRole(user.role || 'VENDEDOR');
        setCreatedAt(user.createdAt || '');
        const perms = user.permissions || {};
        setPermissionsCount(Object.values(perms).filter(Boolean).length);
      } catch (e) {
        console.error(e);
      }
    }
    setTimeout(() => setLoading(false), 400);
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = { id: userId, name, email, phone };
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const userDataRaw = localStorage.getItem('virtuosa_user');
        if (userDataRaw) {
          const user = JSON.parse(userDataRaw);
          localStorage.setItem('virtuosa_user', JSON.stringify({ ...user, name, email, phone }));
        }
        toast('Alterações salvas com sucesso!', 'success');
      } else {
        const err = await res.json();
        toast(err.error || 'Erro ao salvar perfil.', 'error');
      }
    } catch (error) {
      toast('Erro de conexão.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) { toast('Senha deve ter pelo menos 6 caracteres.', 'warning'); return; }
    if (newPassword !== confirmPassword) { toast('As senhas não coincidem!', 'warning'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, password: newPassword })
      });
      if (res.ok) {
        toast('Senha alterada com sucesso!', 'success');
        setShowPasswordModal(false);
        setNewPassword('');
        setConfirmPassword('');
      } else {
        toast('Erro ao alterar senha.', 'error');
      }
    } catch (error) {
      toast('Erro de conexão.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const initials = name ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'US';
  const formattedRole = role ? role.charAt(0) + role.slice(1).toLowerCase() : '';
  const memberSince = createdAt ? new Date(createdAt).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : '—';
  const daysSinceMember = createdAt ? Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;

  const inputS: React.CSSProperties = { width: '100%', padding: '14px 16px', borderRadius: 14, border: '2px solid var(--border)', fontSize: '0.92rem', outline: 'none', background: 'var(--bg)', boxSizing: 'border-box', color: 'var(--text-main)', fontFamily: 'inherit', fontWeight: 600, transition: 'border-color 0.2s, box-shadow 0.2s' };
  const labelS: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: '0.5px', textTransform: 'uppercase' };
  const cardS: React.CSSProperties = { background: 'var(--card-bg)', backdropFilter: 'blur(20px)', borderRadius: 20, border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)', padding: 28 };

  return (
    <AuthGuard requiredPermission="perfil">
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', paddingBottom: 60 }}>
          <AppHeader activePage="perfil" />

          <main style={{ padding: '0 20px', marginTop: 24 }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'flex', gap: 20 }}>
                  <div style={{ width: 320 }}><Skeleton variant="card" height={300} style={{ width: '100%' }} /></div>
                  <div style={{ flex: 1 }}><Skeleton variant="card" height={300} style={{ width: '100%' }} /></div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24 }}>
                {/* ─── Left Sidebar ─── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Hero Card */}
                  <div style={{ ...cardS, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                    {/* Background stripe */}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 80, background: getAvatarGradient(name), opacity: 0.15 }} />

                    <div style={{
                      width: 88, height: 88, borderRadius: '50%', background: getAvatarGradient(name),
                      display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '12px auto 16px',
                      fontSize: '1.8rem', fontWeight: 900, color: '#fff', letterSpacing: '1px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.15)', position: 'relative',
                    }}>
                      {initials}
                      <div style={{ position: 'absolute', bottom: 2, right: 2, width: 16, height: 16, borderRadius: '50%', background: '#10b981', border: '3px solid var(--card-bg)' }} />
                    </div>

                    <h2 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-main)', margin: '0 0 4px' }}>{name}</h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, margin: '0 0 4px' }}>{formattedRole}</p>
                    {role !== 'ADMINISTRADOR' && <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>📍 Unidade {unit}</p>}

                    <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div style={{ background: 'var(--bg)', borderRadius: 12, padding: '12px 8px' }}>
                        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--primary)' }}>{daysSinceMember}</div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>dias ativo</div>
                      </div>
                      <div style={{ background: 'var(--bg)', borderRadius: 12, padding: '12px 8px' }}>
                        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#10b981' }}>{permissionsCount}</div>
                        <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>permissões</div>
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div style={{ ...cardS, padding: 16 }}>
                    <h3 style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>bolt</span> Ações Rápidas
                    </h3>
                    {[
                      { icon: 'lock_reset', label: 'Alterar Senha', color: '#6366f1', action: () => setShowPasswordModal(true) },
                      { icon: 'logout', label: 'Sair da Conta', color: '#ef4444', action: () => { localStorage.removeItem('virtuosa_user'); window.location.href = '/login.html'; } },
                    ].map((item, i) => (
                      <button key={i} onClick={item.action} style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                        background: 'transparent', border: 'none', borderRadius: 12, cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-main)',
                        transition: 'all 0.15s',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.background = `${item.color}08`; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 20, color: item.color, background: `${item.color}12`, borderRadius: 8, padding: 6 }}>{item.icon}</span>
                        {item.label}
                        <span className="material-symbols-outlined" style={{ marginLeft: 'auto', fontSize: 16, color: 'var(--text-muted)' }}>chevron_right</span>
                      </button>
                    ))}
                  </div>

                  {/* Member Since */}
                  <div style={{ ...cardS, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)' }}>calendar_month</span>
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Membro desde</div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-main)' }}>{memberSince}</div>
                    </div>
                  </div>
                </div>

                {/* ─── Right Main ─── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Personal Info Form */}
                  <div style={cardS}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#6366f1' }}>person_edit</span>
                      </div>
                      <div>
                        <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-main)' }}>Informações Pessoais</h2>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>Atualize seus dados de contato</p>
                      </div>
                    </div>

                    <form onSubmit={handleSaveProfile}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label style={labelS}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>badge</span> Nome Completo</label>
                          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome completo" style={inputS} onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px rgba(230,0,126,0.1)'; }} onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }} />
                        </div>
                        <div>
                          <label style={labelS}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>mail</span> E-mail</label>
                          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@virtuosa.com.br" style={inputS} onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px rgba(230,0,126,0.1)'; }} onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }} />
                        </div>
                        <div>
                          <label style={labelS}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>call</span> Telefone / WhatsApp</label>
                          <input type="text" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(00) 00000-0000" style={inputS} onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px rgba(230,0,126,0.1)'; }} onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }} />
                        </div>
                        <div>
                          <label style={labelS}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>work</span> Cargo</label>
                          <input type="text" value={formattedRole} readOnly style={{ ...inputS, opacity: 0.6, cursor: 'not-allowed' }} />
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>Definido pelo administrador</span>
                        </div>
                        {role !== 'ADMINISTRADOR' && (
                          <div>
                            <label style={labelS}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>storefront</span> Unidade</label>
                            <input type="text" value={unit} readOnly style={{ ...inputS, opacity: 0.6, cursor: 'not-allowed' }} />
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>Definido pelo administrador</span>
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                        <button type="submit" disabled={saving} style={{
                          padding: '12px 28px', borderRadius: 14, border: 'none',
                          background: saving ? '#a5b4fc' : 'linear-gradient(135deg, var(--primary), #ff4db1)',
                          color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: saving ? 'not-allowed' : 'pointer',
                          fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8,
                          boxShadow: '0 4px 16px rgba(230,0,126,0.25)', transition: 'all 0.2s',
                        }}>
                          {saving && <span className="material-symbols-outlined spinning" style={{ fontSize: 18 }}>progress_activity</span>}
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span> Salvar Alterações
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Security Card */}
                  <div style={cardS}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#ef4444' }}>security</span>
                      </div>
                      <div>
                        <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-main)' }}>Segurança da Conta</h2>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>Mantenha sua conta segura</p>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div style={{ background: 'var(--bg)', borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#10b981' }}>check_circle</span>
                        <div>
                          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>Conta Ativa</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Status: Operacional</div>
                        </div>
                      </div>
                      <div style={{ background: 'var(--bg)', borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#f59e0b' }}>vpn_key</span>
                        <div>
                          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>Senha</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>••••••••</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>

        {/* Password Modal */}
        {showPasswordModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, animation: 'fadeInScale 0.2s ease-out' }}>
            <div style={{ background: 'var(--card-bg)', borderRadius: 24, maxWidth: 440, width: '90%', boxShadow: '0 25px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#6366f1', background: 'rgba(99,102,241,0.1)', borderRadius: 10, padding: 8 }}>lock_reset</span>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>Alterar Senha</h3>
                <button onClick={() => setShowPasswordModal(false)} style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-muted)' }}>close</span>
                </button>
              </div>

              <form onSubmit={handleChangePassword} style={{ padding: '24px 28px' }}>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelS}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>lock</span> Nova Senha</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required placeholder="Mínimo 6 caracteres" style={inputS} onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px rgba(230,0,126,0.1)'; }} onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }} />
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={labelS}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>lock_clock</span> Confirmar Senha</label>
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required placeholder="Repita a senha" style={inputS} onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px rgba(230,0,126,0.1)'; }} onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }} />
                </div>
                {newPassword && confirmPassword && newPassword !== confirmPassword && (
                  <div style={{ fontSize: '0.78rem', color: '#ef4444', fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>error</span> As senhas não coincidem
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                  <button type="button" onClick={() => setShowPasswordModal(false)} style={{ padding: '12px 24px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card-bg)', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', color: 'var(--text-main)', fontFamily: 'inherit' }}>Cancelar</button>
                  <button type="submit" disabled={saving} style={{ padding: '12px 24px', borderRadius: 12, border: 'none', background: saving ? '#a5b4fc' : 'linear-gradient(135deg, #6366f1, #7c3aed)', color: '#fff', fontWeight: 700, fontSize: '0.88rem', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {saving && <span className="material-symbols-outlined spinning" style={{ fontSize: 16 }}>progress_activity</span>}
                    Alterar Senha
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
