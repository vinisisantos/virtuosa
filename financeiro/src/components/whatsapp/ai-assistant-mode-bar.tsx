"use client";

import { useState } from "react";
import Link from "next/link";
import { Bot, CirclePause, Loader2, Pencil, Sparkles } from "lucide-react";
import styles from "./ai-assistant-composer.module.css";

export type AliceConversationMode = "manual" | "suggestions" | "agent";

type Props = {
  mode: AliceConversationMode;
  unit: string;
  changingMode: boolean;
  onChange: (mode: AliceConversationMode) => Promise<void>;
};

export function AiAssistantModeBar({ mode, unit, changingMode, onChange }: Props) {
  const [confirming, setConfirming] = useState(false);
  const choices = [
    { mode: "manual" as const, label: "Manual", ariaLabel: "Resposta manual", Icon: Pencil },
    { mode: "suggestions" as const, label: "Alice", ariaLabel: "Sugestões da Alice", Icon: Sparkles },
    ...(unit === "SBC" ? [{ mode: "agent" as const, label: "Autônomo", ariaLabel: "Atendimento autônomo da Alice", Icon: Bot }] : []),
  ];

  return <>
    <div className={styles.modeBar}>
      <span className={styles.modeBarLabel}>Responder com</span>
      <div className={styles.modeSwitch} role="group" aria-label="Modo de resposta" aria-busy={changingMode}>
        {choices.map((choice) => <button type="button" key={choice.mode} disabled={changingMode}
          className={`${styles.modeSwitchButton} ${mode === choice.mode ? styles.modeSwitchSelected : ""}`}
          aria-label={choice.ariaLabel} aria-pressed={mode === choice.mode}
          onClick={() => {
            if (choice.mode === "agent" && mode !== "agent") setConfirming(true);
            else { setConfirming(false); void onChange(choice.mode); }
          }}><choice.Icon className="h-4 w-4" aria-hidden="true" />{choice.label}</button>)}
      </div>
      <span className={styles.modeBarCaption} role="status">
        {changingMode ? <><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Atualizando modo...</>
          : mode === "agent" ? "Respostas automáticas sujeitas aos controles de SBC"
            : unit === "SBC" ? "Sugestões manuais; confirmação de agenda pode ser automática" : "Envio sempre manual"}
      </span>
    </div>
    {unit === "SBC" && mode === "agent" && <section className={styles.agentState} aria-label="Controle do atendimento autônomo">
      <div><strong>Alice em modo autônomo nesta conversa</strong><p>Espera de 30 s após a última mensagem do lead e 3 s entre complementos. Ao assumir ou responder manualmente, a Alice pausa.</p></div>
      <div className={styles.agentActions}><button type="button" className={styles.agentButton} disabled={changingMode} onClick={() => void onChange("manual")}><CirclePause size={16} aria-hidden="true" /> Assumir atendimento</button><Link href="/crm/alice" className={styles.agentLink}>Ver acompanhamento</Link></div>
    </section>}
    {confirming && mode !== "agent" && <section className={styles.agentState} aria-label="Confirmar modo autônomo">
      <div><strong>Permitir respostas automáticas nesta conversa?</strong><p>Se a operação de SBC estiver ativa, a Alice poderá responder ao lead sem revisão prévia. Você pode voltar ao modo Manual a qualquer momento.</p></div>
      <div className={styles.agentActions}><button type="button" className={styles.agentButton} disabled={changingMode} onClick={async () => { await onChange("agent"); setConfirming(false); }}><Bot size={16} aria-hidden="true" /> Ativar nesta conversa</button><button type="button" className={styles.agentButton} disabled={changingMode} onClick={() => setConfirming(false)}>Cancelar</button></div>
    </section>}
  </>;
}
