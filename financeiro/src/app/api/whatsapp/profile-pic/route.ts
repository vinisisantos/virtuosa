import { NextResponse } from "next/server";
import { getInstanceForRequest } from "@/lib/whatsapp/instance-resolver";

import { prisma } from "@/lib/db";

const getEvolutionConfig = () => ({
  url: process.env.EVOLUTION_API_URL || "http://localhost:8080",
  apiKey: process.env.EVOLUTION_API_KEY || "",
});

const PROFILE_PIC_CACHE_HEADERS = {
  "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
};

const PROFILE_PIC_EMPTY_CACHE_HEADERS = {
  "Cache-Control": "private, max-age=900, stale-while-revalidate=3600",
};

const PROFILE_PIC_NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

function profilePicResponse(profilePicUrl: string | null, forceRefresh = false) {
  const headers = forceRefresh
    ? PROFILE_PIC_NO_STORE_HEADERS
    : profilePicUrl
      ? PROFILE_PIC_CACHE_HEADERS
      : PROFILE_PIC_EMPTY_CACHE_HEADERS;

  return NextResponse.json({ profilePicUrl }, { headers });
}

/**
 * GET /api/whatsapp/profile-pic?phone=5511999999999
 * Busca a foto de perfil de um contato do WhatsApp.
 * 1. Verifica cache no banco
 * 2. Busca na Evolution API (fetchProfilePictureUrl) usando instância do usuário
 * 3. Salva no cache para próximas consultas
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const phone = searchParams.get("phone");
  const forceRefresh = searchParams.get("refresh") === "1";

  if (!phone) {
    return NextResponse.json(
      { error: "phone é obrigatório" },
      { status: 400, headers: PROFILE_PIC_NO_STORE_HEADERS }
    );
  }

  try {
    // 1. Cache no banco
    const contact = await prisma.whatsAppContact.findUnique({
      where: { phone },
    });

    if (contact?.profilePic && !forceRefresh) {
      return profilePicResponse(contact.profilePic, forceRefresh);
    }

    // 2. Buscar na Evolution API usando instância do usuário
    const { url, apiKey } = getEvolutionConfig();

    // Resolver instância do usuário (admin pode usar ?targetUserId=xxx)
    const { instance: dbInstance } = await getInstanceForRequest(req);

    if (!dbInstance) {
      return profilePicResponse(null, forceRefresh);
    }

    const instanceName = dbInstance.name;
    let profilePicUrl: string | null = null;

    try {
      // Evolution API v2: POST /chat/fetchProfilePictureUrl/{instanceName}
      const res = await fetch(`${url}/chat/fetchProfilePictureUrl/${instanceName}`, {
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

    return profilePicResponse(profilePicUrl, forceRefresh);
  } catch (error: any) {
    return profilePicResponse(null, forceRefresh);
  }
}
