'use client';
import React, { useState, useEffect } from 'react';

export interface UserPermissions {
  // Dashboard
  dashboard: boolean;
  dashboardVendas: boolean;
  dashboardMetas: boolean;
  dashboardRelatorios: boolean;
  dashboardAnalise: boolean;
  crmEstatistica: boolean;
  // Agenda
  agenda: boolean;
  darBaixa: boolean;
  excluirFinalizado: boolean;
  // Pedidos
  pedidos: boolean;
  pedidosEditarDireto: boolean;
  pedidosAprovar: boolean;
  pedidosHistorico: boolean;
  pedidosExcluirHistorico: boolean;
  // Financeiro
  financeiro: boolean;
  finAdiantamento: boolean;
  finPremiacao: boolean;
  finReembolso: boolean;
  finCustos: boolean;
  finAnalise: boolean;
  // Administrativo
  cancelamento: boolean;
  termos: boolean;
  deleteOrcamento: boolean;
  // Sistema
  perfil: boolean;
  usuarios: boolean;
  multiUnit: boolean;
  admin: boolean;
  // Unidades (acesso individual)
  unitBarueri: boolean;
  unitSCS: boolean;
  unitSBC: boolean;
  unitOsasco: boolean;
}

export interface UserData {
  id: string; name: string; email: string; phone: string | null;
  role: string; unit: string | null; permissions: UserPermissions | null;
  isActive: boolean; createdAt: string;
}

export const DEFAULT_PERMISSIONS: UserPermissions = {
  dashboard: false, dashboardVendas: false, dashboardMetas: false, dashboardRelatorios: false, dashboardAnalise: false, crmEstatistica: false,
  agenda: false, darBaixa: false, excluirFinalizado: false,
  pedidos: false, pedidosEditarDireto: false, pedidosAprovar: false, pedidosHistorico: false, pedidosExcluirHistorico: false,
  financeiro: false, finAdiantamento: false, finPremiacao: false, finReembolso: false, finCustos: false, finAnalise: false,
  cancelamento: false, termos: false, deleteOrcamento: false,
  perfil: true, usuarios: false, multiUnit: false, admin: false,
  unitBarueri: false, unitSCS: false, unitSBC: false, unitOsasco: false,
};

export const PERMISSION_LABELS: Record<string, string> = {
  dashboard: 'Visão Geral', dashboardVendas: 'Vendas', dashboardMetas: 'Metas',
  dashboardRelatorios: 'Relatórios', dashboardAnalise: 'Análise (Dashboard)',
  crmEstatistica: 'CRM Estatística',
  agenda: 'Agenda', darBaixa: 'Dar Baixa (Finalizar Procedimento)', excluirFinalizado: 'Excluir Sessão Finalizada',
  pedidos: 'Acessar Pedidos', pedidosEditarDireto: 'Alterar Pedidos sem Aprovação',
  pedidosAprovar: 'Aprovar Alterações em Pedidos', pedidosHistorico: 'Visualizar Histórico de Alterações',
  pedidosExcluirHistorico: 'Excluir Histórico de Alterações',
  financeiro: 'Folha de Pagamento', finAdiantamento: 'Adiantamento', finPremiacao: 'Premiação',
  finReembolso: 'Reembolso', finCustos: 'Custos', finAnalise: 'Análise Financeira',
  cancelamento: 'Cancelamentos', termos: 'Termos e Contratos', deleteOrcamento: 'Excluir Orçamentos',
  perfil: 'Meu Perfil', usuarios: 'Gestão de Usuários', multiUnit: 'Acesso Multi-Unidade', admin: 'Administrador Total',
  unitBarueri: 'Barueri', unitSCS: 'São Caetano do Sul', unitSBC: 'São Bernardo do Campo', unitOsasco: 'Osasco',
};

export const PERMISSION_ICONS: Record<string, string> = {
  dashboard: 'dashboard', dashboardVendas: 'point_of_sale', dashboardMetas: 'flag',
  dashboardRelatorios: 'summarize', dashboardAnalise: 'analytics',
  crmEstatistica: 'insights',
  agenda: 'calendar_month', darBaixa: 'check_circle', excluirFinalizado: 'delete_forever',
  pedidos: 'shopping_cart', pedidosEditarDireto: 'edit_note', pedidosAprovar: 'approval',
  pedidosHistorico: 'history', pedidosExcluirHistorico: 'delete_sweep',
  financeiro: 'payments', finAdiantamento: 'account_balance_wallet', finPremiacao: 'emoji_events',
  finReembolso: 'receipt_long', finCustos: 'account_balance', finAnalise: 'analytics',
  cancelamento: 'cancel', termos: 'description', deleteOrcamento: 'delete_forever',
  perfil: 'person', usuarios: 'manage_accounts', multiUnit: 'apartment', admin: 'shield_person',
  unitBarueri: 'location_on', unitSCS: 'location_on', unitSBC: 'location_on', unitOsasco: 'location_on',
};

export interface PermissionCategory {
  label: string;
  icon: string;
  color: string;
  description: string;
  keys: (keyof UserPermissions)[];
}

export const PERMISSION_CATEGORIES: PermissionCategory[] = [
  { label: 'Dashboard', icon: 'dashboard', color: '#6366f1', description: 'Acesso ao painel de controle, vendas e relatórios',
    keys: ['dashboard', 'dashboardVendas', 'dashboardMetas', 'dashboardRelatorios', 'dashboardAnalise', 'crmEstatistica'] },
  { label: 'Agenda', icon: 'calendar_month', color: '#e600a0', description: 'Agendamentos e gestão de horários',
    keys: ['agenda', 'darBaixa', 'excluirFinalizado'] },
  { label: 'Pedidos', icon: 'shopping_cart', color: '#f59e0b', description: 'Gestão de pedidos, aprovações e histórico',
    keys: ['pedidos', 'pedidosEditarDireto', 'pedidosAprovar', 'pedidosHistorico', 'pedidosExcluirHistorico'] },
  { label: 'Financeiro', icon: 'payments', color: '#10b981', description: 'Folha de pagamento, adiantamentos e custos',
    keys: ['financeiro', 'finAdiantamento', 'finPremiacao', 'finReembolso', 'finCustos', 'finAnalise'] },
  { label: 'Administrativo', icon: 'admin_panel_settings', color: '#ef4444', description: 'Cancelamentos, contratos e exclusão de orçamentos',
    keys: ['cancelamento', 'termos', 'deleteOrcamento'] },
  { label: 'Sistema', icon: 'settings', color: '#8b5cf6', description: 'Configurações de acesso e administração',
    keys: ['perfil', 'usuarios', 'multiUnit', 'admin'] },
  { label: 'Unidades', icon: 'apartment', color: '#0ea5e9', description: 'Habilite o acesso individual a cada unidade',
    keys: ['unitSCS', 'unitSBC', 'unitOsasco'] },
];

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
  const [formUnit, setFormUnit] = useState('SCS');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formPermissions, setFormPermissions] = useState<UserPermissions>({ ...DEFAULT_PERMISSIONS });
  const [formWhatsappInstances, setFormWhatsappInstances] = useState<string[]>([]); // instanceName[]

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
    setFormPhone(''); setFormRole('VENDEDOR'); setFormUnit('SCS');
    setFormIsActive(true); setFormPermissions({ ...DEFAULT_PERMISSIONS }); setFormWhatsappInstances([]); setShowModal(true);
  }

  function openEditModal(user: UserData) {
    setEditingUser(user); setFormName(user.name); setFormEmail(user.email);
    setFormPassword(''); setFormPhone(user.phone || ''); setFormRole(user.role);
    setFormUnit(user.unit || 'SCS'); setFormIsActive(user.isActive);
    setFormPermissions(user.permissions ? { ...DEFAULT_PERMISSIONS, ...user.permissions } : { ...DEFAULT_PERMISSIONS });
    // Load whatsapp instances from permissions JSON (stored as whatsappInstances array)
    const perms = user.permissions as any;
    setFormWhatsappInstances(perms?.whatsappInstances || []);
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    
    let derivedUnit = formUnit;
    if (formPermissions.unitOsasco) derivedUnit = 'Osasco';
    else if (formPermissions.unitSBC) derivedUnit = 'SBC';
    else if (formPermissions.unitSCS) derivedUnit = 'SCS';
    else if (formPermissions.unitBarueri) derivedUnit = 'Barueri';
    
    const payload: any = { name: formName, email: formEmail, phone: formPhone, role: formRole, unit: derivedUnit, isActive: formIsActive, permissions: { ...formPermissions, whatsappInstances: formWhatsappInstances } };
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

  function toggleCategory(keys: (keyof UserPermissions)[]) {
    setFormPermissions(prev => {
      const allOn = keys.every(k => prev[k]);
      const next = { ...prev };
      keys.forEach(k => { next[k] = !allOn; });
      return next;
    });
  }

  const formatRole = (r: string) => {
    const roleMap: Record<string, string> = {
      ADMINISTRADOR: 'Administrador', GERENTE: 'Gerente', SECRETARIA: 'Secretária',
      VENDEDOR: 'Vendedor', ESTETICISTA: 'Esteticista',
    };
    return roleMap[r] || r.charAt(0) + r.slice(1).toLowerCase();
  };
  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  return {
    users, loading, showModal, setShowModal, editingUser, deleteConfirmId, setDeleteConfirmId,
    saving, feedback, formName, setFormName, formEmail, setFormEmail, formPassword, setFormPassword,
    formPhone, setFormPhone, formRole, setFormRole, formUnit, setFormUnit, formIsActive, setFormIsActive,
    formPermissions, formWhatsappInstances, setFormWhatsappInstances,
    openCreateModal, openEditModal, handleSave, handleDelete, togglePermission, toggleCategory,
    formatRole, getInitials,
  };
}
