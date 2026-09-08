"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { welcomeConfig, type WelcomeConfig } from "@/lib/whatsapp/campaign-welcome-policy";

type Settings = {
  automation: { id: string; isActive: boolean; triggerConfig: unknown } | null;
  library: Array<{ id: string; title: string; content: string; campaignKey: string | null }>;
  campaigns: Array<{ key: string; name: string; covered: boolean }>;
  scheduler: { installed: boolean; readyAt: string | null; lastWorkerAt: string | null };
  recent: Array<{ id: string; status: string; reason: string | null; campaignKey: string | null; createdAt: string }>;
};
export function CampaignWelcomeDialog({ unit, onClose, onSaved }: { unit: string | null; onClose: () => void; onSaved: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [config, setConfig] = useState<WelcomeConfig | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!unit) return;
    const controller = new AbortController();
    setSettings(null); setConfig(null); setError('');
    fetch(`/api/crm/automations?welcomeUnit=${encodeURIComponent(unit)}`, { signal: controller.signal })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Erro ao carregar.'); return body as Settings; })
      .then((body) => {
        const config = welcomeConfig(body.automation?.triggerConfig);
        config.replyIds = Object.fromEntries(Object.entries(config.replyIds).map(([key,id]) => [key, body.library.some(reply => reply.id === id && reply.campaignKey === key) ? id : '']));
        setSettings(body); setConfig(config); setActive(!!body.automation?.isActive);
      })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [unit]);
  async function save() {
    if (!settings?.automation || !config) return;
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/crm/automations', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: settings.automation.id, isActive: active, triggerConfig: config }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Não foi possível salvar.');
      onSaved(); onClose();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Falha de conexão.'); }
    finally { setSaving(false); }
  }
  return <Dialog open={!!unit} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent className="campaign-welcome-dialog flex max-h-[90dvh] w-[calc(100vw-24px)] max-w-[760px] flex-col overflow-hidden p-4 sm:max-w-[760px] sm:p-6 [&_[data-slot=dialog-close]]:min-h-11 [&_[data-slot=dialog-close]]:min-w-11">
      <DialogHeader className="pr-10 text-left">
        <DialogTitle>Recepção por campanha · {unit}</DialogTitle>
        <DialogDescription>Após 1 minuto: saudação → pergunta da campanha. Biblioteca da Claudenice.</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain pr-1">
        {error && <p role="alert" className="break-words text-sm text-red-500">{error}</p>}
        {!settings && !error && <p role="status">Carregando configuração…</p>}
        {settings && config && <>
          <p className="rounded-lg bg-muted p-3 text-sm">{settings.scheduler.readyAt ? 'Agendador ativado. Em operação normal, o envio começa entre 60 e 75 segundos, mais a latência do WhatsApp.' : 'Aguardando ativação do agendador. A recepção anterior permanece preservada.'}</p>
          <label className="flex min-h-11 items-center gap-3 font-medium"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="h-5 w-5" />Recepção habilitada nesta unidade</label>
          <label className="block space-y-2"><span className="font-medium">1. Saudação automática</span>
            <textarea aria-label="Saudação automática" rows={4} maxLength={4096} value={config.greeting} onChange={(event) => setConfig({ ...config, greeting: event.target.value })} className="w-full resize-y rounded-lg border border-border bg-background p-3 text-base" />
            <span className="block text-xs text-muted-foreground">Sem nome do lead ou apresentação como uma pessoa. Não altera a saudação manual.</span>
          </label>
          <section className="space-y-3">
            <h3 className="font-medium">2. Pergunta para entender a região</h3>
            <p className="text-sm text-muted-foreground">Associe uma pergunta já cadastrada na pasta da campanha. Sem associação, envia somente a saudação.</p>
            {settings.campaigns.map((campaign) => {
              const options = settings.library.filter((reply) => reply.campaignKey === campaign.key);
              const reply = options.find((item) => item.id === config.replyIds[campaign.key]);
              return <div key={campaign.key} className="min-w-0 space-y-2 rounded-lg border border-border p-3">
                <label className="block break-words text-sm font-semibold" htmlFor={`welcome-${campaign.key}`}>{campaign.name}</label>
                <select id={`welcome-${campaign.key}`} className="min-h-11 w-full min-w-0 max-w-full rounded-lg border border-border bg-background px-2 text-base" value={reply?.id || ''}
                  onChange={(event) => setConfig({ ...config, replyIds: { ...config.replyIds, [campaign.key]: event.target.value } })}>
                  <option value="">Somente saudação — pergunta pendente</option>
                  {options.map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}
                </select>
                {reply ? <details className="text-sm"><summary className="flex min-h-11 cursor-pointer items-center text-primary">Ver mensagem selecionada</summary><p className="whitespace-pre-wrap break-words text-muted-foreground">{reply.content}</p></details>
                  : <p className="text-xs text-amber-600 dark:text-amber-400">Cadastre/associe uma pergunta desta campanha. Não será usada outra campanha como alternativa.</p>}
              </div>;
            })}
          </section>
          <p className="text-xs text-muted-foreground">Não envia para conversas antigas. Interrompe quando há atendimento, agendamento, bloqueio ou resposta entre as duas mensagens. Falhas incertas não são reenviadas automaticamente.</p>
          <details className="rounded-lg border border-border p-3"><summary className="flex min-h-11 cursor-pointer items-center text-sm">Últimas {settings.recent.length} recepções</summary>
            {!settings.recent.length ? <p className="text-sm text-muted-foreground">Nenhuma recepção registrada ainda.</p> : <ul className="space-y-2 text-xs">
              {settings.recent.map((job) => <li key={job.id} className="break-words border-t border-border pt-2">{new Date(job.createdAt).toLocaleString('pt-BR')} · {job.campaignKey || 'Sem campanha'} · {({ completed: 'Par enviado', greeting_only: 'Só saudação: pergunta pendente', cancelled: 'Interrompida por segurança', uncertain: 'Envio incerto: conferir no chat', pending: 'Na fila', processing: 'Preparando', sending: 'Enviando' } as Record<string, string>)[job.status] || job.status}</li>)}
            </ul>}
          </details>
        </>}
      </div>
      <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row sm:justify-end">
        <Button className="min-h-11" variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button>
        <Button className="min-h-11" disabled={saving || !settings?.automation || !config} onClick={save}>{saving ? 'Salvando…' : 'Salvar recepção'}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
