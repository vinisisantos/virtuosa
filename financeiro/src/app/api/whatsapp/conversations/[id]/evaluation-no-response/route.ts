import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";
import { getEvaluationScheduleUnitConfig } from "@/lib/whatsapp/evaluation-schedule-confirmation-message";
import { sendEvaluationNoResponseReminder } from "@/lib/whatsapp/evaluation-no-response";

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const deadlineAt = Date.now() + 55000;
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;
  try {
    // O resolvedor recebe identidade verificada, nunca cabeçalhos fornecidos pelo cliente.
    const headers = new Headers(req.headers);
    for (const [key, value] of Object.entries({
      "x-user-id": auth.user.userId, "x-user-name": auth.user.name,
      "x-user-role": auth.user.role, "x-user-unit": auth.user.unit || "",
      "x-user-permissions": JSON.stringify(auth.user.permissions || {}),
    })) headers.set(key, value);
    const { instances } = await getInstancesForRequest(new Request(req.url, { headers }));
    const allowed = instances.filter(instance => instance.canReply === true
      && getEvaluationScheduleUnitConfig({ unit: instance.unit, instanceId: instance.id }));
    if (!allowed.length) return NextResponse.json({ error: "Sem permissão para enviar nesta caixa." }, { status: 403 });
    const { id } = await params;
    const conversation = await prisma.whatsAppConversation.findFirst({
      where: { id, instanceId: { in: allowed.map(instance => instance.id) } },
      select: { instanceId: true },
    });
    const instance = allowed.find(item => item.id === conversation?.instanceId);
    if (!instance) return NextResponse.json({ error: "Conversa não disponível nesta caixa." }, { status: 403 });
    const result = await sendEvaluationNoResponseReminder({
      conversationId: id, instanceId: instance.id, unit: instance.unit,
      actorId: auth.user.userId, actorName: auth.user.name || "Atendente",
    }, { deadlineAt });
    if (result.sent) return NextResponse.json({ status: "sent" });
    if (result.uncertain) return NextResponse.json({ error: "O resultado do envio ficou incerto. Confira o histórico da conversa antes de qualquer nova ação; o lembrete não será repetido." }, { status: 502 });
    const reason = "reason" in result ? result.reason : null;
    const error = reason === "disabled" ? "O envio de lembrete está desabilitado para esta unidade em Automações."
      : reason === "timeout" ? "Não foi possível concluir a verificação. Tente novamente."
      : "Lembrete não enviado. É necessário ter confirmação enviada há pelo menos o prazo configurado (padrão: 2 horas), avaliação pendente e futura, sem resposta e sem lembrete anterior. Confira também a conexão da caixa.";
    return NextResponse.json({ error }, { status: 409 });
  } catch (error) {
    console.error("[Evaluation no response manual]", error);
    return NextResponse.json({ error: "Não foi possível enviar o lembrete. Confira o histórico da conversa." }, { status: 500 });
  }
}
