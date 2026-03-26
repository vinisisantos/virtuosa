'use client';
import React, { useState, useEffect } from 'react';

export interface UserPermissions {
  dashboard: boolean; cancelamento: boolean; pedidos: boolean; financeiro: boolean;
  perfil: boolean; usuarios: boolean; relatorios: boolean; admin: boolean;
}

export interface UserData {
  id: string; name: string; email: string; phone: string | null;
  role: string; unit: string | null; permissions: UserPermissions | null;
  isActive: boolean; createdAt: string;
}

export const DEFAULT_PERMISSIONS: UserPermissions = {
  dashboard: false, cancelamento: false, pedidos: false, financeiro: false,
  perfil: true, usuarios: false, relatorios: false, admin: false,
};

export const PERMISSION_LABELS: Record<string, string> = {
  dashboard: 'Dashboard', cancelamento: 'Cancelamentos', pedidos: 'Pedidos',
  financeiro: 'Financeiro', perfil: 'Meu Perfil', usuarios: 'Gestão de Usuários',
  relatorios: 'Relatórios', admin: 'Administrador Total',
};

export const PERMISSION_ICONS: Record<string, string> = {
  dashboard: 'dashboard', cancelamento: 'cancel', pedidos: 'shopping_cart',
  financeiro: 'payments', perfil: 'person', usuarios: 'manage_accounts',
  relatorios: 'assessment', admin: 'shield_person',
};

export function useUsers() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRole, setFormRole] = useState('VENDEDOR');
  const [formUnit, setFormUnit] = useState('Barueri');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formPermissions, setFormPermissions] = useState<UserPermissions>({ ...DEFAULT_PERMISSIONS });

  useEffect(() => { fetchUsers(); }, []);
  useEffect(() => { if (feedback) { const t = setTimeout(() => setFeedback(null), 4000); return () => clearTimeout(t); } }, [feedback]);

  async function fetchUsers() {
    setLoading(true);
    try { const res = await fetch('/api/users'); setUsers(await res.json()); }
    catch (err) { console.error('Failed to load users', err); }
    finally { setLoading(false); }
  }

  function openCreateModal() {
    setEditingUser(null); setFormName(''); setFormEmail(''); setFormPassword('');
    setFormPhone(''); setFormRole('VENDEDOR'); setFormUnit('Barueri');
    setFormIsActive(true); setFormPermissions({ ...DEFAULT_PERMISSIONS }); setShowModal(true);
  }

  function openEditModal(user: UserData) {
    setEditingUser(user); setFormName(user.name); setFormEmail(user.email);
    setFormPassword(''); setFormPhone(user.phone || ''); setFormRole(user.role);
    setFormUnit(user.unit || 'Barueri'); setFormIsActive(user.isActive);
    setFormPermissions(user.permissions ? { ...DEFAULT_PERMISSIONS, ...user.permissions } : { ...DEFAULT_PERMISSIONS });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    const payload: any = { name: formName, email: formEmail, phone: formPhone, role: formRole, unit: formUnit, isActive: formIsActive, permissions: formPermissions };
    try {
      if (editingUser) {
        payload.id = editingUser.id;
        if (formPassword.trim()) payload.password = formPassword;
        const res = await fetch('/api/users', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error((await res.json()).error || 'Erro ao atualizar');
        setFeedback({ type: 'success', message: `Usuário "${formName}" atualizado com sucesso!` });
      } else {
        payload.password = formPassword;
        if (!formPassword) { setFeedback({ type: 'error', message: 'Senha é obrigatória para novos usuários.' }); setSaving(false); return; }
        const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error((await res.json()).error || 'Erro ao criar');
        setFeedback({ type: 'success', message: `Usuário "${formName}" criado com sucesso!` });
      }
      setShowModal(false); fetchUsers();
    } catch (err: any) { setFeedback({ type: 'error', message: err.message || 'Erro inesperado.' }); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/users?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao excluir');
      setFeedback({ type: 'success', message: 'Usuário excluído com sucesso.' });
      setDeleteConfirmId(null); fetchUsers();
    } catch (err: any) { setFeedback({ type: 'error', message: err.message || 'Erro ao excluir.' }); }
  }

  function togglePermission(key: keyof UserPermissions) {
    setFormPermissions(prev => {
      const next = { ...prev, [key]: !prev[key] };
      if (key === 'admin' && next.admin) Object.keys(next).forEach(k => (next as any)[k] = true);
      return next;
    });
  }

  const formatRole = (r: string) => r.charAt(0) + r.slice(1).toLowerCase();
  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  return {
    users, loading, showModal, setShowModal, editingUser, deleteConfirmId, setDeleteConfirmId,
    saving, feedback, formName, setFormName, formEmail, setFormEmail, formPassword, setFormPassword,
    formPhone, setFormPhone, formRole, setFormRole, formUnit, setFormUnit, formIsActive, setFormIsActive,
    formPermissions, openCreateModal, openEditModal, handleSave, handleDelete, togglePermission,
    formatRole, getInitials,
  };
}
