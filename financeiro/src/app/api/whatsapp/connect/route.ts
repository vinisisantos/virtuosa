import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getUserInstance, generateInstanceName, hasWhatsAppPermission } from "@/lib/whatsapp/instance-resolver";

const prisma = new PrismaClient();

const getEvolutionConfig = () => ({
  url: process.env.EVOLUTION_API_URL || "http://localhost:8080",
  apiKey: process.env.EVOLUTION_API_KEY || "",
});

export async function POST(req: Request) {
  const { url, apiKey } = getEvolutionConfig();

  try {
    // Extrair dados do usuário autenticado (definidos pelo middleware)
    const userId = req.headers.get("x-user-id");
    const userRole = req.headers.get("x-user-role");
    const userUnit = req.headers.get("x-user-unit");
    const userPermissions = JSON.parse(req.headers.get("x-user-permissions") || "{}");

    if (!userId) {
      return NextResponse.json({ error: "Usuário não autenticado" }, { status: 401 });
    }

    if (!hasWhatsAppPermission(userRole || "", userPermissions)) {
      return NextResponse.json({ error: "Sem permissão para WhatsApp" }, { status: 403 });
    }

    // 1. Buscar instância do usuário no banco
    let dbInstance = await getUserInstance(userId);
    const instanceName = dbInstance?.name || generateInstanceName(userId);

    // 2. Verificar se a instância existe na Evolution API
    let evolutionInstanceExists = false;
    try {
      const checkRes = await fetch(`${url}/instance/connectionState/${instanceName}`, {
        method: "GET",
        headers: { "apikey": apiKey },
      });
      if (checkRes.ok) {
        evolutionInstanceExists = true;
      }
    } catch (e) {
      // Falha ao conectar com o servidor
    }

    // 3. Se não existir na Evolution, criar lá
    if (!evolutionInstanceExists) {
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
          instanceName: instanceName,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok) {
        return NextResponse.json({ error: "Falha ao criar instância na Evolution API", details: createData }, { status: 500 });
      }

      const instanceData = createData.instance || createData;
      const newToken = createData.hash?.apikey || apiKey;

      if (!dbInstance) {
        dbInstance = await prisma.whatsAppInstance.create({
          data: {
            instanceId: instanceData.instanceId || instanceData.instanceName || instanceName,
            name: instanceData.instanceName || instanceName,
            token: newToken,
            status: "disconnected",
            userId: userId,
            unit: userUnit || undefined,
          },
        });
      } else {
        dbInstance = await prisma.whatsAppInstance.update({
          where: { id: dbInstance.id },
          data: { token: newToken },
        });
      }
    } else if (!dbInstance) {
      // Existe na Evolution mas não no banco — sincronizar
      dbInstance = await prisma.whatsAppInstance.create({
        data: {
          instanceId: instanceName,
          name: instanceName,
          token: apiKey,
          status: "disconnected",
          userId: userId,
          unit: userUnit || undefined,
        },
      });
    }

    // 4. Configurar webhook (compartilhado entre todas as instâncias)
    const host = req.headers.get("host");
    const protocol = host?.includes("localhost") ? "http" : "https";
    const webhookUrl = `${protocol}://${host}/api/whatsapp/webhook`;

    const webhookRes = await fetch(`${url}/webhook/set/${instanceName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey,
      },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: false,
          webhookBase64: true,
          events: [
            "MESSAGES_UPSERT",
            "MESSAGES_UPDATE",
            "CONNECTION_UPDATE",
            "QRCODE_UPDATED",
          ],
        }
      }),
    });

    if (!webhookRes.ok) {
      console.warn("[WhatsApp] Webhook registration failed:", await webhookRes.text());
    } else {
      console.log(`[WhatsApp] Webhook registered for ${instanceName}:`, webhookUrl);
    }

    // 5. Conectar instância (gera QR Code)
    const connectRes = await fetch(`${url}/instance/connect/${instanceName}`, {
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
