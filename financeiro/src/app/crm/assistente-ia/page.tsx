"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  CircleOff,
  Loader2,
  LockKeyhole,
  Save,
  Send,
  ShieldCheck,
} from "lucide-react";
import AuthGuard from "@/components/auth-guard";
import { toast } from "@/components/toast";

type SettingsResponse = {
  config: { enabled: boolean; model: string; agentEnabled: false };
  knowledge: {
    available: boolean;
    repository: string;
    revision: string;
    activeUnits: string[];
    activeDocuments: number;
    excludedTopics: string[];
    humanReviewRequired: boolean;
    automaticSending: boolean;
  };
  runtime: {
    ready: boolean;
    privateKnowledge: boolean;
    hermesBridgeConfigured: boolean;
    ownerConfigured: boolean;
    conversationDataApproved: boolean;
    liveSuggestionsEnabled: boolean;
    blockers: string[];
  };
  usage: { requestsToday: number; reservedMicroUsdToday: number; actualMicroUsdToday: number };
};

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
      {ok ? <Check className="h-4 w-4 shrink-0 text-emerald-500" /> : <CircleOff className="h-4 w-4 shrink-0 text-amber-500" />}
      <span className="text-sm text-foreground">{label}</span>
      <span className={`ml-auto text-xs font-semibold ${ok ? "text-emerald-600" : "text-amber-600"}`}>{ok ? "OK" : "Pendente"}</span>
    </div>
  );
}

export default function AiAssistantSettingsPage() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [enabled, setEnabled] = useState(false);
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
      setEnabled(result.config.enabled);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Não foi possível carregar", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/crm/ai-assistant/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar");
      await load();
      toast(enabled ? "Configuração da Alice salva" : "Alice pausada", "success");
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
      setTestOutput(`${result.response}${result.needsHuman ? "\n\n[Encaminhamento humano sinalizado no teste]" : ""}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Não foi possível testar", "error");
    } finally {
      setTesting(false);
    }
  };

  return (
    <AuthGuard allowedRoles={["ADMINISTRADOR"]}>
      <main className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
        <section className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Bot className="h-6 w-6" /></span>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Copiloto · SBC e Osasco</p>
                <h1 className="mt-1 text-xl font-bold text-foreground sm:text-2xl">Alice no CRM</h1>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">A Alice usa os arquivos oficiais da base privada para preparar sugestões. Você revisa, pode editar e decide se envia.</p>
              </div>
            </div>
            <span className="inline-flex min-h-10 w-fit items-center gap-2 rounded-full bg-muted px-3 text-xs font-bold text-muted-foreground"><LockKeyhole className="h-4 w-4" /> Envio automático bloqueado</span>
          </div>
        </section>

        {loading || !data ? (
          <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <div className="mt-4 grid gap-4">
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Estado do CRM</p><p className="mt-2 text-lg font-bold">{enabled ? "Ativado" : "Pausado"}</p><p className="mt-1 text-xs text-muted-foreground">Ainda sujeito aos bloqueios de segurança</p></div>
              <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Modelo</p><p className="mt-2 text-lg font-bold">GPT-6 Luna</p><p className="mt-1 text-xs text-muted-foreground">Sugestões, sem agente automático</p></div>
              <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Documentos ativos</p><p className="mt-2 text-lg font-bold">{data.knowledge.activeDocuments}</p><p className="mt-1 text-xs text-muted-foreground">Revisão {data.knowledge.revision.slice(0, 8)}</p></div>
              <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Sugestões hoje</p><p className="mt-2 text-lg font-bold">{data.usage.requestsToday}</p><p className="mt-1 text-xs text-muted-foreground">Máximo de 300 solicitações por dia</p></div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
              <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><h2 className="font-bold">Verificações para operar</h2><p className="mt-1 text-sm text-muted-foreground">Sugestões de conversas reais só funcionam quando cada controle abaixo está configurado no servidor.</p></div></div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Status ok={data.runtime.privateKnowledge} label="Base privada fixada e carregada no servidor" />
                <Status ok={data.runtime.hermesBridgeConfigured} label="Ponte privada do Hermes configurada" />
                <Status ok={data.runtime.ownerConfigured} label="Acesso exclusivo do proprietário configurado" />
                <Status ok={data.runtime.conversationDataApproved} label="Uso de trecho sanitizado aprovado" />
                <Status ok={data.runtime.liveSuggestionsEnabled} label="Sugestões ao vivo habilitadas" />
              </div>
              {!data.runtime.ready && <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{data.runtime.blockers.join(" ")}</span></div>}
              <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
                Repositório fonte: <span className="font-semibold">{data.knowledge.repository}</span>. A revisão é fixada no build; arquivos da Alice não são enviados ao navegador nem buscados a cada conversa. A ponte Hermes recebe somente o trecho recente sanitizado e a base necessária; identificadores pessoais são removidos. Conteúdo clínico detectado é tratado localmente e encaminhado sem chamar o modelo.
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
              <h2 className="font-bold">Escopo e encaminhamento humano</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-background p-4"><p className="text-sm font-semibold">Unidades habilitadas</p><p className="mt-1 text-sm text-muted-foreground">{data.knowledge.activeUnits.join(" · ")}</p><p className="mt-3 text-sm font-semibold">SBC</p><p className="mt-1 text-sm text-muted-foreground">Encaminha para Gabriela somente quando ela já tem acesso àquela caixa.</p></div>
                <div className="rounded-xl border border-border bg-background p-4"><p className="text-sm font-semibold">Osasco</p><p className="mt-1 text-sm text-muted-foreground">Notifica a equipe local que já tem acesso à instância; nenhuma permissão nova é concedida.</p><p className="mt-3 text-sm font-semibold">Fora do escopo ativo</p><p className="mt-1 text-sm text-muted-foreground">{data.knowledge.excludedTopics.join(" · ")}</p></div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Notificações são internas. A Alice nunca envia mensagem de WhatsApp nem agenda automaticamente.</p>
            </section>

            <section className="rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-6">
              <div className="flex items-start gap-3"><Bot className="mt-0.5 h-5 w-5 text-primary" /><div><h2 className="font-bold">Teste isolado</h2><p className="mt-1 text-sm text-muted-foreground">Use um exemplo fictício. O resultado não entra em nenhuma conversa nem dispara notificação.</p></div></div>
              <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
                <textarea value={testInput} onChange={(event) => setTestInput(event.target.value)} maxLength={1_000} rows={3} placeholder="Escreva uma mensagem fictícia de cliente..." className="min-h-24 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
                <button type="button" onClick={runTest} disabled={testing || !testInput.trim()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-50 lg:self-end">
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Testar Alice
                </button>
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">Se as verificações estiverem habilitadas, o texto de teste também será processado pelo Hermes com sua sessão ChatGPT. Não cole dados de clientes.</p>
              {testOutput && <div className="mt-3 rounded-xl border border-emerald-500/25 bg-background p-4"><p className="text-xs font-bold uppercase tracking-wide text-emerald-600">Resposta sugerida</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{testOutput}</p></div>}
            </section>

            <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div><p className="font-semibold">Habilitar Alice no CRM</p><p className="mt-1 text-sm text-muted-foreground">Esta chave não substitui credenciais, consentimento e demais bloqueios do servidor.</p></div>
              <button type="button" role="switch" aria-checked={enabled} onClick={() => setEnabled(!enabled)} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold ${enabled ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-border bg-background text-muted-foreground"}`}>
                {enabled ? <Check className="h-4 w-4" /> : <CircleOff className="h-4 w-4" />}{enabled ? "Ativada" : "Pausada"}
              </button>
            </section>

            <div className="sticky bottom-3 z-20 flex justify-end">
              <button type="button" onClick={save} disabled={saving} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-50 sm:w-auto">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
              </button>
            </div>
          </div>
        )}
      </main>
    </AuthGuard>
  );
}
