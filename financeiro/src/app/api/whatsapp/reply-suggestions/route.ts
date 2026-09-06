import { aiErrorResponse } from "@/lib/ai-inbox/access";
import { InboxAiError } from "@/lib/ai-inbox/policy";
import { applySuggestion, suggestReply } from "@/lib/ai-inbox/suggestions";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (
      typeof body.conversationId !== "string" ||
      body.conversationId.length > 100
    )
      throw new InboxAiError("Conversa inválida");
    if (body.action === "apply") {
      if (typeof body.operationId !== "string")
        throw new InboxAiError("Sugestão inválida");
      return Response.json(
        await applySuggestion(req, body.conversationId, body.operationId),
      );
    }
    if (body.action !== "generate") throw new InboxAiError("Ação inválida");
    return Response.json(await suggestReply(req, body.conversationId));
  } catch (error) {
    return aiErrorResponse(error);
  }
}
