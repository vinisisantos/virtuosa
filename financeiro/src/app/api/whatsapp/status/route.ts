import { NextResponse } from "next/server";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";
import {
  deleteWahaSession,
  getInstanceProvider,
  getWahaQr,
  getWahaSession,
  logoutWahaSession,
  normalizeWahaStatus,
} from "@/lib/whatsapp/provider";

import { prisma } from "@/lib/db";

const getEvolutionConfig = () => ({
  url: process.env.EVOLUTION_API_URL || "http://localhost:8080",
  apiKey: process.env.EVOLUTION_API_KEY || "",
});

function normalizeStatus(status?: string | null) {
  const normalized = (status || "disconnected").toLowerCase();
  if (["open", "connected", "connection.open"].includes(normalized)) return "connected";
  if (["connecting", "qrcode", "qr", "pairing"].includes(normalized)) return "connecting";
  if (["close", "closed", "disconnected", "logout", "removed"].includes(normalized)) return "disconnected";
  return normalized;
}

// GET — Consultar status das instâncias do usuário
export async function GET(req: Request) {
  const { url, apiKey } = getEvolutionConfig();
  try {
    const { instances: dbInstances } = await getInstancesForRequest(req);
    const operationalInstances = dbInstances.filter((instance) => instance.status !== "archived");

    if (!operationalInstances || operationalInstances.length === 0) {
      return NextResponse.json({ instances: [] });
    }

    const instancesStatus = await Promise.all(operationalInstances.map(async (dbInstance) => {
      const instanceName = dbInstance.name;
      const provider = getInstanceProvider(dbInstance);
      let newStatus = dbInstance.status;
      let qrcode = dbInstance.qrcode;
      let profilePicUrl = null;
      let profileName = null;
      let phone = null;

      try {
        if (provider === "waha") {
          const session = await getWahaSession(instanceName);
          newStatus = normalizeWahaStatus(session?.status);
          profileName = session?.me?.pushName || null;
          phone = session?.me?.id?.split("@")?.[0] || null;
          if (newStatus === "connected") {
            qrcode = null;
          } else if (newStatus === "connecting") {
            qrcode = await getWahaQr(instanceName).catch(() => qrcode);
          }

          if (newStatus !== dbInstance.status || qrcode !== dbInstance.qrcode || phone !== dbInstance.phoneNumber) {
            await prisma.whatsAppInstance.update({
              where: { id: dbInstance.id },
              data: { status: newStatus, qrcode, phoneNumber: phone || dbInstance.phoneNumber },
            });
          }
        } else {
          const statusRes = await fetch(`${url}/instance/connectionState/${instanceName}`, {
            method: "GET",
            headers: { "apikey": apiKey },
          });

          if (statusRes.ok) {
            const statusData = await statusRes.json();
            const state = statusData.instance?.state || statusData.instance?.status || statusData.state || statusData.status || "close";
            newStatus = normalizeStatus(state);

            if (newStatus === "connected" || newStatus === "disconnected") {
              qrcode = null;
            }

            if (newStatus !== dbInstance.status || qrcode !== dbInstance.qrcode) {
              await prisma.whatsAppInstance.update({
                where: { id: dbInstance.id },
                data: { status: newStatus, qrcode },
              });
            }

            if (newStatus === "connected") {
              try {
                const infoRes = await fetch(`${url}/instance/fetchInstances?instanceName=${instanceName}`, {
                  method: "GET",
                  headers: { "apikey": apiKey },
                });
                const infoData = await infoRes.json();
                const inst = Array.isArray(infoData) ? infoData[0] : infoData;
                profilePicUrl = inst?.instance?.profilePicUrl || inst?.profilePicUrl || null;
                profileName = inst?.instance?.profileName || inst?.profileName || null;
                phone = inst?.instance?.owner?.split("@")?.[0] || null;
              } catch (e) {}
            }
          } else if ([400, 404, 410].includes(statusRes.status)) {
            newStatus = "disconnected";
            qrcode = null;

            if (dbInstance.status !== "disconnected" || dbInstance.qrcode) {
              await prisma.whatsAppInstance.update({
                where: { id: dbInstance.id },
                data: { status: newStatus, qrcode: null },
              });
              await prisma.webhookLog.create({
                data: {
                  source: "whatsapp_evolution",
                  eventType: "connection_state_missing",
                  status: "warning",
                  payload: JSON.stringify({
                    instanceId: dbInstance.id,
                    instanceName,
                    provider,
                    previousStatus: dbInstance.status,
                    responseStatus: statusRes.status,
                  }).slice(0, 2000),
                  errorMessage: "Evolution não encontrou a instância ao consultar connectionState",
                },
              }).catch(() => {});
            }
          }
        }
      } catch (e) {}

      return {
        id: dbInstance.id,
        name: dbInstance.name,
        provider,
        unit: dbInstance.unit,
        userId: dbInstance.userId,
        status: newStatus,
        qrcode,
        profilePicUrl,
        profileName,
        phone,
      };
    }));

    return NextResponse.json({ instances: instancesStatus });

  } catch (error: any) {
    console.error("[WhatsApp Status API Error]:", error);
    return NextResponse.json({ error: "Erro interno", details: error.message }, { status: 500 });
  }
}

// DELETE — Desconectar instância (somente própria ou admin)
export async function DELETE(req: Request) {
  const { url, apiKey } = getEvolutionConfig();
  try {
    const { searchParams } = new URL(req.url);
    const instanceId = searchParams.get("instanceId");
    const removeInstance = searchParams.get("remove") === "true";
    const userRole = req.headers.get("x-user-role");

    const { instances: dbInstances, isProxy } = await getInstancesForRequest(req);
    const operationalInstances = dbInstances.filter((instance) => instance.status !== "archived");

    if (!operationalInstances || operationalInstances.length === 0) {
      return NextResponse.json({ success: true });
    }

    let dbInstance = null;
    if (instanceId) {
      dbInstance = operationalInstances.find(i => i.id === instanceId);
    } else {
      // Compatibilidade retroativa, deletar a primeira
      dbInstance = operationalInstances[0];
    }

    if (!dbInstance) {
      return NextResponse.json({ error: "Instância não encontrada" }, { status: 404 });
    }

    // Somente o dono ou admin com alvo explicito pode desconectar/remover.
    if (isProxy && userRole !== "ADMINISTRADOR") {
      return NextResponse.json({ error: "Apenas o dono da instância pode desconectar" }, { status: 403 });
    }

    const instanceName = dbInstance.name;
    const provider = getInstanceProvider(dbInstance);

    if (removeInstance) {
      try {
        if (provider === "waha") {
          await deleteWahaSession(instanceName);
        } else {
          await fetch(`${url}/instance/delete/${instanceName}`, {
            method: "DELETE",
            headers: { "apikey": apiKey },
          });
        }
      } catch {}

      // Remove da operação sem apagar conversas históricas ligadas à instância.
      // Como conversas têm cascade, delete físico apagaria o histórico junto.
      await prisma.whatsAppInstance.update({
        where: { id: dbInstance.id },
        data: { status: "archived", qrcode: null },
      });

      return NextResponse.json({ success: true, removed: true });
    }

    // Evolution API v2: DELETE /instance/logout/{instanceName}
    if (provider === "waha") {
      await logoutWahaSession(instanceName).catch(() => null);
    } else {
      await fetch(`${url}/instance/logout/${instanceName}`, {
        method: "DELETE",
        headers: { "apikey": apiKey },
      });
    }

    // Marca como desconectada (NÃO deletamos o registro: as conversas têm
    // onDelete Cascade e seriam apagadas junto). O /crm/diagnostico passa a
    // listar só instâncias conectadas, então a desconectada some da lista —
    // sem perder histórico — e reaparece se reconectar.
    await prisma.whatsAppInstance.update({
      where: { id: dbInstance.id },
      data: { status: "disconnected", qrcode: null },
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("[WhatsApp Disconnect API Error]:", error);
    return NextResponse.json({ error: "Erro interno", details: error.message }, { status: 500 });
  }
}
