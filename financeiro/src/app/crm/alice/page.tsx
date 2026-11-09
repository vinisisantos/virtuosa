"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CirclePause, Loader2, RefreshCw } from "lucide-react";
import AuthGuard from "@/components/auth-guard";
import { AliceMonitoringControls } from "./alice-monitoring-controls";
import { AliceMonitoringList } from "./alice-monitoring-list";
import { formatAliceCost, formatAliceDate, formatAliceDuration } from "./monitoring-types";
import { useAliceMonitoring } from "./use-alice-monitoring";
import styles from "./page.module.css";

const ADMIN_ROLES = ["ADMINISTRADOR"];

export default function AliceMonitoringPage() {
  return <AuthGuard allowedRoles={ADMIN_ROLES}><AliceMonitoringContent /></AuthGuard>;
}

function AliceMonitoringContent() {
  const [days, setDays] = useState(7);
  const { data, loading, loadingMore, saving, error, lastUpdatedAt, load, loadMore, changeEnabled } = useAliceMonitoring(days);
  const summary = data?.summary;

  return <main className={styles.page} aria-busy={loading || saving}>
    <Link className={styles.backLink} href="/crm/assistente-ia"><ArrowLeft size={16} aria-hidden="true" /> Configurações da Alice</Link>
    <header className={styles.header}>
      <div><h1>Acompanhamento da Alice <span className={styles.unit}>SBC</span></h1><p>Atendimento autônomo, custos e pontos que precisam da equipe.</p></div>
      <div className={styles.toolbar}>
        <div className={styles.periods} role="group" aria-label="Período do acompanhamento">
          {([1, 7, 30] as const).map((period) => <button type="button" key={period} aria-pressed={days === period} onClick={() => setDays(period)} disabled={saving}>{period === 1 ? "24 horas" : `${period} dias`}</button>)}
        </div>
        <button type="button" className={styles.button} disabled={loading || saving} onClick={() => void load()}><RefreshCw className={loading ? styles.spinner : ""} size={16} aria-hidden="true" /> Atualizar</button>
      </div>
    </header>

    {error && <div className={styles.error} role="alert"><AlertTriangle size={20} aria-hidden="true" /><div><strong>Não foi possível concluir a atualização</strong><p>{error}</p><button type="button" className={styles.button} disabled={loading || saving} onClick={() => void load()}>Tentar novamente</button></div></div>}

    {!data && loading ? <div className={styles.loading} role="status"><Loader2 size={24} className={styles.spinner} aria-hidden="true" /><span>Carregando acompanhamento da Alice...</span></div> : data && summary ? <>
      <section className={styles.operation} aria-label="Estado do atendimento autônomo">
        <div className={styles.operationCopy}>
          <span className={styles.stateDot} data-active={data.config.enabled} aria-hidden="true" />
          <div><h2>{data.config.enabled ? "Alice ativa em SBC" : "Atendimento autônomo pausado"}</h2><p>{data.config.enabled ? "Novas mensagens e pendências elegíveis podem receber respostas automáticas." : "A Alice não está liberada para próximos envios autônomos. Um envio já iniciado na rede ainda pode concluir. As sugestões manuais continuam disponíveis."}</p></div>
        </div>
        {data.config.enabled && <button type="button" className={styles.pauseButton} disabled={saving} onClick={() => void changeEnabled(false)}>{saving ? <Loader2 size={17} className={styles.spinner} aria-hidden="true" /> : <CirclePause size={17} aria-hidden="true" />} Pausar envios agora</button>}
      </section>
      {!data.readiness.ready && data.config.enabled && <div className={styles.warning} role="status"><AlertTriangle size={18} aria-hidden="true" /><div><strong>Operação com bloqueios</strong><ul>{data.readiness.blockers.map((blocker, index) => <li key={index}>{blocker}</li>)}</ul></div></div>}

      <section className={styles.section} aria-labelledby="alice-summary-title">
        <div className={styles.sectionHeading}><div><h2 id="alice-summary-title">Visão do período</h2><p>{loading ? "Atualizando o período selecionado..." : `Última consulta em ${formatAliceDate(lastUpdatedAt)}`}</p></div><span className={styles.model}>Claude Sonnet 4.6</span></div>
        <dl className={styles.summary}>
          <Metric label="Conversas no período" value={summary.conversations} />
          <Metric label="Na fila" value={summary.queued} />
          <Metric label="Envios aceitos" value={summary.sent} />
          <Metric label="Equipe necessária" value={summary.needsHuman} tone="warning" />
          <Metric label="Sem confirmação" value={summary.uncertain} tone="warning" />
          <Metric label="Falhas" value={summary.failed} tone="danger" />
          <Metric label="Agendamentos registrados" value={summary.appointments} />
          <Metric label={summary.unknownCostTurns > 0 ? "Custo conhecido (parcial)" : "Custo estimado"} value={summary.unknownCostTurns > 0 && summary.costMicroUsd === 0 ? "Não apurado" : formatAliceCost(summary.costMicroUsd)} />
        </dl>
        <dl className={styles.details}>
          <div><dt>Tokens de entrada / saída</dt><dd>{summary.inputTokens.toLocaleString("pt-BR")} / {summary.outputTokens.toLocaleString("pt-BR")}</dd></div>
          <div><dt>Geração média</dt><dd>{formatAliceDuration(summary.averageGenerationMs)}</dd></div>
          <div><dt>Primeiro envio · mensagens novas</dt><dd>{formatAliceDuration(summary.averageResponseMs)}</dd></div>
          <div><dt>Primeiro envio · retomadas</dt><dd>{formatAliceDuration(summary.averageBacklogResponseMs)} · {summary.backlogTurns.toLocaleString("pt-BR")} retomada(s)</dd></div>
        </dl>
        {summary.unknownCostTurns > 0 && <p className={styles.warning} role="status"><AlertTriangle size={18} aria-hidden="true" /><span>{summary.unknownCostTurns} geração(ões) sem dados de uso confirmados. O custo não está apurado e não foi considerado como zero no total conhecido.</span></p>}
        <p className={styles.note}>Custos estimados pelo uso registrado de tokens, em dólares. Não são o faturamento final da Anthropic. Agendamentos registrados não representam comparecimento ou venda.</p>
        <p className={styles.note}>O tempo das mensagens novas parte da entrada do lead. Nas retomadas, o tempo começa quando a pendência entra na fila da Alice, sem incluir a espera anterior.</p>
      </section>
      <AliceMonitoringList items={data.items} hasMore={Boolean(data.nextCursor)} loadingMore={loadingMore} onLoadMore={() => void loadMore()} />
      <AliceMonitoringControls data={data} saving={saving} onActivate={(anchor, previewToken) => changeEnabled(true, anchor, previewToken)} />
    </> : null}
  </main>;
}

function Metric({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return <div data-tone={tone}><dt>{label}</dt><dd>{typeof value === "number" ? value.toLocaleString("pt-BR") : value}</dd></div>;
}
