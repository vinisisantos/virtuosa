import { NextRequest, NextResponse } from "next/server";
import { getUserFromHeaders } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSilentAnalysisSettings } from "@/lib/crm-silent-analysis";

function canManageSilentAnalysis(req: NextRequest) {
  const user = getUserFromHeaders(req);
  if (!user) return { allowed: false, response: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) };
  if (user.isAdmin || user.permissions?.crmSilentAnalysis === true) return { allowed: true, user };
  return { allowed: false, response: NextResponse.json({ error: "Sem permissão para análise silenciosa" }, { status: 403 }) };
}

export async function GET(req: NextRequest) {
  const auth = canManageSilentAnalysis(req);
  if (!auth.allowed) return auth.response;

  const settings = await getSilentAnalysisSettings();
  return NextResponse.json({ settings });
}

export async function PUT(req: NextRequest) {
  const auth = canManageSilentAnalysis(req);
  if (!auth.allowed) return auth.response;

  const body = await req.json().catch(() => ({}));
  const unit = typeof body.unit === "string" ? body.unit : "";
  if (!["SCS", "SBC", "Osasco"].includes(unit)) {
    return NextResponse.json({ error: "Unidade inválida" }, { status: 400 });
  }

  const setting = await prisma.crmSilentAnalysisSetting.upsert({
    where: { unit },
    update: {
      ...(typeof body.isEnabled === "boolean" ? { isEnabled: body.isEnabled } : {}),
      ...(typeof body.collectMessageBodies === "boolean" ? { collectMessageBodies: body.collectMessageBodies } : {}),
      ...(typeof body.includeOutbound === "boolean" ? { includeOutbound: body.includeOutbound } : {}),
      updatedBy: auth.user?.userId || auth.user?.name || null,
    },
    create: {
      unit,
      isEnabled: body.isEnabled === true,
      collectMessageBodies: body.collectMessageBodies !== false,
      includeOutbound: body.includeOutbound !== false,
      updatedBy: auth.user?.userId || auth.user?.name || null,
    },
  });

  return NextResponse.json({ setting });
}
