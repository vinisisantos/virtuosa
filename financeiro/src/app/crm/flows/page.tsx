"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Workflow,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  MessageSquare,
  Tag,
  Users,
  Play,
  Pause,
  Archive,
  MoreVertical,
  Copy,
  Check,
  X,
  ArrowRight,
  Clock,
  GitBranch,
  CircleStop,
  Zap,
  HelpCircle,
  Send,
  UserPlus,
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

// ─── Types ────────────────────────────────────────────────────
interface FlowNode {
  id: string;
  type: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

interface FlowEdge {
  source: string;
  target: string;
  label?: string;
}

interface Flow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  triggerType: string;
  triggerConfig: Record<string, unknown> | null;
  nodes?: FlowNode[];
  edges?: FlowEdge[];
  executionCount: number;
  lastExecutedAt: string | null;
  createdAt: string;
  _count?: { runs: number };
}

// ─── Constants ───────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Play }> = {
  draft: { label: "Rascunho", color: "text-muted-foreground bg-muted", icon: Pencil },
  active: { label: "Ativo", color: "text-emerald-700 bg-emerald-400/10 dark:text-emerald-400", icon: Play },
  archived: { label: "Arquivado", color: "text-muted-foreground bg-muted/50", icon: Archive },
};

const TRIGGER_TYPES = [
  { key: "keyword", label: "Palavra-chave", desc: "Disparado por mensagens com palavras específicas", icon: Tag },
  { key: "first_message", label: "Primeira Mensagem", desc: "Disparado na primeira mensagem de um contato", icon: UserPlus },
  { key: "manual", label: "Manual", desc: "Iniciado manualmente por um operador", icon: Play },
];

const NODE_TYPES = [
  { key: "start", label: "Início", icon: Play, color: "border-l-emerald-500 bg-emerald-500/5" },
  { key: "send_message", label: "Enviar Mensagem", icon: Send, color: "border-l-blue-500 bg-blue-500/5" },
  { key: "send_buttons", label: "Botões Interativos", icon: HelpCircle, color: "border-l-purple-500 bg-purple-500/5" },
  { key: "collect_input", label: "Capturar Resposta", icon: MessageSquare, color: "border-l-amber-500 bg-amber-500/5" },
  { key: "condition", label: "Condição (Se/Senão)", icon: GitBranch, color: "border-l-orange-500 bg-orange-500/5" },
  { key: "wait", label: "Aguardar", icon: Clock, color: "border-l-gray-500 bg-gray-500/5" },
  { key: "handoff", label: "Transferir p/ Atendente", icon: Users, color: "border-l-cyan-500 bg-cyan-500/5" },
  { key: "end", label: "Fim", icon: CircleStop, color: "border-l-red-500 bg-red-500/5" },
];

const FLOW_TEMPLATES = [
  {
    name: "FAQ Automático",
    description: "Responde perguntas frequentes com botões interativos",
    icon: HelpCircle,
    triggerType: "keyword",
    triggerConfig: { keywords: ["ajuda", "dúvida", "informação"] },
    nodes: [
      { id: "n1", type: "start", config: {}, position: { x: 250, y: 50 } },
      { id: "n2", type: "send_buttons", config: { text: "Olá! 👋 Como posso ajudar?\n\nEscolha uma opção:", buttons: [{ label: "Preços", nextId: "n3" }, { label: "Horários", nextId: "n4" }, { label: "Falar com atendente", nextId: "n5" }] }, position: { x: 250, y: 150 } },
      { id: "n3", type: "send_message", config: { message: "💰 Nossos preços variam de acordo com o procedimento.\n\nAgende uma avaliação gratuita para receber um orçamento personalizado!" }, position: { x: 100, y: 300 } },
      { id: "n4", type: "send_message", config: { message: "🕐 Funcionamos:\nSeg-Sex: 9h às 19h\nSáb: 9h às 14h\nDom: Fechado" }, position: { x: 250, y: 300 } },
      { id: "n5", type: "handoff", config: { note: "Cliente solicitou atendente" }, position: { x: 400, y: 300 } },
      { id: "n6", type: "end", config: {}, position: { x: 250, y: 450 } },
    ],
    edges: [
      { source: "n1", target: "n2" },
      { source: "n2", target: "n3", label: "Preços" },
      { source: "n2", target: "n4", label: "Horários" },
      { source: "n2", target: "n5", label: "Atendente" },
      { source: "n3", target: "n6" },
      { source: "n4", target: "n6" },
    ],
  },
  {
    name: "Agendamento",
    description: "Coleta dados para agendamento de consulta",
    icon: MessageSquare,
    triggerType: "keyword",
    triggerConfig: { keywords: ["agendar", "marcar", "consulta", "horário"] },
    nodes: [
      { id: "n1", type: "start", config: {}, position: { x: 250, y: 50 } },
      { id: "n2", type: "send_message", config: { message: "Vamos agendar sua consulta! 📅\n\nPrimeiro, me diga seu nome completo:" }, position: { x: 250, y: 150 } },
      { id: "n3", type: "collect_input", config: { prompt: "Agora informe a data de preferência (ex: 15/01):", varKey: "data_preferencia" }, position: { x: 250, y: 280 } },
      { id: "n4", type: "collect_input", config: { prompt: "Qual turno prefere? (manhã/tarde)", varKey: "turno" }, position: { x: 250, y: 400 } },
      { id: "n5", type: "send_message", config: { message: "Perfeito! ✅ Sua solicitação de agendamento foi registrada.\n\nNossa equipe entrará em contato para confirmar." }, position: { x: 250, y: 520 } },
      { id: "n6", type: "handoff", config: { note: "Agendamento solicitado" }, position: { x: 250, y: 640 } },
    ],
    edges: [
      { source: "n1", target: "n2" },
      { source: "n2", target: "n3" },
      { source: "n3", target: "n4" },
      { source: "n4", target: "n5" },
      { source: "n5", target: "n6" },
    ],
  },
];

// ─── Flow Card ───────────────────────────────────────────────
function FlowCard({
  flow,
  onEdit,
  onDuplicate,
  onToggleStatus,
  onDelete,
}: {
  flow: Flow;
  onEdit: () => void;
  onDuplicate: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const cfg = STATUS_CONFIG[flow.status] || STATUS_CONFIG.draft;
  const StatusIcon = cfg.icon;
  const nodeCount = flow.nodes?.length || 0;

  return (
    <div className="rounded-xl border border-border bg-card transition-colors hover:border-primary/30">
      <div className="flex items-center gap-4 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Workflow className="h-5 w-5 text-primary" />
        </div>

        <button onClick={onEdit} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{flow.name}</span>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.color}`}>
              {cfg.label}
            </span>
          </div>
          {flow.description && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{flow.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium">
              {TRIGGER_TYPES.find((t) => t.key === flow.triggerType)?.label || flow.triggerType}
            </span>
            <span>{nodeCount} nós</span>
            <span>· {flow.executionCount} execuções</span>
          </div>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={onToggleStatus}
            className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
              flow.status === "active"
                ? "bg-emerald-400/10 text-emerald-700 hover:bg-emerald-400/20 dark:text-emerald-400"
                : "text-muted-foreground hover:bg-muted"
            }`}
            title={flow.status === "active" ? "Pausar" : "Ativar"}
          >
            {flow.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>

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
                  <button onClick={() => { onDuplicate(); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted">
                    <Copy className="h-3.5 w-3.5" /> Duplicar
                  </button>
                  <div className="my-1 h-px bg-border" />
                  <button onClick={() => { onDelete(); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-red-700 hover:bg-red-400/10 dark:text-red-400">
                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Visual Node on Canvas ───────────────────────────────────
function CanvasNode({
  node,
  selected,
  onSelect,
}: {
  node: FlowNode;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = NODE_TYPES.find((n) => n.key === node.type);
  const Icon = meta?.icon || Zap;

  return (
    <button
      onClick={onSelect}
      className={`absolute flex items-start gap-2.5 rounded-lg border-l-[3px] border border-border px-3 py-2.5 min-w-[180px] max-w-[240px] text-left transition-all shadow-sm ${
        meta?.color || "border-l-border"
      } ${selected ? "ring-2 ring-primary shadow-md" : "hover:shadow-md"}`}
      style={{ left: node.position.x, top: node.position.y }}
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-background/80 shrink-0 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground">{meta?.label || node.type}</p>
        {node.type === "send_message" && !!node.config.message && (
          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{String(node.config.message)}</p>
        )}
        {node.type === "send_buttons" && !!node.config.text && (
          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{String(node.config.text)}</p>
        )}
        {node.type === "collect_input" && !!node.config.prompt && (
          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{String(node.config.prompt)}</p>
        )}
        {node.type === "wait" && (
          <p className="text-[10px] text-muted-foreground mt-0.5">{String(node.config.seconds || 0)}s</p>
        )}
        {node.type === "handoff" && !!node.config.note && (
          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{String(node.config.note)}</p>
        )}
      </div>
    </button>
  );
}

// ─── Flow Builder Dialog ─────────────────────────────────────
function FlowBuilder({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: Partial<Flow> | null;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState("keyword");
  const [triggerConfig, setTriggerConfig] = useState<Record<string, unknown>>({});
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && initial) {
      setName(initial.name || "");
      setDescription(initial.description || "");
      setTriggerType(initial.triggerType || "keyword");
      setTriggerConfig(initial.triggerConfig || {});
      setNodes(Array.isArray(initial.nodes) ? initial.nodes : []);
      setEdges(Array.isArray(initial.edges) ? initial.edges : []);
      setSelectedNode(null);
    } else if (open) {
      setName("");
      setDescription("");
      setTriggerType("keyword");
      setTriggerConfig({});
      setNodes([
        { id: "start", type: "start", config: {}, position: { x: 250, y: 40 } },
        { id: "end", type: "end", config: {}, position: { x: 250, y: 400 } },
      ]);
      setEdges([]);
      setSelectedNode(null);
    }
  }, [open, initial]);

  function addNode(type: string) {
    const id = `n_${Date.now()}`;
    const maxY = Math.max(...nodes.map((n) => n.position.y), 0);
    const newNode: FlowNode = {
      id,
      type,
      config: type === "send_message" ? { message: "" } : type === "send_buttons" ? { text: "", buttons: [] } : type === "collect_input" ? { prompt: "", varKey: "" } : type === "wait" ? { seconds: 60 } : type === "condition" ? { field: "", value: "" } : type === "handoff" ? { note: "" } : {},
      position: { x: 250, y: maxY + 100 },
    };
    setNodes([...nodes, newNode]);
    setSelectedNode(id);
  }

  function updateNodeConfig(id: string, config: Record<string, unknown>) {
    setNodes(nodes.map((n) => (n.id === id ? { ...n, config } : n)));
  }

  function removeNode(id: string) {
    if (id === "start" || id === "end") return;
    setNodes(nodes.filter((n) => n.id !== id));
    setEdges(edges.filter((e) => e.source !== id && e.target !== id));
    if (selectedNode === id) setSelectedNode(null);
  }

  const selected = nodes.find((n) => n.id === selectedNode);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const data: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim() || null,
      triggerType,
      triggerConfig,
      nodes,
      edges,
    };
    if (initial?.id) data.id = initial.id;
    await onSave(data);
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) onClose(); }}>
      <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>{initial?.id ? "Editar Fluxo" : "Novo Fluxo"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex gap-4 min-h-0">
          {/* Left panel: config */}
          <div className="w-72 shrink-0 overflow-y-auto space-y-4 pr-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nome *</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do fluxo" className="bg-card border-border text-foreground" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Descrição</label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição opcional" className="bg-card border-border text-foreground" />
            </div>

            {/* Trigger */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Gatilho</label>
              {TRIGGER_TYPES.map((t) => {
                const Icon = t.icon;
                const active = triggerType === t.key;
                return (
                  <button key={t.key} onClick={() => setTriggerType(t.key)} className={`flex w-full items-center gap-2 rounded-lg border p-2.5 text-left text-xs transition-all ${active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}>
                    <Icon className={`h-3.5 w-3.5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="font-medium text-foreground">{t.label}</span>
                  </button>
                );
              })}
              {triggerType === "keyword" && (
                <Input
                  value={(triggerConfig.keywords as string[] || []).join(", ")}
                  onChange={(e) => setTriggerConfig({ ...triggerConfig, keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) })}
                  placeholder="preço, valor, ajuda"
                  className="bg-card border-border text-foreground text-xs"
                />
              )}
            </div>

            {/* Add node */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Adicionar Nó</label>
              <div className="grid grid-cols-2 gap-1.5">
                {NODE_TYPES.filter((n) => n.key !== "start" && n.key !== "end").map((n) => {
                  const Icon = n.icon;
                  return (
                    <button key={n.key} onClick={() => addNode(n.key)} className="flex items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1.5 text-[10px] font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors">
                      <Plus className="h-2.5 w-2.5" />
                      <Icon className="h-2.5 w-2.5" />
                      {n.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected node config */}
            {selected && selected.type !== "start" && selected.type !== "end" && (
              <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">
                    {NODE_TYPES.find((n) => n.key === selected.type)?.label}
                  </span>
                  <button onClick={() => removeNode(selected.id)} className="h-5 w-5 flex items-center justify-center rounded text-red-700 hover:bg-red-400/10 dark:text-red-400">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>

                {selected.type === "send_message" && (
                  <textarea value={(selected.config.message as string) || ""} onChange={(e) => updateNodeConfig(selected.id, { ...selected.config, message: e.target.value })} placeholder="Mensagem..." rows={4} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
                )}

                {selected.type === "send_buttons" && (
                  <>
                    <textarea value={(selected.config.text as string) || ""} onChange={(e) => updateNodeConfig(selected.id, { ...selected.config, text: e.target.value })} placeholder="Texto da mensagem..." rows={3} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
                    <p className="text-[10px] text-muted-foreground">Botões são configurados nas conexões do canvas</p>
                  </>
                )}

                {selected.type === "collect_input" && (
                  <>
                    <textarea value={(selected.config.prompt as string) || ""} onChange={(e) => updateNodeConfig(selected.id, { ...selected.config, prompt: e.target.value })} placeholder="Pergunta ao contato..." rows={3} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
                    <Input value={(selected.config.varKey as string) || ""} onChange={(e) => updateNodeConfig(selected.id, { ...selected.config, varKey: e.target.value })} placeholder="Nome da variável" className="bg-background border-border text-foreground text-xs" />
                  </>
                )}

                {selected.type === "wait" && (
                  <div className="flex items-center gap-2">
                    <Input type="number" value={(selected.config.seconds as number) || 0} onChange={(e) => updateNodeConfig(selected.id, { ...selected.config, seconds: parseInt(e.target.value) || 0 })} className="w-20 bg-background border-border text-foreground text-xs" min={0} />
                    <span className="text-xs text-muted-foreground">segundos</span>
                  </div>
                )}

                {selected.type === "condition" && (
                  <>
                    <Input value={(selected.config.field as string) || ""} onChange={(e) => updateNodeConfig(selected.id, { ...selected.config, field: e.target.value })} placeholder="Campo / variável" className="bg-background border-border text-foreground text-xs" />
                    <Input value={(selected.config.value as string) || ""} onChange={(e) => updateNodeConfig(selected.id, { ...selected.config, value: e.target.value })} placeholder="Valor esperado" className="bg-background border-border text-foreground text-xs" />
                  </>
                )}

                {selected.type === "handoff" && (
                  <Input value={(selected.config.note as string) || ""} onChange={(e) => updateNodeConfig(selected.id, { ...selected.config, note: e.target.value })} placeholder="Nota interna" className="bg-background border-border text-foreground text-xs" />
                )}
              </div>
            )}
          </div>

          {/* Canvas */}
          <div ref={canvasRef} className="flex-1 relative rounded-xl border border-border bg-muted/20 overflow-auto min-h-[400px]">
            {/* Grid background */}
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)", backgroundSize: "24px 24px" }} />

            {/* Edges (SVG lines) */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ minHeight: 600 }}>
              {edges.map((e, i) => {
                const src = nodes.find((n) => n.id === e.source);
                const tgt = nodes.find((n) => n.id === e.target);
                if (!src || !tgt) return null;
                const x1 = src.position.x + 90;
                const y1 = src.position.y + 40;
                const x2 = tgt.position.x + 90;
                const y2 = tgt.position.y;
                const midY = (y1 + y2) / 2;
                return (
                  <g key={i}>
                    <path d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`} fill="none" stroke="hsl(var(--border))" strokeWidth="1.5" strokeDasharray="4 3" />
                    {e.label && (
                      <text x={(x1 + x2) / 2} y={midY - 4} fill="hsl(var(--muted-foreground))" fontSize="9" textAnchor="middle" fontWeight="600">
                        {e.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Nodes */}
            {nodes.map((node) => (
              <CanvasNode key={node.id} node={node} selected={selectedNode === node.id} onSelect={() => setSelectedNode(node.id)} />
            ))}
          </div>
        </div>

        <DialogFooter className="shrink-0 pt-4 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={saving} className="border-border text-muted-foreground">Cancelar</Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {initial?.id ? "Salvar" : "Criar Fluxo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═════════════════════════════════════════════════════════════
// ─── Main Page ────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════
export default function FlowsPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Flow> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Flow | null>(null);

  const fetchFlows = useCallback(async () => {
    try {
      const res = await fetch("/api/crm/flows");
      const data = await res.json();
      setFlows(data.flows || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFlows(); }, [fetchFlows]);

  async function handleSave(data: Record<string, unknown>) {
    try {
      const isEdit = !!data.id;
      const res = await fetch("/api/crm/flows", {
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
      fetchFlows();
    } catch (e) {
      console.error(e);
    }
  }

  async function handleToggleStatus(flow: Flow) {
    const nextStatus = flow.status === "active" ? "draft" : "active";
    try {
      await fetch("/api/crm/flows", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: flow.id, status: nextStatus }),
      });
      fetchFlows();
    } catch (e) {
      console.error(e);
    }
  }

  async function handleDuplicate(flow: Flow) {
    // Need full flow data with nodes
    try {
      const res = await fetch("/api/crm/flows");
      const data = await res.json();
      const full = (data.flows as Flow[])?.find((f) => f.id === flow.id);
      await handleSave({
        name: `${flow.name} (cópia)`,
        description: flow.description,
        triggerType: flow.triggerType,
        triggerConfig: flow.triggerConfig,
        nodes: full?.nodes || [],
        edges: full?.edges || [],
        status: "draft",
      });
    } catch (e) {
      console.error(e);
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/crm/flows?id=${id}`, { method: "DELETE" });
      setDeleteTarget(null);
      fetchFlows();
    } catch (e) {
      console.error(e);
    }
  }

  function handleFromTemplate(t: typeof FLOW_TEMPLATES[0]) {
    setEditing({
      name: t.name,
      description: t.description,
      triggerType: t.triggerType,
      triggerConfig: t.triggerConfig,
      nodes: t.nodes as FlowNode[],
      edges: t.edges,
    });
    setBuilderOpen(true);
  }

  async function editFlow(flow: Flow) {
    // Fetch full flow data including nodes/edges
    try {
      const res = await fetch("/api/crm/flows");
      const data = await res.json();
      const full = (data.flows as Flow[])?.find((f) => f.id === flow.id);
      // The list query doesn't include nodes — fetch individually
      const detailRes = await fetch(`/api/crm/flows?id=${flow.id}`);
      // Workaround: use list data
      setEditing({ ...flow, ...full });
      setBuilderOpen(true);
    } catch {
      setEditing(flow);
      setBuilderOpen(true);
    }
  }

  const showTemplates = flows.length < 2;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            Flows
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">BETA</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Construa fluxos conversacionais visuais para WhatsApp.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setBuilderOpen(true); }} className="bg-primary hover:bg-primary/90 text-primary-foreground self-start sm:self-auto">
          <Plus className="h-4 w-4" />
          Novo Fluxo
        </Button>
      </div>

      {/* Templates */}
      {showTemplates && (
        <section>
          <h2 className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Templates prontos</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {FLOW_TEMPLATES.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.name} onClick={() => handleFromTemplate(t)} className="group flex flex-col items-start rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/50">
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/15">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-semibold text-foreground">{t.name}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
                  <p className="mt-2 text-[10px] text-muted-foreground">{t.nodes.length} nós · {t.edges.length} conexões</p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : flows.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Workflow className="h-6 w-6 text-primary" />
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">Nenhum fluxo ainda</p>
          <p className="mt-1 text-xs text-muted-foreground">Use um template acima ou crie do zero.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {flows.map((f) => (
            <FlowCard key={f.id} flow={f} onEdit={() => editFlow(f)} onDuplicate={() => handleDuplicate(f)} onToggleStatus={() => handleToggleStatus(f)} onDelete={() => setDeleteTarget(f)} />
          ))}
        </div>
      )}

      {/* Builder */}
      <FlowBuilder open={builderOpen} initial={editing} onClose={() => { setBuilderOpen(false); setEditing(null); }} onSave={handleSave} />

      {/* Delete */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir Fluxo</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Excluir <span className="font-medium text-foreground">{deleteTarget?.name}</span> e todas as execuções?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="border-border text-muted-foreground">Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteTarget && handleDelete(deleteTarget.id)}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
