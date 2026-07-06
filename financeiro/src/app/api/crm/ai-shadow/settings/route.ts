import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { ensureAiShadowSettings } from "@/lib/ai-shadow";
import { prisma } from "@/lib/db";

function requireAdmin(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return { error: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  if (!user.isAdmin) return { error: NextResponse.json({ error: "Apenas administradores podem configurar o piloto IA" }, { status: 403 }) };
  return { user };
}

function normalizeAllowedInstances(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

export async function GET(req: NextRequest) {
  try {
    const auth = requireAdmin(req);
    if ("error" in auth) return auth.error;

    await ensureAiShadowSettings();
    const [settings, instances] = await Promise.all([
      prisma.aiShadowSetting.findMany({ orderBy: { unit: "asc" } }),
      prisma.whatsAppInstance.findMany({
        where: { unit: "Osasco", capturesLeads: true, status: { not: "archived" } },
        select: {
          id: true,
          name: true,
          phoneNumber: true,
          unit: true,
          status: true,
          capturesLeads: true,
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return NextResponse.json({ settings, instances });
  } catch (error: any) {
    console.error("[GET /api/crm/ai-shadow/settings]", error);
    return NextResponse.json({ error: "Falha ao carregar configurações", details: error?.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = requireAdmin(req);
    if ("error" in auth) return auth.error;

    await ensureAiShadowSettings();
    const body = await req.json().catch(() => ({}));
    const unit = body.unit === "Osasco" ? "Osasco" : "";
    if (!unit) return NextResponse.json({ error: "Piloto permitido apenas para Osasco" }, { status: 400 });

    const allowedInstanceIds = normalizeAllowedInstances(body.allowedInstanceIds);
    const validInstances = allowedInstanceIds.length
      ? await prisma.whatsAppInstance.findMany({
          where: {
            id: { in: allowedInstanceIds },
            unit: "Osasco",
            capturesLeads: true,
            status: { not: "archived" },
          },
          select: { id: true },
        })
      : [];
    if (allowedInstanceIds.length !== validInstances.length) {
      return NextResponse.json({ error: "Todas as instâncias devem ser comerciais e de Osasco" }, { status: 400 });
    }

    const setting = await prisma.aiShadowSetting.upsert({
      where: { unit },
      update: {
        enabled: body.enabled === true,
        allowedInstanceIds,
        ...(typeof body.modelA === "string" && body.modelA.trim() ? { modelA: body.modelA.trim() } : {}),
        ...(typeof body.modelB === "string" && body.modelB.trim() ? { modelB: body.modelB.trim() } : {}),
        ...(typeof body.onlyAfterHours === "boolean" ? { onlyAfterHours: body.onlyAfterHours } : {}),
        ...(typeof body.weekdayStart === "string" ? { weekdayStart: body.weekdayStart } : {}),
        ...(typeof body.weekdayEnd === "string" ? { weekdayEnd: body.weekdayEnd } : {}),
        ...(typeof body.weekendEnabled === "boolean" ? { weekendEnabled: body.weekendEnabled } : {}),
        ...(Number.isFinite(Number(body.maxRunsPerDay)) ? { maxRunsPerDay: Math.max(1, Math.min(500, Number(body.maxRunsPerDay))) } : {}),
        updatedBy: auth.user.name || auth.user.email || auth.user.userId,
      },
      create: {
        unit,
        enabled: body.enabled === true,
        allowedInstanceIds,
        updatedBy: auth.user.name || auth.user.email || auth.user.userId,
      },
    });

    return NextResponse.json({ setting });
  } catch (error: any) {
    console.error("[PUT /api/crm/ai-shadow/settings]", error);
    return NextResponse.json({ error: "Falha ao salvar configuração", details: error?.message }, { status: 500 });
  }
}
