import { ALICE_AUTONOMY_DELAY_MS } from "@/lib/ai-assistant/autonomy/policy";

type Message = {
  id: string; fromMe: boolean; type: string; body: string; timestamp: Date; createdAt?: Date;
};

export const ALICE_UNREAD_MEDIA_INSTRUCTION = "O conteúdo visual dos anexos não foi interpretado. Responda somente ao pedido textual identificado. Não afirme ter visto a imagem, não extraia valores, resultados ou condições de saúde dela. Se a resposta depender da imagem, peça uma descrição textual antes de prosseguir.";

/** A mídia mantém o ID da fonte para os locks; o texto do mesmo conjunto apenas permite responder ao pedido. */
export function aliceMediaTextContext(history: readonly Message[], sourceMessageId: string) {
  const sourceIndex = history.findLastIndex((message) => !message.fromMe);
  const source = history[sourceIndex];
  if (!source || source.id !== sourceMessageId || source.type === "text") return null;
  const attachments: string[] = [];
  for (let index = sourceIndex; index >= 0; index--) {
    const message = history[index];
    const age = source.timestamp.getTime() - message.timestamp.getTime();
    const ingestionAge = source.createdAt && message.createdAt
      ? source.createdAt.getTime() - message.createdAt.getTime() : age;
    if (message.fromMe || !Number.isFinite(age) || age < 0 || age > ALICE_AUTONOMY_DELAY_MS
      || !Number.isFinite(ingestionAge) || ingestionAge < 0 || ingestionAge > ALICE_AUTONOMY_DELAY_MS) return null;
    if (message.type === "text" && message.body.trim()) {
      return { textMessageId: message.id, attachmentMessageIds: attachments,
        instruction: ALICE_UNREAD_MEDIA_INSTRUCTION };
    }
    if (message.body.trim() || (message.type !== "image" && message.type !== "associatedChildMessage")) return null;
    attachments.unshift(message.id);
  }
  return null;
}
