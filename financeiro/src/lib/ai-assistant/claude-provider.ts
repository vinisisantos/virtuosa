import { AiAssistantError } from "@/lib/ai-assistant/policy";
import { buildAliceAssistantRequest, parseGeneration, type AiAssistantUsage } from "@/lib/ai-assistant/provider";

export const CLAUDE_MODEL = "claude-sonnet-4-6";
export const CLAUDE_MAX_OUTPUT_TOKENS = 1024;

export function buildClaudeRequest(input: unknown) {
  const request = buildAliceAssistantRequest(input);
  return {
    model: CLAUDE_MODEL,
    max_tokens: CLAUDE_MAX_OUTPUT_TOKENS,
    system: request.instructions,
    messages: [{ role: "user", content: request.input }],
    output_config: { format: { type: "json_schema", schema: {
      type: "object", additionalProperties: false,
      properties: {
        response: { type: "string" }, messages: { type: "array", items: { type: "string" } }, confidence: { type: "string", enum: ["high", "medium", "low"] },
        needsHuman: { type: "boolean" }, usedKnowledge: { type: "array", items: { type: "string" } },
      },
      required: ["response", "messages", "confidence", "needsHuman", "usedKnowledge"],
    } } },
  };
}

export async function generateClaudeReply(input: unknown, usage: AiAssistantUsage) {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new AiAssistantError("A conexão com Claude não está configurada", 503);
  const payload = JSON.stringify(buildClaudeRequest(input));
  if (Buffer.byteLength(payload, "utf8") > 80_000) {
    throw new AiAssistantError("O contexto da conversa ficou grande demais", 413);
  }
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: payload,
    cache: "no-store",
    signal: AbortSignal.timeout(48_000),
  });
  if (!response.ok) throw new AiAssistantError("O Claude não concluiu a sugestão", 502);
  const result = await response.json();
  usage.input += Number(result.usage?.input_tokens || 0);
  usage.output += Number(result.usage?.output_tokens || 0);
  const text = Array.isArray(result.content)
    ? result.content.filter((block: { type?: string }) => block.type === "text").map((block: { text?: string }) => block.text || "").join("")
    : "";
  try {
    return parseGeneration(JSON.parse(text));
  } catch (error) {
    if (error instanceof AiAssistantError) throw error;
    throw new AiAssistantError("O Claude devolveu uma sugestão inválida", 502);
  }
}
