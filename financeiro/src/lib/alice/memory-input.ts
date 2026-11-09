import type { LeadMemoryResultLevel } from "@prisma/client";

export type AliceMemoryScope = { conversationId: string; instanceId: string; unidade: "SBC" };

// Agenda, envio, identificadores e unidade não podem vir no patch sugerido pelo modelo.
export type AliceMemoryUpdate = {
  nome?: string | null;
  nomeConfirmado?: boolean | null;
  campanhaOrigem?: string | null;
  procedimentoInteresse?: string | null;
  queixaPrincipal?: string | null;
  nivelResultado?: LeadMemoryResultLevel | null;
  primeiraVez?: boolean | null;
  saudeObservacoes?: string | null;
  precoPerguntado?: boolean | null;
  precoInformado?: string | null;
  objecoes?: readonly string[] | null;
  perguntasFeitas?: readonly string[] | null;
  resumo?: string | null;
  escalarHumano?: boolean | null;
  motivoEscalonamento?: string | null;
};

export class AliceMemoryError extends Error {
  readonly code: "invalid_scope" | "invalid_update" | "memory_unavailable" | "presentation_unproven" | "message_unproven";

  constructor(code: AliceMemoryError["code"]) {
    super(`alice_memory_${code}`);
    this.name = "AliceMemoryError";
    this.code = code;
  }
}

export const MEMORY_FIELDS = [
  { key: "nome", kind: "text" }, { key: "nomeConfirmado", kind: "boolean" },
  { key: "campanhaOrigem", kind: "origin" }, { key: "procedimentoInteresse", kind: "text" },
  { key: "queixaPrincipal", kind: "text" }, { key: "nivelResultado", kind: "level" },
  { key: "primeiraVez", kind: "boolean" }, { key: "saudeObservacoes", kind: "text" },
  { key: "precoPerguntado", kind: "boolean" }, { key: "precoInformado", kind: "text" },
  { key: "objecoes", kind: "list" }, { key: "perguntasFeitas", kind: "list" },
  { key: "resumo", kind: "text" }, { key: "escalarHumano", kind: "escalation" },
  { key: "motivoEscalonamento", kind: "text" },
] as const;

export type MemoryField = (typeof MEMORY_FIELDS)[number];
export type PreparedMemoryUpdate = Partial<Record<MemoryField["key"], string | boolean | string[]>>;

export function prepareMemoryUpdate(input: AliceMemoryUpdate): PreparedMemoryUpdate {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new AliceMemoryError("invalid_update");
  const keys = new Set<string>(MEMORY_FIELDS.map((field) => field.key));
  if (Object.keys(input).some((key) => !keys.has(key))) throw new AliceMemoryError("invalid_update");
  const patch: PreparedMemoryUpdate = {};
  for (const field of MEMORY_FIELDS) {
    if (!Object.hasOwn(input, field.key)) continue;
    const value = input[field.key];
    if (value == null) continue;
    if (field.kind === "list") {
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new AliceMemoryError("invalid_update");
      patch[field.key] = [...new Set(value.map((item) => item.trim()).filter(Boolean))];
    } else if (field.kind === "boolean" || field.kind === "escalation") {
      if (typeof value !== "boolean") throw new AliceMemoryError("invalid_update");
      patch[field.key] = value;
    } else {
      if (typeof value !== "string") throw new AliceMemoryError("invalid_update");
      if (!value.trim()) continue;
      if (field.kind === "level" && !["NATURAL", "MEDIO", "EVIDENTE", "NAO_INFORMADO"].includes(value)) throw new AliceMemoryError("invalid_update");
      if (field.key === "resumo" && [...value].length > 600) throw new AliceMemoryError("invalid_update");
      patch[field.key] = value;
    }
  }
  return patch;
}
