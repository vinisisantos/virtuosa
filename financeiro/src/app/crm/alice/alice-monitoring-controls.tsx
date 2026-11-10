"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Play } from "lucide-react";
import { formatAliceDate, type AliceMonitoringData } from "./monitoring-types";
import styles from "./page.module.css";

type Props = {
  data: AliceMonitoringData;
  saving: boolean;
  onActivate: (anchor?: string, previewToken?: string) => Promise<boolean>;
};

export function AliceMonitoringControls({ data, saving, onActivate }: Props) {
  const [anchor, setAnchor] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const confirmRef = useRef<HTMLInputElement>(null);
  const configuredAnchor = data.config.backlogAnchorConversationId;
  const active = data.config.enabled;
  const candidates = [...data.backlogCandidates].sort((a, b) => a.lastInboundAt.localeCompare(b.lastInboundAt));
  const selected = candidates.find((candidate) => candidate.conversationId === anchor);
  const firstActivation = !data.config.activatedAt && !configuredAnchor;
  const canActivate = data.readiness.ready && (active
    ? Boolean(selected?.previewToken)
    : (!firstActivation || Boolean(selected?.previewToken)) && (!anchor || Boolean(selected?.previewToken)));

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  useEffect(() => {
    setConfirming(false);
    setAccepted(false);
  }, [data.config.enabled, selected?.previewToken]);

  return (
    <section className={styles.section} aria-labelledby="alice-controls-title">
      <div className={styles.sectionHeading}>
        <div>
          <h2 id="alice-controls-title">Regras do atendimento</h2>
          <p>Somente SBC. As permissões das outras unidades não mudam.</p>
        </div>
      </div>
      <dl className={styles.rules}>
        <div><dt>Modelo e campanhas</dt><dd>Claude Sonnet 4.6 · todas as campanhas</dd></div>
        <div><dt>Horário de resposta</dt><dd>24 horas, inclusive de madrugada</dd></div>
        <div><dt>Espera antes de responder</dt><dd>{data.config.initialDelaySeconds} s após a última mensagem do lead</dd></div>
        <div><dt>Mensagens complementares</dt><dd>{data.config.complementDelaySeconds} s entre as partes da mesma resposta</dd></div>
        <div><dt>Controle de gasto no CRM</dt><dd>{data.config.monthlyLimitUsd === null ? "Sem teto mensal" : `US$ ${data.config.monthlyLimitUsd} por mês`}</dd></div>
        <div><dt>Retomada pela equipe</dt><dd>Alice pausa quando alguém assume ou responde</dd></div>
      </dl>
      <p className={styles.note}>A recepção automática anterior não deve se sobrepor às conversas assumidas pela Alice. Dúvidas clínicas e casos que precisam de análise continuam sendo encaminhados para a equipe.</p>

      {(!active || candidates.length > 0) && (
        <div className={styles.activation}>
          <h3>{active ? "Retomar pendências sem pausar a Alice" : firstActivation ? "Por onde começar as pendências" : "Retomar o atendimento autônomo"}</h3>
          {active
            ? <p className={styles.note}>As novas mensagens continuarão sendo atendidas. Selecione uma conversa para enfileirar as últimas entradas ainda sem resposta, inclusive em conversas antigas ou com avaliação marcada.</p>
            : !firstActivation && <p className={styles.note}>Sem escolher uma nova conversa inicial, a retomada vale somente para novas mensagens. Pendências anteriores não são reenviadas nem retomadas automaticamente.</p>}
          {candidates.length > 0 ? (
            <>
              <label className={styles.fieldLabel} htmlFor="alice-backlog-anchor">Primeira conversa da retomada{firstActivation || active ? " (obrigatório)" : " (opcional)"}</label>
              <select id="alice-backlog-anchor" className={styles.select} value={anchor} disabled={saving || confirming} onChange={(event) => setAnchor(event.target.value)}>
                <option value="">{firstActivation || active ? "Selecione a conversa inicial" : "Somente novas mensagens, sem retomar pendências"}</option>
                {candidates.map((candidate) => <option key={candidate.conversationId} value={candidate.conversationId}>
                  {candidate.contactName || "Sem nome"} · final {candidate.phoneLast4 || "—"} · {formatAliceDate(candidate.lastInboundAt)} · entrada sem resposta
                </option>)}
              </select>
              {selected && <p className={styles.selectionPreview}>
                Começar por <strong>{selected.contactName || "Sem nome"}</strong>, final {selected.phoneLast4 || "—"}, com entrada sem resposta em {formatAliceDate(selected.lastInboundAt)}. O lote será validado novamente antes do envio e não pode ultrapassar 200 conversas.
              </p>}
            </>
          ) : <p className={styles.note}>{firstActivation ? "Nenhuma pendência elegível foi localizada para definir o início. Atualize o acompanhamento antes de ativar." : "Nenhuma pendência elegível na lista. A retomada vale apenas para novas mensagens, sem reprocessar o lote anterior."}</p>}
          {data.backlogTruncated && <p className={styles.note}>A seleção mostra as primeiras 200 pendências elegíveis. Há outras além desta lista; confirme o início e o recorte antes de ativar.</p>}

          {!data.readiness.ready && <div className={styles.warning} role="status">
            <AlertTriangle aria-hidden="true" size={18} />
            <div><strong>A ativação ainda não está disponível</strong><ul>{data.readiness.blockers.map((blocker, index) => <li key={index}>{blocker}</li>)}</ul></div>
          </div>}

          {confirming ? <div className={styles.confirmation}>
            <h3>{active ? "Confirmar retomada das pendências" : "Confirmar ativação em SBC"}</h3>
            <p>{active
              ? "A Alice enviará respostas reais às pendências a partir da conversa selecionada, sem pausar as novas mensagens. Usa Sonnet 4.6, sem teto mensal de gasto no CRM; conversas assumidas pela equipe continuam protegidas."
              : `A Alice poderá enviar respostas reais ${selected ? "às novas mensagens e às pendências selecionadas" : "às novas mensagens, sem retomar pendências anteriores"}, 24 horas por dia, usando Sonnet e sem teto mensal de gasto no CRM.`}</p>
            <label className={styles.checkboxLabel}>
              <input ref={confirmRef} type="checkbox" checked={accepted} disabled={saving} onChange={(event) => setAccepted(event.target.checked)} />
              <span>{active
                ? "Entendo que isso enfileira respostas às pendências selecionadas, sem pausar as novas conversas. A equipe pode assumir qualquer conversa."
                : "Entendo que isso ativa envios automáticos. Posso pausar a operação nesta página ou assumir uma conversa."}</span>
            </label>
            <div className={styles.actions}>
              <button type="button" className={styles.primaryButton} disabled={saving || !accepted || !canActivate} onClick={async () => {
                if (await onActivate(anchor || undefined, selected?.previewToken)) {
                  setConfirming(false);
                  setAccepted(false);
                  setAnchor("");
                }
              }}>{saving ? <Loader2 className={styles.spinner} size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />} {active ? "Retomar pendências" : "Ativar agora em SBC"}</button>
              <button type="button" className={styles.button} disabled={saving} onClick={() => { setConfirming(false); setAccepted(false); }}>Cancelar</button>
            </div>
          </div> : <button type="button" className={styles.primaryButton} disabled={saving || !canActivate} onClick={() => setConfirming(true)}>
            <Play size={16} aria-hidden="true" /> {firstActivation ? "Revisar e ativar em SBC" : "Revisar e retomar em SBC"}
          </button>}
        </div>
      )}
    </section>
  );
}
