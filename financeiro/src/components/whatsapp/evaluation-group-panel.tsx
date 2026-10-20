"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CalendarDays, ChevronDown, Loader2, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { getEvaluationGroupUnitConfig, type EvaluationGroupUnit, type EvaluationGroupConfig } from "@/lib/whatsapp/evaluation-group-notice-config";
import { formatBrazilianPhone } from "@/lib/phone";
import type { EvaluationNoticeGroup, EvaluationGroupDiscoveryDiagnostics, EvaluationGroupDiscoveryResult } from "@/lib/whatsapp/evaluation-group-directory";

type Notice = {
  id: string; clientName: string; clientPhone: string; evaluationProcedure: string;
  eventType?: "scheduled" | "confirmed" | "cancelled" | "rescheduled";
  previousStartTime?: string | null;
  startTime: string; state: string; createdAt: string; submittedAt: string | null; lastError: string | null;
};
type Snapshot = { config: EvaluationGroupConfig | null; notices: Notice[]; canManage: boolean; connected: boolean };
const states: Record<string, string> = {
  queued: "Na fila", processing: "Preparando", sending: "Enviando", submitted: "Aceito pela Evolution",
  uncertain: "Conferir no WhatsApp", cancelled: "Não enviado",
};
const time = (value: string) => new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short",
}).format(new Date(value));

async function request<T>(endpoint: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(endpoint, body ? {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  } : { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Não foi possível carregar o grupo.");
  return payload;
}

export function EvaluationGroupPanel({ unit = "SBC" }: { unit?: EvaluationGroupUnit }) {
  const scope = getEvaluationGroupUnitConfig(unit)!;
  const endpoint = `/api/whatsapp/evaluation-group?targetInstanceId=${scope.instanceId}&unit=${scope.unit}`;
  const detailsId = `evaluation-group-details-${unit}`;
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [groups, setGroups] = useState<EvaluationNoticeGroup[] | null>(null);
  const [diagnostics, setDiagnostics] = useState<{ unit: EvaluationGroupUnit; data: EvaluationGroupDiscoveryDiagnostics } | null>(null);
  const discoveryDiagnostics = unit === "Osasco" && diagnostics?.unit === unit ? diagnostics.data : null;
  const [selected, setSelected] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editError, setEditError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setSnapshot(await request<Snapshot>(endpoint)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao carregar os avisos."); }
    finally { setLoading(false); }
  }, [endpoint]);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const discover = async () => {
    setBusy(true); setEditError(""); setGroups(null); setDiagnostics(null); setSelected(""); setConsent(false);
    try {
      const data = await request<EvaluationGroupDiscoveryResult>(endpoint, { action: "discover" });
      setGroups(data.groups);
      if (unit === "Osasco" && data.diagnostics) setDiagnostics({ unit, data: data.diagnostics });
      if (data.groups.length === 1 && !(unit === "Osasco" && data.groups[0].announce)) setSelected(data.groups[0].id);
    } catch (reason) { setEditError(reason instanceof Error ? reason.message : "Falha ao consultar o grupo."); }
    finally { setBusy(false); }
  };
  const save = async (enabled: boolean) => {
    setBusy(true); setEditError("");
    try {
      await request(endpoint, { action: "configure", enabled, groupJid: selected, confirmTeamAccess: consent });
      setEditing(false); setDiagnostics(null); await load();
    } catch (reason) { setEditError(reason instanceof Error ? reason.message : "Falha ao salvar."); }
    finally { setBusy(false); }
  };

  return <section className="min-w-0 rounded-xl border border-border bg-card" aria-label={`Avisos ao grupo de avaliações ${unit}`}>
    <button type="button" className="flex min-h-14 w-full items-center gap-3 p-4 text-left" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls={detailsId}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Users className="size-5" /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">{scope.groupName}</span><span className="block text-xs text-muted-foreground">{scope.instanceDisplayName} · Avisos de avaliações</span></span>
      <ChevronDown className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <div id={detailsId} className="space-y-4 border-t border-border p-4">
      <p className="text-sm text-muted-foreground">Destino e histórico dos avisos automáticos. Esta área não importa a conversa completa nem libera outros grupos.</p>
      {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      <div className="flex flex-wrap items-center gap-2">
        {snapshot && <span className={`rounded-full px-3 py-1 text-xs font-medium ${snapshot.config?.enabled ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
          {snapshot.config?.enabled ? "Automação ativa" : "Automação desativada"}
        </span>}
        <Button type="button" variant="outline" className="min-h-11" disabled={loading} onClick={() => void load()}>
          {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}Atualizar
        </Button>
        {snapshot?.canManage && <Button type="button" className="min-h-11" onClick={() => { setEditing(true); setGroups(null); setDiagnostics(null); setConsent(false); setSelected(""); setEditError(""); }}>Configurar grupo</Button>}
      </div>
      {loading && !snapshot && <p role="status" className="text-sm text-muted-foreground">Carregando os avisos…</p>}
      {snapshot?.config?.enabled && <div className="space-y-2 text-xs text-muted-foreground">
        <p>Novos agendamentos: avaliações elegíveis desde {time(snapshot.config.activatedAt)}. Sem importação de histórico ou avisos de sessões.</p>
        {snapshot.config.confirmationsActivatedAt
          ? <p>Novas confirmações ativas desde {time(snapshot.config.confirmationsActivatedAt)}, incluindo avaliações antigas com vínculo comprovado à {scope.instanceDisplayName} e procedimento informado. Um aviso por avaliação e data/horário confirmados, sem envio retroativo em massa. Reconfirmar o mesmo horário não repete; remarcar e confirmar um novo horário permite outro aviso.</p>
          : <p>Avisos de confirmação ainda não estão ativados.</p>}
        {snapshot.config.cancellationsActivatedAt
          ? <p>Cancelamentos ativos desde {time(snapshot.config.cancellationsActivatedAt)}. Novas mudanças para Desmarcou de avaliações futuras vinculadas à {scope.instanceDisplayName} geram um aviso por avaliação e horário. Sem avisos retroativos ou disparos por exclusão.</p>
          : <p>Avisos de cancelamento ainda não estão ativados.</p>}
        {snapshot.config.reschedulesActivatedAt
          ? <p>Reagendamentos ativos desde {time(snapshot.config.reschedulesActivatedAt)}. Um aviso por alteração real de data ou horário, com horário anterior e novo. Salvar igual não repete; inclui avaliações já criadas com vínculo comprovado à {scope.instanceDisplayName}. Sem envio retroativo em massa.</p>
          : <p>Avisos de reagendamento ainda não estão ativados.</p>}
      </div>}
      {snapshot && !snapshot.connected && <p role="status" className="text-sm text-amber-700 dark:text-amber-400">A {scope.instanceDisplayName} está desconectada. Verifique a conexão antes de aguardar novos avisos.</p>}
      {snapshot && <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Últimos 20 avisos</h3>
        {!snapshot.notices.length && <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Nenhum aviso registrado. Agendamentos anteriores não serão enviados.</div>}
        {snapshot.notices.map(notice => <article key={notice.id} className="min-w-0 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h4 className="min-w-0 break-words font-medium text-foreground">{notice.clientName}</h4>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-md px-2 py-1 text-xs font-medium ${notice.eventType === "cancelled" ? "bg-rose-500/10 text-rose-700 dark:text-rose-400" : notice.eventType === "confirmed" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-primary/10 text-primary"}`}>{notice.eventType === "rescheduled" ? "Reagendada" : notice.eventType === "cancelled" ? "Desmarcada" : notice.eventType === "confirmed" ? "Confirmada" : "Agendada"}</span>
              <span className={`rounded-md px-2 py-1 text-xs ${notice.state === "uncertain" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground"}`}>{states[notice.state] || notice.state}</span>
            </div>
          </div>
          <p className="mt-1 break-words text-sm text-muted-foreground">{notice.clientPhone} · {notice.evaluationProcedure}</p>
          {notice.eventType === "rescheduled" && notice.previousStartTime && <p className="mt-2 break-words text-xs text-muted-foreground">Anterior: {time(notice.previousStartTime)}</p>}
          <p className="mt-2 flex items-center gap-2 text-sm"><CalendarDays className="size-4 shrink-0 text-primary" />{notice.eventType === "rescheduled" ? "Novo: " : ""}{time(notice.startTime)}</p>
          {notice.state === "uncertain" && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">O aviso pode ter sido enviado. Confira no grupo; não haverá reenvio automático.</p>}
          {notice.state === "cancelled" && <p className="mt-2 text-xs text-muted-foreground">Aviso encerrado sem envio. Confira o agendamento e a conexão da caixa.</p>}
        </article>)}
        <p className="text-xs text-muted-foreground">“Aceito pela Evolution” não comprova entrega ou leitura pelos integrantes do grupo.</p>
      </div>}
    </div>}
    <Dialog open={editing} onOpenChange={value => { if (!busy) { setEditing(value); setDiagnostics(null); } }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Avisos ao grupo {scope.groupName}</DialogTitle><DialogDescription>Somente avaliações elegíveis de {unit}. Envio pela {scope.instanceDisplayName}, após salvar a alteração.{snapshot?.config?.confirmationsActivatedAt && " Novas mudanças para Confirmado geram um aviso por data e horário."}{snapshot?.config?.cancellationsActivatedAt && " Novas mudanças para Desmarcou também geram aviso; sem retroativos ou exclusões."}{snapshot?.config?.reschedulesActivatedAt && " Reagendar informa o horário anterior e o novo; salvar igual não repete."}</DialogDescription></DialogHeader>
        <div className="min-w-0 space-y-4">
          <Button type="button" variant="outline" className="min-h-11 w-full" disabled={busy || !snapshot?.connected} onClick={() => void discover()}>{busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Users className="mr-2 size-4" />}Conferir grupo na {scope.instanceDisplayName}</Button>
          {discoveryDiagnostics && <div className="min-w-0 space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            <p className="break-words"><span className="font-medium text-foreground">Número conectado:</span> {discoveryDiagnostics.connectedPhone ? formatBrazilianPhone(discoveryDiagnostics.connectedPhone) : discoveryDiagnostics.phoneUnavailable ? "Não foi possível consultar o número." : "Não informado pela integração."}</p>
            {groups?.length === 0
              ? <p role="status" className="break-words">Nenhum grupo chamado <span className="font-medium text-foreground">{scope.groupName}</span> encontrado entre {discoveryDiagnostics.totalGroups} {discoveryDiagnostics.totalGroups === 1 ? "grupo" : "grupos"} deste número.</p>
              : <p>{discoveryDiagnostics.totalGroups} {discoveryDiagnostics.totalGroups === 1 ? "grupo consultado" : "grupos consultados"} neste número.</p>}
            {discoveryDiagnostics.groupsWithoutName > 0 && <p className="break-words">A integração não informou o nome de {discoveryDiagnostics.groupsWithoutName} {discoveryDiagnostics.groupsWithoutName === 1 ? "grupo" : "grupos"}.</p>}
          </div>}
          {groups?.length === 0 && !discoveryDiagnostics && <p role="status" className="text-sm text-muted-foreground">Nenhum grupo com esse nome foi encontrado. Confirme que a {scope.instanceDisplayName} participa dele.</p>}
          {groups?.length === 0 && discoveryDiagnostics && discoveryDiagnostics.relatedGroups.length > 0 && <div className="min-w-0 space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Nomes semelhantes encontrados</h3>
            <p className="break-words text-xs text-muted-foreground">Estes resultados precisam ser conferidos antes da ativação e não podem ser selecionados aqui.</p>
            <ul className="min-w-0 space-y-2">
              {discoveryDiagnostics.relatedGroups.map(group => <li key={group.id} className="min-w-0 rounded-lg border border-border p-3 text-sm">
                <span className="block break-words font-medium text-foreground">{group.name}</span>
                <span className="block break-all text-xs text-muted-foreground">{group.id}</span>
                <span className="block break-words text-xs text-muted-foreground">{group.size === null ? "Integrantes não informados" : `${group.size} integrantes`}{group.announce ? " · Somente administradores podem enviar" : ""}</span>
              </li>)}
            </ul>
          </div>}
          {groups && groups.length > 1 && <p className="text-sm text-amber-700 dark:text-amber-400">Há grupos com o mesmo nome. Confira o identificador antes de selecionar.</p>}
          {groups?.map(group => <label key={group.id} className="flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
            <input type="radio" name={`evaluation-group-${unit}`} checked={selected === group.id} onChange={() => { setSelected(group.id); setConsent(false); }} disabled={busy || (unit === "Osasco" && group.announce)} className="mt-1 size-4 shrink-0 accent-primary" />
            <span className="min-w-0 text-sm"><span className="block font-medium">{group.name}</span><span className="block break-all text-xs text-muted-foreground">{group.id}</span><span className="block text-xs text-muted-foreground">{group.size === null ? "Integrantes não informados" : `${group.size} integrantes`}{group.announce ? " · Somente administradores podem enviar" : ""}</span></span>
          </label>)}
          {unit === "Osasco" && <p className="break-words text-sm text-muted-foreground">A ativação inclui novos agendamentos, confirmações, desmarcações e reagendamentos futuros elegíveis. Grupos em que somente administradores enviam precisam ser ajustados antes da ativação.</p>}
          <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">O aviso contém nome, telefone, procedimento escolhido, data e horário. Nenhuma análise da Alice ou conteúdo do chat será incluído.</div>
          <label className="flex cursor-pointer items-start gap-3 text-sm"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={busy || !selected} className="mt-1 size-4 shrink-0 accent-primary" /><span>Confirmo que este é o grupo correto e que seus integrantes estão autorizados a receber os dados dos clientes.</span></label>
          {editError && <p role="alert" className="flex items-start gap-2 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" />{editError}</p>}
        </div>
        <DialogFooter className="gap-2">
          {snapshot?.config?.enabled && <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => void save(false)}>Pausar avisos</Button>}
          <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => { setEditing(false); setDiagnostics(null); }}>Cancelar</Button>
          <Button type="button" className="min-h-11" disabled={busy || !selected || !consent} onClick={() => void save(true)}>{unit === "Osasco" ? "Ativar avisos de avaliações" : "Ativar para novas avaliações"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
