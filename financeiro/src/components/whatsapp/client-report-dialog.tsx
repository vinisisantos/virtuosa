'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { Download, ExternalLink, FileText, Loader2, Printer, RefreshCw, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { reportCurrency, reportDate, type ClientReport } from '@/lib/whatsapp/client-report';
import { printClientReport } from '@/lib/whatsapp/client-report-pdf';

type Props = {
  unit: string; conversationId: string; instanceId: string;
  onClose: () => void; returnFocus: RefObject<HTMLButtonElement | null>;
};
const action = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50';

export function ClientReportDialog({ unit, conversationId, instanceId, onClose, returnFocus }: Props) {
  const [report, setReport] = useState<ClientReport | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [retry, setRetry] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    const params = new URLSearchParams({ unit, conversationId, targetInstanceId: instanceId });
    fetch(`/api/whatsapp/client-report?${params}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o relatório.');
        if (controller.signal.aborted) return;
        setReport(data); setSelectedId(data.closings[0]?.id || '');
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o relatório.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { mounted.current = false; controller.abort(); };
  }, [conversationId, instanceId, retry, unit]);

  const closing = report?.closings.find(item => item.id === selectedId);
  const download = async () => {
    if (!report || !closing) return;
    setError(null); setExporting(true);
    try {
      const { createClientReportPdf } = await import('@/lib/whatsapp/client-report-pdf');
      const doc = await createClientReportPdf(report, closing);
      if (mounted.current) {
        const name = closing.clientName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').slice(0, 70);
        doc.save(`relatorio-${name || 'cliente'}-${closing.id.slice(0, 8)}.pdf`);
      }
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'Não foi possível gerar o PDF.'); }
    finally { if (mounted.current) setExporting(false); }
  };
  const print = () => {
    if (!report || !closing) return;
    setError(null);
    // Keep opening synchronous with the click for Safari's popup policy.
    try { printClientReport(report, closing); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível imprimir.'); }
  };

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent showCloseButton={false} finalFocus={returnFocus} className="z-[100] flex max-h-[calc(100dvh-2rem)] min-w-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
      <header className="flex shrink-0 items-start gap-3 border-b border-border p-4 sm:p-5">
        <FileText className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <DialogTitle id="client-report-title" className="text-lg font-semibold">Relatório do cliente</DialogTitle>
          <DialogDescription className="mt-1 text-xs leading-5">Fechamentos registrados em {unit}. Apenas consulta, sem envio ao WhatsApp.</DialogDescription>
        </div>
        <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted" aria-label="Fechar relatório"><X className="h-5 w-5" /></button>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 [overflow-wrap:anywhere] sm:p-5">
        {loading && <p role="status" className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Consultando os fechamentos…</p>}
        {error && <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm"><p>{error}</p>
          {!report && <button type="button" className={action} onClick={() => { setError(null); setLoading(true); setRetry(value => value + 1); }}><RefreshCw className="h-4 w-4" /> Tentar novamente</button>}
        </div>}
        {!loading && report && !report.closings.length && <div className="rounded-xl border border-dashed border-border p-5"><p className="font-medium">Nenhum fechamento disponível</p><p className="mt-2 text-sm text-muted-foreground">Não há venda fechada registrada para este contato, nesta unidade e no seu acesso atual. Propostas e avaliações agendadas não são incluídas.</p></div>}
        {!loading && report && closing && <>
          {report.multipleClients && <p className="rounded-lg bg-amber-500/10 p-3 text-sm">Há mais de um cadastro vinculado ao telefone. Confira o nome no fechamento escolhido.</p>}
          <label className="block space-y-2 text-sm font-medium">Fechamento
            <select aria-label="Selecionar fechamento" disabled={exporting} value={selectedId} onChange={event => { setSelectedId(event.target.value); setError(null); }} className="mt-2 min-h-11 w-full min-w-0 max-w-full rounded-lg border border-border bg-background px-3 text-sm">
              {report.closings.map(item => <option key={item.id} value={item.id}>{reportDate(item.closedAt)} · {item.clientName} · {reportCurrency(item.total)}</option>)}
            </select>
          </label>
          <section className="space-y-4 rounded-xl border border-border bg-muted/20 p-4" aria-label="Prévia do relatório">
            <div><p className="text-xs text-muted-foreground">Cliente</p><h3 className="mt-1 text-base font-semibold">{closing.clientName}</h3></div>
            <div><p className="text-xs text-muted-foreground">Anúncio / campanha registrada</p><p className="mt-1 font-medium">{closing.origin.name}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{closing.origin.description}</p>
              {closing.origin.url && <a href={closing.origin.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm text-primary underline underline-offset-4"><ExternalLink className="h-4 w-4" /> Abrir anúncio registrado</a>}
            </div>
            <div><h4 className="text-sm font-semibold">Procedimentos fechados</h4>
              <ul className="mt-2 divide-y divide-border">{closing.procedures.map((item, index) => <li key={index} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3 text-sm">
                <div className="min-w-0 flex-1 basis-40"><p>{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.sessions === null ? 'Sessões não informadas' : `${item.sessions} ${item.sessions === 1 ? 'sessão' : 'sessões'}`}</p></div>
                <span className="shrink-0 font-medium">{item.courtesy ? 'Cortesia' : reportCurrency(item.value)}</span>
              </li>)}</ul>
              {!closing.procedures.length && <p className="mt-2 text-sm text-muted-foreground">Procedimentos não informados.</p>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4"><span className="text-sm font-medium">Valor final contratado</span><strong className="text-xl text-primary">{reportCurrency(closing.total)}</strong></div>
            <p className="text-xs leading-5 text-muted-foreground">Total após descontos. Não representa o valor já recebido e não comprova pagamento.</p>
          </section>
          {!!closing.warnings.length && <ul className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm" aria-label="Avisos do fechamento">{closing.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
          {!closing.exportable && <p role="status" className="text-sm text-destructive">Revise o fechamento no CRM antes de imprimir ou gerar o PDF.</p>}
        </>}
      </div>
      <footer className="grid shrink-0 grid-cols-2 gap-2 border-t border-border bg-muted/20 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex sm:justify-end">
        <button type="button" className={action} disabled={loading || exporting || !closing?.exportable} onClick={print}><Printer className="h-4 w-4" /> Imprimir</button>
        <button type="button" className={`${action} border-primary bg-primary text-primary-foreground`} disabled={loading || exporting || !closing?.exportable} onClick={() => void download()}>{exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Baixar PDF</button>
      </footer>
    </DialogContent>
  </Dialog>;
}
