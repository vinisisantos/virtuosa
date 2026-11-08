import { Prisma, type AiAssistantDraft } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AiAssistantError } from "@/lib/ai-assistant/policy";

export async function saveAliceDraft(params: {
  current: Pick<AiAssistantDraft, "id" | "version" | "updatedAt"> | null;
  create: Prisma.AiAssistantDraftUncheckedCreateInput;
  update: Prisma.AiAssistantDraftUpdateManyMutationInput;
}) {
  if (!params.current) {
    try {
      return await prisma.aiAssistantDraft.create({ data: params.create });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AiAssistantError("Outra sugestão foi gerada nesta conversa. Atualize antes de continuar.", 409);
      }
      throw error;
    }
  }
  const current = params.current;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.aiAssistantDraft.updateMany({
      where: { id: current.id, version: current.version, updatedAt: current.updatedAt },
      data: params.update,
    });
    if (!updated.count) throw new AiAssistantError("Outra sugestão foi alterada nesta conversa. Atualize antes de continuar.", 409);
    return tx.aiAssistantDraft.findUniqueOrThrow({ where: { id: current.id } });
  });
}
