import { NextRequest, NextResponse } from "next/server";

import {
  createConversationForInstance,
  findConversationByPhone,
} from "@/lib/whatsapp/conversation-starter";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";
import {
  checkWhatsAppNumber,
  isValidWhatsAppNumber,
  normalizeWhatsAppNumber,
  WhatsAppNumberCheckError,
} from "@/lib/whatsapp/number-check";

type NewConversationAction = "check" | "create";

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action: NewConversationAction = body.action === "create" ? "create" : "check";
    const rawNumber = typeof body.number === "string" ? body.number : "";
    const number = normalizeWhatsAppNumber(rawNumber);
    const contactName = cleanName(body.name);

    if (!isValidWhatsAppNumber(number)) {
      return NextResponse.json({ error: "Informe um número válido com DDI e DDD." }, { status: 400 });
    }

    const { instances } = await getInstancesForRequest(req);
    const operationalInstances = instances.filter((instance) => instance.status !== "archived");
    const instance = operationalInstances.find((item) => item.status === "connected");

    if (!instance) {
      const hasInstance = operationalInstances.length > 0;
      return NextResponse.json(
        {
          error: hasInstance
            ? "Este WhatsApp está desconectado. Reconecte antes de verificar o número."
            : "Nenhuma instância de WhatsApp está disponível para este Inbox.",
        },
        { status: hasInstance ? 409 : 404 },
      );
    }

    const checked = await checkWhatsAppNumber(instance, number);
    if (!checked.exists) {
      return NextResponse.json(
        {
          exists: false,
          number: checked.number || number,
          error: "Este número não possui uma conta de WhatsApp.",
        },
        { status: action === "create" ? 422 : 200 },
      );
    }

    const existingConversation = await findConversationByPhone({
      phone: checked.number || number,
      instanceIds: [instance.id],
    });

    if (action === "check") {
      return NextResponse.json({
        exists: true,
        number: checked.number || number,
        jid: checked.jid,
        instanceId: instance.id,
        instanceName: instance.name,
        conversationId: existingConversation?.id || null,
        alreadyExists: !!existingConversation,
      });
    }

    const conversation = await createConversationForInstance({
      instanceId: instance.id,
      phone: checked.number || number,
      contactName,
      unit: instance.unit,
      lastKnownJid: checked.jid,
    });

    return NextResponse.json({
      success: true,
      created: !existingConversation,
      conversation,
    });
  } catch (error) {
    if (error instanceof WhatsAppNumberCheckError) {
      console.error("[WhatsApp Number Check]", error.message);
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return NextResponse.json(
        {
          error: "Não foi possível verificar este número agora. Tente novamente em instantes.",
          details: error.message,
        },
        { status },
      );
    }

    console.error("[WhatsApp New Conversation]", error);
    return NextResponse.json(
      { error: "Não foi possível iniciar a conversa." },
      { status: 500 },
    );
  }
}
