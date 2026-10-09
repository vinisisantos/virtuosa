"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CalendarDays, ChevronDown, Loader2, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { EVALUATION_GROUP_INSTANCE_ID, type EvaluationGroupConfig } from "@/lib/whatsapp/evaluation-group-notice-config";
import type { EvaluationNoticeGroup } from "@/lib/whatsapp/evaluation-group-directory";

const endpoint = `/api/whatsapp/evaluation-group?targetInstanceId=${EVALUATION_GROUP_INSTANCE_ID}&unit=SBC`;
type Notice = {
  id: string; clientName: string; clientPhone: string; evaluationProcedure: string;
  eventType?: "scheduled" | "confirmed";
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

async function request<T>(body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(endpoint, body ? {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  } : { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Não foi possível carregar o grupo.");
  return payload;
}

export function EvaluationGroupPanel() {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [groups, setGroups] = useState<EvaluationNoticeGroup[] | null>(null);
  const [selected, setSelected] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editError, setEditError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setSnapshot(await request<Snapshot>()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao carregar os avisos."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const discover = async () => {
    setBusy(true); setEditError(""); setGroups(null); setSelected(""); setConsent(false);
    try {
      const data = await request<{ groups: EvaluationNoticeGroup[] }>({ action: "discover" });
      setGroups(data.groups);
      if (data.groups.length === 1) setSelected(data.groups[0].id);
    } catch (reason) { setEditError(reason instanceof Error ? reason.message : "Falha ao consultar o grupo."); }
    finally { setBusy(false); }
  };
  const save = async (enabled: boolean) => {
    setBusy(true); setEditError("");
    try {
      await request({ action: "configure", enabled, groupJid: selected, confirmTeamAccess: consent });
      setEditing(false); await load();
    } catch (reason) { setEditError(reason instanceof Error ? reason.message : "Falha ao salvar."); }
    finally { setBusy(false); }
  };

  return <section className="min-w-0 rounded-xl border border-border bg-card" aria-label="Avisos ao grupo de avaliações SBC">
    <button type="button" className="flex min-h-14 w-full items-center gap-3 p-4 text-left" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="evaluation-group-details">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Users className="size-5" /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">AVALIAÇOES SBC</span><span className="block text-xs text-muted-foreground">Leads - Paloma · Avisos de avaliações</span></span>
      <ChevronDown className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <div id="evaluation-group-details" className="space-y-4 border-t border-border p-4">
      <p className="text-sm text-muted-foreground">Destino e histórico dos avisos automáticos. Esta área não importa a conversa completa nem libera outros grupos.</p>
      {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      <div className="flex flex-wrap items-center gap-2">
        {snapshot && <span className={`rounded-full px-3 py-1 text-xs font-medium ${snapshot.config?.enabled ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
          {snapshot.config?.enabled ? "Automação ativa" : "Automação desativada"}
        </span>}
        <Button type="button" variant="outline" className="min-h-11" disabled={loading} onClick={() => void load()}>
          {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}Atualizar
        </Button>
        {snapshot?.canManage && <Button type="button" className="min-h-11" onClick={() => { setEditing(true); setGroups(null); setConsent(false); setSelected(""); setEditError(""); }}>Configurar grupo</Button>}
      </div>
      {loading && !snapshot && <p role="status" className="text-sm text-muted-foreground">Carregando os avisos…</p>}
      {snapshot?.config?.enabled && <div className="space-y-2 text-xs text-muted-foreground">
        <p>Novos agendamentos: avaliações elegíveis desde {time(snapshot.config.activatedAt)}. Sem importação de histórico ou avisos de sessões. Remarcar ou cancelar não gera aviso por si só.</p>
        {snapshot.config.confirmationsActivatedAt
          ? <p>Novas confirmações ativas desde {time(snapshot.config.confirmationsActivatedAt)}, incluindo avaliações antigas com vínculo comprovado à Leads - Paloma e procedimento informado. Um aviso por avaliação e data/horário confirmados, sem envio retroativo em massa. Reconfirmar o mesmo horário não repete; remarcar e confirmar um novo horário permite outro aviso.</p>
          : <p>Avisos de confirmação ainda não estão ativados.</p>}
      </div>}
      {snapshot && !snapshot.connected && <p role="status" className="text-sm text-amber-700 dark:text-amber-400">A Leads - Paloma está desconectada. Verifique a conexão antes de aguardar novos avisos.</p>}
      {snapshot && <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Últimos 20 avisos</h3>
        {!snapshot.notices.length && <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Nenhum aviso registrado. Agendamentos anteriores não serão enviados.</div>}
        {snapshot.notices.map(notice => <article key={notice.id} className="min-w-0 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h4 className="min-w-0 break-words font-medium text-foreground">{notice.clientName}</h4>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-md px-2 py-1 text-xs font-medium ${notice.eventType === "confirmed" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-primary/10 text-primary"}`}>{notice.eventType === "confirmed" ? "Confirmada" : "Agendada"}</span>
              <span className={`rounded-md px-2 py-1 text-xs ${notice.state === "uncertain" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground"}`}>{states[notice.state] || notice.state}</span>
            </div>
          </div>
          <p className="mt-1 break-words text-sm text-muted-foreground">{notice.clientPhone} · {notice.evaluationProcedure}</p>
          <p className="mt-2 flex items-center gap-2 text-sm"><CalendarDays className="size-4 shrink-0 text-primary" />{time(notice.startTime)}</p>
          {notice.state === "uncertain" && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">O aviso pode ter sido enviado. Confira no grupo; não haverá reenvio automático.</p>}
          {notice.state === "cancelled" && <p className="mt-2 text-xs text-muted-foreground">Aviso encerrado sem envio. Confira o agendamento e a conexão da caixa.</p>}
        </article>)}
        <p className="text-xs text-muted-foreground">“Aceito pela Evolution” não comprova entrega ou leitura pelos integrantes do grupo.</p>
      </div>}
    </div>}
    <Dialog open={editing} onOpenChange={value => { if (!busy) setEditing(value); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Avisos ao grupo AVALIAÇOES SBC</DialogTitle><DialogDescription>Somente novas avaliações de SBC. Envio pela Leads - Paloma, após salvar o agendamento.{snapshot?.config?.confirmationsActivatedAt && " As novas mudanças para Confirmado dessas avaliações também geram um aviso por data e horário."}</DialogDescription></DialogHeader>
        <div className="min-w-0 space-y-4">
          <Button type="button" variant="outline" className="min-h-11 w-full" disabled={busy || !snapshot?.connected} onClick={() => void discover()}>{busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Users className="mr-2 size-4" />}Conferir grupo na Leads - Paloma</Button>
          {groups?.length === 0 && <p role="status" className="text-sm text-muted-foreground">Nenhum grupo com esse nome foi encontrado. Confirme que a Leads - Paloma participa dele.</p>}
          {groups && groups.length > 1 && <p className="text-sm text-amber-700 dark:text-amber-400">Há grupos com o mesmo nome. Confira o identificador antes de selecionar.</p>}
          {groups?.map(group => <label key={group.id} className="flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
            <input type="radio" name="evaluation-group" checked={selected === group.id} onChange={() => { setSelected(group.id); setConsent(false); }} disabled={busy} className="mt-1 size-4 shrink-0 accent-primary" />
            <span className="min-w-0 text-sm"><span className="block font-medium">{group.name}</span><span className="block break-all text-xs text-muted-foreground">{group.id}</span><span className="block text-xs text-muted-foreground">{group.size === null ? "Integrantes não informados" : `${group.size} integrantes`}{group.announce ? " · Somente administradores podem enviar" : ""}</span></span>
          </label>)}
          <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">O aviso contém nome, telefone, procedimento escolhido, data e horário. Nenhuma análise da Alice ou conteúdo do chat será incluído.</div>
          <label className="flex cursor-pointer items-start gap-3 text-sm"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={busy || !selected} className="mt-1 size-4 shrink-0 accent-primary" /><span>Confirmo que este é o grupo correto e que seus integrantes estão autorizados a receber os dados dos clientes.</span></label>
          {editError && <p role="alert" className="flex items-start gap-2 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" />{editError}</p>}
        </div>
        <DialogFooter className="gap-2">
          {snapshot?.config?.enabled && <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => void save(false)}>Pausar avisos</Button>}
          <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => setEditing(false)}>Cancelar</Button>
          <Button type="button" className="min-h-11" disabled={busy || !selected || !consent} onClick={() => void save(true)}>Ativar para novas avaliações</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
