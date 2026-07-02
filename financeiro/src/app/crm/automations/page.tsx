"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Zap,
  Plus,
  Trash2,
  Pencil,
  Copy,
  Loader2,
  MessageSquare,
  Clock,
  Users,
  Phone,
  Tag,
  ArrowRight,
  ArrowLeft,
  Check,
  MoreVertical,
  Power,
  PowerOff,
  ChevronDown,
  Send,
  Timer,
  GitBranch,
  X,
  FileText,
  ShieldAlert,
  PhoneOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// ─── Types ────────────────────────────────────────────────────
interface AutomationStep {
  type: string;
  config: Record<string, unknown>;
}

interface Automation {
  id: string;
  name: string;
  description: string | null;
  triggerType: string;
  triggerConfig: Record<string, unknown> | null;
  steps: AutomationStep[];
  isActive: boolean;
  executionCount: number;
  lastExecutedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  _count?: { logs: number };
}

interface CallBlockSettings {
  enabled: boolean;
  message: string;
  cooldownMinutes: number;
  units: string[];
}

// ─── Constants ───────────────────────────────────────────────
const TRIGGER_TYPES = [
  { key: "ctwa_welcome", label: "Boas-vindas CTWA", desc: "Somente novos leads de campanhas", icon: MessageSquare },
  { key: "new_message", label: "Nova Mensagem Recebida", desc: "Qualquer mensagem recebida", icon: MessageSquare },
  { key: "keyword", label: "Palavra-chave", desc: "Mensagem contém palavras específicas", icon: Tag },
  { key: "new_contact", label: "Novo Contato", desc: "Quando um contato é criado", icon: Users },
  { key: "stage_change", label: "Mudança de Estágio", desc: "Quando o estágio do contato muda", icon: GitBranch },
];

const STEP_TYPES = [
  { key: "send_message", label: "Enviar Mensagem", icon: Send, color: "text-blue-400 bg-blue-400/10" },
  { key: "wait", label: "Aguardar", icon: Timer, color: "text-amber-400 bg-amber-400/10" },
  { key: "add_tag", label: "Adicionar Tag", icon: Tag, color: "text-purple-400 bg-purple-400/10" },
  { key: "send_notification", label: "Notificar Equipe", icon: Phone, color: "text-emerald-400 bg-emerald-400/10" },
];

const CALL_BLOCK_UNITS = ["Osasco", "SBC", "SCS"];
const DEFAULT_CALL_BLOCK_MESSAGE =
  "Este número não recebe ligações. Por favor, envie sua mensagem por aqui para darmos continuidade ao atendimento.";

const TEMPLATES = [
  {
    name: "Mensagem de Boas-vindas",
    description: "Enviar saudação automática para novos contatos",
    triggerType: "new_contact",
    triggerConfig: {},
    steps: [
      { type: "wait", config: { seconds: 5 } },
      { type: "send_message", config: { message: "Olá! 👋 Seja bem-vindo(a) à Virtuosa! Como posso ajudar?" } },
    ],
  },
  {
    name: "Resposta Fora do Horário",
    description: "Informar horário de atendimento quando offline",
    triggerType: "new_message",
    triggerConfig: {},
    steps: [
      { type: "send_message", config: { message: "Olá! No momento estamos fora do horário de atendimento. Retornaremos em breve! 🕐" } },
    ],
  },
  {
    name: "Qualificação de Lead",
    description: "Perguntar interesse ao receber mensagem com palavra-chave",
    triggerType: "keyword",
    triggerConfig: { keywords: ["preço", "valor", "orçamento", "quanto"] },
    steps: [
      { type: "send_message", config: { message: "Oi! 😊 Vi que você tem interesse em nossos serviços. Posso te enviar mais informações?" } },
      { type: "add_tag", config: { tag: "interessado" } },
    ],
  },
  {
    name: "Follow-up Automático",
    description: "Enviar lembrete após mudança de estágio",
    triggerType: "stage_change",
    triggerConfig: { stage: "avaliacao" },
    steps: [
      { type: "wait", config: { seconds: 86400 } },
      { type: "send_message", config: { message: "Olá! Tudo bem? 😊 Gostaria de saber se você tem alguma dúvida sobre a avaliação. Estamos à disposição!" } },
      { type: "send_notification", config: { message: "Follow-up automático enviado" } },
    ],
  },
];

function formatWaitTime(seconds: number): string {
  if (seconds < 60) return `${seconds} segundos`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutos`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} horas`;
  return `${Math.round(seconds / 86400)} dias`;
}

function triggerLabel(type: string): string {
  return TRIGGER_TYPES.find((t) => t.key === type)?.label || type;
}

function TriggerIcon({ type }: { type: string }) {
  const t = TRIGGER_TYPES.find((tr) => tr.key === type);
  if (!t) return <Zap className="h-4 w-4" />;
  const Icon = t.icon;
  return <Icon className="h-4 w-4" />;
}

// ─── Automation Card ──────────────────────────────────────────
function AutomationCard({
  automation,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  automation: Automation;
  onToggle: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isNativeCtwa = automation.triggerType === "ctwa_welcome";

  return (
    <div className="rounded-xl border border-border bg-card transition-colors hover:border-primary/30">
      <div className="flex items-center gap-4 p-4">
        {/* Icon */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Zap className="h-5 w-5 text-primary" />
        </div>

        {/* Content */}
        <button onClick={onEdit} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{automation.name}</span>
            {automation.isActive && (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
            )}
          </div>
          {automation.description && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{automation.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium">
              <TriggerIcon type={automation.triggerType} />
              {triggerLabel(automation.triggerType)}
            </span>
            <span className="tabular-nums">{automation.executionCount} execuções</span>
            <span>· {automation.steps?.length || 0} ações</span>
          </div>
        </button>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Toggle */}
          <button
            onClick={onToggle}
            className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
              automation.isActive
                ? "bg-primary/10 text-primary hover:bg-primary/20"
                : "text-muted-foreground hover:bg-muted"
            }`}
            title={automation.isActive ? "Desativar" : "Ativar"}
          >
            {automation.isActive ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
          </button>

          {/* Menu */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-colors"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-40 mt-1 w-40 rounded-lg border border-border bg-popover p-1 shadow-lg">
                  <button onClick={() => { onEdit(); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted">
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </button>
                  {!isNativeCtwa && (
                    <>
                      <button onClick={() => { onDuplicate(); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted">
                        <Copy className="h-3.5 w-3.5" /> Duplicar
                      </button>
                      <div className="my-1 h-px bg-border" />
                      <button onClick={() => { onDelete(); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-red-400 hover:bg-red-400/10">
                        <Trash2 className="h-3.5 w-3.5" /> Excluir
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step Editor ──────────────────────────────────────────────
function StepEditor({
  step,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  step: AutomationStep;
  index: number;
  total: number;
  onChange: (s: AutomationStep) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const meta = STEP_TYPES.find((s) => s.key === step.type);
  const Icon = meta?.icon || Zap;

  return (
    <div className="relative">
      {/* Connector line */}
      {index > 0 && (
        <div className="absolute left-5 -top-3 h-3 w-px bg-border" />
      )}

      <div className="rounded-lg border border-border bg-card p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-md ${meta?.color || "bg-muted text-muted-foreground"}`}>
              <Icon className="h-3.5 w-3.5" />
            </div>
            <span className="text-xs font-medium text-foreground">{meta?.label || step.type}</span>
            <span className="text-[10px] text-muted-foreground">#{index + 1}</span>
          </div>
          <div className="flex items-center gap-1">
            {index > 0 && (
              <button onClick={onMoveUp} className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:bg-muted text-xs">▲</button>
            )}
            {index < total - 1 && (
              <button onClick={onMoveDown} className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:bg-muted text-xs">▼</button>
            )}
            <button onClick={onRemove} className="h-6 w-6 flex items-center justify-center rounded text-red-400 hover:bg-red-400/10">
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Config fields */}
        {step.type === "send_message" && (
          <textarea
            value={(step.config.message as string) || ""}
            onChange={(e) => onChange({ ...step, config: { ...step.config, message: e.target.value } })}
            placeholder="Mensagem a ser enviada..."
            rows={3}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
        )}

        {step.type === "wait" && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={step.config.seconds as number || 0}
              onChange={(e) => onChange({ ...step, config: { ...step.config, seconds: parseInt(e.target.value) || 0 } })}
              className="w-24 bg-background border-border text-foreground"
              min={0}
            />
            <select
              value={
                (step.config.seconds as number || 0) >= 86400 ? "days" :
                (step.config.seconds as number || 0) >= 3600 ? "hours" :
                (step.config.seconds as number || 0) >= 60 ? "minutes" : "seconds"
              }
              onChange={(e) => {
                const current = (step.config.seconds as number) || 0;
                let multiplier = 1;
                if (e.target.value === "minutes") multiplier = 60;
                else if (e.target.value === "hours") multiplier = 3600;
                else if (e.target.value === "days") multiplier = 86400;
                onChange({ ...step, config: { ...step.config, seconds: multiplier } });
              }}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            >
              <option value="seconds">segundos</option>
              <option value="minutes">minutos</option>
              <option value="hours">horas</option>
              <option value="days">dias</option>
            </select>
          </div>
        )}

        {step.type === "add_tag" && (
          <Input
            value={(step.config.tag as string) || ""}
            onChange={(e) => onChange({ ...step, config: { ...step.config, tag: e.target.value } })}
            placeholder="Nome da tag..."
            className="bg-background border-border text-foreground"
          />
        )}

        {step.type === "send_notification" && (
          <Input
            value={(step.config.message as string) || ""}
            onChange={(e) => onChange({ ...step, config: { ...step.config, message: e.target.value } })}
            placeholder="Mensagem da notificação..."
            className="bg-background border-border text-foreground"
          />
        )}
      </div>
    </div>
  );
}

// ─── Builder Dialog ──────────────────────────────────────────
function AutomationBuilder({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: Partial<Automation> | null;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState("new_message");
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>({});
  const [steps, setSteps] = useState<AutomationStep[]>([]);
  const [saving, setSaving] = useState(false);
  const isNativeCtwa = initial?.triggerType === "ctwa_welcome";

  // Load initial data
  useEffect(() => {
    if (open && initial) {
      setName(initial.name || "");
      setDescription(initial.description || "");
      setTriggerType(initial.triggerType || "new_message");
      setTriggerConfig(initial.triggerConfig || {});
      setSteps(Array.isArray(initial.steps) ? initial.steps : []);
    } else if (open && !initial) {
      setName("");
      setDescription("");
      setTriggerType("new_message");
      setTriggerConfig({});
      setSteps([]);
    }
  }, [open, initial]);

  function addStep(type: string) {
    const defaultConfig: Record<string, Record<string, unknown>> = {
      send_message: { message: "" },
      wait: { seconds: 60 },
      add_tag: { tag: "" },
      send_notification: { message: "" },
    };
    setSteps([...steps, { type, config: defaultConfig[type] || {} }]);
  }

  function updateStep(i: number, step: AutomationStep) {
    setSteps(steps.map((s, idx) => (idx === i ? step : s)));
  }

  function removeStep(i: number) {
    setSteps(steps.filter((_, idx) => idx !== i));
  }

  function moveStep(from: number, to: number) {
    const arr = [...steps];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    setSteps(arr);
  }

  async function handleSave() {
    if (!name.trim() || steps.length === 0) return;
    setSaving(true);
    const data: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim() || null,
      triggerType,
      triggerConfig,
      steps,
    };
    if (initial?.id) data.id = initial.id;
    await onSave(data);
    setSaving(false);
  }

  const isValid = name.trim().length > 0 && steps.length > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) onClose(); }}>
      <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Editar Automação" : "Nova Automação"}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Configure o gatilho e as ações que serão executadas automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Name + Description */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nome *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Boas-vindas Automáticas"
                className="bg-card border-border text-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Descrição</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrição opcional..."
                className="bg-card border-border text-foreground"
              />
            </div>
          </div>

          {/* Trigger */}
          <div className="space-y-3">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Gatilho</label>
            <div className="grid grid-cols-2 gap-2">
              {TRIGGER_TYPES.map((t) => {
                const Icon = t.icon;
                const active = triggerType === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => { if (!isNativeCtwa) { setTriggerType(t.key); setTriggerConfig({}); } }}
                    disabled={isNativeCtwa && t.key !== "ctwa_welcome"}
                    className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-all ${
                      active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card hover:bg-muted/50"
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 ${active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">{t.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{t.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Keyword config */}
            {triggerType === "keyword" && (
              <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Palavras-chave (separadas por vírgula)</label>
                <Input
                  value={(triggerConfig.keywords as string[] || []).join(", ")}
                  onChange={(e) => setTriggerConfig({ ...triggerConfig, keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) })}
                  placeholder="preço, valor, orçamento"
                  className="bg-background border-border text-foreground"
                />
              </div>
            )}

            {/* Stage change config */}
            {triggerType === "stage_change" && (
              <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Estágio de destino</label>
                <select
                  value={(triggerConfig.stage as string) || ""}
                  onChange={(e) => setTriggerConfig({ ...triggerConfig, stage: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Qualquer estágio</option>
                  <option value="entrada">Entrada</option>
                  <option value="em_andamento">Em Andamento</option>
                  <option value="avaliacao">Avaliação</option>
                  <option value="venda">Venda</option>
                  <option value="nao_venda">Não Venda</option>
                </select>
              </div>
            )}
          </div>

          {/* Steps */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Ações ({steps.length})
              </label>
            </div>

            {steps.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 py-8">
                <Zap className="h-6 w-6 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Adicione ações abaixo</p>
              </div>
            ) : (
              <div className="space-y-3">
                {steps.map((step, i) => (
                  <StepEditor
                    key={i}
                    step={step}
                    index={i}
                    total={steps.length}
                    onChange={(s) => updateStep(i, s)}
                    onRemove={() => removeStep(i)}
                    onMoveUp={() => moveStep(i, i - 1)}
                    onMoveDown={() => moveStep(i, i + 1)}
                  />
                ))}
              </div>
            )}

            {/* Add step buttons */}
            <div className="flex flex-wrap gap-2">
              {STEP_TYPES.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.key}
                    onClick={() => addStep(s.key)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    <Icon className="h-3 w-3" />
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving} className="border-border text-muted-foreground">
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isValid || saving}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {initial?.id ? "Salvar" : "Criar Automação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CallBlockAutomationPanel() {
  const [settings, setSettings] = useState<CallBlockSettings>({
    enabled: false,
    message: DEFAULT_CALL_BLOCK_MESSAGE,
    cooldownMinutes: 30,
    units: CALL_BLOCK_UNITS,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/call-block");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || "Erro ao carregar bloqueio de ligações", "error");
        return;
      }
      setSettings({
        enabled: data.settings?.enabled === true,
        message: data.settings?.message || DEFAULT_CALL_BLOCK_MESSAGE,
        cooldownMinutes: data.settings?.cooldownMinutes || 30,
        units:
          Array.isArray(data.settings?.units) && data.settings.units.length
            ? data.settings.units
            : CALL_BLOCK_UNITS,
      });
    } catch {
      toast("Erro ao carregar bloqueio de ligações", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const toggleUnit = (unit: string) => {
    setSettings((current) => {
      const nextUnits = current.units.includes(unit)
        ? current.units.filter((item) => item !== unit)
        : [...current.units, unit];
      return { ...current, units: nextUnits.length ? nextUnits : current.units };
    });
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/whatsapp/call-block", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || "Erro ao salvar bloqueio de ligações", "error");
        return;
      }

      setSettings(data.settings || settings);
      const synced = data.webhookSync?.synced || 0;
      const failed = data.webhookSync?.failed || 0;
      toast(
        failed > 0
          ? `Automação salva. ${synced} webhook(s) atualizados e ${failed} falharam.`
          : `Automação salva. ${synced} webhook(s) atualizados.`,
        failed > 0 ? "info" : "success",
      );
    } catch {
      toast("Erro ao salvar bloqueio de ligações", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500/10">
            <PhoneOff className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-foreground">Bloqueio de ligações</h2>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  settings.enabled
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {settings.enabled ? "Ativa" : "Inativa"}
              </span>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Recusa chamadas recebidas nas instâncias selecionadas e envia uma mensagem automática avisando que o número não recebe ligações.
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant={settings.enabled ? "outline" : "default"}
          onClick={() => setSettings((current) => ({ ...current, enabled: !current.enabled }))}
          disabled={loading}
          className={
            settings.enabled
              ? "border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          }
        >
          {settings.enabled ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
          {settings.enabled ? "Desativar" : "Ativar"}
        </Button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_220px]">
        <div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Mensagem automática
          </label>
          <textarea
            value={settings.message}
            onChange={(event) => setSettings((current) => ({ ...current, message: event.target.value }))}
            rows={3}
            maxLength={500}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary"
          />
        </div>
        <div>
          <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Repetir aviso após
          </label>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
            <input
              type="number"
              min={1}
              max={1440}
              value={settings.cooldownMinutes}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  cooldownMinutes: Math.max(1, Math.min(1440, Number(event.target.value) || 30)),
                }))
              }
              className="w-full bg-transparent text-sm font-semibold text-foreground outline-none"
            />
            <span className="text-xs font-semibold text-muted-foreground">min</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Unidades</p>
          <div className="flex flex-wrap gap-2">
            {CALL_BLOCK_UNITS.map((unit) => {
              const selected = settings.units.includes(unit);
              return (
                <button
                  key={unit}
                  type="button"
                  onClick={() => toggleUnit(unit)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    selected
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {unit}
                </button>
              );
            })}
          </div>
        </div>

        <Button
          type="button"
          onClick={saveSettings}
          disabled={saving || loading || settings.units.length === 0}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Salvar automação
        </Button>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════
// ─── Main Page ────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════
export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Automation> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Automation | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const fetchAutomations = useCallback(async () => {
    try {
      const res = await fetch("/api/crm/automations");
      if (res.status === 403 || res.status === 401) {
        setAutomations([]);
        return;
      }
      const data = await res.json();
      setAutomations(data.automations || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("virtuosa_user");
      const user = raw ? JSON.parse(raw) : null;
      const admin = user?.role === "ADMINISTRADOR";
      setIsAdmin(admin);
      setAuthChecked(true);
      if (admin) fetchAutomations();
      else setLoading(false);
    } catch {
      setAuthChecked(true);
      setLoading(false);
    }
  }, [fetchAutomations]);

  // ─── Actions ──────────────────────────────────────────────
  async function handleSave(data: Record<string, unknown>) {
    try {
      const isEdit = !!data.id;
      const res = await fetch("/api/crm/automations", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Erro ao salvar");
        return;
      }
      setBuilderOpen(false);
      setEditing(null);
      fetchAutomations();
    } catch (e) {
      console.error(e);
      alert("Erro de conexão");
    }
  }

  async function handleToggle(automation: Automation) {
    // Optimistic update
    setAutomations((prev) => prev.map((a) => a.id === automation.id ? { ...a, isActive: !a.isActive } : a));
    try {
      const res = await fetch("/api/crm/automations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: automation.id, isActive: !automation.isActive }),
      });
      if (!res.ok) {
        // Rollback
        setAutomations((prev) => prev.map((a) => a.id === automation.id ? { ...a, isActive: automation.isActive } : a));
      }
    } catch {
      setAutomations((prev) => prev.map((a) => a.id === automation.id ? { ...a, isActive: automation.isActive } : a));
    }
  }

  async function handleDuplicate(automation: Automation) {
    await handleSave({
      name: `${automation.name} (cópia)`,
      description: automation.description,
      triggerType: automation.triggerType,
      triggerConfig: automation.triggerConfig,
      steps: automation.steps,
      isActive: false,
    });
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/crm/automations?id=${id}`, { method: "DELETE" });
      setDeleteTarget(null);
      fetchAutomations();
    } catch (e) {
      console.error(e);
    }
  }

  function handleFromTemplate(template: typeof TEMPLATES[0]) {
    setEditing({
      name: template.name,
      description: template.description,
      triggerType: template.triggerType,
      triggerConfig: template.triggerConfig,
      steps: template.steps,
    });
    setBuilderOpen(true);
  }

  const showTemplates = automations.length < 3;

  if (!authChecked || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-foreground">Acesso restrito</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          A aba Automações é exclusiva para administradores.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Automações</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Crie fluxos automáticos que reagem a eventos do WhatsApp.
          </p>
        </div>
        <Button
          onClick={() => { setEditing(null); setBuilderOpen(true); }}
          className="bg-primary hover:bg-primary/90 text-primary-foreground self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Nova Automação
        </Button>
      </div>

      <CallBlockAutomationPanel />

      {/* Quick-start templates */}
      {showTemplates && (
        <section>
          <h2 className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Templates rápidos
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {TEMPLATES.map((t) => {
              const triggerInfo = TRIGGER_TYPES.find((tr) => tr.key === t.triggerType);
              const Icon = triggerInfo?.icon || Zap;
              return (
                <button
                  key={t.name}
                  onClick={() => handleFromTemplate(t)}
                  className="group flex flex-col items-start rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/50"
                >
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/15">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-semibold text-foreground">{t.name}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* List */}
      {automations.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">Nenhuma automação ainda</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Use um template acima ou crie do zero.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {automations.map((a) => (
            <AutomationCard
              key={a.id}
              automation={a}
              onToggle={() => handleToggle(a)}
              onEdit={() => { setEditing(a); setBuilderOpen(true); }}
              onDuplicate={() => handleDuplicate(a)}
              onDelete={() => setDeleteTarget(a)}
            />
          ))}
        </div>
      )}

      {/* Builder Dialog */}
      <AutomationBuilder
        open={builderOpen}
        initial={editing}
        onClose={() => { setBuilderOpen(false); setEditing(null); }}
        onSave={handleSave}
      />

      {/* Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir Automação</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Excluir <span className="font-medium text-foreground">{deleteTarget?.name}</span> e todo o histórico de execução?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="border-border text-muted-foreground">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && handleDelete(deleteTarget.id)}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
