"use client";

import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Users,
  ChevronLeft,
  ChevronRight,
  X,
  Phone,
  Mail,
  User,
  Tag,
  Building2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────
interface Contact {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  unit: string;
  originUnit?: string | null;
  stage: string;
  source?: string | null;
  tags?: string | null;
  totalSpent: number;
  visitCount: number;
  isActive: boolean;
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────
const stageColors: Record<string, { bg: string; text: string }> = {
  entrada: { bg: "#8b5cf620", text: "#8b5cf6" },
  em_andamento: { bg: "#3b82f620", text: "#3b82f6" },
  avaliacao: { bg: "#f59e0b20", text: "#f59e0b" },
  venda: { bg: "#22c55e20", text: "#22c55e" },
  nao_venda: { bg: "#ef444420", text: "#ef4444" },
};

const stageLabels: Record<string, string> = {
  entrada: "Entrada",
  em_andamento: "Em Andamento",
  avaliacao: "Avaliação",
  venda: "Venda",
  nao_venda: "Não Venda",
};

const sourceLabels: Record<string, string> = {
  instagram: "Instagram",
  indicacao: "Indicação",
  google: "Google",
  whatsapp: "WhatsApp",
  site: "Site",
  meta_ads: "Meta Ads",
  facebook_ad: "Facebook Ads",
  outro: "Outro",
};

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ─── Contact Form Dialog ──────────────────────────────────────
function ContactFormDialog({
  open,
  onOpenChange,
  contact,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contact: Contact | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    unit: "",
    stage: "entrada",
    source: "",
    tags: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (contact) {
      setForm({
        name: contact.name || "",
        phone: contact.phone || "",
        email: contact.email || "",
        unit: contact.unit || "",
        stage: contact.stage || "entrada",
        source: contact.source || "",
        tags: contact.tags || "",
      });
    } else {
      setForm({ name: "", phone: "", email: "", unit: "", stage: "entrada", source: "", tags: "" });
    }
    setError("");
  }, [contact, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Nome é obrigatório."); return; }
    setSaving(true);
    setError("");

    const method = contact ? "PUT" : "POST";
    const body = contact
      ? { id: contact.id, ...form }
      : form;

    const res = await fetch("/api/clients", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Erro ao salvar contato.");
      return;
    }

    onSaved();
    onOpenChange(false);
  }

  const stageOptions = ["entrada", "em_andamento", "avaliacao", "venda", "nao_venda"];
  const sourceOptions = ["instagram", "indicacao", "google", "whatsapp", "site", "meta_ads", "outro"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">
            {contact ? "Editar Contato" : "Novo Contato"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {contact ? "Atualize as informações do contato." : "Preencha os dados do novo contato."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Nome *
            </label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Maria Silva"
              className="bg-card border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Telefone
              </label>
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="(11) 99999-9999"
                className="bg-card border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Email
              </label>
              <Input
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@exemplo.com"
                type="email"
                className="bg-card border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Stage + Source */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Estágio
              </label>
              <select
                value={form.stage}
                onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {stageOptions.map((s) => (
                  <option key={s} value={s}>
                    {stageLabels[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Origem
              </label>
              <select
                value={form.source}
                onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-border bg-card px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Selecione...</option>
                {sourceOptions.map((s) => (
                  <option key={s} value={s}>
                    {sourceLabels[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Unit + Tags */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Unidade
              </label>
              <Input
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                placeholder="Ex: Barueri"
                className="bg-card border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Tags
              </label>
              <Input
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                placeholder="VIP, Premium..."
                className="bg-card border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {error && (
            <p className="rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              {contact ? "Salvar" : "Criar Contato"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Contact Detail Sheet ─────────────────────────────────────
function ContactDetailSheet({
  contact,
  onClose,
  onEdit,
}: {
  contact: Contact | null;
  onClose: () => void;
  onEdit: (c: Contact) => void;
}) {
  if (!contact) return null;

  const tags = contact.tags
    ? contact.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  const stageStyle = stageColors[contact.stage] || { bg: "#6b728020", text: "#6b7280" };

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex">
      {/* Backdrop */}
      <button
        className="fixed inset-0 bg-background/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Fechar"
      />

      {/* Panel */}
      <div className="relative ml-auto flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-xl overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-foreground">Detalhes do Contato</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 p-6 space-y-6">
          {/* Avatar + Name */}
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary text-xl font-bold">
              {contact.name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">{contact.name}</h3>
              <span
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium mt-1"
                style={{ backgroundColor: stageStyle.bg, color: stageStyle.text }}
              >
                {stageLabels[contact.stage] || contact.stage}
              </span>
            </div>
          </div>

          {/* Info Grid */}
          <div className="space-y-3">
            {contact.phone && (
              <div className="flex items-center gap-3 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-foreground font-mono">{contact.phone}</span>
              </div>
            )}
            {contact.email && (
              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-foreground">{contact.email}</span>
              </div>
            )}
            {contact.source && (
              <div className="flex items-center gap-3 text-sm">
                <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground">Origem:</span>
                <span className="text-foreground">{sourceLabels[contact.source] || contact.source}</span>
              </div>
            )}
            {contact.unit && (
              <div className="flex items-center gap-3 text-sm">
                <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground">Unidade:</span>
                <span className="text-foreground">{contact.unit}</span>
              </div>
            )}
            {contact.originUnit && (
              <div className="flex items-center gap-3 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground">Unidade de origem:</span>
                <span className="text-foreground">{contact.originUnit}</span>
              </div>
            )}
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <Tag className="h-3.5 w-3.5" />
                Tags
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-xs text-muted-foreground mb-1">Total Gasto</p>
              <p className="text-lg font-bold text-foreground tabular-nums">
                {formatCurrency(contact.totalSpent || 0)}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-xs text-muted-foreground mb-1">Visitas</p>
              <p className="text-lg font-bold text-foreground tabular-nums">
                {contact.visitCount || 0}
              </p>
            </div>
          </div>

          <div className="text-xs text-muted-foreground pt-2 border-t border-border">
            Cadastrado em {formatDate(contact.createdAt)}
          </div>
        </div>

        {/* Footer actions */}
        <div className="border-t border-border p-4 flex gap-2">
          <Button
            className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={() => onEdit(contact)}
          >
            <Pencil className="size-4" />
            Editar
          </Button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// ─── Main Page ────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════
const PAGE_SIZE = 25;

function todayDateInput() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function CRMContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [startDate, setStartDate] = useState(todayDateInput);
  const [endDate, setEndDate] = useState(todayDateInput);
  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [orderBy, setOrderBy] = useState("name");

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [detailContact, setDetailContact] = useState<Contact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const params = new URLSearchParams({
        page: String(page + 1),
        limit: String(PAGE_SIZE),
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
        ...(selectedStages.length ? { stage: selectedStages.join(",") } : {}),
        ...(selectedSources.length ? { source: selectedSources.join(",") } : {}),
        orderBy,
      });
      const res = await fetch(`/api/clients?${params}`);
      const data = await res.json();
      setContacts(data.clients || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error("[CRM Contacts]", err);
    } finally {
      setLoading(false);
    }
  }, [page, search, startDate, endDate, selectedStages, selectedSources, orderBy]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Debounce search
  useEffect(() => {
    setPage(0);
  }, [search, startDate, endDate, selectedStages, selectedSources, orderBy]);

  function toggleFilterValue(value: string, setter: Dispatch<SetStateAction<string[]>>) {
    setter((prev) => prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]);
  }

  function clearFilters() {
    setStartDate("");
    setEndDate("");
    setSelectedStages([]);
    setSelectedSources([]);
    setOrderBy("name");
  }

  function openAddForm() {
    setEditContact(null);
    setFormOpen(true);
  }

  function openEditForm(contact: Contact) {
    setDetailContact(null);
    setEditContact(contact);
    setFormOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/clients?id=${deleteTarget.id}`, { method: "DELETE" });
      fetchContacts();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  async function handleBulkDelete() {
    setDeleting(true);
    try {
      await fetch("/api/clients", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      setSelected(new Set());
      fetchContacts();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
      setBulkDeleteOpen(false);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const allSelected = contacts.length > 0 && contacts.every((c) => selected.has(c.id));
  const someSelected = contacts.some((c) => selected.has(c.id));

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        contacts.forEach((c) => next.delete(c.id));
      } else {
        contacts.forEach((c) => next.add(c.id));
      }
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contatos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie sua base de contatos.{" "}
            {total > 0 && (
              <span className="font-medium text-foreground">{total.toLocaleString()} contatos.</span>
            )}
          </p>
        </div>
        <Button
          onClick={openAddForm}
          className="bg-primary hover:bg-primary/90 text-primary-foreground self-start sm:self-auto"
        >
          <Plus className="size-4" />
          Novo Contato
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, telefone ou email..."
          className="pl-8 bg-card border-border text-foreground placeholder:text-muted-foreground"
        />
      </div>

      <div className="rounded-xl border border-border/50 bg-card p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-foreground">Filtros de contatos</h2>
            <p className="mt-1 text-xs text-muted-foreground">Combine cadastro, origem, estágio e ordenação.</p>
          </div>
          <Button variant="outline" size="sm" onClick={clearFilters} className="border-border text-muted-foreground hover:bg-muted">
            Limpar filtros
          </Button>
        </div>
        <div className="grid gap-3 lg:grid-cols-4">
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Cadastro inicial
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 bg-background border-border" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Cadastro final
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 bg-background border-border" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Ordenação
            <select value={orderBy} onChange={(e) => setOrderBy(e.target.value)} className="mt-1 flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground">
              <option value="name">Nome A-Z</option>
              <option value="createdAt_desc">Cadastro mais recente</option>
              <option value="createdAt_asc">Cadastro mais antigo</option>
            </select>
          </label>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Estágio</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stageLabels).map(([key, label]) => (
                <button key={key} type="button" onClick={() => toggleFilterValue(key, setSelectedStages)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold ${selectedStages.includes(key) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Origem</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(sourceLabels).map(([key, label]) => (
                <button key={key} type="button" onClick={() => toggleFilterValue(key, setSelectedSources)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold ${selectedSources.includes(key) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-muted/40 px-4 py-2.5 shadow-sm">
          <p className="text-sm text-foreground">
            <span className="font-medium">{selected.size}</span>{" "}
            contato{selected.size !== 1 ? "s" : ""} selecionado{selected.size !== 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
              className="text-muted-foreground hover:text-foreground"
            >
              Limpar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="size-4" />
              Excluir selecionados
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border/50 bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  disabled={contacts.length === 0}
                  aria-label="Selecionar todos"
                />
              </TableHead>
              <TableHead className="text-muted-foreground">Nome</TableHead>
              <TableHead className="text-muted-foreground">Telefone</TableHead>
              <TableHead className="text-muted-foreground hidden md:table-cell">Email</TableHead>
              <TableHead className="text-muted-foreground hidden lg:table-cell">Estágio</TableHead>
              <TableHead className="text-muted-foreground hidden lg:table-cell">Origem</TableHead>
              <TableHead className="text-muted-foreground hidden xl:table-cell">Cadastrado</TableHead>
              <TableHead className="text-muted-foreground w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="border-border">
                <TableCell colSpan={8} className="text-center py-16">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="size-6 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Carregando contatos...</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : contacts.length === 0 ? (
              <TableRow className="border-border">
                <TableCell colSpan={8} className="text-center py-16">
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <Users className="size-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      {search ? "Nenhum contato encontrado" : "Nenhum contato ainda"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {search
                        ? "Tente ajustar sua busca."
                        : "Adicione o primeiro contato para começar."}
                    </p>
                    {!search && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={openAddForm}
                        className="mt-2 border-border text-muted-foreground hover:bg-muted"
                      >
                        <Plus className="size-3.5" />
                        Adicionar primeiro contato
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((contact) => {
                const stageStyle = stageColors[contact.stage] || { bg: "#6b728020", text: "#6b7280" };
                return (
                  <TableRow
                    key={contact.id}
                    className="border-border hover:bg-muted/50 cursor-pointer select-none"
                    onClick={() => setDetailContact(contact)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(contact.id)}
                        onCheckedChange={() => toggleOne(contact.id)}
                        aria-label={`Selecionar ${contact.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {contact.name?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <span className="text-foreground font-medium text-sm">
                          {contact.name || (
                            <span className="text-muted-foreground italic">Sem nome</span>
                          )}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {contact.phone || <span className="text-muted-foreground/40">—</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden md:table-cell text-sm">
                      {contact.email || <span className="text-muted-foreground/40">—</span>}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{ backgroundColor: stageStyle.bg, color: stageStyle.text }}
                      >
                        {stageLabels[contact.stage] || contact.stage}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden lg:table-cell text-xs">
                      {contact.source
                        ? sourceLabels[contact.source] || contact.source
                        : <span className="text-muted-foreground/40">—</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs hidden xl:table-cell">
                      {formatDate(contact.createdAt)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <button
                              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                              aria-label="Opções"
                            />
                          }
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="bg-popover border-border"
                        >
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditForm(contact);
                            }}
                            className="text-popover-foreground focus:bg-muted focus:text-foreground"
                          >
                            <Pencil className="size-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-border" />
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(contact);
                            }}
                            className="text-red-700 focus:bg-red-400/10 focus:text-red-800 dark:text-red-400 dark:focus:text-red-300"
                          >
                            <Trash2 className="size-4" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 h-8 w-8 p-0"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs text-muted-foreground px-3">
              Página {page + 1} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 h-8 w-8 p-0"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Contact Form Dialog */}
      <ContactFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        contact={editContact}
        onSaved={fetchContacts}
      />

      {/* Detail Sheet */}
      <ContactDetailSheet
        contact={detailContact}
        onClose={() => setDetailContact(null)}
        onEdit={(c) => {
          setDetailContact(null);
          openEditForm(c);
        }}
      />

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">Excluir Contato</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Tem certeza que deseja excluir{" "}
              <span className="text-popover-foreground font-medium">
                {deleteTarget?.name || deleteTarget?.phone}
              </span>
              ? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              Excluir {selected.size} Contato{selected.size !== 1 ? "s" : ""}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Tem certeza que deseja excluir{" "}
              <span className="text-popover-foreground font-medium">
                {selected.size} contato{selected.size !== 1 ? "s" : ""}
              </span>
              ? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkDeleteOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={deleting}>
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
