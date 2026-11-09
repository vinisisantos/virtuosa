import { sbcConversationPresentation } from "@/lib/ai-assistant/conversation-presentation";
import { readAliceContextDialogue, readAliceContinuityControls } from "@/lib/alice/context-controls";

const normalize = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const volumeQuestion = "Me conta, você busca um ganho de volume médio ou grande, mais marcante?";

export function sbcGluteoConversationFlow(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const prompt = input as Record<string, unknown>;
  if (prompt.UNIDADE !== "SBC") return null;
  const dialogue = readAliceContextDialogue(input);
  const campaign = typeof prompt.CAMPANHA === "string" ? prompt.CAMPANHA : "";
  const lastClient = dialogue.findLast((item) => item.role === "cliente");
  if (!/\bgluteos?\b/u.test(normalize(campaign || lastClient?.text || ""))) return null;

  const team = dialogue.filter((item) => item.role === "atendente");
  const { introduced, introduction } = sbcConversationPresentation(input)!;
  const clientMessages = dialogue.filter((item) => item.role === "cliente");
  const preference = clientMessages.findLast((item) => {
    const text = normalize(item.text);
    return /\b(?:medio|moderado|grande|maior|marcante|discreto|pequeno|sutil|natural)\b/u.test(text)
      && (/\b(?:volum\w*|bumbum|resultado|ganho)\b/u.test(text) || /^(?:quero |prefiro |busco |um |mais |bem )*(?:medio|moderado|grande|maior|marcante|discreto|pequeno|sutil|natural)[.!\s]*$/u.test(text));
  });
  // Uma negação ou dúvida mais recente não confirma a preferência anterior.
  const volumeKnown = preference ? !/\b(?:nao|nem|talvez|duvida|ou)\b|\?/u.test(normalize(preference.text))
    : Boolean(readAliceContinuityControls(input)?.resultLevelKnown);
  const hasVolumeGoal = Boolean(preference || clientMessages.some((item) => /\b(?:volum\w*|aument\w*|projecao)\b/u.test(normalize(item.text))));
  const awaitingVolume = dialogue.at(-1)?.role === "atendente" && team.some((item) =>
    /\b(?:medio|moderado)\b/u.test(normalize(item.text)) && /\b(?:grande|maior|marcante)\b/u.test(normalize(item.text)) && /\?/u.test(item.text));
  const pending = Array.isArray(prompt.MENSAGENS_RECENTES_SEM_RESPOSTA) ? prompt.MENSAGENS_RECENTES_SEM_RESPOSTA : [];
  const target = prompt.MENSAGEM_ALVO && typeof prompt.MENSAGEM_ALVO === "object" ? prompt.MENSAGEM_ALVO : null;
  const questions = [...pending, ...(target ? [target] : [])]
    .map((item) => item && typeof item.text === "string" ? item.text : "");
  if (!questions.length) questions.push(lastClient?.text || "");
  const directQuestion = questions.some((text) => {
    const normalized = normalize(text);
    return /\b(?:preco|valor|quanto|custa|duracao|parcel\w*|marca|produto|composicao|como funciona)\b/u.test(normalized)
      || (/\?/u.test(normalized) && !/vim pel[oa]|mais informacoes sobre isso/u.test(normalized));
  });
  return { introduced, volumeKnown, needsVolumeDiscovery: hasVolumeGoal && !volumeKnown, awaitingVolume, directQuestion, introduction, volumeQuestion };
}

export function sbcGluteoFlowInstructions(input: unknown) {
  const flow = sbcGluteoConversationFlow(input);
  if (!flow) return null;
  return [
    "Fluxo específico de Glúteos em SBC, com prioridade sobre o convite genérico após a queixa.",
    "Uma recepção institucional automática não é apresentação pessoal da Alice. Considere apenas mensagens realmente enviadas pela equipe, nunca rascunhos.",
    flow.introduced ? "A Alice já se apresentou no contexto. Não se apresente novamente." : "A Alice ainda não se apresentou. A primeira mensagem deve apenas apresentá-la como atendente da Virtuosa, que dará seguimento ao atendimento. Use [pessoa] como vocativo, sem inventar nome.",
    flow.volumeKnown
      ? "A cliente já descreveu o volume desejado. Não pergunte novamente. Explique brevemente como a oferta documentada pode se relacionar ao volume e às demais queixas informadas, sem prometer resultado ou indicação individual; só depois dessa explicação convide para avaliação, se apropriado."
      : flow.needsVolumeDiscovery
        ? "O volume desejado ainda não foi informado. Primeiro pergunte se busca volume médio ou grande/mais marcante e aguarde a resposta. Não explique produto, marca, composição, benefícios ou quantidades e não convide para agendamento nesta etapa. Não volte a perguntar qual queixa priorizar quando ela já informou volume e flacidez."
        : "Ainda não foi informado interesse em ganho de volume. Não presuma esse objetivo; considere a queixa real da cliente e, se ela ainda não contou, pergunte o que deseja melhorar.",
    "Se houver pergunta direta, responda primeiro com a base aprovada sem ignorá-la; depois retome a etapa pendente sem convite prematuro. Encaminhamento clínico sempre prevalece.",
    "Quando apresentação e pergunta forem necessárias, retorne duas mensagens separadas em messages, para seleção e envio manual. Nunca inclua travessão ou dois-pontos artificiais.",
  ].join("\n");
}
