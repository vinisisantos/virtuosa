import { Prisma, type LeadMemory } from "@prisma/client";
import { ALICE_AUTONOMY_INSTANCE_ID } from "@/lib/ai-assistant/autonomy/policy";
import { containsPersonalPresentation } from "@/lib/alice/presentation-filter";
import { resolveAiAssistantContactName } from "@/lib/ai-assistant/privacy";
import { aliceContinuityQuestionKeys, type AliceContinuityControls } from "@/lib/alice/context-controls";
import type { AliceMemoryScope } from "@/lib/alice/memory-input";

export type AliceContextMessage = {
  id: string; conversationId: string; body: string; type: string; fromMe: boolean;
  status: string; timestamp: Date; respondedByName: string | null;
};

export type AliceRegisteredAppointment = {
  conversationId: string; unidade: "SBC"; state: "AGENDADO" | "CONFIRMADO"; date: Date;
};

export type AliceContextInput = {
  scope: AliceMemoryScope;
  memory: LeadMemory | null;
  history: readonly AliceContextMessage[];
  knowledge: Prisma.InputJsonValue;
  campaignName: string | null;
  contactName: string | null;
  evaluationOptions: Prisma.InputJsonValue;
  appointment?: AliceRegisteredAppointment | null;
  targetMessageId?: string | null;
  autonomous?: boolean;
  now?: Date;
};

export class AliceContextError extends Error {
  readonly code: "invalid_scope" | "invalid_history" | "invalid_memory" | "invalid_appointment" | "presentation_unconfirmed" | "context_too_large";
  constructor(code: AliceContextError["code"]) {
    super(`alice_context_${code}`);
    this.name = "AliceContextError";
    this.code = code;
  }
}

const acceptedStatuses = new Set(["sent", "delivered", "read", "played"]);
const validDate = (date: unknown): date is Date => date instanceof Date && Number.isFinite(date.getTime());
const hasPresentation = (message: AliceContextMessage): boolean => message.fromMe && message.type === "text"
  && containsPersonalPresentation(message.body);

function orderedHistory(input: AliceContextInput): AliceContextMessage[] {
  const ids = new Set<string>();
  for (const message of input.history) {
    if (message.conversationId !== input.scope.conversationId) throw new AliceContextError("invalid_scope");
    if (!message.id || ids.has(message.id) || !validDate(message.timestamp) || typeof message.body !== "string"
      || typeof message.fromMe !== "boolean" || typeof message.type !== "string" || typeof message.status !== "string") throw new AliceContextError("invalid_history");
    ids.add(message.id);
  }
  return input.history.filter((message) => message.status !== "deleted").slice().sort((a, b) =>
    a.timestamp.getTime() - b.timestamp.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function memoryData(memory: LeadMemory | null): Prisma.InputJsonObject {
  if (!memory) return {};
  const data: Record<string, Prisma.InputJsonValue | null> = {};
  for (const key of ["nome", "campanhaOrigem", "procedimentoInteresse", "queixaPrincipal", "saudeObservacoes", "precoInformado", "resumo", "motivoEscalonamento"] as const) {
    if (memory[key]?.trim()) data[key] = memory[key];
  }
  data.nomeConfirmado = memory.nomeConfirmado;
  data.precoPerguntado = memory.precoPerguntado;
  data.escalarHumano = memory.escalarHumano;
  if (memory.primeiraVez !== null) data.primeiraVez = memory.primeiraVez;
  if (memory.nivelResultado !== "NAO_INFORMADO") data.nivelResultado = memory.nivelResultado;
  if (memory.objecoes.length) data.objecoes = [...memory.objecoes];
  if (memory.perguntasFeitas.length) data.perguntasFeitas = [...memory.perguntasFeitas];
  // Etapa/data na memória não são prova de agendamento; só o registro atual é usado.
  return data;
}

function dialogueMessage(message: AliceContextMessage): Prisma.InputJsonObject {
  const labels: Record<string, string> = { image: "IMAGEM", audio: "ÁUDIO", ptt: "ÁUDIO", video: "VÍDEO", document: "DOCUMENTO", sticker: "FIGURINHA" };
  const caption = /^data:[^;,]+;base64,/i.test(message.body) ? "" : message.body;
  return {
    role: message.fromMe ? "atendente" : "cliente",
    text: message.type === "text" ? message.body : `[${labels[message.type] || "ANEXO"}]${caption ? `\n${caption}` : ""}`,
    timestamp: message.timestamp.toISOString(), author: message.fromMe ? message.respondedByName : null,
  };
}

/** Construtor puro: recebe dados do backend já autorizados; não consulta, grava ou chama modelos. */
export function buildAliceContext(input: AliceContextInput): Prisma.InputJsonObject {
  if (input.scope.unidade !== "SBC" || input.scope.instanceId !== ALICE_AUTONOMY_INSTANCE_ID
    || !input.scope.conversationId) throw new AliceContextError("invalid_scope");
  const now = input.now || new Date();
  if (!validDate(now)) throw new AliceContextError("invalid_history");
  const memory = input.memory;
  if (memory && (memory.conversationId !== input.scope.conversationId || memory.unidade !== "SBC")) throw new AliceContextError("invalid_scope");
  if (memory?.apresentacaoFeitaEm && (!validDate(memory.apresentacaoFeitaEm) || memory.apresentacaoFeitaEm > now)) throw new AliceContextError("invalid_memory");
  const history = orderedHistory(input);
  const accepted = history.filter((message) => !message.fromMe || acceptedStatuses.has(message.status));
  const rawPresentation = accepted.find(hasPresentation);
  const presentationAt = memory?.apresentacaoFeitaEm || rawPresentation?.timestamp || null;
  if (!presentationAt && history.some((message) => message.status === "pending" && hasPresentation(message))) throw new AliceContextError("presentation_unconfirmed");
  const customer = accepted.findLast((message) => !message.fromMe);
  if (!customer) throw new AliceContextError("invalid_history");
  const target = input.targetMessageId ? accepted.find((message) => message.id === input.targetMessageId && !message.fromMe) : null;
  if (input.targetMessageId && !target) throw new AliceContextError("invalid_history");
  const lastTeam = accepted.findLastIndex((message) => message.fromMe);
  const pending = accepted.slice(lastTeam + 1).filter((message) => !message.fromMe);
  const precedingTeam = accepted.filter((message) => message.fromMe && message.timestamp <= customer.timestamp).at(-1);
  const firstReturn = precedingTeam ? accepted.find((message) => !message.fromMe && message.timestamp > precedingTeam.timestamp) : null;
  const returnSeconds = firstReturn && precedingTeam ? Math.floor((firstReturn.timestamp.getTime() - precedingTeam.timestamp.getTime()) / 1_000) : null;
  const appointment = input.appointment;
  if (appointment && (appointment.conversationId !== input.scope.conversationId || appointment.unidade !== "SBC"
    || !["AGENDADO", "CONFIRMADO"].includes(appointment.state) || !validDate(appointment.date))) throw new AliceContextError("invalid_appointment");
  const name = [input.contactName, memory?.nome].find((value) => resolveAiAssistantContactName(value))?.trim() || null;
  const controls: AliceContinuityControls = {
    version: 1, presentationAt: presentationAt?.toISOString() || null, nameKnown: Boolean(name),
    complaintKnown: Boolean(memory?.queixaPrincipal?.trim()), firstTimeKnown: memory?.primeiraVez != null,
    resultLevelKnown: Boolean(memory && memory.nivelResultado !== "NAO_INFORMADO"),
    questionsAsked: aliceContinuityQuestionKeys(memory?.perguntasFeitas || []),
    returningAfter24h: returnSeconds !== null && returnSeconds > 86_400, appointmentRegistered: Boolean(appointment),
  };
  const dialogue = accepted.map(dialogueMessage);
  const prompt: Prisma.InputJsonObject = {
    BASE_ALICE: input.knowledge, UNIDADE: "SBC", CAMPANHA: input.campaignName || memory?.campanhaOrigem || "Não identificada",
    HORARIOS_SBC: input.evaluationOptions, CONTATO: { nomeSalvoDisponivel: Boolean(name), nome: name },
    MEMORIA_CLIENTE: memoryData(memory), CONTROLES_CONTINUIDADE_ALICE: { ...controls },
    TEMPO_CONVERSA: { agora: now.toISOString(), fusoHorario: "America/Sao_Paulo", ultimaMensagemClienteEm: customer.timestamp.toISOString(),
      aguardandoEquipeSegundos: Math.max(0, Math.floor((now.getTime() - customer.timestamp.getTime()) / 1_000)),
      retornoClienteAposSegundos: returnSeconds },
    DADOS_AGENDA_ATUAIS: appointment ? { estado: appointment.state, data: appointment.date.toISOString(),
      dataLocal: new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(appointment.date),
      futura: appointment.date > now } : null,
    MENSAGEM_ALVO: target ? { id: target.id, text: dialogueMessage(target).text } : null,
    ULTIMA_MENSAGEM_CLIENTE: { id: customer.id, text: dialogueMessage(customer).text },
    MENSAGENS_RECENTES_SEM_RESPOSTA: pending.map((message) => ({ id: message.id, text: dialogueMessage(message).text })),
    HISTORICO_ANTERIOR: dialogue.slice(0, Math.max(0, dialogue.length - 12)), CONVERSA: dialogue.slice(-12),
    ...(input.autonomous ? { ATENDIMENTO_AUTONOMO: true } : {}),
  };
  if (Buffer.byteLength(JSON.stringify(prompt), "utf8") > 80_000) throw new AliceContextError("context_too_large");
  return prompt;
}
