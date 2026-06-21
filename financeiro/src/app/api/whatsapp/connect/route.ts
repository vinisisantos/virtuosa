import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const getEvolutionConfig = () => ({
  url: process.env.EVOLUTION_API_URL || "http://localhost:8080",
  apiKey: process.env.EVOLUTION_API_KEY || "",
});

export async function POST(req: Request) {
  const { url, apiKey } = getEvolutionConfig();

  try {
    // 1. Buscar instância no banco
    let dbInstance = await prisma.whatsAppInstance.findFirst({
      where: { name: "virtuosa-main" },
    });

    // 2. Se não existir, criar na Evolution API
    if (!dbInstance) {
      if (!apiKey) {
        return NextResponse.json({ error: "EVOLUTION_API_KEY não configurada" }, { status: 500 });
      }

      const createRes = await fetch(`${url}/instance/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": apiKey,
        },
        body: JSON.stringify({
          instanceName: "virtuosa-main",
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok) {
        return NextResponse.json({ error: "Falha ao criar instância na Evolution API", details: createData }, { status: 500 });
      }

      const instanceData = createData.instance || createData;

      dbInstance = await prisma.whatsAppInstance.create({
        data: {
          instanceId: instanceData.instanceId || instanceData.instanceName || "virtuosa-main",
          name: instanceData.instanceName || "virtuosa-main",
          token: createData.hash?.apikey || apiKey,
          status: "disconnected",
        },
      });
    }

    // 3. Configurar webhook automaticamente
    const host = req.headers.get("host");
    const protocol = host?.includes("localhost") ? "http" : "https";
    const webhookUrl = `${protocol}://${host}/api/whatsapp/webhook`;

    const webhookRes = await fetch(`${url}/webhook/set/virtuosa-main`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey,
      },
      body: JSON.stringify({
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        events: [
          "MESSAGES_UPSERT",
          "MESSAGES_UPDATE",
          "CONNECTION_UPDATE",
          "QRCODE_UPDATED",
        ],
      }),
    });

    if (!webhookRes.ok) {
      console.warn("[WhatsApp] Webhook registration failed:", await webhookRes.text());
    } else {
      console.log("[WhatsApp] Webhook registered:", webhookUrl);
    }

    // 4. Conectar instância (gera QR Code)
    const connectRes = await fetch(`${url}/instance/connect/virtuosa-main`, {
      method: "GET",
      headers: { "apikey": apiKey },
    });

    const connectData = await connectRes.json();
    if (!connectRes.ok) {
      return NextResponse.json({ error: "Falha ao gerar QR Code", details: connectData }, { status: connectRes.status });
    }

    const qrBase64 = connectData.base64 || connectData.qrcode?.base64 || null;
    const isConnected = connectData.instance?.state === "open" || connectData.state === "open";

    const updatedInstance = await prisma.whatsAppInstance.update({
      where: { id: dbInstance.id },
      data: {
        status: isConnected ? "connected" : "connecting",
        qrcode: qrBase64,
      },
    });

    return NextResponse.json({
      success: true,
      status: updatedInstance.status,
      qrcode: updatedInstance.qrcode,
      instanceId: updatedInstance.instanceId,
    });

  } catch (error: any) {
    console.error("[WhatsApp Connect API Error]:", error);
    return NextResponse.json({ error: "Erro interno do servidor", details: error.message }, { status: 500 });
  }
}
