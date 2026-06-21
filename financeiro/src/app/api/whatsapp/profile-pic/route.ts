import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const getEvolutionConfig = () => ({
  url: process.env.EVOLUTION_API_URL || "http://localhost:8080",
  apiKey: process.env.EVOLUTION_API_KEY || "",
});

/**
 * GET /api/whatsapp/profile-pic?phone=5511999999999
 * Busca a foto de perfil de um contato do WhatsApp.
 * 1. Verifica cache no banco
 * 2. Busca na Evolution API (fetchProfilePictureUrl)
 * 3. Salva no cache para próximas consultas
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const phone = searchParams.get("phone");

  if (!phone) {
    return NextResponse.json({ error: "phone é obrigatório" }, { status: 400 });
  }

  try {
    // 1. Cache no banco
    const contact = await prisma.whatsAppContact.findUnique({
      where: { phone },
    });

    if (contact?.profilePic) {
      return NextResponse.json({ profilePicUrl: contact.profilePic });
    }

    // 2. Buscar na Evolution API
    const { url, apiKey } = getEvolutionConfig();

    const dbInstance = await prisma.whatsAppInstance.findFirst({
      where: { name: "virtuosa-main" },
    });

    if (!dbInstance) {
      return NextResponse.json({ profilePicUrl: null });
    }

    let profilePicUrl: string | null = null;

    try {
      // Evolution API v2: POST /chat/fetchProfilePictureUrl/{instanceName}
      const res = await fetch(`${url}/chat/fetchProfilePictureUrl/virtuosa-main`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": apiKey,
        },
        body: JSON.stringify({ number: phone }),
      });

      if (res.ok) {
        const data = await res.json();
        const picUrl = data.profilePictureUrl || data.profilePicUrl || data.url || null;
        if (picUrl && typeof picUrl === "string" && picUrl.startsWith("http")) {
          profilePicUrl = picUrl;
        }
      }
    } catch (e) {
      // Ignora erro ao buscar foto
    }

    // 3. Salvar no cache
    if (profilePicUrl && contact) {
      await prisma.whatsAppContact.update({
        where: { phone },
        data: { profilePic: profilePicUrl },
      }).catch(() => {});
    }

    return NextResponse.json({ profilePicUrl });
  } catch (error: any) {
    return NextResponse.json({ profilePicUrl: null });
  }
}
