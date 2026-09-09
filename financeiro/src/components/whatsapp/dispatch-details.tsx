"use client";

import { Check, CheckCheck, Clock3, Megaphone, UserRound, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { dispatchDeliveryStatus, dispatchLabel, type DispatchSnapshot } from "@/lib/whatsapp/dispatch";

export function DispatchBadge({ onClick, compact = false }: { onClick: () => void; compact?: boolean }) {
  return (
    <button type="button" onClick={event => { event.stopPropagation(); onClick(); }}
      aria-label="Ver detalhes do disparo" title="Ver detalhes do disparo"
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg px-1 text-primary outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className={`inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] font-semibold ${compact ? "max-sm:border-transparent max-sm:bg-transparent max-sm:px-1" : ""}`}>
        <Megaphone className={compact ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden="true" />
        <span className={compact ? "hidden sm:inline" : ""}>Disparo</span>
      </span>
    </button>
  );
}

export function DispatchDetails({ dispatch, onClose }: { dispatch: DispatchSnapshot | null; onClose: () => void }) {
  const status = dispatch ? dispatchDeliveryStatus(dispatch.status) : null;
  return (
    <Dialog open={!!dispatch} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent showCloseButton={false} className="top-auto bottom-0 left-0 max-h-[85dvh] w-full max-w-full translate-x-0 translate-y-0 overflow-y-auto rounded-b-none rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-6">
        <div aria-hidden="true" className="mx-auto mb-1 h-1 w-10 rounded-full bg-muted-foreground/40 sm:hidden" />
        <DialogTitle className="pr-10 text-lg font-semibold">Detalhes do disparo</DialogTitle>
        <DialogDescription>Identificação do envio em lote nesta conversa de Osasco.</DialogDescription>
        <DialogClose aria-label="Fechar detalhes do disparo" className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></DialogClose>
        {dispatch && status && <>
          <dl className="space-y-4 py-2 text-sm">
            <div className="flex items-start gap-3"><Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div className="min-w-0"><dt className="font-semibold">{dispatchLabel(dispatch.metadata)}</dt><dd className="mt-1 break-words text-muted-foreground">{dispatch.metadata.campaignName || "Sem campanha informada no lote"}</dd></div></div>
            <div className="flex items-start gap-3"><UserRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><div className="min-w-0"><dt className="text-xs text-muted-foreground">Enviado por</dt><dd className="break-words">{dispatch.sentByName}</dd></div></div>
            <div className="flex items-start gap-3"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><div><dt className="text-xs text-muted-foreground">Data e horário</dt><dd>{new Date(dispatch.sentAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}</dd></div></div>
            <div><dt className="mb-1 text-xs text-muted-foreground">Último status informado pelo WhatsApp</dt><dd className={`flex items-center gap-2 font-semibold ${status.tone === "success" ? "text-emerald-600 dark:text-emerald-400" : status.tone === "error" ? "text-destructive" : "text-muted-foreground"}`}>
              {status.tone === "success" ? <CheckCheck className="h-4 w-4" /> : status.tone === "error" ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}{status.label}
            </dd></div>
          </dl>
          <p className="rounded-xl bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">{status.detail} O selo registra o disparo e não significa, por si só, que a pessoa recebeu ou leu.</p>
        </>}
      </DialogContent>
    </Dialog>
  );
}
