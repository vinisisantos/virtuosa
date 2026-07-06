import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { prisma } from "@/lib/db";

function requireAdmin(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return { allowed: false, response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  if (user.isAdmin) return { allowed: true, user };
  return { allowed: false, response: NextResponse.json({ error: "Apenas administradores podem editar a base IA" }, { status: 403 }) };
}

function canRead(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return { allowed: false, response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  if (user.isAdmin || user.permissions?.crmSilentAnalysis === true) return { allowed: true, user };
  return { allowed: false, response: NextResponse.json({ error: "Sem permissão para ver a base IA" }, { status: 403 }) };
}

function unitFrom(value: unknown) {
  return value === "SBC" || value === "SCS" || value === "Todas" ? value : "Osasco";
}

function text(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function bumpKnowledgeVersion(unit: string) {
  await prisma.aiShadowSetting.updateMany({
    where: { unit },
    data: { knowledgeVersion: `kb-${Date.now()}` },
  });
}

export async function GET(req: NextRequest) {
  try {
    const auth = canRead(req);
    if (!auth.allowed) return auth.response;
    const { searchParams } = new URL(req.url);
    const unit = unitFrom(searchParams.get("unit"));
    const [unitKnowledge, procedures, suggestions] = await Promise.all([
      prisma.aiUnitKnowledge.findUnique({ where: { unit } }),
      prisma.aiKnowledgeProcedure.findMany({
        where: { unit, active: true },
        orderBy: { updatedAt: "desc" },
        take: 80,
      }),
      prisma.aiKnowledgeSuggestion.findMany({
        where: { unit, status: "pending" },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
    ]);

    return NextResponse.json({ unitKnowledge, procedures, suggestions });
  } catch (error: any) {
    console.error("[GET /api/crm/ai-shadow/knowledge]", error);
    return NextResponse.json({ error: "Falha ao carregar base IA", details: error?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = requireAdmin(req);
    if (!auth.allowed) return auth.response;
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";
    const unit = unitFrom(body.unit);
    const user = auth.user!;
    const userName = user.name || user.email || user.userId;

    if (action === "save_unit") {
      const unitKnowledge = await prisma.aiUnitKnowledge.upsert({
        where: { unit },
        update: {
          address: text(body.address, 2000) || null,
          hours: text(body.hours, 2000) || null,
          generalRules: text(body.generalRules, 4000) || null,
          updatedBy: userName,
        },
        create: {
          unit,
          address: text(body.address, 2000) || null,
          hours: text(body.hours, 2000) || null,
          generalRules: text(body.generalRules, 4000) || null,
          updatedBy: userName,
        },
      });
      await bumpKnowledgeVersion(unit);
      return NextResponse.json({ unitKnowledge });
    }

    if (action === "save_procedure") {
      const id = text(body.id, 120);
      const data = {
        unit,
        name: text(body.name, 160),
        aliases: Array.isArray(body.aliases) ? body.aliases.filter((item: unknown) => typeof item === "string" && item.trim()).slice(0, 12) : [],
        howItWorks: text(body.howItWorks, 5000),
        indications: text(body.indications, 4000) || null,
        whatToSay: text(body.whatToSay, 4000) || null,
        whatNotToSay: text(body.whatNotToSay, 4000) || null,
        priceRange: text(body.priceRange, 1000) || null,
        active: body.active !== false,
        approvedBy: userName,
      };
      if (!data.name || !data.howItWorks) {
        return NextResponse.json({ error: "Nome e como funciona são obrigatórios" }, { status: 400 });
      }

      const procedure = id
        ? await prisma.aiKnowledgeProcedure.update({ where: { id }, data })
        : await prisma.aiKnowledgeProcedure.create({ data });

      if (typeof body.suggestionId === "string") {
        await prisma.aiKnowledgeSuggestion.updateMany({
          where: { id: body.suggestionId, unit },
          data: { status: "approved", reviewedBy: userName, reviewedAt: new Date() },
        });
      }

      await bumpKnowledgeVersion(unit);
      return NextResponse.json({ procedure });
    }

    if (action === "reject_suggestion") {
      const suggestionId = text(body.suggestionId, 120);
      if (!suggestionId) return NextResponse.json({ error: "suggestionId obrigatório" }, { status: 400 });
      const suggestion = await prisma.aiKnowledgeSuggestion.update({
        where: { id: suggestionId },
        data: { status: "rejected", reviewedBy: userName, reviewedAt: new Date() },
      });
      return NextResponse.json({ suggestion });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error: any) {
    console.error("[POST /api/crm/ai-shadow/knowledge]", error);
    return NextResponse.json({ error: "Falha ao salvar base IA", details: error?.message }, { status: 500 });
  }
}
