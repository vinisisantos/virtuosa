"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_PINK_FRIDAY_SBC_MESSAGE,
  PINK_FRIDAY_SBC_GROUP_INSTANCE_ID,
  PINK_FRIDAY_SBC_GROUP_INSTANCE_NAME,
  PINK_FRIDAY_SBC_GROUP_NAME,
  PINK_FRIDAY_SBC_GROUP_UNIT,
} from "@/lib/whatsapp/manual-group-message-policy";

type Access = { groupName: string; instanceName: string; connected: boolean; canSend: boolean };
type Result = { state: "submitted" | "rejected" | "uncertain"; error?: string; message?: string; groupSize?: number | null };

const endpoint = `/api/whatsapp/manual-group-message?targetInstanceId=${PINK_FRIDAY_SBC_GROUP_INSTANCE_ID}&unit=${PINK_FRIDAY_SBC_GROUP_UNIT}`;

export function ManualGroupMessagePanel() {
  const [open, setOpen] = useState(false);
  const [access, setAccess] = useState<Access | null>(null);
  const [message, setMessage] = useState(DEFAULT_PINK_FRIDAY_SBC_MESSAGE);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível conferir a instância.");
      setAccess(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível conferir a instância.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const send = async () => {
    setSending(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const payload: Result = await response.json();
      if (!response.ok) {
        if (payload.state) {
          setResult(payload);
          return;
        }
        throw new Error(payload.error || "Não foi possível enviar a mensagem.");
      }
      setResult(payload);
      setConfirmed(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível enviar a mensagem.");
    } finally {
      setSending(false);
    }
  };

  const trimmed = message.trim();
  const canSend = access?.canSend === true && access.connected && trimmed.length > 0 && trimmed.length <= 4096;

  return <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card" aria-label="Envio manual ao grupo Pink Friday SBC">
    <button type="button" className="flex min-h-14 w-full items-center gap-3 p-4 text-left" onClick={() => setOpen(value => !value)} aria-expanded={open}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Users className="size-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{PINK_FRIDAY_SBC_GROUP_NAME}</span>
        <span className="block text-xs text-muted-foreground">{PINK_FRIDAY_SBC_GROUP_INSTANCE_NAME} · Mensagem manual</span>
      </span>
      <span aria-hidden="true" className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}>⌄</span>
    </button>

    {open && <div className="space-y-4 border-t border-border p-4">
      <p className="text-sm text-muted-foreground">Uma mensagem será enviada diretamente para todas as pessoas deste grupo. O CRM não importa o histórico da conversa.</p>
      {loading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Conferindo acesso e conexão…</p>}
      {access && <div className="flex flex-wrap gap-2 text-xs">
        <span className={`rounded-full px-3 py-1 font-medium ${access.connected ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 text-amber-800 dark:text-amber-400"}`}>
          {access.connected ? "Instância conectada" : "Instância desconectada"}
        </span>
        {access.canSend && <span className="rounded-full bg-muted px-3 py-1 font-medium text-muted-foreground">Envio administrativo</span>}
      </div>}
      {access && !access.canSend && <p role="status" className="text-sm text-muted-foreground">Somente um administrador com permissão de envio pode usar este recurso.</p>}
      {access && !access.connected && <p role="status" className="text-sm text-amber-800 dark:text-amber-400">Conecte a instância à Evolution antes de enviar.</p>}

      {access?.canSend && <div className="space-y-3">
        <label htmlFor="pink-friday-group-message" className="block text-sm font-medium text-foreground">Mensagem</label>
        <Textarea id="pink-friday-group-message" value={message} onChange={event => { setMessage(event.target.value); setConfirmed(false); setResult(null); }} maxLength={4096} rows={5} className="min-h-32 resize-y text-sm leading-6" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs tabular-nums text-muted-foreground">{message.length}/4096 caracteres</span>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-muted-foreground sm:items-center">
            <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={sending} className="mt-1 size-4 shrink-0 accent-primary sm:mt-0" />
            <span>Confirmo o grupo e o envio para seus participantes.</span>
          </label>
        </div>
        <p className="text-xs text-muted-foreground">O sistema bloqueia a repetição do mesmo texto para este grupo no mesmo dia, para evitar duplicidade.</p>
      </div>}

      {error && <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</p>}
      {result?.state === "submitted" && <p role="status" className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-800 dark:text-emerald-300"><CheckCircle2 className="mt-0.5 size-4 shrink-0" />{result.message}{result.groupSize !== null && result.groupSize !== undefined ? ` Grupo com ${result.groupSize} participantes.` : ""}</p>}
      {result?.state === "uncertain" && <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-300">Resultado incerto. Confira o grupo antes de fazer qualquer novo envio.</p>}
      {result?.state === "rejected" && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">A Evolution recusou esta tentativa. Confira a permissão da instância e a conexão antes de reenviar.</p>}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" disabled={loading || sending} onClick={() => void load()}>
          Conferir instância
        </Button>
        {access?.canSend && <Button type="button" className="min-h-11 w-full sm:w-auto" disabled={!canSend || !confirmed || loading || sending || result?.state === "uncertain"} onClick={() => void send()}>
          {sending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
          {sending ? "Enviando…" : "Enviar para o grupo"}
        </Button>}
      </div>
    </div>}
  </section>;
}
