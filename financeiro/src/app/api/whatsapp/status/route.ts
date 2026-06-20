import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(req: Request) {
  const UAZAPI_URL = process.env.UAZAPI_URL || "https://free.uazapi.com";
  try {
    const dbInstance = await prisma.whatsAppInstance.findFirst({
      where: { name: "virtuosa-main" },
    });

    if (!dbInstance) {
      return NextResponse.json({ status: "disconnected" });
    }

    // Consulta status real na Uazapi
    const statusRes = await fetch(`${UAZAPI_URL}/instance/status`, {
      method: "GET",
      headers: {
        "token": dbInstance.token,
      },
    });

    const statusData = await statusRes.json();
    if (statusRes.ok && statusData.instance) {
      // Sincroniza banco com status atual da uazapi
      const newStatus = statusData.instance.status || "disconnected";
      
      if (newStatus !== dbInstance.status) {
        await prisma.whatsAppInstance.update({
          where: { id: dbInstance.id },
          data: { status: newStatus },
        });
      }

      return NextResponse.json({
        status: newStatus,
        qrcode: statusData.instance.qrcode || null,
        profilePicUrl: statusData.instance.profilePicUrl || null,
        profileName: statusData.instance.profileName || null,
        phone: statusData.instance.phone || null,
      });
    }

    return NextResponse.json({ status: dbInstance.status });

  } catch (error: any) {
    console.error("[WhatsApp Status API Error]:", error);
    return NextResponse.json({ error: "Erro interno", details: error.message }, { status: 500 });
  }
}

// Rota DELETE para desconectar a instância
export async function DELETE(req: Request) {
  const UAZAPI_URL = process.env.UAZAPI_URL || "https://free.uazapi.com";
  try {
    const dbInstance = await prisma.whatsAppInstance.findFirst({
      where: { name: "virtuosa-main" },
    });

    if (!dbInstance) {
      return NextResponse.json({ success: true });
    }

    // Correct Uazapi endpoint for disconnecting
    await fetch(`${UAZAPI_URL}/instance/disconnect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": dbInstance.token,
      },
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
