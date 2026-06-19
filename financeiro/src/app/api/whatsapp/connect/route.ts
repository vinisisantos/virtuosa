import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  const UAZAPI_URL = process.env.UAZAPI_URL || "https://free.uazapi.com";
  const UAZAPI_ADMIN_TOKEN = process.env.UAZAPI_ADMIN_TOKEN || "";
  try {
    // 1. Procurar se já temos uma instância cadastrada no banco
    let dbInstance = await prisma.whatsAppInstance.findFirst({
      where: { name: "virtuosa-main" },
    });

    // 2. Se não existir no banco, criar na Uazapi
    if (!dbInstance) {
      if (!UAZAPI_ADMIN_TOKEN) {
        return NextResponse.json({ error: "UAZAPI_ADMIN_TOKEN não configurado" }, { status: 500 });
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
        return NextResponse.json({ error: "Falha ao criar instância na Uazapi", details: createData }, { status: 500 });
      }

      const uazapiInstance = createData.instance;
      
      // Salva no banco de dados
      dbInstance = await prisma.whatsAppInstance.create({
        data: {
          instanceId: uazapiInstance.id,
          name: uazapiInstance.name,
          token: uazapiInstance.token,
          status: "disconnected",
        },
      });
    }

    // 3. Chamar /instance/connect para gerar o QR Code
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
      instanceId: updatedInstance.instanceId
    });

  } catch (error: any) {
    console.error("[WhatsApp Connect API Error]:", error);
    return NextResponse.json({ error: "Erro interno do servidor", details: error.message }, { status: 500 });
  }
}
