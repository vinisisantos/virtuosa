import { Prisma } from "@prisma/client";
import { findAiTrainingDiagramV6Campaign } from "@/lib/ai-campaign-simulation";
import {
  aiTrainingDiagramV6MessageAudit,
  createAiTrainingDiagramV6Simulation,
} from "@/lib/ai-training-diagram-v6";
import { prisma } from "@/lib/db";

export async function createAiPublicDiagramV6Simulation(params: {
  unit: string;
  campaignId: string;
}) {
  const [campaign, unitKnowledge] = await Promise.all([
    findAiTrainingDiagramV6Campaign(params.unit, params.campaignId),
    prisma.aiUnitKnowledge.findUnique({
      where: { unit: params.unit },
      select: { address: true },
    }),
  ]);
  if (!campaign) throw new Error("A campanha vinculada ao link V6 não está mais disponível.");
  return createAiTrainingDiagramV6Simulation({
    campaign,
    unitAddress: unitKnowledge?.address,
  });
}

export function aiPublicDiagramV6InitialMessages(params: {
  sessionId: string;
  simulation: Awaited<ReturnType<typeof createAiPublicDiagramV6Simulation>>;
  createdAt?: number;
}) {
  const createdAt = params.createdAt ?? Date.now();
  return params.simulation.messages.map((message, index) => ({
    sessionId: params.sessionId,
    role: "assistant",
    content: message.content,
    model: "deterministic:diagram-v6",
    guardrailFlags: ["diagram_v6_initial_script", "public_test_isolated"],
    campaignPriceSource: "absent",
    sdrAudit: aiTrainingDiagramV6MessageAudit({
      state: params.simulation.state,
      mediaKey: message.mediaKey,
    }) as Prisma.InputJsonValue,
    generationAttempts: 0,
    createdAt: new Date(createdAt + index),
  }));
}
