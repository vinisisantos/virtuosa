"use client";

import { useEffect, useState, type RefObject } from "react";
import { BellRing, Loader2, ShieldCheck, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EVALUATION_NO_RESPONSE_TRIGGER, MAX_NO_RESPONSE_DELAY_HOURS, noResponseConfig, validNoResponseDelay } from "@/lib/whatsapp/evaluation-no-response-policy";
import { getEvaluationScheduleAutomationMessage } from "@/lib/whatsapp/evaluation-schedule-confirmation-message";

export type NoResponseAutomationView = {
  id: string; unit: string | null; isActive: boolean; triggerConfig: unknown; steps: unknown;
};

export function EvaluationNoResponseDialog({ open, unit, onOpenChange, initial, onSaved, returnFocusRef }: {
  open: boolean;
  unit: string;
  onOpenChange: (open: boolean) => void;
  initial?: NoResponseAutomationView | null;
  onSaved?: () => void;
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
}) {
  const [record, setRecord] = useState<NoResponseAutomationView | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [delay, setDelay] = useState("2");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const controller = new AbortController();
    setRecord(null);
    setError("");
    setLoading(true);
    async function load() {
      try {
        let automation = initial;
        if (!automation) {
          const res = await fetch(`/api/crm/automations?unit=${encodeURIComponent(unit)}`, { signal: controller.signal });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Não foi possível carregar a configuração.");
          automation = data.automations?.find((item: { triggerType: string; unit: string }) => item.triggerType === EVALUATION_NO_RESPONSE_TRIGGER && item.unit === unit);
        }
        if (!automation || automation.unit !== unit) throw new Error("Configuração não encontrada para esta unidade.");
        if (cancelled) return;
        setRecord(automation);
        setEnabled(automation.isActive);
        setDelay(String(noResponseConfig(automation.triggerConfig).delayHours));
        setMessage(getEvaluationScheduleAutomationMessage(automation.steps) || "");
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Erro ao carregar configuração.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; controller.abort(); };
  }, [open, unit, initial, retry]);

  const valid = !!record && validNoResponseDelay(Number(delay)) && !!message.trim() && message.length <= 4000;
  async function save() {
    if (!valid || saving || !record) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/crm/automations", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: record.id, isActive: enabled, triggerConfig: { delayHours: Number(delay) },
          steps: [{ type: "send_message", config: { message: message.trim() } }] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
      onSaved?.();
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!saving) onOpenChange(value); }}>
      <DialogContent showCloseButton={false} finalFocus={returnFocusRef ? () => returnFocusRef.current : undefined} className="no-response-dialog flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <div className="relative border-b border-border p-4 pr-16 sm:p-6 sm:pr-16">
          <p className="mb-2 text-xs text-muted-foreground">Automações / {unit} / Agenda</p>
          <DialogTitle className="flex items-center gap-2 text-lg leading-snug"><BellRing className="h-5 w-5 shrink-0 text-primary" />Lembrete sem resposta</DialogTitle>
          <DialogDescription className="mt-2 text-sm">Envio manual pelo botão do chat. Esta configuração vale para a unidade {unit}.</DialogDescription>
          <Button variant="ghost" size="icon" aria-label="Fechar lembrete" disabled={saving} onClick={() => onOpenChange(false)} className="absolute right-2 top-2 h-11 w-11"><X className="h-5 w-5" /></Button>
        </div>
        <div className="min-h-0 space-y-5 overflow-y-auto p-4 sm:p-6">
          {loading ? <p role="status" className="flex items-center gap-2 py-8"><Loader2 className="h-5 w-5 animate-spin" />Carregando configuração…</p> : record ? <>
            <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 px-3 py-2">
              <span className="font-medium">Habilitar envio pelo botão</span>
              <input aria-label="Habilitar envio pelo botão" type="checkbox" role="switch" checked={enabled} disabled={saving} onChange={(event) => setEnabled(event.target.checked)} className="h-6 w-6 shrink-0 accent-primary" />
            </label>
            <div className="space-y-2">
              <label htmlFor="no-response-delay" className="block font-medium">Permitir envio após</label>
              <div className="flex items-center gap-3">
                <input id="no-response-delay" type="number" inputMode="numeric" min={1} max={MAX_NO_RESPONSE_DELAY_HOURS} step={1} value={delay} disabled={saving} onChange={(event) => setDelay(event.target.value)} className="h-11 w-24 rounded-lg border border-border bg-background px-3 text-base outline-none focus:border-primary" />
                <span>horas sem resposta</span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">De 1 a 24 horas após a solicitação de confirmação. O envio só acontece ao clicar em “Enviar lembrete sem resposta” no chat, das 8h às 21h (São Paulo), antes da avaliação.</p>
            </div>
            <div className="space-y-2">
              <label htmlFor="no-response-message" className="block font-medium">Mensagem</label>
              <textarea id="no-response-message" rows={7} maxLength={4000} value={message} disabled={saving} onChange={(event) => setMessage(event.target.value)} className="w-full resize-y rounded-lg border border-border bg-background p-3 text-base leading-relaxed outline-none [overflow-wrap:anywhere] focus:border-primary" />
              <p className="break-words text-xs leading-relaxed text-muted-foreground">Use {"{{primeiro_nome}}"}, {"{{data}}"}, {"{{hora}}"} e {"{{unidade}}"} para personalizar.</p>
            </div>
            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Qualquer resposta interrompe o lembrete. Não envia se a avaliação for confirmada, cancelada ou reagendada. Uma mensagem por agendamento; não cancela o horário.</p>
            <p className="rounded-lg bg-primary/10 p-3 text-xs leading-relaxed">Salvar ou habilitar não envia mensagens. Não há disparo automático nem em lote; cada envio depende do botão na conversa escolhida.</p>
          </> : null}
          {error && <div role="alert" className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><p>{error}</p>{!record && !loading && <Button variant="outline" className="min-h-11" onClick={() => setRetry((value) => value + 1)}>Tentar novamente</Button>}</div>}
        </div>
        <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-popover p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
          <Button variant="outline" disabled={saving} className="min-h-11" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button data-no-response-save disabled={!valid || saving || loading} className="min-h-11" onClick={() => void save()}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar configuração</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
