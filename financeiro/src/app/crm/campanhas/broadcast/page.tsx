"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Radio,
  Plus,
  ArrowRight,
  ArrowLeft,
  Send,
  Loader2,
  Users,
  Check,
  Filter,
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  Trash2,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useVisiblePolling } from "@/hooks/use-visible-polling";

// ─── Types ────────────────────────────────────────────────────
interface Broadcast {
  id: string;
  name: string;
  message: string;
  audienceType: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  createdBy: string | null;
  sentAt: string | null;
  completedAt: string | null;
  createdAt: string;
  _count?: { recipients: number };
}

// ─── Helpers ─────────────────────────────────────────────────
function formatDate(d: string) {
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
  outro: "Outro",
};

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  draft: { label: "Rascunho", color: "text-muted-foreground bg-muted", icon: Clock },
  sending: { label: "Enviando...", color: "text-amber-800 bg-amber-400/10 dark:text-amber-400", icon: Loader2 },
  sent: { label: "Enviado", color: "text-emerald-700 bg-emerald-400/10 dark:text-emerald-400", icon: CheckCircle },
  failed: { label: "Falhou", color: "text-red-700 bg-red-400/10 dark:text-red-400", icon: XCircle },
};

// ─── Status Badge ─────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] || statusConfig.draft;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${cfg.color}`}>
      <Icon className={`h-3 w-3 ${status === "sending" ? "animate-spin" : ""}`} />
      {cfg.label}
    </span>
  );
}

// ─── Broadcast List ────────────────────────────────────────────
function BroadcastList({
  broadcasts,
  loading,
  onDelete,
  onRefresh,
}: {
  broadcasts: Broadcast[];
  loading: boolean;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}) {
  const [deleteTarget, setDeleteTarget] = useState<Broadcast | null>(null);

  const hasSending = broadcasts.some((b) => b.status === "sending");
  useVisiblePolling(onRefresh, 5000, { enabled: hasSending, runImmediately: false });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-sm text-muted-foreground">Carregando broadcasts...</p>
      </div>
    );
  }

  if (broadcasts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Radio className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-foreground">Nenhum broadcast ainda</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Crie seu primeiro envio em massa para alcançar seus contatos.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {["Nome", "Mensagem", "Destinatários", "Progresso", "Status", "Data", ""].map((h) => (
                <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-3 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {broadcasts.map((b) => {
              const progress = b.totalRecipients > 0 ? Math.round(((b.sentCount + b.failedCount) / b.totalRecipients) * 100) : 0;
              return (
                <tr key={b.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-foreground">{b.name}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">{b.message}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-foreground tabular-nums">
                      {b.totalRecipients}
                    </span>
                  </td>
                  <td className="px-4 py-3 min-w-[140px]">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums w-8">
                        {progress}%
                      </span>
                    </div>
                    <div className="flex gap-2 mt-1 text-[10px] text-muted-foreground">
                      <span className="text-emerald-700 dark:text-emerald-400">{b.sentCount} ✓</span>
                      {b.failedCount > 0 && <span className="text-red-700 dark:text-red-400">{b.failedCount} ✗</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={b.status} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {b.sentAt ? formatDate(b.sentAt) : formatDate(b.createdAt)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setDeleteTarget(b)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-400/10 hover:text-red-700 dark:hover:text-red-400"
                      title="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir Broadcast</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Excluir <span className="font-medium text-foreground">{deleteTarget?.name}</span>? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="border-border text-muted-foreground">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTarget) onDelete(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Wizard: Step 1 — Mensagem ──────────────────────────────
function Step1Message({
  name,
  message,
  onChangeName,
  onChangeMessage,
}: {
  name: string;
  message: string;
  onChangeName: (v: string) => void;
  onChangeMessage: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-foreground mb-4">Configurar Mensagem</h3>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Nome do Broadcast *
            </label>
            <Input
              value={name}
              onChange={(e) => onChangeName(e.target.value)}
              placeholder="Ex: Promoção Black Friday"
              className="bg-card border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Mensagem *
            </label>
            <textarea
              value={message}
              onChange={(e) => onChangeMessage(e.target.value)}
              placeholder="Digite a mensagem que será enviada a todos os contatos selecionados..."
              rows={6}
              className="flex w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
            <p className="text-[11px] text-muted-foreground">
              {message.length} caracteres
            </p>
          </div>
        </div>
      </div>

      {/* Preview */}
      {message.trim() && (
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Eye className="h-3 w-3" />
            Pré-visualização
          </p>
          <div className="flex justify-end">
            <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-2.5 text-sm shadow-sm">
              <p className="whitespace-pre-wrap break-words">{message}</p>
              <p className="mt-1 text-right text-[10px] opacity-70">agora</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Wizard: Step 2 — Audiência ─────────────────────────────
function Step2Audience({
  audienceType,
  selectedStages,
  selectedSources,
  onChangeAudience,
  onChangeStages,
  onChangeSources,
  estimatedCount,
  loadingCount,
}: {
  audienceType: string;
  selectedStages: string[];
  selectedSources: string[];
  onChangeAudience: (t: string) => void;
  onChangeStages: (s: string[]) => void;
  onChangeSources: (s: string[]) => void;
  estimatedCount: number;
  loadingCount: boolean;
}) {
  const audienceOptions = [
    { key: "all", label: "Todos os Contatos", desc: "Enviar para toda a base", icon: Users },
    { key: "stage", label: "Filtrar por Estágio", desc: "Selecione estágios do funil", icon: Filter },
    { key: "source", label: "Filtrar por Origem", desc: "Selecione fontes de aquisição", icon: Radio },
  ];

  const stages = Object.entries(stageLabels);
  const sources = Object.entries(sourceLabels);

  function toggleItem(list: string[], item: string, setter: (v: string[]) => void) {
    setter(list.includes(item) ? list.filter((s) => s !== item) : [...list, item]);
  }

  return (
    <div className="space-y-6">
      <h3 className="text-base font-semibold text-foreground">Selecionar Audiência</h3>

      {/* Audience type cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {audienceOptions.map((opt) => {
          const Icon = opt.icon;
          const isActive = audienceType === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => onChangeAudience(opt.key)}
              className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all ${
                isActive
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border bg-card hover:bg-muted/50"
              }`}
            >
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Stage filter */}
      {audienceType === "stage" && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Selecione os estágios</p>
          <div className="flex flex-wrap gap-2">
            {stages.map(([key, label]) => (
              <button
                key={key}
                onClick={() => toggleItem(selectedStages, key, onChangeStages)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedStages.includes(key)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {selectedStages.includes(key) && <Check className="h-3 w-3" />}
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Source filter */}
      {audienceType === "source" && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Selecione as origens</p>
          <div className="flex flex-wrap gap-2">
            {sources.map(([key, label]) => (
              <button
                key={key}
                onClick={() => toggleItem(selectedSources, key, onChangeSources)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedSources.includes(key)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {selectedSources.includes(key) && <Check className="h-3 w-3" />}
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Estimated count */}
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Alcance estimado</p>
            <p className="text-lg font-bold text-foreground tabular-nums">
              {loadingCount ? "..." : estimatedCount.toLocaleString()} contatos
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Wizard: Step 3 — Revisão e Envio ───────────────────────
function Step3Review({
  name,
  message,
  audienceType,
  estimatedCount,
  sending,
  onSend,
}: {
  name: string;
  message: string;
  audienceType: string;
  estimatedCount: number;
  sending: boolean;
  onSend: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const audienceLabel =
    audienceType === "all"
      ? "Todos os contatos"
      : audienceType === "stage"
      ? "Filtrado por estágio"
      : "Filtrado por origem";

  return (
    <div className="space-y-6">
      <h3 className="text-base font-semibold text-foreground">Revisar e Enviar</h3>

      {/* Summary card */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Nome</p>
            <p className="font-medium text-foreground">{name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Audiência</p>
            <p className="font-medium text-foreground">{audienceLabel}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Destinatários</p>
            <p className="font-medium text-foreground tabular-nums">{estimatedCount.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Caracteres</p>
            <p className="font-medium text-foreground tabular-nums">{message.length}</p>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Mensagem</p>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-sm text-foreground whitespace-pre-wrap">{message}</p>
          </div>
        </div>
      </div>

      {/* Warning */}
      <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-3 flex items-start gap-3">
        <MessageSquare className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-800 dark:text-amber-400" />
        <p className="text-xs text-muted-foreground">
          Ao enviar, as mensagens serão despachadas uma a uma com intervalo de 1 segundo entre cada envio
          para evitar bloqueio. O progresso será atualizado em tempo real na listagem.
        </p>
      </div>

      {/* Send button */}
      <Button
        onClick={() => setConfirmOpen(true)}
        disabled={sending || estimatedCount === 0}
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-11"
      >
        {sending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Enviando...
          </>
        ) : (
          <>
            <Send className="h-4 w-4" />
            Enviar para {estimatedCount.toLocaleString()} contatos
          </>
        )}
      </Button>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar Envio</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Você está prestes a enviar uma mensagem para{" "}
              <span className="font-bold text-foreground">{estimatedCount.toLocaleString()}</span> contatos.
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} className="border-border text-muted-foreground">
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                onSend();
              }}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Send className="h-4 w-4" />
              Confirmar Envio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// ─── Main Page ────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════
export default function BroadcastPage() {
  // List
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  // Wizard
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(0);

  // Step 1 state
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");

  // Step 2 state
  const [audienceType, setAudienceType] = useState("all");
  const [selectedStages, setSelectedStages] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [estimatedCount, setEstimatedCount] = useState(0);
  const [loadingCount, setLoadingCount] = useState(false);

  // Step 3
  const [sending, setSending] = useState(false);
  const broadcastsRequestInFlightRef = useRef(false);

  // ─── Data fetch ───────────────────────────────────────────
  const fetchBroadcasts = useCallback(async () => {
    if (broadcastsRequestInFlightRef.current) return;

    broadcastsRequestInFlightRef.current = true;
    try {
      const res = await fetch("/api/crm/broadcasts");
      const data = await res.json();
      setBroadcasts(data.broadcasts || []);
    } catch (e) {
      console.error(e);
    } finally {
      broadcastsRequestInFlightRef.current = false;
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    fetchBroadcasts();
  }, [fetchBroadcasts]);

  // Estimate audience count
  useEffect(() => {
    if (!wizardOpen || step !== 1) return;

    setLoadingCount(true);
    const params = new URLSearchParams();
    if (audienceType === "stage" && selectedStages.length > 0) {
      params.set("stages", selectedStages.join(","));
    }
    if (audienceType === "source" && selectedSources.length > 0) {
      params.set("sources", selectedSources.join(","));
    }

    // Use clients API to count
    fetch(`/api/clients?limit=1&${params}`)
      .then((r) => r.json())
      .then((d) => setEstimatedCount(d.total || 0))
      .catch(() => setEstimatedCount(0))
      .finally(() => setLoadingCount(false));
  }, [wizardOpen, step, audienceType, selectedStages, selectedSources]);

  // ─── Actions ──────────────────────────────────────────────
  function resetWizard() {
    setStep(0);
    setName("");
    setMessage("");
    setAudienceType("all");
    setSelectedStages([]);
    setSelectedSources([]);
    setEstimatedCount(0);
    setSending(false);
  }

  function openWizard() {
    resetWizard();
    setWizardOpen(true);
  }

  async function handleSend() {
    setSending(true);
    try {
      const body: Record<string, unknown> = {
        name,
        message,
        audienceType,
      };

      if (audienceType === "stage" && selectedStages.length) {
        body.audienceFilter = { stages: selectedStages };
      }
      if (audienceType === "source" && selectedSources.length) {
        body.audienceFilter = { sources: selectedSources };
      }

      const res = await fetch("/api/crm/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Erro ao enviar broadcast");
        setSending(false);
        return;
      }

      // Success — close wizard and refresh list
      setWizardOpen(false);
      resetWizard();
      fetchBroadcasts();
    } catch (e) {
      console.error(e);
      alert("Erro de conexão");
      setSending(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/crm/broadcasts?id=${id}`, { method: "DELETE" });
      fetchBroadcasts();
    } catch (e) {
      console.error(e);
    }
  }

  // Step validation
  const step1Valid = name.trim().length > 0 && message.trim().length > 0;
  const step2Valid =
    audienceType === "all" ||
    (audienceType === "stage" && selectedStages.length > 0) ||
    (audienceType === "source" && selectedSources.length > 0);

  const STEPS = ["Mensagem", "Audiência", "Revisar"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Broadcasts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Envie mensagens em massa para seus contatos via WhatsApp.
          </p>
        </div>
        <Button
          onClick={openWizard}
          className="bg-primary hover:bg-primary/90 text-primary-foreground self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Novo Broadcast
        </Button>
      </div>

      {/* Broadcast List */}
      <BroadcastList
        broadcasts={broadcasts}
        loading={loadingList}
        onDelete={handleDelete}
        onRefresh={fetchBroadcasts}
      />

      {/* Wizard Dialog */}
      <Dialog open={wizardOpen} onOpenChange={(v) => { if (!v && !sending) { setWizardOpen(false); } }}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {/* Stepper */}
          <div className="flex items-center justify-center gap-2 mb-6 pt-2">
            {STEPS.map((label, i) => (
              <div key={i} className="flex items-center gap-2">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    i < step
                      ? "bg-primary text-primary-foreground"
                      : i === step
                      ? "bg-primary/10 text-primary ring-1 ring-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span className={`text-xs font-medium ${i === step ? "text-foreground" : "text-muted-foreground"}`}>
                  {label}
                </span>
                {i < STEPS.length - 1 && (
                  <div className={`h-px w-8 ${i < step ? "bg-primary" : "bg-border"}`} />
                )}
              </div>
            ))}
          </div>

          {/* Step content */}
          {step === 0 && (
            <Step1Message
              name={name}
              message={message}
              onChangeName={setName}
              onChangeMessage={setMessage}
            />
          )}

          {step === 1 && (
            <Step2Audience
              audienceType={audienceType}
              selectedStages={selectedStages}
              selectedSources={selectedSources}
              onChangeAudience={setAudienceType}
              onChangeStages={setSelectedStages}
              onChangeSources={setSelectedSources}
              estimatedCount={estimatedCount}
              loadingCount={loadingCount}
            />
          )}

          {step === 2 && (
            <Step3Review
              name={name}
              message={message}
              audienceType={audienceType}
              estimatedCount={estimatedCount}
              sending={sending}
              onSend={handleSend}
            />
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <Button
              variant="outline"
              onClick={() => {
                if (step === 0) setWizardOpen(false);
                else setStep((s) => s - 1);
              }}
              disabled={sending}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" />
              {step === 0 ? "Cancelar" : "Voltar"}
            </Button>

            {step < STEPS.length - 1 && (
              <Button
                onClick={() => setStep((s) => s + 1)}
                disabled={(step === 0 && !step1Valid) || (step === 1 && !step2Valid)}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Próximo
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
