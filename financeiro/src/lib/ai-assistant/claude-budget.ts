import { prisma } from "@/lib/db";
import { AiAssistantError } from "@/lib/ai-assistant/policy";
import { buildClaudeRequest, CLAUDE_MAX_OUTPUT_TOKENS } from "@/lib/ai-assistant/claude-provider";

const MONTHLY_LIMIT_MICRO_USD = 5_000_000;

export function claudeMonthlyReservation(input: unknown) {
  const bytes = Buffer.byteLength(JSON.stringify(buildClaudeRequest(input)), "utf8");
  if (bytes > 80_000) throw new AiAssistantError("O contexto da conversa ficou grande demais", 413);
  // Reserve one input token per byte plus protocol overhead, keeping the reservation on timeouts.
  return (bytes + 2_000) * 3 + CLAUDE_MAX_OUTPUT_TOKENS * 15;
}

export async function reserveClaudeMonthlyBudget(input: unknown, date = new Date()) {
  const reservation = claudeMonthlyReservation(input);
  const month = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(date);
  const key = `ai_assistant_claude_budget:${month}`;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    const setting = await tx.appSetting.findUnique({ where: { key }, select: { value: true } });
    let reserved = 0;
    if (setting) {
      try {
        const parsed = JSON.parse(setting.value);
        if (!Number.isSafeInteger(parsed.reserved) || parsed.reserved < 0) throw new Error("invalid");
        reserved = parsed.reserved;
      } catch {
        throw new AiAssistantError("Não foi possível verificar o limite do Claude", 503);
      }
    }
    if (reserved + reservation > MONTHLY_LIMIT_MICRO_USD) {
      throw new AiAssistantError("Limite mensal de US$ 5 do Claude atingido", 429);
    }
    await tx.appSetting.upsert({ where: { key }, create: { key, value: JSON.stringify({ reserved: reservation }) }, update: { value: JSON.stringify({ reserved: reserved + reservation }) } });
  }, { timeout: 10_000 });
}
