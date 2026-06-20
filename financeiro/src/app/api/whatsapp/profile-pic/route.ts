import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * GET /api/whatsapp/profile-pic?phone=5511999999999
 * Fetches the profile picture for a WhatsApp contact.
 * First checks our DB cache, then tries Uazapi, then falls back to null.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const phone = searchParams.get("phone");

  if (!phone) {
    return NextResponse.json({ error: "phone é obrigatório" }, { status: 400 });
  }

  try {
    // 1. Check DB cache first
    const contact = await prisma.whatsAppContact.findUnique({
      where: { phone },
    });

    if (contact?.profilePic) {
      return NextResponse.json({ profilePicUrl: contact.profilePic });
    }

    // 2. Try to fetch from Uazapi
    const dbInstance = await prisma.whatsAppInstance.findFirst({
      where: { name: "virtuosa-main" },
    });

    if (!dbInstance) {
      return NextResponse.json({ profilePicUrl: null });
    }

    const UAZAPI_URL = process.env.UAZAPI_URL || "https://free.uazapi.com";

    // Try multiple Uazapi endpoint patterns
    const endpoints = [
      { method: "GET", url: `${UAZAPI_URL}/contact/profilepic?number=${phone}` },
      { method: "GET", url: `${UAZAPI_URL}/contact/profilepic?id=${phone}` },
      { method: "GET", url: `${UAZAPI_URL}/contact/profilepic?jid=${phone}@s.whatsapp.net` },
    ];

    let profilePicUrl: string | null = null;

    for (const ep of endpoints) {
      try {
        const res = await fetch(ep.url, {
          method: ep.method,
          headers: {
            "token": dbInstance.token,
            "Content-Type": "application/json",
          },
        });

        if (res.ok) {
          const data = await res.json();
          const url = data.profilePicUrl || data.url || data.pic || data.img || null;
          if (url && typeof url === "string" && url.startsWith("http")) {
            profilePicUrl = url;
            break;
          }
        }
      } catch (e) {
        // Try next endpoint
      }
    }

    // 3. Save to DB cache if found
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
