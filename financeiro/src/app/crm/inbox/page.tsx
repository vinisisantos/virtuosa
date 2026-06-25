"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useGlobalUnit } from "@/contexts/UnitContext";
import { toast } from "@/components/toast";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Search,
  Paperclip,
  Send,
  User,
  Loader2,
  X,
  FileText,
  Check,
  CheckCheck,
  Mic,
  ChevronLeft,
  Phone,
  Mail,
  Tag,
  Info,
  Circle,
  MessageSquare,
  Eye,
  ChevronDown,
  ChevronRight,
  Shield,
  XCircle,
  RotateCcw,
  Trash2,
  Play,
  MoreVertical,
  Building2,
  Megaphone,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────
interface Contact {
  id: string;
  phone: string;
  name?: string | null;
  profilePic?: string | null;
  tags?: any;
  unit?: string | null;
}

interface Conversation {
  id: string;
  status: string;
  unreadCount: number;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  contact: Contact;
  assignedTo?: string | null;
  assignedToName?: string | null;
  resolution?: string | null;
  closedAt?: string | null;
  closedByName?: string | null;
  satisfactionScore?: number | null;
  campaignName?: string | null;
}

// ─── Tag (etiqueta) por campanha — estilo WhatsApp ────────────
// Cada campanha vira uma etiqueta colorida e consistente (cor derivada do
// nome, então a mesma campanha tem sempre a mesma cor). Classes Tailwind
// estáticas para o JIT enxergar.
const CAMPAIGN_TAG_STYLES = [
  "bg-rose-500/15 text-rose-600 ring-rose-500/30",
  "bg-amber-500/15 text-amber-700 ring-amber-500/30",
  "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30",
  "bg-sky-500/15 text-sky-600 ring-sky-500/30",
  "bg-violet-500/15 text-violet-600 ring-violet-500/30",
  "bg-fuchsia-500/15 text-fuchsia-600 ring-fuchsia-500/30",
  "bg-teal-500/15 text-teal-600 ring-teal-500/30",
  "bg-orange-500/15 text-orange-600 ring-orange-500/30",
];
function campaignTagStyle(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CAMPAIGN_TAG_STYLES[h % CAMPAIGN_TAG_STYLES.length];
}

interface Message {
  id: string;
  body: string;
  type: string;
  mediaUrl?: string | null;
  fromMe: boolean;
  status: string;
  timestamp: string;
  respondedBy?: string | null;
  respondedByName?: string | null;
}

// Tipo para instâncias de colaboradores (admin)
interface CollaboratorInstance {
  userId: string;
  userName: string;
  unit: string;
  status: string;
  phone?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────
function formatTime(dateString: string) {
  try {
    const d = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return "Ontem";
    if (diffDays < 7) return d.toLocaleDateString("pt-BR", { weekday: "short" });
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  } catch {
    return "";
  }
}

function formatMessageTime(dateString: string) {
  try {
    return new Date(dateString).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

// ─── Pipeline Stage Selector (Sidebar) ───────────────────────
function PipelineStageSelector({ contactPhone, contactName, layout = "sidebar", refreshTrigger, showFallback, openEvolutionSignal }: { contactPhone: string; contactName?: string; layout?: "sidebar" | "header" | "headerPill" | "inline"; refreshTrigger?: number; showFallback?: boolean; openEvolutionSignal?: number }) {
  const [deal, setDeal] = useState<any>(null);
  const [stages, setStages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEvolutionModal, setShowEvolutionModal] = useState(false);
  const [evolutionNotes, setEvolutionNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const [clientData, setClientData] = useState<any>(null);
  const [pipelineId, setPipelineId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        // 1. Encontrar o client
        const cRes = await fetch(`/api/clients?search=${encodeURIComponent(contactPhone)}`);
        const clientList = await cRes.json();
        const client = clientList.clients?.[0];
        setClientData(client || null);

        // 2. Encontrar os stages do pipeline default
        const pRes = await fetch('/api/pipelines');
        const pipes = await pRes.json();
        const defaultPipeline = pipes[0];
        if (defaultPipeline) {
          setPipelineId(defaultPipeline.id);
          setStages(defaultPipeline.stages || []);

          // 3. Encontrar o deal desse client (somente se client existir)
          if (client) {
            const dRes = await fetch(`/api/pipeline?pipelineId=${defaultPipeline.id}`);
            const deals = await dRes.json();
            const clientDeal = deals.find((d: any) => d.clientId === client.id);
            setDeal(clientDeal || null);
            setEvolutionNotes(clientDeal?.notes || "");
          } else {
            setDeal(null);
            setEvolutionNotes("");
          }
        }
      } catch {
        // error
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [contactPhone, refreshTrigger]);

  // Abre a modal de evolução quando o menu "⋯" do header dispara o sinal.
  useEffect(() => {
    if (openEvolutionSignal) setShowEvolutionModal(true);
  }, [openEvolutionSignal]);

  const updateStage = async (newStageId: string) => {
    if (!newStageId) return;
    
    if (!deal) {
      if (!pipelineId) return;
      // CREATE DEAL
      let targetClientId = clientData?.id;
      let targetClientName = clientData?.name || contactName || contactPhone;

      try {
        if (!targetClientId) {
          // CREATE CLIENT Seeding the contact
          const createRes = await fetch("/api/clients", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: targetClientName, phone: contactPhone, force: true }),
          });
          if (createRes.ok) {
            const newClientRes = await createRes.json();
            targetClientId = newClientRes.client?.id || newClientRes.id;
            setClientData(newClientRes.client || newClientRes);
          } else {
            throw new Error("Erro ao criar cliente");
          }
        }

        const res = await fetch("/api/pipeline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: targetClientId,
            clientName: targetClientName,
            pipelineId: pipelineId,
            stageId: newStageId,
            source: "whatsapp",
            value: 0
          }),
        });
        if (res.ok) {
          const newDeal = await res.json();
          setDeal(newDeal);
          toast("Adicionado ao funil!", "success");
        }
      } catch {
        toast("Erro ao adicionar ao funil", "error");
      }
      return;
    }
    
    // UPDATE EXISTING DEAL
    try {
      const res = await fetch("/api/pipeline", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deal.id, stageId: newStageId }),
      });
      if (res.ok) {
        setDeal({ ...deal, stageId: newStageId });
        toast("Fase atualizada!", "success");
      }
    } catch {
      toast("Erro ao atualizar fase", "error");
    }
  };

  const saveEvolutionNotes = async () => {
    if (!deal) return;
    setSavingNotes(true);
    try {
      const res = await fetch("/api/pipeline", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deal.id, notes: evolutionNotes }),
      });
      if (res.ok) {
        setDeal({ ...deal, notes: evolutionNotes });
        toast("Evolução salva com sucesso!", "success");
        setShowEvolutionModal(false);
      } else {
        toast("Erro ao salvar evolução", "error");
      }
    } catch {
      toast("Erro ao salvar evolução", "error");
    } finally {
      setSavingNotes(false);
    }
  };

  if (loading) return null;
  if (stages.length === 0) {
    if (showFallback) return <p className="text-xs text-muted-foreground italic">Contato sem registro no funil.</p>;
    return null;
  }

  // Modal compartilhado entre todos os layouts
  const evolutionModal = showEvolutionModal ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-foreground">Evolução do Paciente</h3>
        <textarea
          className="w-full h-40 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary mb-4"
          placeholder="Digite a evolução, histórico ou observações sobre o paciente..."
          value={evolutionNotes}
          onChange={(e) => setEvolutionNotes(e.target.value)}
        />
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={() => { setEvolutionNotes(deal?.notes || ""); setShowEvolutionModal(false); }}
            disabled={savingNotes}
            className="rounded-md border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={saveEvolutionNotes}
            disabled={savingNotes || !deal}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {savingNotes ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const currentStageIndex = deal ? stages.findIndex(s => s.id === deal?.stageId) : -1;
  const canGoBack = currentStageIndex > 0;
  const canGoForward = currentStageIndex >= 0 && currentStageIndex < stages.length - 1;

  const goBack = () => {
    if (canGoBack) updateStage(stages[currentStageIndex - 1].id);
  };
  const goForward = () => {
    if (canGoForward) updateStage(stages[currentStageIndex + 1].id);
  };

  // Layout headerPill: só o seletor de fase (‹ etapa ▾ ›) no header do chat.
  // A "Evolução" saiu daqui — agora vive no menu "⋯" e no card do contato.
  if (layout === "headerPill") {
    return (
      <>
        <div className="relative shrink-0">
          <select
            value={deal?.stageId || ""}
            onChange={(e) => updateStage(e.target.value)}
            title="Fase do funil"
            className="appearance-none rounded-lg border border-input bg-background pl-3 pr-8 py-1.5 text-xs font-medium text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer w-[128px] sm:w-44 truncate"
          >
            {!deal && <option value="" disabled hidden>Adicionar ao Funil</option>}
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>{stage.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
        {evolutionModal}
      </>
    );
  }

  // Layout inline: barra compacta acima do input do chat
  if (layout === "inline") {
    return (
      <>
        <div className="flex shrink-0 items-center gap-3 border-t border-border bg-card/50 px-4 py-2">
          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Fase do Funil:</span>
          
          <div className="flex items-center gap-1 flex-1 max-w-[260px]">
            <button
              onClick={goBack}
              disabled={!canGoBack}
              title="Retroceder Fase"
              className="p-1.5 rounded bg-muted/50 text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <div className="relative flex-1">
              <select
                value={deal?.stageId || ""}
                onChange={(e) => updateStage(e.target.value)}
                className="appearance-none w-full rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary pr-7 truncate"
              >
                {!deal && <option value="" disabled hidden>Adicionar ao Funil</option>}
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>{stage.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>
            <button
              onClick={goForward}
              disabled={!canGoForward}
              title="Avançar Fase"
              className="p-1.5 rounded bg-muted/50 text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            onClick={() => setShowEvolutionModal(true)}
            disabled={!deal}
            className="flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground hover:bg-muted transition-colors whitespace-nowrap disabled:opacity-50"
          >
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            Evolução do Paciente
          </button>
        </div>
        {evolutionModal}
      </>
    );
  }

  const isHeader = layout === "header";

  return (
    <>
      <div className={isHeader ? "flex items-center gap-2" : "flex flex-col gap-1.5 pt-2 border-t border-border"}>
        {!isHeader && <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Funil / Evolução</span>}
        <div className={isHeader ? "flex items-center gap-2" : "flex flex-col gap-2"}>
          
          <div className="flex items-center w-full rounded-md border border-input bg-background shadow-sm overflow-hidden">
            <button
              onClick={goBack}
              disabled={!canGoBack}
              title="Retroceder Fase"
              className="p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors flex-shrink-0 border-r border-input"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <div className="relative flex-1 bg-transparent">
              <select
                value={deal?.stageId || ""}
                onChange={(e) => updateStage(e.target.value)}
                className={`appearance-none bg-transparent px-3 py-1.5 text-xs text-foreground focus:outline-none pr-8 cursor-pointer ${isHeader ? "w-[110px] sm:w-32 truncate" : "w-full"}`}
              >
                {!deal && <option value="" disabled hidden>Adicionar ao Funil</option>}
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>{stage.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>
            <button
              onClick={goForward}
              disabled={!canGoForward}
              title="Avançar Fase"
              className="p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors flex-shrink-0 border-l border-input"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            onClick={() => setShowEvolutionModal(true)}
            disabled={!deal}
            title="Evolução do Paciente"
            className={`flex items-center justify-center rounded-md border border-input bg-background hover:bg-muted transition-colors disabled:opacity-50 ${isHeader ? "h-8 px-2.5 sm:px-3 sm:gap-1.5" : "gap-1.5 px-3 py-1.5 w-full"}`}
          >
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className={isHeader ? "hidden sm:inline text-xs whitespace-nowrap" : "text-xs whitespace-nowrap"}>Evolução</span>
          </button>
        </div>
      </div>
      {evolutionModal}
    </>
  );
}

// ─── Campaign Attribution ────────────────────────────────────
// Botão + dropdown por chat: atribui a campanha ao lead (Client.campaignName).
// As opções vêm das campanhas ATIVAS cadastradas na aba Campanhas, filtradas
// pela unidade do lead. Atribuir aqui sobrescreve qualquer registro anterior
// e reflete imediatamente em toda a estatística (que agrega por campaignName).
function CampaignAttributeControl({ contactPhone, contactName, unit }: {
  contactPhone: string; contactName?: string | null; unit?: string | null;
}) {
  const [client, setClient] = useState<{ id: string; campaignName: string | null; unit: string | null } | null>(null);
  const [campaigns, setCampaigns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const cRes = await fetch(`/api/clients?search=${encodeURIComponent(contactPhone)}`);
        const cJson = await cRes.json();
        const cl = cJson.clients?.[0] || null;
        if (!cancelled) setClient(cl ? { id: cl.id, campaignName: cl.campaignName ?? null, unit: cl.unit ?? null } : null);
        const u = cl?.unit || unit;
        const mRes = await fetch(`/api/campaigns/manage?status=ativa${u ? `&unit=${encodeURIComponent(u)}` : ""}`);
        const mJson = await mRes.json();
        if (!cancelled && Array.isArray(mJson)) {
          setCampaigns([...new Set(mJson.map((c: { name?: string }) => c.name).filter(Boolean) as string[])]);
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [contactPhone, unit]);

  const attribute = async (name: string) => {
    const value = name.trim();
    if (!value) { setOpen(false); setCustom(false); return; }
    setSaving(true);
    try {
      if (!client?.id) {
        // Sem Client ainda → cria o lead já com a campanha
        const createRes = await fetch("/api/clients", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: contactName || contactPhone, phone: contactPhone, campaignName: value, source: "facebook_ad", force: true }),
        });
        if (createRes.ok) {
          const j = await createRes.json();
          setClient({ id: j.client?.id || j.id, campaignName: value, unit: unit ?? null });
          toast("Campanha atribuída!", "success");
        } else toast("Erro ao atribuir campanha", "error");
      } else {
        const res = await fetch("/api/clients", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: client.id, campaignName: value, source: "facebook_ad" }),
        });
        if (res.ok) {
          setClient((c) => (c ? { ...c, campaignName: value } : c));
          toast("Campanha atribuída!", "success");
        } else toast("Erro ao atribuir campanha", "error");
      }
    } catch { toast("Erro ao atribuir campanha", "error"); }
    finally { setSaving(false); setOpen(false); setCustom(false); }
  };

  const current = client?.campaignName || null;
  const hasCampaign = !!current;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={saving || loading}
        title="Atribuir campanha ao lead"
        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60 ${
          hasCampaign
            ? "border-primary/30 bg-primary/5 text-foreground hover:bg-primary/10"
            : "border-dashed border-amber-500/50 bg-amber-500/5 text-amber-600 hover:bg-amber-500/10"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Megaphone className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {loading ? "Carregando…" : saving ? "Salvando…" : current || "Atribuir campanha"}
          </span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 opacity-70 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[55]" onClick={() => { setOpen(false); setCustom(false); }} />
          <div className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-2xl">
            {custom ? (
              <input
                autoFocus
                placeholder="Nome da campanha…"
                defaultValue={current || ""}
                onKeyDown={(e) => {
                  if (e.key === "Enter") attribute((e.target as HTMLInputElement).value);
                  if (e.key === "Escape") setCustom(false);
                }}
                onBlur={(e) => { if (e.target.value.trim()) attribute(e.target.value); else setCustom(false); }}
                className="mx-1.5 my-1 w-[calc(100%-12px)] rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            ) : (
              <>
                {campaigns.length === 0 && (
                  <p className="px-3 py-2 text-[11px] italic text-muted-foreground">
                    Nenhuma campanha ativa cadastrada{unit ? ` em ${unit}` : ""}.
                  </p>
                )}
                {campaigns.map((c) => (
                  <button
                    key={c}
                    onClick={() => attribute(c)}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted ${c === current ? "font-semibold text-primary" : "text-foreground"}`}
                  >
                    <Megaphone className="h-3 w-3 shrink-0 opacity-60" />
                    <span className="truncate">{c}</span>
                    {c === current && <Check className="ml-auto h-3 w-3 shrink-0" />}
                  </button>
                ))}
                <div className="my-1 h-px bg-border" />
                <button
                  onClick={() => setCustom(true)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted"
                >
                  ✏️ Outra (digitar)…
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Contact Popover ─────────────────────────────────────────
// Card flutuante ancorado ao avatar do header: identidade + status + unidade
// + funil/evolução, de forma organizada. "Ver perfil completo" abre a ficha.
function ContactPopover({ conversation, onClose, onOpenFull, pipelineRefreshKey }: {
  conversation: Conversation;
  onClose: () => void;
  onOpenFull: () => void;
  pipelineRefreshKey: number;
}) {
  const { contact } = conversation;
  const initial = contact.name?.charAt(0)?.toUpperCase() || contact.phone?.charAt(0) || "?";
  const tags: string[] = Array.isArray(contact.tags)
    ? contact.tags
    : typeof contact.tags === "string"
    ? contact.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
    : [];
  const isOpen = conversation.status === "open";

  return (
    <>
      {/* Camada invisível p/ fechar ao clicar fora */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-0 top-full z-50 mt-2 w-[290px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card shadow-2xl">
        {/* Identidade */}
        <div className="flex items-center gap-3 border-b border-border p-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-lg font-bold text-primary ring-2 ring-background">
            {contact.profilePic ? (
              <img src={contact.profilePic} alt="" className="h-12 w-12 object-cover" />
            ) : initial}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {contact.name || <span className="italic text-muted-foreground">Sem nome</span>}
            </p>
            <p className="truncate font-mono text-xs text-muted-foreground">{contact.phone}</p>
          </div>
        </div>

        {/* Status + Unidade */}
        <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
            isOpen
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
              : "border-border bg-muted text-muted-foreground"
          }`}>
            <Circle className="h-1.5 w-1.5 fill-current" />
            {isOpen ? "Conversa aberta" : "Finalizada"}
          </span>
          {contact.unit && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground">
              <Building2 className="h-3 w-3 text-muted-foreground" />
              {contact.unit}
            </span>
          )}
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap items-start gap-1.5 border-b border-border px-4 py-3">
            {tags.map((tag) => (
              <span key={tag} className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] text-foreground">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Campanha */}
        <div className="space-y-2 border-b border-border p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Campanha</p>
          <CampaignAttributeControl
            contactPhone={contact.phone}
            contactName={contact.name}
            unit={contact.unit}
          />
        </div>

        {/* Funil & Evolução */}
        <div className="space-y-2 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Funil &amp; Evolução</p>
          <PipelineStageSelector
            contactPhone={contact.phone}
            contactName={contact.name || undefined}
            layout="sidebar"
            refreshTrigger={pipelineRefreshKey}
            showFallback
          />
        </div>

        {/* Ver ficha completa */}
        <button
          onClick={onOpenFull}
          className="flex w-full items-center justify-between rounded-b-2xl border-t border-border px-4 py-3 text-xs font-medium text-primary transition-colors hover:bg-muted"
        >
          Ver perfil completo
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}

// ─── Contact Sidebar ─────────────────────────────────────────
function ContactSidebar({ conversation, onClose, pipelineRefreshKey }: {
  conversation: Conversation;
  onClose: () => void;
  pipelineRefreshKey: number;
}) {
  const { contact } = conversation;
  const tags: string[] = Array.isArray(contact.tags)
    ? contact.tags
    : typeof contact.tags === "string"
    ? contact.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
    : [];

  const initial = contact.name?.charAt(0)?.toUpperCase() || contact.phone?.charAt(0) || "?";

  const statusMap: Record<string, { label: string; color: string }> = {
    open: { label: "Em aberto", color: "text-emerald-400" },
    resolved: { label: "Resolvido", color: "text-blue-400" },
    closed: { label: "Fechado", color: "text-muted-foreground" },
    waiting_customer: { label: "Aguardando cliente", color: "text-amber-400" },
    waiting_response: { label: "Aguardando resposta", color: "text-orange-400" },
  };
  const statusInfo = statusMap[conversation.status] ?? { label: conversation.status, color: "text-muted-foreground" };

  return (
    <div className="flex h-full w-full lg:w-72 flex-shrink-0 flex-col border-l border-border bg-card overflow-y-auto">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <span className="text-sm font-semibold text-foreground">Perfil do Contato</span>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Avatar + Nome + Status */}
      <div className="flex flex-col items-center gap-3 px-4 py-6 border-b border-border">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary text-3xl font-bold overflow-hidden ring-4 ring-background shadow-md">
          {contact.profilePic ? (
            <img src={contact.profilePic} alt="" className="h-20 w-20 object-cover" />
          ) : initial}
        </div>
        <div className="text-center">
          <p className="font-semibold text-foreground text-base">
            {contact.name || <span className="text-muted-foreground italic text-sm">Sem nome</span>}
          </p>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">{contact.phone}</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium ${
          conversation.status === "open"
            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            : "bg-muted text-muted-foreground border-border"
        }`}>
          <Circle className="h-1.5 w-1.5 fill-current" />
          {conversation.status === "open" ? "Conversa aberta" : "Conversa fechada"}
        </span>
      </div>

      <div className="flex flex-col divide-y divide-border">

        {/* ── Informações de contato ── */}
        <div className="p-4 space-y-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Contato</p>
          <div className="flex items-center gap-3">
            <Phone className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-xs font-mono text-foreground select-all">{contact.phone}</span>
          </div>
          {contact.unit && (
            <div className="flex items-center gap-3">
              <Info className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-foreground">{contact.unit}</span>
            </div>
          )}
          {tags.length > 0 && (
            <div className="flex items-start gap-3">
              <Tag className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="flex flex-wrap gap-1">
                {tags.map((tag: string) => (
                  <span key={tag} className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] text-foreground">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Campanha ── */}
        <div className="p-4 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Campanha</p>
          <CampaignAttributeControl
            contactPhone={contact.phone}
            contactName={contact.name}
            unit={contact.unit}
          />
        </div>

        {/* ── Funil & Evolução ── */}
        <div className="p-4 space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Funil & Evolução</p>
          <PipelineStageSelector
            contactPhone={contact.phone}
            contactName={contact.name || undefined}
            layout="sidebar"
            refreshTrigger={pipelineRefreshKey}
            showFallback
          />
        </div>

        {/* ── Dados da conversa ── */}
        <div className="p-4 space-y-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Conversa</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Status</span>
              <span className={`font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
            </div>
            {conversation.assignedToName && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Atendente</span>
                <span className="font-medium text-foreground">{conversation.assignedToName}</span>
              </div>
            )}
            {conversation.resolution && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Resolução</span>
                <span className="font-medium text-foreground capitalize">{conversation.resolution}</span>
              </div>
            )}
            {conversation.closedByName && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Fechada por</span>
                <span className="font-medium text-foreground">{conversation.closedByName}</span>
              </div>
            )}
            {conversation.closedAt && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Fechada em</span>
                <span className="font-medium text-foreground">
                  {new Date(conversation.closedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            )}
            {conversation.satisfactionScore != null && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Satisfação</span>
                <span className="font-medium text-foreground">
                  {conversation.satisfactionScore}/5 {"⭐".repeat(Math.max(0, conversation.satisfactionScore))}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Métricas ── */}
        <div className="p-4 pb-8">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Métricas</p>
          <div className="rounded-lg border border-border bg-background p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Não lidas</span>
              <span className="font-medium text-foreground">{conversation.unreadCount || 0}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Última mensagem</span>
              <span className="font-medium text-foreground">
                {conversation.lastMessageAt ? formatTime(conversation.lastMessageAt) : "—"}
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────
function MessageBubble({ msg }: { msg: Message }) {
  const isMe = msg.fromMe;

  return (
    <div className={`flex w-full ${isMe ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[75%]">
        {/* Label de respondido por (quando admin respondeu em nome de outro) */}
        {isMe && msg.respondedByName && (
          <div className="text-[10px] text-amber-500 mb-0.5 text-right">
            ✍️ Respondido por {msg.respondedByName}
          </div>
        )}

        <div
          className={`relative rounded-2xl text-[14.5px] shadow-sm flex flex-col overflow-hidden ${
            isMe
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-muted text-foreground rounded-bl-sm"
          } ${msg.type === 'image' || msg.mediaUrl?.startsWith('data:image/') ? 'p-1 pb-1.5' : 'px-3 py-2'}`}
        >
          {/* Image — aceita type "image" ou data URLs de imagem */}
          {(msg.type === "image" || (msg.mediaUrl && msg.mediaUrl.startsWith("data:image/"))) && msg.mediaUrl && (
            <img
              src={msg.mediaUrl}
              alt=""
              className="max-w-full rounded-[12px] mb-1.5 cursor-pointer object-cover max-h-[320px] w-full"
              onClick={() => window.open(msg.mediaUrl!, "_blank")}
            />
          )}

          {/* Audio — sem type hardcoded para o browser detectar o codec correto */}
          {(msg.type === "audio" || msg.type === "ptt") && msg.mediaUrl && (
            <div className="w-[240px] max-w-full">
              <audio controls className="w-full h-10 mb-1">
                <source src={msg.mediaUrl} />
              </audio>
            </div>
          )}

          {/* Document */}
          {msg.type === "document" && msg.mediaUrl && (
            <a
              href={msg.mediaUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 bg-black/10 p-2.5 rounded-xl mb-1.5 hover:bg-black/20 transition-colors"
            >
              <div className="w-10 h-10 rounded bg-background/50 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <span className="text-[13px] font-medium truncate max-w-[180px]">Documento</span>
            </a>
          )}

          {/* Text */}
          {msg.body && (
            <div className={`break-words whitespace-pre-wrap leading-relaxed ${(msg.type === 'image' || msg.mediaUrl?.startsWith('data:image/')) ? 'px-2 pt-0.5 pb-1' : ''}`}>
              {msg.body}
            </div>
          )}

          {/* Timestamp + status */}
          <div className={`mt-0.5 flex items-center justify-end gap-1 ${isMe ? "text-primary-foreground/70" : "text-muted-foreground"} ${(msg.type === 'image' || msg.mediaUrl?.startsWith('data:image/')) ? 'px-2' : ''}`}>
            <span className="text-[10px] tracking-wide">{formatMessageTime(msg.timestamp)}</span>
            {isMe && (
              <>
                {msg.status === "read" ? (
                  <CheckCheck className="w-3.5 h-3.5 text-[#3b82f6]" />
                ) : msg.status === "delivered" ? (
                  <CheckCheck className="w-3.5 h-3.5 opacity-80" />
                ) : (
                  <Check className="w-3.5 h-3.5 opacity-80" />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Conversation Item ────────────────────────────────────────
function ConversationItem({
  conv,
  isActive,
  onClick,
}: {
  conv: Conversation;
  isActive: boolean;
  onClick: () => void;
}) {
  const initial = conv.contact?.name?.charAt(0)?.toUpperCase() || conv.contact?.phone?.charAt(0) || "?";
  const [pic, setPic] = React.useState<string | null>(conv.contact?.profilePic || null);

  // Lazily fetch profile pic if not in DB yet
  React.useEffect(() => {
    if (pic || !conv.contact?.phone) return;
    let cancelled = false;
    fetch(`/api/whatsapp/profile-pic?phone=${conv.contact.phone}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.profilePicUrl) setPic(d.profilePicUrl);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [conv.contact?.phone, pic]);

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50 ${
        isActive ? "border-l-2 border-primary bg-muted/70" : "border-l-2 border-transparent"
      }`}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold overflow-hidden">
          {pic ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pic} alt="" className="h-10 w-10 object-cover" onError={() => setPic(null)} />
          ) : (
            initial
          )}
        </div>
        {conv.status === "open" && (
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {conv.contact?.name || conv.contact?.phone}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {conv.lastMessageAt ? formatTime(conv.lastMessageAt) : ""}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="truncate text-xs text-muted-foreground">
            {conv.lastMessage || "Nova conversa"}
          </p>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Status badges */}
            {conv.status === 'resolved' && (
              <span className="text-[9px] bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded-full">Resolvido</span>
            )}
            {conv.status === 'closed' && (
              <span className="text-[9px] bg-gray-500/10 text-gray-400 px-1.5 py-0.5 rounded-full">Fechado</span>
            )}
            {conv.status === 'waiting_customer' && (
              <span className="text-[9px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded-full">Aguardando</span>
            )}
            {(conv.status === 'waiting_response' || (!conv.assignedTo && conv.status === 'open')) && (
              <span className="relative flex items-center gap-1 text-[9px] bg-orange-500/10 text-orange-500 px-1.5 py-0.5 rounded-full">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-orange-500"></span>
                </span>
                Sem atendente
              </span>
            )}
            {conv.unreadCount > 0 && (
              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {conv.unreadCount}
              </span>
            )}
          </div>
        </div>

        {/* Etiqueta da campanha (tag estilo WhatsApp) */}
        {conv.campaignName && (
          <div className="mt-1 flex">
            <span
              className={`inline-flex max-w-full items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ring-1 ring-inset ${campaignTagStyle(conv.campaignName)}`}
              title={`Campanha: ${conv.campaignName}`}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-80" />
              <span className="truncate">{conv.campaignName}</span>
            </span>
          </div>
        )}
      </div>
    </button>
  );
}

// ═════════════════════════════════════════════════════════════
// ─── Main Inbox Page ──────────────────────────────────────────
// ═════════════════════════════════════════════════════════════
export default function InboxPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { globalUnit } = useGlobalUnit();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [search, setSearch] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [attachment, setAttachment] = useState<{ file: File; base64: string; type: string } | null>(null);
  const [contactSidebarOpen, setContactSidebarOpen] = useState(false);
  const [contactPopoverOpen, setContactPopoverOpen] = useState(false);
  const [kebabOpen, setKebabOpen] = useState(false);
  const [evoSignal, setEvoSignal] = useState(0);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // ─── Gravação de áudio ─────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<"all" | "open" | "unread" | "closed">("all");
  // Filtro por etiqueta (campanha). Vazio = mostra todas.
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [tagFilterOpen, setTagFilterOpen] = useState(false);

  // ─── Admin: dados do usuário e seletor de colaboradores ───
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; role: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [collaborators, setCollaborators] = useState<CollaboratorInstance[]>([]);
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [selectedCollaborator, setSelectedCollaborator] = useState<CollaboratorInstance | null>(null);
  const [collaboratorDropdownOpen, setCollaboratorDropdownOpen] = useState(false);

  // Pipeline refresh trigger — incrementado após auto-evolução para forçar re-fetch no componente
  const [pipelineRefreshKey, setPipelineRefreshKey] = useState(0);

  // Close modal
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeResolution, setCloseResolution] = useState('resolved');
  const [closeNote, setCloseNote] = useState('');
  const [sendGoodbye, setSendGoodbye] = useState(true);
  const [sendSurvey, setSendSurvey] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Buscar info do usuário logado e instâncias (se admin)
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          setCurrentUser({ id: data.user.id, name: data.user.name, role: data.user.role });
          if (data.user.role === "ADMINISTRADOR") {
            setIsAdmin(true);
            // Buscar instâncias dos colaboradores
            fetch("/api/whatsapp/admin/instances")
              .then((r) => r.json())
              .then((d) => {
                if (d.instances) setCollaborators(d.instances);
              })
              .catch(() => {});
          }
        }
      })
      .catch(() => {});
  }, []);

  // Ler targetUserId da URL ao montar
  useEffect(() => {
    const urlTargetUserId = searchParams.get("targetUserId");
    if (urlTargetUserId) {
      setTargetUserId(urlTargetUserId);
    }
  }, [searchParams]);

  // Atualizar colaborador selecionado quando targetUserId mudar
  useEffect(() => {
    if (targetUserId && collaborators.length > 0) {
      const collab = collaborators.find((c) => c.userId === targetUserId);
      setSelectedCollaborator(collab || null);
    } else {
      setSelectedCollaborator(null);
    }
  }, [targetUserId, collaborators]);

  // Helper para construir URL com targetUserId
  const buildUrl = useCallback(
    (baseUrl: string, extraParams?: Record<string, string>) => {
      const url = new URL(baseUrl, window.location.origin);
      if (targetUserId) url.searchParams.set("targetUserId", targetUserId);
      if (extraParams) {
        Object.entries(extraParams).forEach(([k, v]) => url.searchParams.set(k, v));
      }
      return url.pathname + url.search;
    },
    [targetUserId]
  );

  // Limpar targetUser e voltar ao próprio inbox
  const clearTargetUser = useCallback(() => {
    setTargetUserId(null);
    setSelectedCollaborator(null);
    setSelectedConv(null);
    setMessages([]);
    router.push("/crm/inbox");
  }, [router]);

  // Selecionar colaborador
  const selectCollaborator = useCallback(
    (userId: string | null) => {
      setTargetUserId(userId);
      setSelectedConv(null);
      setMessages([]);
      setCollaboratorDropdownOpen(false);
      if (userId) {
        router.push(`/crm/inbox?targetUserId=${userId}`);
      } else {
        router.push("/crm/inbox");
      }
    },
    [router]
  );

  // ─── Data fetching ────────────────────────────────────────
  // Note: Sound & browser notifications are handled globally by the sidebar.
  // Monta a query compartilhada (targetUserId p/ admin + unit p/ separação).
  const waParams = useCallback((extra?: Record<string, string>) => {
    const p = new URLSearchParams();
    if (targetUserId) p.set("targetUserId", targetUserId);
    if (globalUnit) p.set("unit", globalUnit);
    if (extra) for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p.toString();
  }, [targetUserId, globalUnit]);

  const fetchConversations = useCallback(async () => {
    try {
      const qs = waParams();
      const res = await fetch(`/api/whatsapp/conversations${qs ? `?${qs}` : ""}`);
      const data = await res.json();
      if (data.conversations) {
        setConversations(data.conversations as Conversation[]);
      }
    } catch (e) {
      console.error(e);
    }
  }, [waParams]);

  const fetchMessages = useCallback(async (convId: string) => {
    try {
      const qs = waParams({ conversationId: convId });
      const res = await fetch(`/api/whatsapp/messages?${qs}`);
      const data = await res.json();
      if (data.messages) setMessages(data.messages);
    } catch (e) {
      console.error(e);
    }
  }, [waParams]);

  // Ao trocar de unidade, zera a seleção atual (a conversa pertencia a outra
  // unidade) e limpa a lista até o próximo fetch — separação total.
  useEffect(() => {
    setSelectedConv(null);
    setMessages([]);
    setConversations([]);
  }, [globalUnit]);

  // Polling
  useEffect(() => {
    fetchConversations();
    const interval = setInterval(() => {
      fetchConversations();
      if (selectedConv) fetchMessages(selectedConv.id);
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedConv, fetchConversations, fetchMessages]);

  // Load messages on conversation select
  useEffect(() => {
    if (!selectedConv) return;
    setLoadingMessages(true);
    setMessages([]);
    fetchMessages(selectedConv.id).finally(() => setLoadingMessages(false));
  }, [selectedConv, fetchMessages]);

  // Auto-scroll
  const prevLengthRef = useRef(0);
  useEffect(() => {
    if (messages.length > prevLengthRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevLengthRef.current = messages.length;
  }, [messages]);

  // ─── File attachment ──────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        setAttachment({
          file,
          base64: reader.result as string,
          type: file.type.startsWith("image/") ? "image" : file.type.startsWith("audio/") ? "audio" : "document",
        });
      };
      reader.readAsDataURL(file);
    }
  };

  // ─── Send message ─────────────────────────────────────────
  const handleSendMessage = async (e: React.FormEvent | React.KeyboardEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !attachment) || !selectedConv) return;

    const wasFirstMessage = messages.length === 0;
    setIsSending(true);
    const tempMsg = newMessage;
    const tempAttach = attachment;
    const tempId = "temp_" + Date.now();

    setNewMessage("");
    setAttachment(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        body: tempMsg,
        type: tempAttach ? tempAttach.type : "text",
        mediaUrl: tempAttach?.base64,
        fromMe: true,
        status: "sent",
        timestamp: new Date().toISOString(),
      },
    ]);

    try {
      const payload: Record<string, any> = {
        contactId: selectedConv.contact.phone,
        body: tempMsg,
        type: tempAttach ? tempAttach.type : "text",
      };
      // Incluir targetUserId se estiver visualizando inbox de outro usuário
      if (targetUserId) {
        payload.targetUserId = targetUserId;
      }
      if (tempAttach) {
        payload.file = tempAttach.base64;
        payload.docName = tempAttach.file.name;
      }

      const qs = waParams();
      const res = await fetch(`/api/whatsapp/send${qs ? `?${qs}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("Falha no envio:", err);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      } else {
        if (wasFirstMessage) autoEvolveToServiceStage(selectedConv.contact.phone);
        fetchMessages(selectedConv.id);
      }
      fetchConversations();
    } catch (error) {
      console.error(error);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setIsSending(false);
    }
  };

  // ─── Gravação de áudio ────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Usa webm/opus se disponível, senão fallback para o default
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : undefined;
      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || "audio/webm",
        });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          sendAudioMessage(base64);
        };
        reader.readAsDataURL(audioBlob);
        // Liberar microfone
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Erro ao acessar microfone:", err);
      toast("Permita o acesso ao microfone para gravar áudio", "error");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      // Remove handler para não enviar o áudio ao parar
      mediaRecorderRef.current.onstop = null;
      if (mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingTime(0);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const sendAudioMessage = async (base64: string) => {
    if (!selectedConv) return;
    setIsSending(true);
    try {
      const payload: Record<string, any> = {
        contactId: selectedConv.contact.phone,
        body: "",
        type: "audio",
        file: base64,
      };
      // Incluir targetUserId se estiver visualizando inbox de outro usuário
      if (targetUserId) payload.targetUserId = targetUserId;

      const qs = waParams();
      const res = await fetch(`/api/whatsapp/send${qs ? `?${qs}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        fetchMessages(selectedConv.id);
        fetchConversations();
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("Falha ao enviar áudio:", err);
        toast("Erro ao enviar áudio", "error");
      }
    } catch (e) {
      console.error(e);
      toast("Erro ao enviar áudio", "error");
    } finally {
      setIsSending(false);
    }
  };

  // Avança o deal do contato da 1ª fase para a 2ª automaticamente (ex: Novo Lead → Em Atendimento)
  const autoEvolveToServiceStage = useCallback(async (phone: string) => {
    try {
      const [cRes, pRes] = await Promise.all([
        fetch(`/api/clients?phone=${phone}`),
        fetch('/api/pipelines'),
      ]);
      const clients = await cRes.json();
      const client = clients[0];
      if (!client) return;
      const pipes = await pRes.json();
      const pipeline = pipes[0];
      if (!pipeline?.stages || pipeline.stages.length < 2) return;
      const dRes = await fetch(`/api/pipeline?pipelineId=${pipeline.id}`);
      const deals = await dRes.json();
      const deal = deals.find((d: any) => d.clientId === client.id);
      if (!deal || deal.stageId !== pipeline.stages[0].id) return; // já avançou
      const targetStage = pipeline.stages[1];
      const res = await fetch('/api/pipeline', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deal.id, stageId: targetStage.id }),
      });
      if (res.ok) {
        toast(`Fase atualizada: ${targetStage.name}`, 'success');
        setPipelineRefreshKey((k) => k + 1);
      }
    } catch {
      // falha silenciosa — auto-evolução é best-effort
    }
  }, []);

  // Finalizar conversa
  const handleCloseConversation = async () => {
    if (!selectedConv) return;
    setIsClosing(true);
    try {
      const targetParam = targetUserId ? `?targetUserId=${targetUserId}` : '';
      const res = await fetch(`/api/whatsapp/conversations/${selectedConv.id}/close${targetParam}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolution: closeResolution,
          closeNote,
          sendGoodbye,
          sendSurvey,
          unit: globalUnit,
        }),
      });
      if (res.ok) {
        toast('Conversa finalizada com sucesso', 'success');
        setShowCloseModal(false);
        setCloseResolution('resolved');
        setCloseNote('');
        fetchConversations();
      } else {
        toast('Erro ao finalizar conversa', 'error');
      }
    } catch {
      toast('Erro ao finalizar conversa', 'error');
    } finally {
      setIsClosing(false);
    }
  };

  // Reabrir conversa
  const handleReopenConversation = async () => {
    if (!selectedConv) return;
    try {
      const targetParam = targetUserId ? `?targetUserId=${targetUserId}` : '';
      const res = await fetch(`/api/whatsapp/conversations/${selectedConv.id}/reopen${targetParam}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        toast('Conversa reaberta', 'success');
        fetchConversations();
      }
    } catch {
      toast('Erro ao reabrir conversa', 'error');
    }
  };

  const handleDeleteConversation = async () => {
    if (!selectedConv) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/whatsapp/conversations/${selectedConv.id}/delete`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast('Conversa excluída com sucesso', 'success');
        setShowDeleteModal(false);
        setSelectedConv(null);
        fetchConversations();
      } else {
        const data = await res.json();
        toast(data.error || 'Erro ao excluir', 'error');
      }
    } catch {
      toast('Erro ao excluir conversa', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Iniciar atendimento — atribui operador e altera status da conversa para 'open'
  const handleStartService = async () => {
    if (!selectedConv || !currentUser) return;
    try {
      const targetParam = targetUserId ? `?targetUserId=${targetUserId}` : '';

      // 1. Atualizar status da conversa para 'open' e atribuir operador no banco de dados
      const res = await fetch(`/api/whatsapp/conversations/${selectedConv.id}/reopen${targetParam}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id,
          'x-user-name': currentUser.name || '',
        },
        body: JSON.stringify({
          assignedTo: currentUser.id,
          assignedToName: currentUser.name || 'Operador',
        }),
      });

      if (res.ok) {
        toast('Atendimento iniciado!', 'success');
        autoEvolveToServiceStage(selectedConv.contact.phone);

        // 2. Atualizar estado local imediatamente
        setSelectedConv({
          ...selectedConv,
          status: 'open',
          assignedTo: currentUser.id,
          assignedToName: currentUser.name || 'Operador',
        });

        fetchConversations();
        fetchMessages(selectedConv.id);
      } else {
        toast('Erro ao iniciar atendimento', 'error');
      }
    } catch {
      toast('Erro ao iniciar atendimento', 'error');
    }
  };

  // ─── Filtered conversations ───────────────────────────────
  const openCount = conversations.filter((c) => c.status === "open").length;
  const unreadCount = conversations.filter((c) => c.unreadCount > 0).length;

  // Etiquetas (campanhas) presentes nas conversas — alimentam o filtro.
  const availableTags = [...new Set(
    conversations.map((c) => c.campaignName).filter(Boolean) as string[]
  )].sort();

  const filtered = conversations.filter((c) => {
    // Tab filter
    if (tab === "open" && c.status !== "open") return false;
    if (tab === "unread" && c.unreadCount === 0) return false;
    if (tab === "closed" && c.status !== "closed") return false;
    // Tag (campanha) filter
    if (tagFilter.length > 0 && !tagFilter.includes(c.campaignName || "")) return false;
    // Search filter
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.contact?.name?.toLowerCase().includes(q) ||
      c.contact?.phone?.toLowerCase().includes(q)
    );
  });

  // ─── UI ───────────────────────────────────────────────────
  return (
    <div className="absolute inset-0 flex overflow-hidden bg-background text-foreground">
      
      {/* ── LEFT: Conversation List ── */}
      <div
        className={`flex h-full flex-col border-r border-border bg-card flex-shrink-0 w-full sm:w-80 ${
          selectedConv ? "hidden lg:flex" : "flex"
        }`}
      >
        {/* Banner admin: visualizando inbox de outro usuário */}
        {targetUserId && selectedCollaborator && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center gap-2 text-sm">
            <Eye className="w-4 h-4 text-amber-500" />
            <span className="text-amber-600 dark:text-amber-400">
              Visualizando inbox de <strong>{selectedCollaborator.userName}</strong>
            </span>
            <button
              onClick={clearTargetUser}
              className="ml-auto text-xs text-amber-500 hover:underline"
            >
              Voltar ao meu inbox
            </button>
          </div>
        )}

        {/* Seletor de colaborador (apenas admin) */}
        {isAdmin && (
          <div className="border-b border-border px-3 py-2">
            <div className="relative">
              <button
                onClick={() => setCollaboratorDropdownOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm transition-colors hover:bg-muted"
              >
                <span className="truncate">
                  {targetUserId && selectedCollaborator
                    ? `👤 ${selectedCollaborator.userName} (${selectedCollaborator.unit})`
                    : "📥 Meu Inbox"}
                </span>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${collaboratorDropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {collaboratorDropdownOpen && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                  <button
                    onClick={() => selectCollaborator(null)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-muted ${
                      !targetUserId ? "bg-primary/10 text-primary font-medium" : "text-foreground"
                    }`}
                  >
                    📥 Meu Inbox
                  </button>
                  {collaborators.map((collab) => (
                    <button
                      key={collab.userId}
                      onClick={() => selectCollaborator(collab.userId)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-muted ${
                        targetUserId === collab.userId ? "bg-primary/10 text-primary font-medium" : "text-foreground"
                      }`}
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold flex-shrink-0">
                        {collab.userName?.charAt(0)?.toUpperCase() || "?"}
                      </span>
                      <span className="truncate">{collab.userName}</span>
                      <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">{collab.unit}</span>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        collab.status === "connected" ? "bg-emerald-500" : "bg-red-500"
                      }`} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Search + Tabs */}
        <div className="border-b border-border p-3 space-y-2">
          {/* Header with open count */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-foreground">Conversas</span>
            {openCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                {openCount} em aberto
              </span>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar conversas..."
              className="flex h-9 w-full rounded-md border border-border bg-muted px-3 py-1 pl-9 text-sm text-foreground placeholder:text-muted-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          {/* Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-0.5">
            {([
              { key: "all" as const, label: "Todas", count: undefined },
              { key: "open" as const, label: "Em Aberto", count: openCount },
              { key: "unread" as const, label: "Não Lidos", count: unreadCount },
              { key: "closed" as const, label: "Finalizados", count: undefined },
            ]).map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  tab === key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                }`}
              >
                {label}
                {count !== undefined && count > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                    tab === key ? "bg-white/20 text-white" : "bg-primary/15 text-primary"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Filtro por etiqueta (campanha) */}
          {availableTags.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setTagFilterOpen((o) => !o)}
                className={`flex w-full items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  tagFilter.length > 0
                    ? "border-primary/40 bg-primary/5 text-foreground"
                    : "border-border bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <Tag className="h-3.5 w-3.5" />
                <span className="flex-1 text-left">
                  {tagFilter.length > 0 ? `${tagFilter.length} etiqueta(s)` : "Filtrar por etiqueta"}
                </span>
                {tagFilter.length > 0 && (
                  <span
                    onClick={(e) => { e.stopPropagation(); setTagFilter([]); }}
                    className="rounded px-1 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    limpar
                  </span>
                )}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${tagFilterOpen ? "rotate-180" : ""}`} />
              </button>

              {tagFilterOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setTagFilterOpen(false)} />
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-2xl">
                    {availableTags.map((t) => {
                      const active = tagFilter.includes(t);
                      return (
                        <button
                          key={t}
                          onClick={() =>
                            setTagFilter((prev) => (active ? prev.filter((x) => x !== t) : [...prev, t]))
                          }
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted"
                        >
                          <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${active ? "border-primary bg-primary" : "border-border"}`}>
                            {active && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                          </span>
                          <span className={`inline-flex min-w-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${campaignTagStyle(t)}`}>
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-80" />
                            <span className="truncate">{t}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                <MessageSquare className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                {search || tagFilter.length > 0 ? "Nenhuma conversa encontrada" : "Nenhuma conversa ainda"}
              </p>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {filtered.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  isActive={selectedConv?.id === conv.id}
                  onClick={() => {
                    setSelectedConv(conv);
                    setContactSidebarOpen(false);
                    setContactPopoverOpen(false);
                    setKebabOpen(false);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── CENTER: Message Thread ── */}
      <div
        className={`flex h-full min-w-0 flex-1 flex-col bg-background relative ${
          selectedConv ? "flex" : "hidden lg:flex"
        }`}
      >
        {selectedConv ? (
          <>
            {/* Banner admin no topo do thread */}
            {targetUserId && selectedCollaborator && (
              <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center gap-2 text-sm lg:hidden">
                <Eye className="w-4 h-4 text-amber-500" />
                <span className="text-amber-600 dark:text-amber-400">
                  Inbox de <strong>{selectedCollaborator.userName}</strong>
                </span>
                <button
                  onClick={clearTargetUser}
                  className="ml-auto text-xs text-amber-500 hover:underline"
                >
                  Voltar
                </button>
              </div>
            )}

            {/* Thread Header */}
            <div className="flex flex-col sm:flex-row sm:h-14 shrink-0 items-start sm:items-center justify-between border-b border-border bg-card px-3 sm:px-4 py-2 sm:py-0 shadow-sm z-10 gap-2 sm:gap-0">
              <div className="relative flex items-center gap-1 sm:gap-2 min-w-0 w-full sm:w-auto">
                {/* Back (mobile) */}
                <button
                  onClick={() => setSelectedConv(null)}
                  className="lg:hidden p-1.5 -ml-1 text-muted-foreground hover:bg-muted rounded-lg transition-colors shrink-0"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>

                {/* Avatar + nome — abre o card flutuante do contato */}
                <button
                  onClick={() => setContactPopoverOpen((o) => !o)}
                  className={`flex items-center gap-2 sm:gap-3 min-w-0 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-muted/60 ${contactPopoverOpen ? "bg-muted/60" : ""}`}
                  title="Ver dados do contato"
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold overflow-hidden transition-all ${contactPopoverOpen ? "ring-2 ring-primary/60" : ""}`}>
                    {selectedConv.contact.profilePic ? (
                      <img src={selectedConv.contact.profilePic} alt="" className="h-9 w-9 object-cover" />
                    ) : (
                      selectedConv.contact.name?.charAt(0)?.toUpperCase() ||
                      selectedConv.contact.phone?.charAt(0) ||
                      "?"
                    )}
                  </span>
                  <span className="flex flex-col min-w-0 text-left">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {selectedConv.contact.name || selectedConv.contact.phone}
                    </span>
                    <span className="truncate text-xs text-muted-foreground font-mono">
                      {selectedConv.contact.phone}
                    </span>
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${contactPopoverOpen ? "rotate-180" : ""}`} />
                </button>

                {/* Card flutuante ancorado ao avatar */}
                {contactPopoverOpen && selectedConv && (
                  <ContactPopover
                    conversation={selectedConv}
                    onClose={() => setContactPopoverOpen(false)}
                    onOpenFull={() => { setContactPopoverOpen(false); setContactSidebarOpen(true); }}
                    pipelineRefreshKey={pipelineRefreshKey}
                  />
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
                {/* Chip discreto de conversa finalizada */}
                {selectedConv && (selectedConv.status === 'resolved' || selectedConv.status === 'closed') && (
                  <span className="hidden sm:flex h-8 items-center gap-1 rounded-md bg-emerald-500/10 px-2 text-xs font-medium text-emerald-500" title="Conversa finalizada">
                    <Check className="h-3.5 w-3.5" />
                    Finalizada
                  </span>
                )}

                {/* Seletor de fase do funil */}
                {selectedConv && (
                  <PipelineStageSelector
                    contactPhone={selectedConv.contact.phone}
                    contactName={selectedConv.contact.name || undefined}
                    layout="headerPill"
                    refreshTrigger={pipelineRefreshKey}
                    openEvolutionSignal={evoSignal}
                  />
                )}

                {/* Menu "⋯" — ações da conversa */}
                <div className="relative shrink-0">
                  <button
                    onClick={() => setKebabOpen((o) => !o)}
                    className={`flex h-8 w-8 items-center justify-center rounded-md border border-border transition-colors ${
                      kebabOpen ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                    title="Mais ações"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>

                  {kebabOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setKebabOpen(false)} />
                      <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-2xl">
                        {/* Evolução do paciente */}
                        <button
                          onClick={() => { setEvoSignal((s) => s + 1); setKebabOpen(false); }}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                        >
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          Evolução do paciente
                        </button>

                        <div className="my-1 h-px bg-border" />

                        {/* Finalizar / Reabrir */}
                        {selectedConv && selectedConv.status !== 'resolved' && selectedConv.status !== 'closed' ? (
                          <button
                            onClick={() => { setShowCloseModal(true); setKebabOpen(false); }}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium text-emerald-600 transition-colors hover:bg-emerald-500/10"
                          >
                            <Check className="h-4 w-4" />
                            Finalizar conversa
                          </button>
                        ) : (
                          <button
                            onClick={() => { handleReopenConversation(); setKebabOpen(false); }}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                          >
                            <RotateCcw className="h-4 w-4 text-muted-foreground" />
                            Reabrir conversa
                          </button>
                        )}

                        {/* Excluir — apenas ADMINISTRADOR */}
                        {isAdmin && selectedConv && (
                          <>
                            <div className="my-1 h-px bg-border" />
                            <button
                              onClick={() => { setShowDeleteModal(true); setKebabOpen(false); }}
                              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                              Excluir conversa
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {loadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <p className="text-xs text-muted-foreground">Carregando mensagens...</p>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const prevMsg = idx > 0 ? messages[idx - 1] : undefined;
                  const operatorChanged = msg.fromMe && prevMsg?.fromMe &&
                    msg.respondedBy && prevMsg.respondedBy &&
                    msg.respondedBy !== prevMsg.respondedBy;
                  const showOperatorName = msg.fromMe && msg.respondedByName && (
                    !prevMsg?.fromMe || prevMsg?.respondedBy !== msg.respondedBy
                  );

                  return (
                    <React.Fragment key={msg.id || idx}>
                      {/* Divisor de transferência */}
                      {operatorChanged && (
                        <div className="flex items-center gap-3 py-2 px-4">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            🔄 Transferido para {msg.respondedByName}
                          </span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      )}
                      {/* Nome do operador */}
                      {showOperatorName && !operatorChanged && (
                        <div className="flex justify-end px-4 mb-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-primary text-[8px] font-bold">
                              {msg.respondedByName!.charAt(0).toUpperCase()}
                            </span>
                            <span className="text-[10px] text-primary font-medium">
                              {msg.respondedByName}
                            </span>
                          </div>
                        </div>
                      )}
                      <MessageBubble msg={msg} />
                    </React.Fragment>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Attachment Preview Overlay */}
            {attachment && (
              <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
                <div className="h-14 px-4 flex items-center bg-card border-b border-border gap-3">
                  <button onClick={() => setAttachment(null)} className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground hover:text-foreground">
                    <X className="w-5 h-5" />
                  </button>
                  <h2 className="font-semibold text-foreground">Pré-visualizar</h2>
                </div>
                <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
                  {attachment.type === "image" ? (
                    <img src={attachment.base64} alt="Preview" className="max-w-full max-h-full object-contain rounded-lg shadow-lg" />
                  ) : attachment.file.type === "application/pdf" ? (
                    <embed src={attachment.base64} type="application/pdf" className="w-full h-full max-w-4xl rounded-lg shadow-xl bg-white" />
                  ) : (
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-28 h-28 bg-muted rounded-2xl flex items-center justify-center">
                        <FileText className="w-14 h-14 text-muted-foreground" />
                      </div>
                      <div className="text-center">
                        <h3 className="font-semibold text-foreground text-lg max-w-sm truncate">{attachment.file.name}</h3>
                        <p className="text-sm text-muted-foreground mt-1">{(attachment.file.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-4 bg-card border-t border-border flex items-center gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                  <div className="flex-1 flex items-center bg-muted rounded-xl px-4 py-2.5 focus-within:ring-1 focus-within:ring-ring">
                    <input
                      className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none text-sm"
                      placeholder="Adicione uma legenda..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(e as any); } }}
                      disabled={isSending}
                      autoFocus
                    />
                  </div>
                  <button
                    onClick={handleSendMessage as any}
                    disabled={isSending}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-primary hover:bg-primary/90 text-primary-foreground transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4 ml-0.5" />}
                  </button>
                </div>
              </div>
            )}

            {/* Botão Iniciar Atendimento — se a conversa não tem atendente */}
            {selectedConv && (!selectedConv.assignedTo || selectedConv.status === 'waiting_response') && (
              <div className="shrink-0 border-t border-border bg-gradient-to-r from-primary/5 to-primary/10 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Nenhum atendente neste chat</p>
                    <p className="text-xs text-muted-foreground">Clique para assumir o atendimento</p>
                  </div>
                  <button
                    onClick={handleStartService}
                    className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md hover:bg-primary/90 transition-all hover:shadow-lg hover:scale-105"
                  >
                    <Play className="h-4 w-4" />
                    Iniciar Atendimento
                  </button>
                </div>
              </div>
            )}



            {/* Input Bar */}
            <div className="shrink-0 border-t border-border bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {isRecording ? (
                /* UI de gravação de áudio */
                <div className="flex items-center gap-2">
                  <button
                    onClick={cancelRecording}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-destructive hover:bg-destructive/10 transition-colors"
                    title="Cancelar gravação"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <div className="flex-1 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-sm text-red-500 font-mono">
                      {Math.floor(recordingTime / 60)
                        .toString()
                        .padStart(2, "0")}
                      :
                      {(recordingTime % 60).toString().padStart(2, "0")}
                    </span>
                    <span className="text-xs text-muted-foreground">Gravando...</span>
                  </div>
                  <button
                    onClick={stopRecording}
                    disabled={isSending}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
                    title="Enviar áudio"
                  >
                    {isSending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 ml-0.5" />
                    )}
                  </button>
                </div>
              ) : (
                /* Barra de input normal */
                <div className="flex items-end gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <Paperclip className="h-5 w-5" />
                  </button>
                  <input
                    type="file"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept="image/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx"
                  />

                  <div className="flex min-h-[40px] flex-1 items-end gap-2 rounded-xl border border-input bg-background px-3 py-2 shadow-sm focus-within:ring-1 focus-within:ring-ring">
                    <textarea
                      ref={textareaRef}
                      value={newMessage}
                      onChange={(e) => {
                        setNewMessage(e.target.value);
                        e.target.style.height = "auto";
                        e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage(e as any);
                        }
                      }}
                      placeholder="Mensagem..."
                      className="flex-1 max-h-[120px] resize-none bg-transparent py-0.5 text-sm placeholder:text-muted-foreground focus:outline-none text-foreground"
                      rows={1}
                    />
                  </div>

                  <button
                    onClick={
                      newMessage.trim() || attachment
                        ? (handleSendMessage as any)
                        : startRecording
                    }
                    disabled={isSending}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {isSending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : newMessage.trim() || attachment ? (
                      <Send className="h-4 w-4 ml-0.5" />
                    ) : (
                      <Mic className="h-4 w-4" />
                    )}
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Empty State */
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground p-8 text-center bg-muted/10">
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-muted ring-8 ring-background">
              <MessageSquare className="h-9 w-9 text-muted-foreground/50" />
            </div>
            <h3 className="mb-2 text-xl font-semibold text-foreground">WhatsApp Inbox</h3>
            <p className="max-w-[260px] text-sm text-muted-foreground">
              Selecione uma conversa para começar a enviar e receber mensagens.
            </p>
          </div>
        )}
      </div>

      {/* ── RIGHT: Contact Sidebar (toggleable) ── */}
      {selectedConv && contactSidebarOpen && (
        <>
          {/* Overlay for mobile */}
          <div 
            className="fixed inset-0 z-40 bg-black/50 lg:hidden" 
            onClick={() => setContactSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm shadow-2xl lg:relative lg:inset-auto lg:z-auto lg:w-auto lg:shadow-none">
            <ContactSidebar
              conversation={selectedConv}
              onClose={() => setContactSidebarOpen(false)}
              pipelineRefreshKey={pipelineRefreshKey}
            />
          </div>
        </>
      )}

      {/* Modal Excluir Conversa (apenas ADM) */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-destructive/30 bg-card p-6 shadow-2xl">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                <Trash2 className="h-7 w-7 text-destructive" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Excluir Conversa</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tem certeza? Todas as mensagens serão permanentemente excluídas.<br />
                  <span className="font-medium text-destructive">Esta ação não pode ser desfeita.</span>
                </p>
              </div>
              <div className="flex w-full gap-3 mt-2">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={isDeleting}
                  className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteConversation}
                  disabled={isDeleting}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white hover:bg-destructive/90 transition-colors disabled:opacity-50"
                >
                  {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Finalizar Conversa */}
      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Finalizar Conversa</h3>
              <button onClick={() => setShowCloseModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Resolução */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Resolução</label>
                <select
                  value={closeResolution}
                  onChange={(e) => setCloseResolution(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="resolved">✅ Resolvido</option>
                  <option value="unresolved">❌ Não Resolvido</option>
                  <option value="spam">🚫 Spam</option>
                  <option value="duplicate">📋 Duplicado</option>
                </select>
              </div>

              {/* Nota interna */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Nota Interna (opcional)</label>
                <textarea
                  value={closeNote}
                  onChange={(e) => setCloseNote(e.target.value)}
                  placeholder="Observações sobre o atendimento..."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground resize-none"
                  rows={3}
                />
              </div>

              {/* Toggles */}
              <div className="space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm text-foreground">Enviar mensagem de despedida</span>
                  <button
                    type="button"
                    onClick={() => setSendGoodbye(!sendGoodbye)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      sendGoodbye ? 'bg-primary' : 'bg-muted'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      sendGoodbye ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </label>


              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCloseModal(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCloseConversation}
                disabled={isClosing}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isClosing ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Finalizar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
