import type { EvaluationGroupConfirmationResult } from "@/lib/whatsapp/evaluation-group-status-notice";

export function groupNoticeFeedback(notice?: EvaluationGroupConfirmationResult, cancelled = false): { message: string; warning: boolean } {
  if (notice?.status === "queued") {
    return { message: `${cancelled ? "Cancelamento salvo" : "Confirmação salva"}. Aviso incluído na fila do grupo AVALIAÇÕES SBC. A entrega ainda não está confirmada; acompanhe em Automações.`, warning: false };
  }
  if (notice?.status === "already_recorded") {
    if (notice.state === "submitted") return { message: "Já existe um aviso aceito pelo provedor para esta data e horário. Nenhum reenvio foi feito. O aceite não comprova entrega; confira o histórico em Automações.", warning: false };
    if (notice.state === "queued" || notice.state === "processing") return { message: "Já existe um aviso na fila para esta data e horário. Nenhum aviso duplicado foi criado; acompanhe em Automações.", warning: false };
    return { message: "Já existe um aviso para esta data e horário que precisa de conferência no histórico de Automações. Nenhum reenvio automático foi feito.", warning: true };
  }
  const reasons: Record<string, string> = {
    unchanged: `A avaliação já estava ${cancelled ? "desmarcada" : "confirmada"}. Nenhum novo aviso ao grupo foi criado.`,
    not_confirmation: "Status salvo. Esta alteração não gera um aviso de confirmação ao grupo.",
    not_cancellation: "Status salvo. Esta alteração não gera um aviso de cancelamento ao grupo.",
    not_future_evaluation: "Status salvo, mas o aviso ao grupo exige uma avaliação de SBC com data e horário futuros.",
    disabled: `Status salvo, mas os avisos de ${cancelled ? "cancelamento" : "confirmação"} ao grupo estão desativados ou ainda não foram liberados.`,
    unverified_source: "Status salvo, mas não foi possível comprovar o vínculo desta avaliação com Leads - Paloma. Nenhum aviso ao grupo foi criado.",
    missing_name: "Status salvo, mas falta um nome válido no cadastro da avaliação. Nenhum aviso ao grupo foi criado.",
    invalid_phone: "Status salvo, mas falta um telefone válido no cadastro da avaliação. Nenhum aviso ao grupo foi criado.",
    missing_procedure: cancelled
      ? "Cancelamento salvo, mas falta o procedimento de interesse no cadastro. Nenhum aviso ao grupo foi criado."
      : "Confirme o procedimento de interesse para salvar a confirmação e gerar o aviso ao grupo.",
  };
  return { message: reasons[notice?.reason || ""] || "Status salvo, mas o resultado do aviso ao grupo não foi informado. Confira o histórico em Automações antes de tentar novamente.",
    warning: !["unchanged", "not_confirmation", "not_cancellation"].includes(notice?.reason || "") };
}
