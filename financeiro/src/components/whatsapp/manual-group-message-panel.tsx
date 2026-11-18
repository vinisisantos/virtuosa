"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, LockKeyhole, RefreshCw, Send, Users } from "lucide-react";
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
type GroupPermission = {
  connected: boolean;
  announcementOnly: boolean | null;
  state: "admins_only" | "everyone" | "unknown";
  message?: string;
};
type GroupPermissionResult = {
  state: "admins_only" | "rejected" | "uncertain";
  announcementOnly?: boolean;
  updated?: boolean;
  auditRecorded?: boolean;
  message?: string;
  error?: string;
};

const endpoint = `/api/whatsapp/manual-group-message?targetInstanceId=${PINK_FRIDAY_SBC_GROUP_INSTANCE_ID}&unit=${PINK_FRIDAY_SBC_GROUP_UNIT}`;
const groupSettingsEndpoint = `/api/whatsapp/admin/pink-friday-sbc-settings?targetInstanceId=${PINK_FRIDAY_SBC_GROUP_INSTANCE_ID}&unit=${PINK_FRIDAY_SBC_GROUP_UNIT}`;

export function ManualGroupMessagePanel() {
  const permissionDialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [access, setAccess] = useState<Access | null>(null);
  const [groupPermission, setGroupPermission] = useState<GroupPermission | null>(null);
  const [groupPermissionLoading, setGroupPermissionLoading] = useState(false);
  const [groupPermissionError, setGroupPermissionError] = useState("");
  const [groupActionError, setGroupActionError] = useState("");
  const [groupPermissionResult, setGroupPermissionResult] = useState<GroupPermissionResult | null>(null);
  const [restrictingGroup, setRestrictingGroup] = useState(false);
  const [message, setMessage] = useState(DEFAULT_PINK_FRIDAY_SBC_MESSAGE);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const loadGroupPermission = useCallback(async () => {
    setGroupPermissionLoading(true);
    setGroupPermissionError("");
    setGroupPermissionResult(null);
    try {
      const response = await fetch(groupSettingsEndpoint, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload) throw new Error(payload?.error || "Não foi possível conferir a permissão do grupo.");
      setGroupPermission(payload);
    } catch (reason) {
      setGroupPermissionError(reason instanceof Error ? reason.message : "Não foi possível conferir a permissão do grupo.");
      setGroupPermission(null);
    } finally {
      setGroupPermissionLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível conferir a instância.");
      setAccess(payload);
      setGroupPermission(null);
      setGroupPermissionError("");
      if (payload.canSend && payload.connected) void loadGroupPermission();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível conferir a instância.");
    } finally {
      setLoading(false);
    }
  }, [loadGroupPermission]);

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

  const applyGroupRestriction = async () => {
    setRestrictingGroup(true);
    setGroupActionError("");
    setGroupPermissionResult(null);
    try {
      const response = await fetch(groupSettingsEndpoint, { method: "POST" });
      const payload = await response.json().catch(() => null) as GroupPermissionResult | null;
      if (!payload) throw new Error("O CRM não retornou uma confirmação válida da alteração.");
      if (!response.ok) {
        if (payload.state === "uncertain" || payload.state === "rejected") {
          setGroupPermissionResult(payload);
          setGroupPermission((current) => current ? { ...current, state: "unknown", announcementOnly: null } : current);
          return;
        }
        throw new Error(payload.error || "Não foi possível restringir as mensagens do grupo.");
      }
      if (payload.state !== "admins_only" || payload.announcementOnly !== true) {
        throw new Error("O CRM não confirmou que somente administradores podem enviar mensagens.");
      }
      setGroupPermission({ connected: true, announcementOnly: true, state: "admins_only", message: payload.message });
      setGroupPermissionResult(payload);
      permissionDialog.current?.close();
    } catch (reason) {
      setGroupActionError(reason instanceof Error ? reason.message : "Não foi possível restringir as mensagens do grupo.");
    } finally {
      setRestrictingGroup(false);
    }
  };

  const openPermissionDialog = () => {
    setGroupActionError("");
    setGroupPermissionResult(null);
    permissionDialog.current?.showModal();
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

      {access?.canSend && <section className="space-y-3 border-t border-border pt-4 sm:pt-5" aria-labelledby="pink-friday-permission-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h3 id="pink-friday-permission-heading" className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <LockKeyhole className="size-4 shrink-0 text-primary" aria-hidden="true" />
              Permissão para enviar mensagens
            </h3>
            <p className="text-sm text-muted-foreground">Defina se todas as participantes podem escrever ou se somente administradores podem enviar mensagens.</p>
          </div>
          <Button type="button" variant="outline" className="min-h-11 w-full shrink-0 sm:w-auto" disabled={!access.connected || groupPermissionLoading || restrictingGroup} onClick={() => void loadGroupPermission()}>
            {groupPermissionLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
            Conferir permissão
          </Button>
        </div>

        {groupPermissionLoading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Consultando o grupo na instância…</p>}
        {groupPermissionError && <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" />{groupPermissionError}</p>}
        {groupPermission && <p role="status" aria-live="polite" className={`flex items-start gap-2 text-sm ${groupPermission.state === "admins_only" ? "text-emerald-700 dark:text-emerald-400" : groupPermission.state === "everyone" ? "text-amber-800 dark:text-amber-400" : "text-muted-foreground"}`}>
          {groupPermission.state === "admins_only" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          {groupPermission.state === "admins_only" ? "Somente administradores podem enviar mensagens." : groupPermission.state === "everyone" ? "Todas as participantes podem enviar mensagens." : "A instância não confirmou quem pode enviar mensagens."}
        </p>}
        {groupPermissionResult?.state === "admins_only" && <p role="status" className={`text-sm ${groupPermissionResult.auditRecorded === false ? "text-amber-800 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}`}>{groupPermissionResult.message}</p>}
        {groupPermissionResult?.state === "uncertain" && <p role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-300">{groupPermissionResult.error}</p>}
        {groupPermissionResult?.state === "rejected" && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{groupPermissionResult.error}</p>}
        {groupActionError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{groupActionError}</p>}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" className="min-h-11 w-full sm:w-auto" disabled={!access.connected || groupPermissionLoading || restrictingGroup || !!groupPermissionResult || groupPermission?.state === "admins_only" || !groupPermission} onClick={openPermissionDialog}>
            <LockKeyhole className="mr-2 size-4" />
            {groupPermission?.state === "admins_only" ? "Grupo restrito a admins" : "Restringir mensagens"}
          </Button>
        </div>
      </section>}

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

    <dialog ref={permissionDialog} aria-labelledby="pink-friday-confirm-title" aria-describedby="pink-friday-confirm-description" className="m-auto w-[calc(100%-2rem)] max-w-lg overscroll-contain rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xl backdrop:bg-black/60">
      <h2 id="pink-friday-confirm-title" className="flex items-center gap-2 text-lg font-semibold">
        <LockKeyhole className="size-5 shrink-0 text-primary" aria-hidden="true" />
        Restringir mensagens do grupo?
      </h2>
      <p id="pink-friday-confirm-description" className="mt-3 text-sm leading-6 text-muted-foreground">
        No grupo {PINK_FRIDAY_SBC_GROUP_NAME}, somente administradores poderão enviar mensagens. Essa alteração será aplicada pela instância {PINK_FRIDAY_SBC_GROUP_INSTANCE_NAME} e conferida após o envio do comando.
      </p>
      {groupActionError && <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{groupActionError}</p>}
      {groupPermissionResult?.state === "uncertain" && <p role="alert" className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-300">{groupPermissionResult.error}</p>}
      {groupPermissionResult?.state === "rejected" && <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{groupPermissionResult.error}</p>}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" onClick={() => permissionDialog.current?.close()} disabled={restrictingGroup} autoFocus>Cancelar</Button>
        <Button type="button" className="min-h-11 w-full sm:w-auto" onClick={() => void applyGroupRestriction()} disabled={restrictingGroup}>
          {restrictingGroup && <Loader2 className="mr-2 size-4 animate-spin" />}
          {restrictingGroup ? "Aplicando restrição…" : "Aplicar somente admins"}
        </Button>
      </div>
    </dialog>
  </section>;
}
