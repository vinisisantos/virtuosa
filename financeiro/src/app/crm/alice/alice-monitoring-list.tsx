"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2, MessageSquare, Play } from "lucide-react";
import { ALICE_STATUSES, aliceConversationUrl, formatAliceCost, formatAliceDate, type AliceTurn } from "./monitoring-types";
import styles from "./page.module.css";

type Props = { items: AliceTurn[]; hasMore: boolean; loadingMore: boolean; saving: boolean;
  onRetry: (turnId: string) => Promise<boolean>; onLoadMore: () => void };

export function AliceMonitoringList({ items, hasMore, loadingMore, saving, onRetry, onLoadMore }: Props) {
  const [filter, setFilter] = useState("all");
  const filtered = items.filter((item) => filter === "all" || (filter === "attention"
    ? ["needs_human", "uncertain", "failed"].includes(item.status)
    : ["queued", "processing", "sending"].includes(item.status)));

  return <section className={styles.section} aria-labelledby="alice-turns-title">
    <div className={styles.sectionHeading}>
      <div><h2 id="alice-turns-title">Atendimentos recentes</h2><p>Acompanhe cada tentativa e abra a conversa quando precisar intervir. Filtros aplicados aos {items.length} registros carregados.</p></div>
      <label className={styles.filterLabel}>
        <span>Mostrar</span>
        <select className={styles.select} value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">Todos os estados</option>
          <option value="attention">Precisam de atenção</option>
          <option value="queue">Em andamento</option>
        </select>
      </label>
    </div>
    {filtered.length === 0 ? <div className={styles.empty}>
      <MessageSquare size={22} aria-hidden="true" />
      <h3>{items.length === 0 ? "Ainda não há atendimentos neste período" : "Nenhum atendimento neste filtro"}</h3>
      <p>{items.length === 0 ? "Os atendimentos aparecerão aqui quando forem processados pela Alice. Nenhuma mensagem é gerada ao abrir esta página." : "Escolha todos os estados para consultar os demais atendimentos."}</p>
    </div> : <>
      <div className={styles.listHeader} aria-hidden="true"><span>Conversa</span><span>Estado</span><span>Início e custo</span><span>Ação</span></div>
      <ul className={styles.turnList}>
        {filtered.map((item) => {
          const status = ALICE_STATUSES[item.status] || { label: "Estado não reconhecido", tone: "warning" };
          return <li key={item.id} className={styles.turn}>
            <div className={styles.contact}>
              <strong>{item.contactName || "Sem nome"}</strong>
              <span>Telefone final {item.phoneLast4 || "—"}</span>
              {item.appointmentId && <span className={styles.appointment}>Agendamento registrado</span>}
            </div>
            <div className={styles.turnState}>
              <span className={styles.badge} data-tone={status.tone}>{status.label}</span>
              {item.error && <p className={styles.errorDetail}>{item.error}</p>}
              {item.status === "needs_human" && !item.error && <p className={styles.errorDetail}>A equipe precisa revisar a conversa.</p>}
              {item.status === "uncertain" && <p className={styles.errorDetail}>Confira no WhatsApp antes de reenviar.</p>}
            </div>
            <div className={styles.turnMeta}>
              <time dateTime={item.createdAt}>{formatAliceDate(item.createdAt)}</time>
              <span>{item.costMicroUsd === null ? "Custo não apurado" : formatAliceCost(item.costMicroUsd)}</span>
              {item.firstSentAt && <span>Primeiro envio {formatAliceDate(item.firstSentAt)}</span>}
            </div>
            <div className={styles.turnActions}>
              <Link className={styles.conversationLink} href={aliceConversationUrl(item.conversationId, item.instanceId)} aria-label={`Abrir conversa de ${item.contactName || "contato sem nome"}, final ${item.phoneLast4 || "não informado"}`}>
                Abrir conversa <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
              {item.retryable && <button type="button" className={styles.retryButton} disabled={saving} onClick={() => void onRetry(item.id)}>
                {saving ? <Loader2 className={styles.spinner} size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
                Retomar esta falha
              </button>}
            </div>
          </li>;
        })}
      </ul>
    </>}
    {hasMore && <div className={styles.pagination}><button type="button" className={styles.button} onClick={onLoadMore} disabled={loadingMore}>{loadingMore && <Loader2 size={16} className={styles.spinner} aria-hidden="true" />}{loadingMore ? "Carregando registros..." : "Carregar próximos registros"}</button></div>}
    <p className={styles.note}>“Envio aceito” indica aceitação pelo serviço de envio, não comprova entrega nem leitura. A lista apresenta os registros carregados do período, sem consultar os modelos.</p>
  </section>;
}
