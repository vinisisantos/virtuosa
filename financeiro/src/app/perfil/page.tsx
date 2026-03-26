'use client';

import React, { useState } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { toast } from '@/components/toast';

export default function ProfilePage() {
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [userId, setUserId] = useState('');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [unit, setUnit] = useState('Barueri');
    const [role, setRole] = useState('VENDEDOR');
    
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');



    React.useEffect(() => {
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

            } catch (e) {
                console.error(e);
            }
        }
    }, []);



    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // Non-admin users can only change name, email, phone
            const payload: any = { id: userId, name, email, phone };
            const res = await fetch('/api/users', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const data = await res.json();
                // Update local storage
                const userDataRaw = localStorage.getItem('virtuosa_user');
                if (userDataRaw) {
                    const user = JSON.parse(userDataRaw);
                    const updatedUser = { ...user, name, email, phone, unit, role };
                    localStorage.setItem('virtuosa_user', JSON.stringify(updatedUser));
                }
                toast('Alterações salvas com sucesso!', 'success');
                window.location.reload();
            } else {
                const err = await res.json();
                toast(err.error || 'Erro ao salvar perfil.', 'error');
            }
        } catch (error) {
            console.error(error);
            toast('Erro de conexão.', 'error');
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) { toast('As senhas não coincidem!', 'warning'); return; }
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
        }
    };

    return (
        <AuthGuard requiredPermission="perfil">
            <div className="dashboard-body" style={{ minHeight: '100vh', background: 'var(--bg)' }}>
                <div className="app-container">
                    <AppHeader activePage="perfil" />

                    <main className="main-content">
                        <div className="profile-container-grid">
                            <div className="profile-sidebar">
                                <div className="card profile-card-hero">
                                    <div className="profile-hero-avatar">{name ? name.substring(0, 2).toUpperCase() : 'US'}</div>
                                    <h2 className="profile-hero-name">{name}</h2>
                                    <p className="profile-hero-role">{role}{role !== 'ADMINISTRADOR' ? ` Unidade ${unit}` : ''}</p>
                                    <button className="btn btn-outline full-width">
                                        <span className="material-symbols-outlined">photo_camera</span> Alterar Foto
                                    </button>
                                </div>

                                <div className="card security-card">
                                    <h3 className="section-title"><span className="material-symbols-outlined">security</span> Segurança</h3>
                                    <p className="section-desc">Mantenha sua conta segura alterando sua senha regularmente.</p>
                                    <button className="btn btn-primary full-width" onClick={() => setShowPasswordModal(true)}>
                                        <span className="material-symbols-outlined">lock_reset</span> Alterar Senha
                                    </button>
                                </div>
                            </div>

                            <div className="profile-main">
                                <div className="card profile-form-card">
                                    <div className="section-header">
                                        <h2 className="section-title"><span className="material-symbols-outlined">person_edit</span> Informações Pessoais</h2>
                                    </div>

                                    <form onSubmit={handleSaveProfile} className="grid-form">
                                        <div className="form-group full-width">
                                            <label>Nome Completo</label>
                                            <div className="input-with-icon">
                                                <span className="material-symbols-outlined input-icon">badge</span>
                                                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome completo" />
                                            </div>
                                        </div>

                                        <div className="form-group">
                                            <label>E-mail Corporativo</label>
                                            <div className="input-with-icon">
                                                <span className="material-symbols-outlined input-icon">mail</span>
                                                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Seu e-mail" />
                                            </div>
                                        </div>

                                        <div className="form-group">
                                            <label>Telefone / WhatsApp</label>
                                            <div className="input-with-icon">
                                                <span className="material-symbols-outlined input-icon">call</span>
                                                <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
                                            </div>
                                        </div>

                                        {role !== 'ADMINISTRADOR' && (
                                        <div className="form-group">
                                            <label>Unidade Principal</label>
                                            <div className="input-with-icon">
                                                <span className="material-symbols-outlined input-icon">storefront</span>
                                                <input type="text" value={unit} readOnly disabled style={{ opacity: 0.7, cursor: 'not-allowed' }} />
                                            </div>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>Apenas o administrador pode alterar</span>
                                        </div>
                                        )}

                                        <div className="form-group full-width">
                                            <label>Cargo / Função</label>
                                            <div className="input-with-icon">
                                                <span className="material-symbols-outlined input-icon">work</span>
                                                <input type="text" value={role.charAt(0) + role.slice(1).toLowerCase()} readOnly disabled style={{ opacity: 0.7, cursor: 'not-allowed' }} />
                                            </div>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>Apenas o administrador pode alterar</span>
                                        </div>

                                        <div className="form-actions full-width" style={{ marginTop: 20, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                                            <button className="btn btn-primary" onClick={() => { localStorage.removeItem('virtuosa_user'); window.location.href = '/login.html'; }}>Cancelar</button>
                                            <button type="submit" className="btn btn-primary" style={{ background: 'linear-gradient(135deg, var(--primary), #ff4db1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span className="material-symbols-outlined">save</span> Salvar Alterações
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        </AuthGuard>
    );
}
