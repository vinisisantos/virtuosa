export type AiReadinessOperationGroup = {
  status: string;
  draftOutcome: string | null;
  draftWasEdited: boolean | null;
  _count: { _all: number };
};

export type AiReadinessComponent = {
  key: string;
  label: string;
  score: number;
  maximum: number;
  formula: string;
  evidence: string;
};

export type AiReadinessSummary = {
  score: number;
  stage: string;
  decisionCount: number;
  sentCount: number;
  discardedCount: number;
  components: AiReadinessComponent[];
  evaluatedSince: string;
  autonomousAgentEnabled: false;
};

const DECISION_SAMPLE_TARGET = 30;
const APPROVED_KNOWLEDGE_TARGET = 10;

function points(value: number, maximum: number) {
  return Math.round(Math.max(0, Math.min(maximum, value)));
}

export function calculateAiReadiness(params: {
  approved: number;
  rejected: number;
  pending: number;
  operations: AiReadinessOperationGroup[];
  evaluatedSince: Date;
}): AiReadinessSummary {
  let completed = 0;
  let failed = 0;
  let sent = 0;
  let discarded = 0;
  let sentWithoutEdits = 0;

  for (const group of params.operations) {
    const count = group._count._all;
    if (group.status === "completed") completed += count;
    if (group.status === "failed") failed += count;
    if (group.draftOutcome === "sent") {
      sent += count;
      if (group.draftWasEdited === false) sentWithoutEdits += count;
    }
    if (group.draftOutcome === "discarded") discarded += count;
  }

  const decisions = sent + discarded;
  const reviewedCandidates = params.approved + params.rejected;
  const allCandidates = reviewedCandidates + params.pending;
  const completedOrFailed = completed + failed;
  const components: AiReadinessComponent[] = [
    {
      key: "sample",
      label: "Amostra de decisões humanas",
      score: points((decisions / DECISION_SAMPLE_TARGET) * 30, 30),
      maximum: 30,
      formula: "1 ponto por decisão humana, até 30 decisões",
      evidence: `${decisions} de ${DECISION_SAMPLE_TARGET} sugestões enviadas ou descartadas nos últimos 90 dias`,
    },
    {
      key: "adoption",
      label: "Aproveitamento das sugestões",
      score: decisions ? points((sent / decisions) * 20, 20) : 0,
      maximum: 20,
      formula: "proporção de sugestões enviadas entre enviadas e descartadas × 20",
      evidence: decisions ? `${sent} enviadas de ${decisions} decisões humanas` : "Ainda sem decisões humanas registradas",
    },
    {
      key: "fit",
      label: "Envios sem edição",
      score: sent ? points((sentWithoutEdits / sent) * 15, 15) : 0,
      maximum: 15,
      formula: "proporção de envios sem edição × 15",
      evidence: sent ? `${sentWithoutEdits} de ${sent} envios sem alteração do texto sugerido` : "Ainda sem sugestões enviadas",
    },
    {
      key: "knowledge",
      label: "Conhecimento validado",
      score: points((params.approved / APPROVED_KNOWLEDGE_TARGET) * 15, 15),
      maximum: 15,
      formula: "1,5 ponto por aprendizado aprovado, até 10",
      evidence: `${params.approved} aprendizados aprovados; meta indicativa de ${APPROVED_KNOWLEDGE_TARGET}`,
    },
    {
      key: "review",
      label: "Revisão dos aprendizados",
      score: allCandidates ? points((reviewedCandidates / allCandidates) * 10, 10) : 0,
      maximum: 10,
      formula: "proporção de candidatos aprovados ou rejeitados sobre todos os candidatos × 10",
      evidence: allCandidates ? `${reviewedCandidates} de ${allCandidates} candidatos revisados` : "Ainda sem candidatos de aprendizado",
    },
    {
      key: "reliability",
      label: "Conclusão das gerações",
      score: completedOrFailed ? points((completed / completedOrFailed) * 10, 10) : 0,
      maximum: 10,
      formula: "proporção de gerações concluídas entre concluídas e com falha × 10",
      evidence: completedOrFailed ? `${completed} concluídas e ${failed} com falha` : "Ainda sem histórico de gerações",
    },
  ];
  const score = components.reduce((total, component) => total + component.score, 0);
  const stage = decisions < 10
    ? "Amostra insuficiente"
    : score < 40
      ? "Evidência inicial"
      : score < 70
        ? "Evidência em formação"
        : score < 85
          ? "Histórico consistente"
          : "Sinal forte para avaliação humana";

  return {
    score,
    stage,
    decisionCount: decisions,
    sentCount: sent,
    discardedCount: discarded,
    components,
    evaluatedSince: params.evaluatedSince.toISOString(),
    autonomousAgentEnabled: false,
  };
}
