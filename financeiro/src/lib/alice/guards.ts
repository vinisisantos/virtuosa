import type { AliceRegisteredAppointment } from "@/lib/alice/build-context";
import type { AliceMemoryScope } from "@/lib/alice/memory-input";
import { aliceStructuredOutputSchema, type AliceStructuredOutput } from "@/lib/alice/schema";
import { containsPersonalPresentation, stripRepeatedPresentation } from "@/lib/alice/presentation-filter";
import { ALICE_AUTONOMY_INSTANCE_ID, aliceAutonomyResponseClaimsBooking, aliceHumanReviewReason, type AliceHumanReviewReason } from "@/lib/ai-assistant/autonomy/policy";
import { validateAliceFearReply, type AliceFearPolicy, type AliceFearViolation } from "@/lib/alice/fear-policy";
import { ALICE_MESSAGE_MAX_WORDS } from "@/lib/alice/message-parts";

export type AliceGuardContext = {
  scope: AliceMemoryScope; presentationAt: Date | null;
  appointment: AliceRegisteredAppointment | null; contactName: string | null; fear?: AliceFearPolicy | null;
};
export type AliceGuardFailure = "invalid_context" | "invalid_proposal" | "presentation_not_separable" | "internal_content" | "word_limit" | "price_after_booking" | "human_review" | "unproven_booking" | AliceFearViolation | AliceHumanReviewReason;
export type AliceGuardEvent = { code: AliceGuardFailure | "presentation_removed" | "markdown_normalized" | "presentation_flag_corrected"; messageIndex?: number };
export type AliceGuardDecision =
  | { status: "ready"; proposal: AliceStructuredOutput; events: AliceGuardEvent[] }
  | { status: "handoff"; reason: AliceGuardFailure; proposal: null; events: AliceGuardEvent[] }
  | { status: "skip"; reason: "empty_after_guard"; proposal: null; events: AliceGuardEvent[] };

const validDate = (value: unknown): value is Date => value instanceof Date && Number.isFinite(value.getTime());

function validContext(context: AliceGuardContext): boolean {
  if (!context?.scope || context.scope.unidade !== "SBC" || context.scope.instanceId !== ALICE_AUTONOMY_INSTANCE_ID
    || typeof context.scope.conversationId !== "string" || !context.scope.conversationId.trim()
    || !(context.presentationAt === null || validDate(context.presentationAt))
    || !(context.contactName === null || typeof context.contactName === "string")) return false;
  const appointment = context.appointment;
  return appointment === null || Boolean(appointment && appointment.conversationId === context.scope.conversationId
    && appointment.unidade === "SBC" && ["AGENDADO", "CONFIRMADO"].includes(appointment.state) && validDate(appointment.date));
}

// Decisão pura. A integração deve usá-la após toda formatação e antes de qualquer envio.
export function guardAliceReply(proposal: unknown, context: AliceGuardContext): AliceGuardDecision {
  if (!validContext(context)) return { status: "handoff", reason: "invalid_context", proposal: null, events: [{ code: "invalid_context" }] };
  const parsed = aliceStructuredOutputSchema.safeParse(proposal);
  if (!parsed.success) return { status: "handoff", reason: "invalid_proposal", proposal: null, events: [{ code: "invalid_proposal" }] };
  const reviewReason = aliceHumanReviewReason(parsed.data);
  if (reviewReason) return { status: "handoff", reason: reviewReason, proposal: null, events: [{ code: reviewReason }] };
  const events: AliceGuardEvent[] = [];
  const messages: string[] = [];
  // Verifica o lote original antes de apagar apresentações: conteúdo interno não pode ser ocultado pela limpeza.
  for (const [messageIndex, message] of parsed.data.resposta.entries()) {
    const checked = message.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase()
      .replace(/[\p{Cf}*_~`]/gu, "").replace(/\s+/gu, " ");
    if (/voce pode responder assim|vale responder|parece que nao entendeu|your trial has ended|upgrade to|\[\s*nota|[{}]/u.test(checked)) {
      return { status: "handoff", reason: "internal_content", proposal: null, events: [{ code: "internal_content", messageIndex }] };
    }
    if (context.appointment && /r\s*\$/u.test(checked)) return { status: "handoff", reason: "price_after_booking", proposal: null,
      events: [{ code: "price_after_booking", messageIndex }] };
  }
  for (const [messageIndex, message] of parsed.data.resposta.entries()) {
    const filtered = context.presentationAt ? stripRepeatedPresentation(message, context.contactName) : { text: message, removed: false, ambiguous: false };
    if (filtered.ambiguous) return { status: "handoff", reason: "presentation_not_separable", proposal: null, events: [...events, { code: "presentation_not_separable", messageIndex }] };
    if (filtered.removed) events.push({ code: "presentation_removed", messageIndex });
    const formatted = filtered.text.replace(/\*\*([^*]+)\*\*/gu, "*$1*");
    if (formatted !== filtered.text) events.push({ code: "markdown_normalized", messageIndex });
    if (formatted.trim().split(/\s+/u).length > ALICE_MESSAGE_MAX_WORDS) return { status: "handoff", reason: "word_limit", proposal: null,
      events: [...events, { code: "word_limit", messageIndex }] };
    if (formatted) messages.push(formatted);
  }
  if (!messages.length) return { status: "skip", reason: "empty_after_guard", proposal: null, events };
  const fearViolation = validateAliceFearReply(messages, context.fear || null, context.contactName);
  if (fearViolation) return { status: "handoff", reason: fearViolation, proposal: null, events: [...events, { code: fearViolation }] };
  if (aliceAutonomyResponseClaimsBooking(messages)) return { status: "handoff", reason: "unproven_booking", proposal: null, events: [...events, { code: "unproven_booking" }] };
  const presented = messages.some(containsPersonalPresentation);
  if (presented !== parsed.data.seApresentouNestaResposta) events.push({ code: "presentation_flag_corrected" });
  return { status: "ready", proposal: { ...parsed.data, resposta: messages,
    seApresentouNestaResposta: presented }, events };
}
