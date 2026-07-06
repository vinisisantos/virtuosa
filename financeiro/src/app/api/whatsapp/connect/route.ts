import { NextResponse } from "next/server";
import { getUserInstance, generateInstanceName, hasWhatsAppPermission } from "@/lib/whatsapp/instance-resolver";

import { prisma } from "@/lib/db";

const getEvolutionConfig = () => ({
  url: process.env.EVOLUTION_API_URL || "http://localhost:8080",
  apiKey: process.env.EVOLUTION_API_KEY || "",
});
const WEBHOOK_EVENTS = [
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "CONNECTION_UPDATE",
  "QRCODE_UPDATED",
  "CALL",
];
const CALL_BLOCK_SETTINGS_KEY = "whatsapp_call_block_settings";
const CALL_BLOCK_UNITS = ["Osasco", "SBC", "SCS", "Todas"];
const LEGACY_CALL_BLOCK_UNITS = ["Osasco", "SBC", "SCS"];
const DEFAULT_CALL_BLOCK_MESSAGE =
  "Este número não recebe ligações. Por favor, envie sua mensagem por aqui para darmos continuidade ao atendimento.";

function normalizeCallBlockSettings(value?: string | null) {
  if (!value) {
    return { enabled: false, message: DEFAULT_CALL_BLOCK_MESSAGE, units: CALL_BLOCK_UNITS };
  }

  try {
    const parsed = JSON.parse(value);
    let units = Array.isArray(parsed?.units)
      ? parsed.units.filter((unit: string) => CALL_BLOCK_UNITS.includes(unit))
      : CALL_BLOCK_UNITS;
    const wasLegacyDefault =
      units.length === LEGACY_CALL_BLOCK_UNITS.length &&
      LEGACY_CALL_BLOCK_UNITS.every((unit) => units.includes(unit));
    if (wasLegacyDefault) units = CALL_BLOCK_UNITS;

    return {
      enabled: parsed?.enabled === true,
      message:
        typeof parsed?.message === "string" && parsed.message.trim()
          ? parsed.message.trim()
          : DEFAULT_CALL_BLOCK_MESSAGE,
      units: units.length ? units : CALL_BLOCK_UNITS,
    };
  } catch {
    return { enabled: false, message: DEFAULT_CALL_BLOCK_MESSAGE, units: CALL_BLOCK_UNITS };
  }
}

async function applyCallBlockSettingsToInstance(params: {
  instanceName: string;
  unit?: string | null;
  url: string;
  apiKey: string;
}) {
  if (!params.apiKey) return;

  const setting = await prisma.appSetting.findUnique({
    where: { key: CALL_BLOCK_SETTINGS_KEY },
    select: { value: true },
  });
  const settings = normalizeCallBlockSettings(setting?.value);
  const unit = params.unit || "Todas";
  const shouldRejectCalls = settings.enabled && settings.units.includes(unit);

  // Evolution API v2 valida o corpo completo em /settings/set — enviar só
  // rejectCall/msgCall retorna 400. Busca as settings atuais para reenviar
  // o corpo inteiro preservando o que já estava configurado.
  let currentSettings: Record<string, unknown> = {};
  try {
    const findRes = await fetch(`${params.url}/settings/find/${params.instanceName}`, {
      headers: { apikey: params.apiKey },
    });
    if (findRes.ok) {
      const data = await findRes.json().catch(() => ({}));
      const found = data?.settings?.instance ?? data?.instance ?? data?.settings ?? data;
      if (found && typeof found === "object") currentSettings = found;
    }
  } catch {}

  const fullBody = {
    rejectCall: shouldRejectCalls,
    msgCall: shouldRejectCalls ? settings.message : "",
    groupsIgnore: currentSettings.groupsIgnore === true,
    alwaysOnline: currentSettings.alwaysOnline === true,
    readMessages: currentSettings.readMessages === true,
    readStatus: currentSettings.readStatus === true,
    syncFullHistory: currentSettings.syncFullHistory === true,
  };

  const paths = [
    `/settings/set/${params.instanceName}`,
  ];
  const methods = ["POST"];
  const bodies = [fullBody, { instance: fullBody }];

  for (const path of paths) {
    for (const method of methods) {
      for (const body of bodies) {
        const settingsRes = await fetch(`${params.url}${path}`, {
          method,
          headers: {
            "Content-Type": "application/json",
            apikey: params.apiKey,
          },
          body: JSON.stringify(body),
        });
        if (settingsRes.ok) return;
      }
    }
  }

  console.warn("[WhatsApp] Call block settings failed:", params.instanceName);
}

async function readEvolutionPayload(res: Response) {
  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function summarizeEvolutionError(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 180);
  if (Array.isArray(value)) {
    return value.map(summarizeEvolutionError).filter(Boolean).join("; ").slice(0, 180);
  }
  if (typeof value !== "object") return String(value).slice(0, 180);

  const data = value as Record<string, unknown>;
  const candidates = [data.message, data.error, data.details, data.response];
  for (const candidate of candidates) {
    const summary = summarizeEvolutionError(candidate);
    if (summary) return summary;
  }

  try {
    return JSON.stringify(data).slice(0, 180);
  } catch {
    return "";
  }
}

function maskSecret(value?: string | null) {
  const clean = (value || "").trim();
  if (!clean) return "";
  if (clean.length <= 8) return `${clean.slice(0, 2)}...len${clean.length}`;
  return `${clean.slice(0, 4)}...${clean.slice(-4)} len${clean.length}`;
}

type EvolutionCreateAttemptDiagnostic = {
  attempt: number;
  variant: "with_call_block" | "base";
  method: "POST";
  path: "/instance/create";
  instanceName: string;
  requestHeaders: {
    "Content-Type": string;
    apikey: string;
  };
  requestBody: Record<string, unknown>;
  responseStatus: number;
  responseOk: boolean;
  responseBody: unknown;
};

function isNotFoundEvolutionError(status: number, data: unknown): boolean {
  return status === 404 || summarizeEvolutionError(data).toLowerCase().includes("not found");
}

function normalizeEvolutionStatus(status?: string | null) {
  const normalized = (status || "connecting").toLowerCase();
  if (["open", "connected", "connection.open"].includes(normalized)) return "connected";
  if (["close", "closed", "disconnected", "logout", "removed"].includes(normalized)) return "disconnected";
  if (["connecting", "qrcode", "qr", "pairing"].includes(normalized)) return "connecting";
  return "connecting";
}

async function checkEvolutionInstanceExists(params: {
  url: string;
  apiKey: string;
  instanceName: string;
}) {
  try {
    const checkRes = await fetch(`${params.url}/instance/connectionState/${params.instanceName}`, {
      method: "GET",
      headers: { "apikey": params.apiKey },
    });
    return checkRes.ok;
  } catch {
    return false;
  }
}

async function findActiveInstanceForConnection(params: {
  userId: string;
  unit?: string | null;
}) {
  return prisma.whatsAppInstance.findFirst({
    where: {
      userId: params.userId,
      status: { in: ["connected", "connecting"] },
      name: { not: "" },
      ...(params.unit
        ? { OR: [{ unit: params.unit }, { unit: "Todas" }, { unit: null }] }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, instanceId: true, name: true, status: true, unit: true },
  });
}

async function createEvolutionInstance(params: {
  url: string;
  apiKey: string;
  instanceName: string;
  rejectCall: boolean;
  msgCall: string;
}) {
  const baseBody = {
    instanceName: params.instanceName,
    integration: "WHATSAPP-BAILEYS",
    qrcode: true,
  };
  const bodies = params.rejectCall
    ? [{ ...baseBody, rejectCall: true, msgCall: params.msgCall }, baseBody]
    : [baseBody];
  let lastFailure: { status: number; data: unknown } | null = null;
  const attempts: EvolutionCreateAttemptDiagnostic[] = [];

  for (let index = 0; index < bodies.length; index += 1) {
    const requestBody = bodies[index];
    const createRes = await fetch(`${params.url}/instance/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": params.apiKey,
      },
      body: JSON.stringify(requestBody),
    });
    const createData = await readEvolutionPayload(createRes);
    attempts.push({
      attempt: index + 1,
      variant: index === 0 && params.rejectCall ? "with_call_block" : "base",
      method: "POST",
      path: "/instance/create",
      instanceName: params.instanceName,
      requestHeaders: {
        "Content-Type": "application/json",
        apikey: maskSecret(params.apiKey),
      },
      requestBody,
      responseStatus: createRes.status,
      responseOk: createRes.ok,
      responseBody: createData,
    });

    if (createRes.ok) {
      return {
        ok: true as const,
        status: createRes.status,
        data: createData,
        attempts,
        usedCallBlockFallback: params.rejectCall && index > 0,
      };
    }

    lastFailure = { status: createRes.status, data: createData };
    if (params.rejectCall && index === 0) {
      console.warn(
        "[WhatsApp] Instance create with call block failed, retrying without call block:",
        params.instanceName,
        createRes.status,
        summarizeEvolutionError(createData)
      );
    }
  }

  return {
    ok: false as const,
    status: lastFailure?.status || 500,
    data: lastFailure?.data,
    attempts,
    usedCallBlockFallback: false,
  };
}

export async function POST(req: Request) {
  const { url, apiKey } = getEvolutionConfig();

  try {
    // Extrair dados do usuário autenticado (definidos pelo middleware)
    const userId = req.headers.get("x-user-id");
    const userRole = req.headers.get("x-user-role");
    const userUnit = req.headers.get("x-user-unit");
    const userPermissions = JSON.parse(req.headers.get("x-user-permissions") || "{}");

    if (!userId) {
      return NextResponse.json({ error: "Usuário não autenticado" }, { status: 401 });
    }

    if (!hasWhatsAppPermission(userRole || "", userPermissions)) {
      return NextResponse.json({ error: "Sem permissão para WhatsApp" }, { status: 403 });
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch (e) {}

    const createNew = body.action === "create_new";
    const restartInstance = body.action === "restart";
    const isAdmin = userRole === "ADMINISTRADOR";
    const requestedInstanceId =
      typeof body.instanceId === "string" && body.instanceId.trim()
        ? body.instanceId.trim()
        : "";
    const targetUserId =
      isAdmin && typeof body.targetUserId === "string" && body.targetUserId.trim()
        ? body.targetUserId.trim()
        : userId;
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true, unit: true, isActive: true },
    });

    if (!targetUser || !targetUser.isActive) {
      return NextResponse.json({ error: "Usuário responsável inválido ou inativo" }, { status: 400 });
    }

    // ── Unidade da instância (separação total por unidade) ──────────────────
    // A unidade NÃO vem mais do JWT de quem conecta — vem da seleção explícita
    // feita na tela, validada contra as unidades que o usuário pode operar.
    // Assim o WhatsApp de SCS é criado como SCS mesmo que quem conecte seja um
    // admin com outra unidade no token. Sem isso, tudo caía na unidade errada.
    const VISIBLE_UNITS = ["Osasco", "SBC", "SCS"];
    const UNIT_PERMISSION_MAP: Record<string, string> = {
      unitOsasco: "Osasco", unitSBC: "SBC", unitSCS: "SCS",
    };
    const permitted = new Set<string>();
    if (isAdmin || userPermissions?.admin || userPermissions?.multiUnit) {
      VISIBLE_UNITS.forEach((u) => permitted.add(u));
    } else {
      if (userUnit && VISIBLE_UNITS.includes(userUnit)) permitted.add(userUnit);
      for (const [k, u] of Object.entries(UNIT_PERMISSION_MAP)) {
        if (userPermissions?.[k]) permitted.add(u);
      }
    }

    const requestedUnit = (body.unit || "").toString().trim();
    let instanceUnit: string | undefined = targetUser.unit || userUnit || undefined;
    if (requestedUnit) {
      if (!VISIBLE_UNITS.includes(requestedUnit)) {
        return NextResponse.json({ error: "Unidade inválida (use Osasco, SBC ou SCS)" }, { status: 400 });
      }
      if (!permitted.has(requestedUnit)) {
        return NextResponse.json({ error: "Você não tem permissão para conectar nesta unidade" }, { status: 403 });
      }
      instanceUnit = requestedUnit;
    }

    // 1. Buscar instância do usuário no banco
    let dbInstance = null;
    let instanceName = "";

    if (requestedInstanceId) {
      dbInstance = await prisma.whatsAppInstance.findUnique({
        where: { id: requestedInstanceId },
      });

      if (!dbInstance || dbInstance.status === "archived") {
        return NextResponse.json({ error: "Instância não encontrada" }, { status: 404 });
      }

      if (!isAdmin && dbInstance.userId !== userId) {
        return NextResponse.json({ error: "Sem permissão para reconectar esta instância" }, { status: 403 });
      }

      instanceName = dbInstance.name;
      if (dbInstance.userId && dbInstance.userId !== targetUser.id) {
        return NextResponse.json({ error: "Usuário responsável não confere com a instância" }, { status: 400 });
      }
    } else if (createNew) {
      const activeInstance = await findActiveInstanceForConnection({
        userId: targetUser.id,
        unit: instanceUnit,
      });

      if (activeInstance) {
        return NextResponse.json({
          error: "Já existe um WhatsApp conectado para este responsável/unidade.",
          instanceId: activeInstance.instanceId,
          status: activeInstance.status,
        }, { status: 409 });
      }

      instanceName = generateInstanceName(targetUser.id) + "-" + Math.floor(Date.now() / 1000).toString();
    } else {
      dbInstance = await getUserInstance(targetUser.id);
      instanceName = dbInstance?.name || generateInstanceName(targetUser.id);
    }

    // 2. Verificar se a instância existe na Evolution API
    let evolutionInstanceExists = await checkEvolutionInstanceExists({ url, apiKey, instanceName });

    if (restartInstance) {
      if (!dbInstance) {
        return NextResponse.json({ error: "Instância WhatsApp não encontrada para reiniciar" }, { status: 400 });
      }

      if (!apiKey) {
        return NextResponse.json({ error: "EVOLUTION_API_KEY não configurada" }, { status: 500 });
      }

      if (!evolutionInstanceExists) {
        return NextResponse.json({ error: "Instância não encontrada na Evolution API" }, { status: 404 });
      }

      const restartRes = await fetch(`${url}/instance/restart/${instanceName}`, {
        method: "PUT",
        headers: { "apikey": apiKey },
      });
      const restartData = await readEvolutionPayload(restartRes);

      if (!restartRes.ok) {
        if (isNotFoundEvolutionError(restartRes.status, restartData)) {
          const logoutRes = await fetch(`${url}/instance/logout/${instanceName}`, {
            method: "DELETE",
            headers: { "apikey": apiKey },
          });
          const logoutData = await readEvolutionPayload(logoutRes);

          if (!logoutRes.ok && !isNotFoundEvolutionError(logoutRes.status, logoutData)) {
            const summary = summarizeEvolutionError(logoutData);
            const error = summary
              ? `Falha ao desconectar instância na Evolution API: ${summary}`
              : "Falha ao desconectar instância na Evolution API";
            return NextResponse.json({ error, details: logoutData }, { status: logoutRes.status || 500 });
          }

          const updatedInstance = await prisma.whatsAppInstance.update({
            where: { id: dbInstance.id },
            data: { status: "disconnected", qrcode: null },
          });

          return NextResponse.json({
            success: true,
            status: updatedInstance.status,
            instanceId: updatedInstance.instanceId,
            requiresReconnect: true,
            message: "Restart não disponível na Evolution; sessão desconectada para reconectar por QR Code.",
          });
        }

        const summary = summarizeEvolutionError(restartData);
        const error = summary
          ? `Falha ao reiniciar instância na Evolution API: ${summary}`
          : "Falha ao reiniciar instância na Evolution API";
        return NextResponse.json({ error, details: restartData }, { status: restartRes.status || 500 });
      }

      const state =
        restartData && typeof restartData === "object"
          ? (restartData as any).instance?.state ||
            (restartData as any).instance?.status ||
            (restartData as any).state ||
            (restartData as any).status
          : null;
      const updatedInstance = await prisma.whatsAppInstance.update({
        where: { id: dbInstance.id },
        data: {
          status: normalizeEvolutionStatus(state),
          qrcode: null,
        },
      });

      return NextResponse.json({
        success: true,
        status: updatedInstance.status,
        instanceId: updatedInstance.instanceId,
      });
    }

    // 3. Se não existir na Evolution, criar lá
    if (!evolutionInstanceExists) {
      if (!apiKey) {
        return NextResponse.json({ error: "EVOLUTION_API_KEY não configurada" }, { status: 500 });
      }

      // Bloqueio de ligações já na criação: o /settings/set desta Evolution
      // está crashando (500 em integrationSession.update), mas o corpo do
      // /instance/create aceita rejectCall/msgCall por um caminho de código
      // diferente — instâncias criadas/reconectadas já nascem com o bloqueio.
      const cbSetting = await prisma.appSetting.findUnique({
        where: { key: CALL_BLOCK_SETTINGS_KEY },
        select: { value: true },
      });
      const cbSettings = normalizeCallBlockSettings(cbSetting?.value);
      const cbShouldReject =
        cbSettings.enabled && cbSettings.units.includes(instanceUnit || "Todas");

      const createAttempt = await createEvolutionInstance({
        url,
        apiKey,
        instanceName,
        rejectCall: cbShouldReject,
        msgCall: cbSettings.message,
      });

      if (!createAttempt.ok) {
        const summary = summarizeEvolutionError(createAttempt.data);
        const error = summary
          ? `Falha ao criar instância na Evolution API: ${summary}`
          : "Falha ao criar instância na Evolution API";
        const diagnostic = {
          instanceName,
          targetUserId: targetUser.id,
          unit: instanceUnit || null,
          apiKey: maskSecret(apiKey),
          preCreateConnectionStateExists: evolutionInstanceExists,
          attempts: createAttempt.attempts,
        };
        console.warn("[WhatsApp] Evolution instance create failed:", JSON.stringify(diagnostic));
        await prisma.webhookLog.create({
          data: {
            source: "whatsapp_evolution",
            eventType: "instance_create_failed",
            status: "error",
            payload: JSON.stringify(diagnostic),
            errorMessage: error.slice(0, 800),
          },
        }).catch(() => {});
        return NextResponse.json(
          { error, details: createAttempt.data, diagnostic },
          { status: createAttempt.status || 500 }
        );
      }

      if (!evolutionInstanceExists && createAttempt.usedCallBlockFallback) {
        console.warn(
          "[WhatsApp] Instance created without call-block bootstrap after Evolution rejected it:",
          instanceName
        );
      }

      if (!evolutionInstanceExists) {
        const createData =
          createAttempt.data && typeof createAttempt.data === "object"
            ? (createAttempt.data as any)
            : {};
        const instanceData = createData.instance || createData;
        const newToken = createData.hash?.apikey || apiKey;

        if (!dbInstance) {
          dbInstance = await prisma.whatsAppInstance.create({
            data: {
              instanceId: instanceData.instanceId || instanceData.instanceName || instanceName,
              name: instanceData.instanceName || instanceName,
              token: newToken,
              status: "disconnected",
              userId: targetUser.id,
              unit: instanceUnit,
            },
          });
        } else {
          dbInstance = await prisma.whatsAppInstance.update({
            where: { id: dbInstance.id },
            data: { token: newToken, ...(requestedUnit ? { unit: instanceUnit } : {}) },
          });
        }
      }
    } else if (!dbInstance) {
      // Existe na Evolution mas não no banco — sincronizar
      dbInstance = await prisma.whatsAppInstance.create({
        data: {
          instanceId: instanceName,
          name: instanceName,
          token: apiKey,
          status: "disconnected",
          userId: targetUser.id,
          unit: instanceUnit,
        },
      });
    }

    if (!dbInstance) {
      return NextResponse.json({ error: "Instância WhatsApp não encontrada após preparar conexão" }, { status: 500 });
    }

    // 4. Configurar webhook (compartilhado entre todas as instâncias)
    const host = req.headers.get("host");
    const protocol = host?.includes("localhost") ? "http" : "https";
    const webhookUrl = `${protocol}://${host}/api/whatsapp/webhook`;

    const webhookRes = await fetch(`${url}/webhook/set/${instanceName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey,
      },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: false,
          webhookBase64: true,
          events: WEBHOOK_EVENTS,
        }
      }),
    });

    if (!webhookRes.ok) {
      console.warn("[WhatsApp] Webhook registration failed:", await webhookRes.text());
    } else {
      console.log(`[WhatsApp] Webhook registered for ${instanceName}:`, webhookUrl);
    }

    await applyCallBlockSettingsToInstance({
      instanceName,
      unit: dbInstance.unit,
      url,
      apiKey,
    });

    // 5. Conectar instância (gera QR Code)
    const connectRes = await fetch(`${url}/instance/connect/${instanceName}`, {
      method: "GET",
      headers: { "apikey": apiKey },
    });

    const connectData = await connectRes.json();
    if (!connectRes.ok) {
      return NextResponse.json({ error: "Falha ao gerar QR Code", details: connectData }, { status: connectRes.status });
    }

    const qrBase64 = connectData.base64 || connectData.qrcode?.base64 || null;
    const isConnected = connectData.instance?.state === "open" || connectData.state === "open";

    const updatedInstance = await prisma.whatsAppInstance.update({
      where: { id: dbInstance.id },
      data: {
        status: isConnected ? "connected" : "connecting",
        qrcode: qrBase64,
      },
    });

    return NextResponse.json({
      success: true,
      status: updatedInstance.status,
      qrcode: updatedInstance.qrcode,
      instanceId: updatedInstance.instanceId,
    });

  } catch (error: any) {
    console.error("[WhatsApp Connect API Error]:", error);
    return NextResponse.json({ error: "Erro interno do servidor", details: error.message }, { status: 500 });
  }
}
