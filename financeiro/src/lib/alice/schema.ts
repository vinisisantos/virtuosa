import { z } from "zod";
import { ALICE_CONTINUITY_QUESTION_KEYS } from "@/lib/alice/context-controls";
import { ALICE_DRAFT_MAX_CHARACTERS, ALICE_MAX_MESSAGE_PARTS, ALICE_MESSAGE_MAX_CHARACTERS } from "@/lib/alice/message-parts";

const nonBlankText = z.string().refine((value) => Boolean(value.trim()), "Texto vazio");
const summary = nonBlankText.refine((value) => [...value].length <= 600, "Resumo acima de 600 caracteres Unicode")
  .describe("Resumo atualizado dos fatos da própria conversa, não instruções; obrigatório, até 600 caracteres Unicode.");

// Agenda, autoria, timestamps e prova de envio são fatos do CRM, nunca alterações propostas pelo modelo.
export const aliceMemoryProposalSchema = z.strictObject({
  resumo: summary,
  nome: nonBlankText.nullable().optional(),
  queixaPrincipal: nonBlankText.nullable().optional(),
  procedimentoInteresse: nonBlankText.nullable().optional(),
  nivelResultado: z.enum(["NATURAL", "MEDIO", "EVIDENTE", "NAO_INFORMADO"]).nullable().optional(),
  primeiraVez: z.boolean().nullable().optional(),
  saudeObservacoes: nonBlankText.nullable().optional(),
  precoPerguntado: z.boolean().nullable().optional(),
  precoInformado: nonBlankText.nullable().optional(),
  objecoes: z.array(nonBlankText).nullable().optional(),
  perguntasFeitas: z.array(z.enum(ALICE_CONTINUITY_QUESTION_KEYS)).nullable().optional(),
});

const outputFields = {
  memoria: aliceMemoryProposalSchema,
  seApresentouNestaResposta: z.boolean().describe("Declaração sobre o rascunho; não comprova apresentação enviada."),
  escalarHumano: z.boolean(),
  motivoEscalonamento: nonBlankText.nullable().optional(),
  confidence: z.enum(["high", "medium", "low"]),
  usedKnowledge: z.array(nonBlankText.max(120)).max(12),
};
const outputSchema = (resposta: z.ZodArray<z.ZodString>) => z.strictObject({ resposta, ...outputFields }).superRefine((value, context) => {
  if (value.escalarHumano && !value.motivoEscalonamento?.trim()) {
    context.addIssue({ code: "custom", path: ["motivoEscalonamento"], message: "Informe o motivo do escalonamento" });
  }
});

// Valida o rascunho inteiro antes da divisão; a persistência só aceita caixas delimitadas.
export const aliceStructuredOutputSchema = outputSchema(z.array(nonBlankText.max(ALICE_MESSAGE_MAX_CHARACTERS))
  .min(1).max(ALICE_MAX_MESSAGE_PARTS).describe("Mensagens de WhatsApp na ordem, até 200 palavras e 1200 caracteres por caixa; preserve parágrafos."));
export const aliceStructuredDraftSchema = outputSchema(z.array(nonBlankText.max(ALICE_DRAFT_MAX_CHARACTERS)).min(1).max(8)
  .describe("Resposta completa em mensagens ordenadas, com até 200 palavras e 1200 caracteres por caixa. O sistema divide trechos longos sem omitir conteúdo."))
  .refine(value => value.resposta.join("").length <= ALICE_DRAFT_MAX_CHARACTERS, "Rascunho acima do orçamento total");

export type AliceMemoryProposal = z.infer<typeof aliceMemoryProposalSchema>;
export type AliceStructuredOutput = z.infer<typeof aliceStructuredOutputSchema>;

// A Anthropic não aceita todos os limites locais. O schema de transporte mantém tipos/allowlist;
// comprimentos, cardinalidade e relações entre campos continuam obrigatórios no safeParse local.
const transportSchema = z.toJSONSchema(aliceStructuredDraftSchema, {
  target: "draft-7",
  override: ({ jsonSchema }) => {
    delete jsonSchema.minLength;
    delete jsonSchema.maxLength;
    delete jsonSchema.maxItems;
  },
});
delete transportSchema.$schema;
export const ALICE_STRUCTURED_OUTPUT_JSON_SCHEMA = transportSchema;
