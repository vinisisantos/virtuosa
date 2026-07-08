import { NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import { phoneLookupKey } from "@/lib/phone";
import { isMarketingRole } from "@/lib/role-access";
import type { UnitGuardResult } from "@/lib/unit-guard";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";

export type PipelineOwnerScope = {
  ownerUserId: string;
  instanceIds: string[];
  phoneKeys: Set<string>;
  handoffRules: PipelineHandoffRule[];
};

type PipelineHandoffRule = {
  unit: string;
  sourceOwnerIds: Set<string>;
  sourcePhoneKeys: Set<string>;
  stageIds: Set<string>;
  stageKeys: Set<string>;
};

type PipelineDealForOwner = {
  clientId: string;
  clientName: string;
  assignedTo?: string | null;
  stage?: string | null;
  stageId?: string | null;
  unit?: string | null;
};

type UserForHandoff = {
  id: string;
  name: string;
  email: string;
  unit: string | null;
  permissions: unknown;
};

function hasExplicitOwnerSelector(req: NextRequest) {
  const searchParams = new URL(req.url).searchParams;
  return !!(searchParams.get("targetUserId") || searchParams.get("targetInstanceId"));
}

function normalizeText(value?: string | null): string {
  return (value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function normalizeStageKey(value?: string | null): string {
  return normalizeText(value).replace(/\s+/g, "_");
}

function permissionsRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function userCanUseUnit(user: UserForHandoff, unit: string): boolean {
  const permissions = permissionsRecord(user.permissions);
  const permissionKeyByUnit: Record<string, string> = {
    Osasco: "unitOsasco",
    SBC: "unitSBC",
    SCS: "unitSCS",
    Barueri: "unitBarueri",
  };

  return (
    user.unit === unit ||
    permissions.admin === true ||
    permissions.multiUnit === true ||
    permissions[permissionKeyByUnit[unit]] === true
  );
}

function matchesPerson(user: UserForHandoff, token: string): boolean {
  const normalizedToken = normalizeText(token);
  return normalizeText(user.name).includes(normalizedToken) || normalizeText(user.email).includes(normalizedToken);
}

async function resolvePipelineHandoffRules(ownerUserId: string): Promise<PipelineHandoffRule[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true, unit: true, permissions: true },
  });
  const owner = users.find((user) => user.id === ownerUserId);
  if (!owner) return [];

  const isLarissaOsasco = matchesPerson(owner, "larissa") && userCanUseUnit(owner, "Osasco");
  if (!isLarissaOsasco) return [];

  const thaisOwnerIds = users
    .filter((user) => matchesPerson(user, "thais") && userCanUseUnit(user, "Osasco"))
    .map((user) => user.id);

  if (!thaisOwnerIds.length) return [];

  const osascoStages = await prisma.pipelineStage.findMany({
    where: { pipeline: { unit: { in: ["Osasco", "Barueri"] } } },
    select: { id: true, name: true },
  });
  const agendadoStageIds = osascoStages
    .filter((stage) => normalizeStageKey(stage.name) === "agendado")
    .map((stage) => stage.id);
  const thaisInstances = await prisma.whatsAppInstance.findMany({
    where: {
      userId: { in: thaisOwnerIds },
      status: { not: "archived" },
      OR: [{ unit: "Osasco" }, { unit: "Todas" }],
    },
    select: { id: true },
  });
  const conversations = thaisInstances.length
    ? await prisma.whatsAppConversation.findMany({
        where: { instanceId: { in: thaisInstances.map((instance) => instance.id) } },
        select: { contact: { select: { phone: true } } },
      })
    : [];
  const sourcePhoneKeys = new Set<string>();
  for (const conversation of conversations) {
    const key = phoneLookupKey(conversation.contact.phone);
    if (key) sourcePhoneKeys.add(key);
  }

  return [
    {
      unit: "Osasco",
      sourceOwnerIds: new Set(thaisOwnerIds),
      sourcePhoneKeys,
      stageIds: new Set(agendadoStageIds),
      stageKeys: new Set(["agendado"]),
    },
  ];
}

export async function resolvePipelineOwnerScope(
  req: NextRequest,
  guard: UnitGuardResult,
): Promise<PipelineOwnerScope | null> {
  if ((guard.isAdmin || isMarketingRole(guard.userRole)) && !hasExplicitOwnerSelector(req)) return null;

  const { instances, targetUserId } = await getInstancesForRequest(req);
  const ownerUserId = targetUserId || guard.userId;
  const instanceIds = instances.map((instance) => instance.id).filter(Boolean);

  if (!ownerUserId) {
    return { ownerUserId: "", instanceIds: [], phoneKeys: new Set(), handoffRules: [] };
  }

  const conversations = instanceIds.length
    ? await prisma.whatsAppConversation.findMany({
        where: { instanceId: { in: instanceIds } },
        select: { contact: { select: { phone: true } } },
      })
    : [];

  const phoneKeys = new Set<string>();
  for (const conversation of conversations) {
    const key = phoneLookupKey(conversation.contact.phone);
    if (key) phoneKeys.add(key);
  }

  const handoffRules = await resolvePipelineHandoffRules(ownerUserId);

  return { ownerUserId, instanceIds, phoneKeys, handoffRules };
}

export function isDealVisibleViaPipelineHandoff(
  deal: PipelineDealForOwner,
  scope: PipelineOwnerScope | null,
  dealPhoneKey?: string | null,
): boolean {
  if (!scope?.handoffRules.length) return false;
  const stageKey = normalizeStageKey(deal.stage);

  return scope.handoffRules.some((rule) => {
    const stageMatches = (!!deal.stageId && rule.stageIds.has(deal.stageId)) || rule.stageKeys.has(stageKey);
    const ownerMatches = !!deal.assignedTo && rule.sourceOwnerIds.has(deal.assignedTo);
    const phoneMatches = !deal.assignedTo && !!dealPhoneKey && rule.sourcePhoneKeys.has(dealPhoneKey);

    return deal.unit === rule.unit && stageMatches && (ownerMatches || phoneMatches);
  });
}

export async function filterDealsByPipelineOwnerScope<T extends PipelineDealForOwner>(
  deals: T[],
  scope: PipelineOwnerScope | null,
): Promise<T[]> {
  if (!scope) return deals;
  if (!scope.ownerUserId) return [];
  if (!deals.length) return deals;

  const clientIds = [...new Set(deals.map((deal) => deal.clientId).filter(Boolean))];
  const clients = clientIds.length
    ? await prisma.client.findMany({
        where: { id: { in: clientIds } },
        select: { id: true, phone: true },
      })
    : [];
  const clientPhoneById = new Map(clients.map((client) => [client.id, client.phone]));

  return deals.filter((deal) => {
    const key = phoneLookupKey(clientPhoneById.get(deal.clientId) || deal.clientName);

    if (isDealVisibleViaPipelineHandoff(deal, scope, key)) return true;

    // Leads criados pelo webhook do WhatsApp gravam o dono da instância como
    // assignedTo; aqui esse campo é uma projeção do dono da instância, não uma
    // atribuição manual do Pipeline.
    if (deal.assignedTo) return deal.assignedTo === scope.ownerUserId;

    return !!key && scope.phoneKeys.has(key);
  });
}

export async function canAccessPipelineDeal(
  deal: PipelineDealForOwner,
  scope: PipelineOwnerScope | null,
) {
  if (!scope) return true;
  const visible = await filterDealsByPipelineOwnerScope([deal], scope);
  return visible.length > 0;
}
