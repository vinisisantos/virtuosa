import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: "whatsapp_welcome_enabled" },
    });
    // Default to true if not set
    return NextResponse.json({ enabled: setting ? setting.value === "true" : true });
  } catch (error) {
    console.error("Error fetching welcome setting:", error);
    return NextResponse.json({ error: "Failed to fetch setting" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { enabled } = await req.json();
    const value = enabled ? "true" : "false";

    await prisma.appSetting.upsert({
      where: { key: "whatsapp_welcome_enabled" },
      update: { value },
      create: { key: "whatsapp_welcome_enabled", value },
    });

    return NextResponse.json({ success: true, enabled });
  } catch (error) {
    console.error("Error updating welcome setting:", error);
    return NextResponse.json({ error: "Failed to update setting" }, { status: 500 });
  }
}
