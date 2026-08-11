import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";

function requesterId(req: Request) {
  return req.headers.get("x-user-id") || "";
}

async function canAccessInstance(req: Request, instanceId: string) {
  const accessUrl = new URL(req.url);
  accessUrl.searchParams.set("targetInstanceId", instanceId);
  const accessRequest = new Request(accessUrl, { headers: req.headers });
  const { instances } = await getInstancesForRequest(accessRequest);
  return instances.some((instance) => instance.id === instanceId);
}

export async function GET(req: Request) {
  try {
    const userId = requesterId(req);
    if (!userId) {
      return NextResponse.json({ error: "Usuário não identificado" }, { status: 401 });
    }

    const preferences = await prisma.whatsAppInstanceNotificationPreference.findMany({
      where: { userId, isMuted: true },
      select: { instanceId: true },
    });

    return NextResponse.json({
      mutedInstanceIds: preferences.map((preference) => preference.instanceId),
    });
  } catch (error) {
    console.error("[WhatsApp Notification Preferences GET]:", error);
    return NextResponse.json({ error: "Não foi possível carregar as preferências" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const userId = requesterId(req);
    if (!userId) {
      return NextResponse.json({ error: "Usuário não identificado" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const instanceId = typeof body?.instanceId === "string" ? body.instanceId.trim() : "";
    const muted = body?.muted;
    if (!instanceId || typeof muted !== "boolean") {
      return NextResponse.json({ error: "Instância e estado de silêncio são obrigatórios" }, { status: 400 });
    }

    if (!(await canAccessInstance(req, instanceId))) {
      return NextResponse.json({ error: "Instância não autorizada" }, { status: 403 });
    }

    if (muted) {
      await prisma.whatsAppInstanceNotificationPreference.upsert({
        where: { userId_instanceId: { userId, instanceId } },
        create: { userId, instanceId, isMuted: true },
        update: { isMuted: true },
      });
    } else {
      await prisma.whatsAppInstanceNotificationPreference.deleteMany({
        where: { userId, instanceId },
      });
    }

    return NextResponse.json({ instanceId, muted });
  } catch (error) {
    console.error("[WhatsApp Notification Preferences PATCH]:", error);
    return NextResponse.json({ error: "Não foi possível salvar a preferência" }, { status: 500 });
  }
}
