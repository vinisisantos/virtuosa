"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Deal } from "./deal-card";
import { Button } from "@/components/ui/button";
import { COMMERCIAL_REASONS, COMMERCIAL_STATUSES, commercialLabel, pausesCommercialCallbacks } from "@/lib/pipeline/commercial-status";

function saoPauloInput(value?: Date | string | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
  return parts.replace(" ", "T");
}

export function CommercialPanel({ deal, scopeQuery = "", onSaved, initialStatus }: {
  deal: Deal; scopeQuery?: string; onSaved: () => void; initialStatus?: string;
}) {
  const [status, setStatus] = useState(initialStatus || deal.commercialStatus || "active");
  const [reason, setReason] = useState(deal.commercialReason || "");
  const [note, setNote] = useState(deal.commercialNote || "");
  const [nextContact, setNextContact] = useState(saoPauloInput(deal.nextContactAt));
  const [saving, setSaving] = useState(false);
  const field = "min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground";
  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/pipeline${scopeQuery ? `?${scopeQuery}` : ""}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deal.id, expectedUpdatedAt: new Date(deal.updatedAt).toISOString(), commercial: {
          status, reason: status === "no_response" ? "no_response" : reason, note,
          nextContactAt: status === "later" && nextContact ? new Date(`${nextContact}:00-03:00`).toISOString() : null,
        } }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Não foi possível classificar");
      if (pausesCommercialCallbacks(status) && !result.commercialLinkedConversations) {
        toast.warning("Classificação salva. Nenhuma conversa acessível foi vinculada à pausa; confira a instância responsável.");
      } else toast.success("Classificação salva. Nenhuma mensagem foi enviada.");
      onSaved();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Erro ao classificar"); }
    finally { setSaving(false); }
  };
  return <section className="grid min-w-0 gap-3 rounded-lg border border-border bg-muted/20 p-3" aria-label="Classificação comercial">
    <div>
      <h3 className="text-sm font-semibold">Situação comercial</h3>
      <p className="mt-1 text-xs text-muted-foreground">Responsável: {deal.assignedName || "Será atribuído a quem salvar"}. O histórico e as mensagens são preservados.</p>
      <p className="mt-1 text-xs text-muted-foreground">Atual: {commercialLabel(deal.commercialStatus)}</p>
    </div>
    <label className="grid min-w-0 gap-1 text-sm">Situação
      <select className={field} value={status} disabled={saving} onChange={(e) => { setStatus(e.target.value); if (e.target.value === "no_response") setReason("no_response"); }}>
        {COMMERCIAL_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
    </label>
    {status !== "active" && <label className="grid min-w-0 gap-1 text-sm">Motivo obrigatório
      <select className={field} value={reason} disabled={saving || status === "no_response"} onChange={(e) => setReason(e.target.value)}>
        <option value="">Selecione o motivo</option>
        {COMMERCIAL_REASONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
    </label>}
    {status === "later" && <label className="grid min-w-0 gap-1 text-sm">Retomar em — horário de Brasília
      <input className={field} type="datetime-local" value={nextContact} disabled={saving} onChange={(e) => setNextContact(e.target.value)} />
    </label>}
    <label className="grid min-w-0 gap-1 text-sm">Observação {status !== "active" ? "obrigatória" : "da retomada (opcional)"}
      <textarea className={`${field} min-h-20 resize-y`} value={note} maxLength={500} disabled={saving} onChange={(e) => setNote(e.target.value)} placeholder="Registre o que a pessoa informou, sem presumir o motivo." />
    </label>
    {pausesCommercialCallbacks(status) && <p className="text-xs text-muted-foreground">Rechamadas e perda automática pausadas nos chats vinculados. A data gera uma tarefa, não uma mensagem. Para voltar, selecione Em atendimento e salve.</p>}
    <Button type="button" className="min-h-11 w-full whitespace-normal" disabled={saving || (status === "later" && !nextContact) || (status !== "active" && (!reason || note.trim().length < 3))} onClick={save}>
      {saving ? "Salvando..." : "Salvar classificação"}
    </Button>
  </section>;
}
