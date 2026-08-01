import { NextResponse } from "next/server";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";
import { getInstancePresentationSettings } from "@/lib/whatsapp/instance-presentation";

// Lista leve das instâncias próprias ou compartilhadas explicitamente com o
// usuário. Não consulta o provedor e nunca concede acesso apenas por unidade.
export async function GET(req: Request) {
  try {
    const requesterId = req.headers.get("x-user-id") || "";
    const requesterName = req.headers.get("x-user-name") || "Usuário";
    if (!requesterId) {
      return NextResponse.json({ error: "Usuário não identificado" }, { status: 401 });
    }

    const [{ instances }, presentation] = await Promise.all([
      getInstancesForRequest(req),
      getInstancePresentationSettings(),
    ]);
    const accessibleInstances = instances.filter((instance) => instance.status !== "archived");

    return NextResponse.json({
      instances: accessibleInstances.map((instance) => ({
        id: instance.id,
        instanceName: instance.name,
        status: instance.status,
        phone: instance.phoneNumber,
        unit: instance.unit || "Todas",
        userId: requesterId,
        userName: requesterName,
        displayName: presentation.displayNames[instance.id] || null,
        channel: presentation.channels[instance.id] || "whatsapp",
        accessRole: instance.accessRole || "VIEWER",
        canReply: instance.canReply === true,
        canManage: instance.canManage === true,
        canReconnect: instance.canReconnect === true,
        isShared: instance.isShared === true,
      })),
    });
  } catch (error) {
    console.error("[WhatsApp Own Instances API Error]:", error);
    return NextResponse.json({ error: "Não foi possível carregar suas instâncias" }, { status: 500 });
  }
}
