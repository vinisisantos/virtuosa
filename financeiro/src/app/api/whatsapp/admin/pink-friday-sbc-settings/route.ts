import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAdminRole } from "@/lib/role-access";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";
import {
  PINK_FRIDAY_SBC_GROUP_INSTANCE_ID,
  PINK_FRIDAY_SBC_GROUP_NAME,
  PINK_FRIDAY_SBC_GROUP_UNIT,
} from "@/lib/whatsapp/manual-group-message-policy";

export const dynamic = "force-dynamic";

type GroupSnapshot = {
  id: string;
  announcementOnly: boolean | null;
};

type GroupLookupFailure = "unavailable" | "not_found" | "ambiguous";

class GroupLookupError extends Error {
  constructor(readonly failure: GroupLookupFailure) {
    super(failure);
  }
}

function responseForLookupFailure(error: unknown) {
  if (error instanceof GroupLookupError) {
    if (error.failure === "not_found") {
      return NextResponse.json({ error: "Não encontrei o grupo Pink Friday SBC nesta instância." }, { status: 404 });
    }
    if (error.failure === "ambiguous") {
      return NextResponse.json({ error: "A instância retornou mais de um grupo com esse nome. Nenhuma alteração foi feita." }, { status: 409 });
    }
  }
  return NextResponse.json({ error: "Não foi possível confirmar o grupo na Evolution." }, { status: 502 });
}

async function authorize(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (!userId) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  if (!isAdminRole(req.headers.get("x-user-role"))) {
    return NextResponse.json({ error: "Somente administradores podem alterar as permissões deste grupo." }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  if (params.get("unit") !== PINK_FRIDAY_SBC_GROUP_UNIT
    || params.get("targetInstanceId") !== PINK_FRIDAY_SBC_GROUP_INSTANCE_ID) {
    return NextResponse.json({ error: "Esta ação é restrita ao grupo Pink Friday SBC e à instância Leads - Paloma SBC." }, { status: 403 });
  }

  const { instances } = await getInstancesForRequest(req);
  const instance = instances.find(candidate => candidate.id === PINK_FRIDAY_SBC_GROUP_INSTANCE_ID
    && candidate.unit === PINK_FRIDAY_SBC_GROUP_UNIT && candidate.canView === true);
  if (!instance || instance.canReply !== true) {
    return NextResponse.json({ error: "Sem permissão para administrar o WhatsApp da unidade SBC." }, { status: 403 });
  }

  return { userId, instance };
}

async function findExactGroup(instanceName: string): Promise<GroupSnapshot> {
  const url = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!url || !apiKey) throw new GroupLookupError("unavailable");

  let response: Response;
  try {
    response = await fetch(`${url}/group/fetchAllGroups/${encodeURIComponent(instanceName)}?getParticipants=false`, {
      method: "GET",
      headers: { apikey: apiKey },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new GroupLookupError("unavailable");
  }
  if (!response.ok) throw new GroupLookupError("unavailable");

  const payload: unknown = await response.json().catch(() => null);
  if (!Array.isArray(payload)) throw new GroupLookupError("unavailable");

  const exact = payload.filter((value): value is Record<string, unknown> =>
    !!value && typeof value === "object" && !Array.isArray(value)
    && typeof value.id === "string" && /^\d+(?:-\d+)?@g\.us$/.test(value.id)
    && typeof value.subject === "string"
    && value.subject.normalize("NFC") === PINK_FRIDAY_SBC_GROUP_NAME.normalize("NFC"));

  if (exact.length === 0) throw new GroupLookupError("not_found");
  if (exact.length !== 1) throw new GroupLookupError("ambiguous");

  return {
    id: exact[0].id as string,
    announcementOnly: typeof exact[0].announce === "boolean" ? exact[0].announce : null,
  };
}

function groupState(announcementOnly: boolean | null) {
  if (announcementOnly === true) return "admins_only" as const;
  if (announcementOnly === false) return "everyone" as const;
  return "unknown" as const;
}

const responseHeaders = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  try {
    const access = await authorize(req);
    if (access instanceof NextResponse) return access;

    const connected = access.instance.status === "connected" && access.instance.provider === "evolution";
    if (!connected) {
      return NextResponse.json({
        groupName: PINK_FRIDAY_SBC_GROUP_NAME,
        connected: false,
        state: "unknown",
        announcementOnly: null,
      }, { headers: responseHeaders });
    }

    const group = await findExactGroup(access.instance.name);
    return NextResponse.json({
      groupName: PINK_FRIDAY_SBC_GROUP_NAME,
      connected: true,
      announcementOnly: group.announcementOnly,
      state: groupState(group.announcementOnly),
    }, { headers: responseHeaders });
  } catch (error) {
    if (error instanceof GroupLookupError) return responseForLookupFailure(error);
    return NextResponse.json({ error: "Não foi possível conferir o acesso ao grupo." }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await authorize(req);
    if (access instanceof NextResponse) return access;

    if (access.instance.status !== "connected" || access.instance.provider !== "evolution") {
      return NextResponse.json({ error: "Leads - Paloma SBC precisa estar conectada à Evolution." }, { status: 409 });
    }

    const group = await findExactGroup(access.instance.name);
    if (group.announcementOnly === true) {
      return NextResponse.json({
        groupName: PINK_FRIDAY_SBC_GROUP_NAME,
        connected: true,
        state: "admins_only",
        announcementOnly: true,
        updated: false,
        message: "O grupo já permite mensagens apenas de administradores.",
      }, { headers: responseHeaders });
    }

    const url = process.env.EVOLUTION_API_URL?.replace(/\/+$/, "");
    const apiKey = process.env.EVOLUTION_API_KEY;
    if (!url || !apiKey) {
      return NextResponse.json({ error: "A conexão com a Evolution não está configurada." }, { status: 503 });
    }

    let updateResponse: Response | null = null;
    try {
      updateResponse = await fetch(`${url}/group/updateSetting/${encodeURIComponent(access.instance.name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({ groupJid: group.id, action: "announcement" }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      // A solicitação pode ter chegado à Evolution; a leitura posterior é a fonte de verdade.
    }

    let verified: GroupSnapshot;
    try {
      verified = await findExactGroup(access.instance.name);
    } catch (error) {
      return NextResponse.json({
        state: "uncertain",
        error: "A solicitação foi feita, mas não foi possível confirmar a configuração. Confira o grupo antes de tentar novamente.",
      }, { status: 502, headers: responseHeaders });
    }

    if (verified.announcementOnly !== true) {
      if (updateResponse && updateResponse.status >= 400 && updateResponse.status < 500) {
        return NextResponse.json({
          state: "rejected",
          error: "A Evolution recusou a alteração. Confirme se Leads - Paloma é administradora do grupo.",
        }, { status: 409, headers: responseHeaders });
      }
      return NextResponse.json({
        state: "uncertain",
        error: "A Evolution não confirmou a restrição. Confira o grupo antes de repetir a ação.",
      }, { status: 502, headers: responseHeaders });
    }

    let auditRecorded = true;
    try {
      await prisma.activityLog.create({
        data: {
          userId: access.userId,
          userName: req.headers.get("x-user-name") || "Administrador",
          action: "whatsapp_group_admin_only_enabled",
          entityType: "WhatsAppGroupSettings",
          entityId: verified.id,
          unit: PINK_FRIDAY_SBC_GROUP_UNIT,
          description: `Mensagens restritas a administradores no grupo ${PINK_FRIDAY_SBC_GROUP_NAME}.`,
          metadata: JSON.stringify({
            instanceId: access.instance.id,
            instanceName: access.instance.name,
            groupJid: verified.id,
            groupName: PINK_FRIDAY_SBC_GROUP_NAME,
            action: "announcement",
            verified: true,
          }),
        },
      });
    } catch {
      auditRecorded = false;
    }

    return NextResponse.json({
      groupName: PINK_FRIDAY_SBC_GROUP_NAME,
      connected: true,
      state: "admins_only",
      announcementOnly: true,
      updated: true,
      auditRecorded,
      message: auditRecorded
        ? "Mensagens agora podem ser enviadas apenas por administradores."
        : "A restrição foi confirmada, mas não foi possível registrar a alteração no histórico do CRM.",
    }, { headers: responseHeaders });
  } catch (error) {
    if (error instanceof GroupLookupError) return responseForLookupFailure(error);
    return NextResponse.json({ error: "Não foi possível alterar a permissão do grupo." }, { status: 503 });
  }
}
