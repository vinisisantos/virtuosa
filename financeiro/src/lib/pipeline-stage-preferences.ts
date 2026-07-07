import { NextRequest } from "next/server";
import { Pipeline, PipelineStage } from "@prisma/client";

import { prisma } from "@/lib/db";
import type { AuthPayload } from "@/lib/auth";

type PipelineWithStages<TStage extends PipelineStage = PipelineStage> = Pipeline & {
  stages?: TStage[];
};

export type PipelineStageView = PipelineStage & {
  baseName: string;
  baseColor: string;
  basePosition: number;
  customName: string | null;
  customColor: string | null;
  customPosition: number | null;
  isHidden: boolean;
};

export type PipelineWithStageViews = PipelineWithStages<PipelineStageView>;

function sortByDisplayPosition(a: PipelineStageView, b: PipelineStageView) {
  return a.position - b.position || a.basePosition - b.basePosition;
}

export async function resolvePipelinePreferenceUserId(
  req: NextRequest,
  user: AuthPayload,
): Promise<string> {
  if (user.role !== "ADMINISTRADOR") return user.userId;

  const searchParams = new URL(req.url).searchParams;
  const targetUserId = searchParams.get("targetUserId");
  if (targetUserId) return targetUserId;

  const targetInstanceId = searchParams.get("targetInstanceId");
  if (!targetInstanceId) return user.userId;

  const instance = await prisma.whatsAppInstance.findUnique({
    where: { id: targetInstanceId },
    select: { userId: true },
  });

  return instance?.userId || user.userId;
}

export async function applyPipelineStagePreferences<TPipeline extends PipelineWithStages>(
  pipelines: TPipeline[],
  userId: string,
): Promise<(Omit<TPipeline, "stages"> & { stages: PipelineStageView[] })[]> {
  if (!pipelines.length) return [];

  const stageIds = pipelines.flatMap((pipeline) => pipeline.stages?.map((stage) => stage.id) || []);
  const preferences = stageIds.length
    ? await prisma.pipelineStagePreference.findMany({
        where: {
          userId,
          stageId: { in: stageIds },
        },
      })
    : [];
  const preferenceByStageId = new Map(preferences.map((preference) => [preference.stageId, preference]));

  return pipelines.map((pipeline) => {
    const stages = (pipeline.stages || [])
      .map((stage) => {
        const preference = preferenceByStageId.get(stage.id);
        return {
          ...stage,
          baseName: stage.name,
          baseColor: stage.color,
          basePosition: stage.position,
          name: preference?.customName?.trim() || stage.name,
          color: preference?.customColor || stage.color,
          position: preference?.position ?? stage.position,
          customName: preference?.customName || null,
          customColor: preference?.customColor || null,
          customPosition: preference?.position ?? null,
          isHidden: preference?.isHidden ?? false,
        };
      })
      .sort(sortByDisplayPosition);

    return {
      ...pipeline,
      stages,
    };
  });
}

export function serializeStagePreferenceInput(stage: {
  id?: unknown;
  name?: unknown;
  color?: unknown;
  position?: unknown;
  isHidden?: unknown;
}) {
  return {
    id: typeof stage.id === "string" ? stage.id : "",
    customName: typeof stage.name === "string" ? stage.name.trim() : null,
    customColor: typeof stage.color === "string" ? stage.color : null,
    position: typeof stage.position === "number" ? stage.position : null,
    isHidden: stage.isHidden === true,
  };
}
