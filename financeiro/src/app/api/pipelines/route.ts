import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  applyPipelineStagePreferences,
  resolvePipelinePreferenceUserId,
} from "@/lib/pipeline-stage-preferences";

// Etapas adicionais que devem existir entre "Em Atendimento" e "Em Negociação".
const EXTRA_STAGES = [
  { name: "Enviado", color: "#06b6d4" },
  { name: "Agendado", color: "#a855f7" },
];

function normalizeStageName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_");
}

type PipelineWithStages = {
  id: string;
  stages: { id: string; name: string; position: number }[];
};

/**
 * Self-heal idempotente: garante que cada pipeline padrão tenha as etapas
 * "Enviado" e "Agendado" logo após "Em Atendimento", deslocando as demais.
 * Roda só quando faltam (depois é no-op). Não mexe em pipelines fora do padrão
 * (sem "Em Atendimento"). Retorna true se alterou algo.
 */
async function ensureExtraStages(pipelines: PipelineWithStages[]): Promise<boolean> {
  let changed = false;
  for (const p of pipelines) {
    const finalizado = p.stages.find((s) => normalizeStageName(s.name) === "finalizado");
    if (finalizado) {
      await prisma.pipelineStage.update({
        where: { id: finalizado.id },
        data: { name: "Encerrado", color: "#ef4444" },
      });
      changed = true;
    }

    const names = p.stages.map((s) => normalizeStageName(s.name));
    const missing = EXTRA_STAGES.filter((e) => !names.includes(normalizeStageName(e.name)));
    if (missing.length === 0) continue;

    const anchor = p.stages.find((s) => s.name.trim().toLowerCase() === "em atendimento");
    if (!anchor) continue; // pipeline fora do padrão — não tocar

    // Abre espaço deslocando tudo que vem depois do "Em Atendimento".
    await prisma.pipelineStage.updateMany({
      where: { pipelineId: p.id, position: { gt: anchor.position } },
      data: { position: { increment: missing.length } },
    });
    await prisma.pipelineStage.createMany({
      data: missing.map((s, idx) => ({
        pipelineId: p.id,
        name: s.name,
        color: s.color,
        position: anchor.position + 1 + idx,
      })),
    });
    changed = true;
  }
  return changed;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;

  try {
    const query = {
      include: { stages: { orderBy: { position: "asc" as const } } },
      orderBy: { createdAt: "asc" as const },
    };
    let pipelines = await prisma.pipeline.findMany(query);

    // Garante as etapas Enviado/Agendado nos pipelines existentes (idempotente).
    if (await ensureExtraStages(pipelines)) {
      pipelines = await prisma.pipeline.findMany(query);
    }

    if (new URL(req.url).searchParams.get("scope") === "base") {
      return NextResponse.json(pipelines);
    }

    const preferenceUserId = await resolvePipelinePreferenceUserId(req, auth.user);
    const personalizedPipelines = await applyPipelineStagePreferences(pipelines, preferenceUserId);

    return NextResponse.json(personalizedPipelines);
  } catch (error) {
    console.error("Error fetching pipelines:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, unit } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const pipeline = await prisma.pipeline.create({
      data: {
        name,
        unit: unit || "Barueri",
      },
    });

    // Create default stages
    const defaultStages = [
      { name: "Novo Lead", color: "#3b82f6", position: 0 },
      { name: "Em Atendimento", color: "#eab308", position: 1 },
      { name: "Enviado", color: "#06b6d4", position: 2 },
      { name: "Agendado", color: "#a855f7", position: 3 },
      { name: "Em Negociação", color: "#f97316", position: 4 },
      { name: "Fechado", color: "#22c55e", position: 5 },
      { name: "Encerrado", color: "#ef4444", position: 6 },
    ];

    await prisma.pipelineStage.createMany({
      data: defaultStages.map((s) => ({
        ...s,
        pipelineId: pipeline.id,
      })),
    });

    const newPipeline = await prisma.pipeline.findUnique({
      where: { id: pipeline.id },
      include: {
        stages: {
          orderBy: { position: "asc" },
        },
      },
    });

    return NextResponse.json(newPipeline);
  } catch (error) {
    console.error("Error creating pipeline:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
