import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  const UAZAPI_URL = process.env.UAZAPI_URL || "https://free.uazapi.com";
  const UAZAPI_ADMIN_TOKEN = process.env.UAZAPI_ADMIN_TOKEN || "ZaW1qwTEkuq7Ub1cBUuyMiK5bNSu3nnMQ9lh7klElc2clSRV8t";
  try {
    // 1. Procurar se já temos uma instância cadastrada no banco
    let dbInstance = await prisma.whatsAppInstance.findFirst({
      where: { name: "virtuosa-main" },
    });

    // Helper: cria uma instância nova na UazAPI e salva no banco
    async function createNewInstance() {
      if (!UAZAPI_ADMIN_TOKEN) {
        throw new Error("UAZAPI_ADMIN_TOKEN não configurado");
      }
      const createRes = await fetch(`${UAZAPI_URL}/instance/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "admintoken": UAZAPI_ADMIN_TOKEN,
        },
        body: JSON.stringify({ name: "virtuosa-main" }),
      });
      const createData = await createRes.json();
      if (!createRes.ok || !createData.instance) {
        throw new Error(`Falha ao criar instância: ${JSON.stringify(createData)}`);
      }
      const uazapiInstance = createData.instance;
      return prisma.whatsAppInstance.create({
        data: {
          instanceId: uazapiInstance.id,
          name: uazapiInstance.name,
          token: uazapiInstance.token,
          status: "disconnected",
        },
      });
    }

    if (!dbInstance) {
      // 2a. Nenhum registro no banco — criar instância nova
      dbInstance = await createNewInstance();
    } else {
      // 2b. Registro existe — verificar se o token ainda é válido na UazAPI.
      // O plano gratuito apaga instâncias após ~1h. Quando isso ocorre o token
      // salvo no banco fica inválido. Detectamos isso verificando o status.
      const checkRes = await fetch(`${UAZAPI_URL}/instance/status`, {
        method: "GET",
        headers: { "token": dbInstance.token },
      });

      if (!checkRes.ok) {
        console.log("[WhatsApp Connect] Token inválido/instância expirada — recriando instância...");
        // Apaga o registro antigo do banco e cria um novo
        await prisma.whatsAppInstance.delete({ where: { id: dbInstance.id } });
        dbInstance = await createNewInstance();
        console.log("[WhatsApp Connect] Nova instância criada:", dbInstance.instanceId);
      }
    }

    // 3. Configura o webhook automaticamente (sempre que conectar)
    const host = req.headers.get("host");
    const protocol = host?.includes("localhost") ? "http" : "https";
    const webhookUrl = `${protocol}://${host}/api/whatsapp/webhook`;
    
    const webhookRes = await fetch(`${UAZAPI_URL}/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": dbInstance.token,
      },
      body: JSON.stringify({
        enabled: true,
        url: webhookUrl,
        events: ["messages", "messages_update", "connection", "qrcode"],
      }),
    });
    
    if (!webhookRes.ok) {
      console.warn("[WhatsApp] Webhook registration failed:", await webhookRes.text());
    } else {
      console.log("[WhatsApp] Webhook registered:", webhookUrl);
    }

    // 4. Chamar /instance/connect para gerar o QR Code
    const connectRes = await fetch(`${UAZAPI_URL}/instance/connect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": dbInstance.token,
      },
      // Sem passar 'phone', ele vai forçar a geração de QR Code
      body: JSON.stringify({ browser: "auto" }),
    });

    const connectData = await connectRes.json();
    if (!connectRes.ok) {
      return NextResponse.json({ error: "Falha ao gerar QR Code", details: connectData }, { status: connectRes.status });
    }

    const { instance, connected } = connectData;

    // Atualiza status e qrcode no banco
    const updatedInstance = await prisma.whatsAppInstance.update({
      where: { id: dbInstance.id },
      data: {
        status: connected ? "connected" : "connecting",
        qrcode: instance.qrcode || null,
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
