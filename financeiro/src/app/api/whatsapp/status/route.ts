import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const getEvolutionConfig = () => ({
  url: process.env.EVOLUTION_API_URL || "http://localhost:8080",
  apiKey: process.env.EVOLUTION_API_KEY || "",
});

// GET — Consultar status da instância
export async function GET(req: Request) {
  const { url, apiKey } = getEvolutionConfig();
  try {
    const dbInstance = await prisma.whatsAppInstance.findFirst({
      where: { name: "virtuosa-main" },
    });

    if (!dbInstance) {
      return NextResponse.json({ status: "disconnected" });
    }

    // Evolution API v2: GET /instance/connectionState/{instanceName}
    const statusRes = await fetch(`${url}/instance/connectionState/virtuosa-main`, {
      method: "GET",
      headers: { "apikey": apiKey },
    });

    const statusData = await statusRes.json();
    if (statusRes.ok) {
      // Evolution retorna { instance: { instanceName, state: "open"|"close"|"connecting" } }
      const state = statusData.instance?.state || statusData.state || "close";
      const newStatus = state === "open" ? "connected" : state === "connecting" ? "connecting" : "disconnected";

      if (newStatus !== dbInstance.status) {
        await prisma.whatsAppInstance.update({
          where: { id: dbInstance.id },
          data: { status: newStatus },
        });
      }

      // Buscar info do perfil via fetchInstances
      let profilePicUrl = null;
      let profileName = null;
      let phone = null;

      try {
        const infoRes = await fetch(`${url}/instance/fetchInstances?instanceName=virtuosa-main`, {
          method: "GET",
          headers: { "apikey": apiKey },
        });
        const infoData = await infoRes.json();
        const inst = Array.isArray(infoData) ? infoData[0] : infoData;
        profilePicUrl = inst?.instance?.profilePicUrl || inst?.profilePicUrl || null;
        profileName = inst?.instance?.profileName || inst?.profileName || null;
        phone = inst?.instance?.owner?.split("@")?.[0] || null;
      } catch (e) {
        // ignora erro ao buscar perfil
      }

      return NextResponse.json({
        status: newStatus,
        qrcode: dbInstance.qrcode,
        profilePicUrl,
        profileName,
        phone,
      });
    }

    return NextResponse.json({ status: dbInstance.status });

  } catch (error: any) {
    console.error("[WhatsApp Status API Error]:", error);
    return NextResponse.json({ error: "Erro interno", details: error.message }, { status: 500 });
  }
}

// DELETE — Desconectar instância
export async function DELETE(req: Request) {
  const { url, apiKey } = getEvolutionConfig();
  try {
    const dbInstance = await prisma.whatsAppInstance.findFirst({
      where: { name: "virtuosa-main" },
    });

    if (!dbInstance) {
      return NextResponse.json({ success: true });
    }

    // Evolution API v2: DELETE /instance/logout/{instanceName}
    await fetch(`${url}/instance/logout/virtuosa-main`, {
      method: "DELETE",
      headers: { "apikey": apiKey },
    });

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
