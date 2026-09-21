"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  BadgeDollarSign,
  BookOpenCheck,
  Bot,
  BrainCircuit,
  Building2,
  Check,
  Clock3,
  ExternalLink,
  Loader2,
  LockKeyhole,
  MessageCircleQuestion,
  Save,
  Send,
  Settings2,
  Sparkles,
  Store,
} from "lucide-react";
import AuthGuard from "@/components/auth-guard";
import { toast } from "@/components/toast";

type AssistantConfig = {
  enabled: boolean;
  unit: "SBC";
  businessDescription: string;
  businessHours: string;
  email: string;
  website: string;
  purchasePolicy: string;
  paymentPolicy: string;
  discountPolicy: string;
  customInstructions: string;
  allowEmojis: boolean;
  sharePrices: boolean;
  askClientInfoAt: "ready_to_schedule" | "conversation_start" | "when_needed";
  dailyBudgetMicroUsd: number;
  agentEnabled: false;
  address: string;
  locationUrl: string;
  clinicName: string;
  model: string;
};

type SettingsResponse = {
  config: AssistantConfig;
  knowledge: {
    catalogItems: number;
    approvedKnowledge: number;
    pendingKnowledge: number;
    savedReplies: number;
  };
  usage: {
    requestsToday: number;
    reservedMicroUsdToday: number;
    actualMicroUsdToday: number;
  };
};

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted-foreground/30"}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs leading-5 text-muted-foreground">{hint}</span>}
    </label>
  );
}

export default function AiAssistantSettingsPage() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [config, setConfig] = useState<AssistantConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testInput, setTestInput] = useState("");
  const [testOutput, setTestOutput] = useState("");
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/crm/ai-assistant/settings", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível carregar");
      setData(result);
      setConfig(result.config);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Não foi possível carregar", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const update = <Key extends keyof AssistantConfig>(key: Key, value: AssistantConfig[Key]) => {
    setConfig((current) => current ? { ...current, [key]: value } : current);
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const response = await fetch("/api/crm/ai-assistant/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar");
      setConfig(result.config);
      toast("Configurações da IA salvas", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Não foi possível salvar", "error");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    if (!testInput.trim()) return;
    setTesting(true);
    setTestOutput("");
    try {
      const response = await fetch("/api/crm/ai-assistant/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: testInput }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível testar");
      setTestOutput(result.response);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Não foi possível testar", "error");
    } finally {
      setTesting(false);
    }
  };

  return (
    <AuthGuard allowedRoles={["ADMINISTRADOR"]}>
      <main className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
        <section className="overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                <BrainCircuit className="h-6 w-6" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Piloto seguro · SBC</p>
                <h1 className="mt-1 text-xl font-bold text-foreground sm:text-2xl">Assistente de IA do WhatsApp</h1>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                  A IA prepara respostas para revisão humana. Nada é enviado automaticamente e o modo Agente permanece bloqueado.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex min-h-10 items-center gap-2 rounded-full bg-emerald-500/15 px-3 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                <Check className="h-4 w-4" /> Sugestões ativas
              </span>
              <span className="inline-flex min-h-10 items-center gap-2 rounded-full bg-muted px-3 text-xs font-bold text-muted-foreground">
                <LockKeyhole className="h-4 w-4" /> Agente bloqueado
              </span>
            </div>
          </div>
        </section>

        {loading || !config || !data ? (
          <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <div className="mt-4 grid gap-4">
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                [Store, "Catálogo ativo", data.knowledge.catalogItems],
                [BookOpenCheck, "Aprendizados aprovados", data.knowledge.approvedKnowledge],
                [MessageCircleQuestion, "Respostas rápidas", data.knowledge.savedReplies],
                [Sparkles, "Sugestões hoje", data.usage.requestsToday],
              ].map(([Icon, label, value]) => {
                const CardIcon = Icon as typeof Store;
                return (
                  <div key={String(label)} className="rounded-2xl border border-border bg-card p-4">
                    <CardIcon className="h-5 w-5 text-primary" />
                    <p className="mt-3 text-xs font-medium text-muted-foreground">{String(label)}</p>
                    <p className="mt-1 text-xl font-bold text-foreground">{String(value)}</p>
                  </div>
                );
              })}
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-primary" />
                <div><h2 className="font-bold text-foreground">Informações da empresa</h2><p className="text-xs text-muted-foreground">Base factual usada nas sugestões.</p></div>
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <Field label="Descrição"><textarea rows={4} value={config.businessDescription} onChange={(event) => update("businessDescription", event.target.value)} className="min-h-28 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" /></Field>
                <Field label="Horário de atendimento" hint="Se ficar vazio, a IA não informará horários da clínica."><textarea rows={4} value={config.businessHours} onChange={(event) => update("businessHours", event.target.value)} placeholder="Ex.: segunda a sexta..." className="min-h-28 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" /></Field>
                <Field label="Endereço canônico" hint="Compartilhado com as confirmações de avaliação."><input readOnly value={config.address} className="h-11 rounded-xl border border-border bg-muted px-3 text-sm text-muted-foreground" /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="E-mail"><input value={config.email} onChange={(event) => update("email", event.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" /></Field>
                  <Field label="Site"><input value={config.website} onChange={(event) => update("website", event.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary" /></Field>
                </div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
                <div className="flex items-center gap-3"><Settings2 className="h-5 w-5 text-primary" /><h2 className="font-bold text-foreground">Instruções</h2></div>
                <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-background">
                  <div className="flex min-h-16 items-center justify-between gap-3 px-4"><div><p className="text-sm font-semibold">Usar emojis quando adequado</p><p className="text-xs text-muted-foreground">Mantém o tom humano sem exagero.</p></div><Toggle checked={config.allowEmojis} onChange={(value) => update("allowEmojis", value)} label="Permitir emojis" /></div>
                  <div className="flex min-h-16 items-center justify-between gap-3 px-4"><div><p className="text-sm font-semibold">Compartilhar preços aprovados</p><p className="text-xs text-muted-foreground">Somente valores ativos do catálogo.</p></div><Toggle checked={config.sharePrices} onChange={(value) => update("sharePrices", value)} label="Permitir preços" /></div>
                </div>
                <div className="mt-4">
                  <Field label="Quando pedir informações do cliente">
                    <select value={config.askClientInfoAt} onChange={(event) => update("askClientInfoAt", event.target.value as AssistantConfig["askClientInfoAt"])} className="h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary">
                      <option value="ready_to_schedule">Quando estiver pronto para agendar</option>
                      <option value="conversation_start">Assim que a conversa começar</option>
                      <option value="when_needed">Somente quando necessário</option>
                    </select>
                  </Field>
                </div>
                <div className="mt-4"><Field label="Orientações adicionais"><textarea rows={5} value={config.customInstructions} onChange={(event) => update("customInstructions", event.target.value)} className="min-h-32 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" /></Field></div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
                <div className="flex items-center gap-3"><BadgeDollarSign className="h-5 w-5 text-primary" /><h2 className="font-bold text-foreground">Políticas comerciais</h2></div>
                <div className="mt-4 grid gap-4">
                  <Field label="Como contratar ou agendar"><textarea rows={3} value={config.purchasePolicy} onChange={(event) => update("purchasePolicy", event.target.value)} className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" /></Field>
                  <Field label="Formas de pagamento"><textarea rows={3} value={config.paymentPolicy} onChange={(event) => update("paymentPolicy", event.target.value)} placeholder="Deixe vazio até confirmar a política." className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" /></Field>
                  <Field label="Descontos"><textarea rows={3} value={config.discountPolicy} onChange={(event) => update("discountPolicy", event.target.value)} placeholder="Deixe vazio para a IA não oferecer descontos." className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" /></Field>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div><h2 className="font-bold text-foreground">Conhecimento da IA</h2><p className="mt-1 text-sm text-muted-foreground">Somente conteúdo aprovado pode orientar uma sugestão.</p></div>
                <span className="inline-flex w-fit items-center rounded-full bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-300">{data.knowledge.pendingKnowledge} aguardando revisão</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Link href="/catalogo" className="flex min-h-20 items-center justify-between gap-3 rounded-xl border border-border bg-background p-4 hover:border-primary/50"><span><span className="block text-sm font-semibold">Catálogo</span><span className="text-xs text-muted-foreground">Procedimentos e preços</span></span><ExternalLink className="h-4 w-4" /></Link>
                <Link href="/crm/aprendizado-ia" className="flex min-h-20 items-center justify-between gap-3 rounded-xl border border-border bg-background p-4 hover:border-primary/50"><span><span className="block text-sm font-semibold">Aprendizados</span><span className="text-xs text-muted-foreground">Revisar e aprovar</span></span><ExternalLink className="h-4 w-4" /></Link>
                <Link href="/crm/inbox" className="flex min-h-20 items-center justify-between gap-3 rounded-xl border border-border bg-background p-4 hover:border-primary/50"><span><span className="block text-sm font-semibold">Respostas rápidas</span><span className="text-xs text-muted-foreground">Exemplos da atendente</span></span><ExternalLink className="h-4 w-4" /></Link>
              </div>
            </section>

            <section className="rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-6">
              <div className="flex items-start gap-3"><Bot className="mt-0.5 h-5 w-5 text-primary" /><div><h2 className="font-bold text-foreground">Testar sua IA</h2><p className="mt-1 text-sm text-muted-foreground">Teste isolado: a resposta não entra em nenhum chat e não é enviada.</p></div></div>
              <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
                <textarea value={testInput} onChange={(event) => setTestInput(event.target.value)} rows={3} placeholder="Escreva como se fosse um cliente..." className="min-h-24 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
                <button type="button" onClick={runTest} disabled={testing || !testInput.trim()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-50 lg:self-end">
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Testar
                </button>
              </div>
              {testOutput && <div className="mt-3 rounded-xl border border-emerald-500/25 bg-background p-4"><p className="text-xs font-bold uppercase tracking-wide text-emerald-600">Resposta sugerida</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{testOutput}</p></div>}
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
              <div className="flex items-center gap-3"><Clock3 className="h-5 w-5 text-primary" /><div><h2 className="font-bold">Controle de respostas</h2><p className="text-xs text-muted-foreground">O modo é escolhido individualmente em cada conversa.</p></div></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4"><p className="text-sm font-semibold">Minha resposta ou Sugestões</p><p className="mt-1 text-xs leading-5 text-muted-foreground">A atendente sempre revisa e envia. O padrão de toda conversa é manual.</p></div>
                <div className="rounded-xl border border-border bg-muted/40 p-4 opacity-80"><p className="flex items-center gap-2 text-sm font-semibold"><LockKeyhole className="h-4 w-4" /> Agente de IA</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Bloqueado nesta etapa. Nenhuma mensagem automática será enviada.</p></div>
              </div>
            </section>

            <div className="sticky bottom-3 z-20 flex justify-end">
              <button type="button" onClick={save} disabled={saving} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-50 sm:w-auto">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar configurações
              </button>
            </div>
          </div>
        )}
      </main>
    </AuthGuard>
  );
}
