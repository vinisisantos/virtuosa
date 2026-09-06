import { prisma } from "@/lib/db";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";
import { CONFIG_KEY, InboxAiError, parseConfig } from "./policy";

export async function pilotConfig() {
  if (process.env.AI_INBOX_SCS_ENABLED !== "true")
    throw new InboxAiError("O piloto de IA de SCS ainda não está ativo", 503);
  const setting = await prisma.appSetting.findUnique({
    where: { key: CONFIG_KEY },
    select: { value: true },
  });
  const config = parseConfig(setting?.value);
  if (!config.enabled || !config.instanceIds.length)
    throw new InboxAiError("O piloto de IA está pausado", 503);
  return config;
}

export async function requirePilotAccess(
  req: Request,
  conversationId?: string,
  mode: "suggest" | "knowledge" = "suggest",
) {
  const userId = req.headers.get("x-user-id");
  if (!userId) throw new InboxAiError("Não autorizado", 401);
  const [config, user] = await Promise.all([
    pilotConfig(),
    prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true, role: true, unit: true, permissions: true },
    }),
  ]);
  if (!user?.isActive) throw new InboxAiError("Acesso revogado", 403);
  // Refresh authorization claims so a role change takes effect before a new
  // suggestion, even while the browser still holds its previous JWT.
  const headers = new Headers(req.headers);
  headers.set("x-user-role", user.role);
  headers.set("x-user-unit", user.unit || "");
  headers.set("x-user-permissions", JSON.stringify(user.permissions || {}));
  const scope = await getInstancesForRequest(new Request(req.url, { headers }));
  const ids: string[] = scope.instances
    .filter(
      (i) =>
        i.unit === "SCS" &&
        i.status !== "archived" &&
        (i.canReply === true ||
          (mode === "knowledge" &&
            config.reviewerIds.includes(userId) &&
            i.canView === true)) &&
        config.instanceIds.includes(i.id),
    )
    .map((i) => i.id);
  if (!ids.length)
    throw new InboxAiError("Sem permissão para o piloto desta caixa", 403);
  if (conversationId) {
    const conv = await prisma.whatsAppConversation.findFirst({
      where: {
        id: conversationId,
        instanceId: { in: ids },
        blockedAt: null,
        archivedAt: null,
        status: { not: "closed" },
      },
      select: { id: true },
    });
    if (!conv)
      throw new InboxAiError("Conversa indisponível ou sem permissão", 404);
  }
  return {
    config,
    userId,
    instanceIds: ids,
    canReview: config.reviewerIds.includes(userId),
    canReviewClinical: config.clinicalReviewerIds.includes(userId),
  };
}

export function aiErrorResponse(error: unknown) {
  if (error instanceof InboxAiError)
    return Response.json({ error: error.message }, { status: error.status });
  // Never return provider payloads, prompts, database details or credentials.
  console.error(
    "[AI Inbox] operação falhou",
    error instanceof Error ? error.name : "UnknownError",
  );
  return Response.json(
    { error: "Não foi possível concluir. O envio manual continua disponível." },
    { status: 503 },
  );
}
