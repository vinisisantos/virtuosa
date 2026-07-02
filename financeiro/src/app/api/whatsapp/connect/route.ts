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

  const settingsRes = await fetch(`${params.url}/settings/set/${params.instanceName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: params.apiKey,
    },
    body: JSON.stringify({
      rejectCall: shouldRejectCalls,
      msgCall: shouldRejectCalls ? settings.message : "",
    }),
  });

  if (!settingsRes.ok) {
    console.warn("[WhatsApp] Call block settings failed:", params.instanceName, await settingsRes.text());
  }
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
      instanceName = generateInstanceName(targetUser.id) + "-" + Math.floor(Date.now() / 1000).toString();
    } else {
      dbInstance = await getUserInstance(targetUser.id);
      instanceName = dbInstance?.name || generateInstanceName(targetUser.id);
    }

    // 2. Verificar se a instância existe na Evolution API
    let evolutionInstanceExists = false;
    try {
      const checkRes = await fetch(`${url}/instance/connectionState/${instanceName}`, {
        method: "GET",
        headers: { "apikey": apiKey },
      });
      if (checkRes.ok) {
        evolutionInstanceExists = true;
      }
    } catch (e) {
      // Falha ao conectar com o servidor
    }

    // 3. Se não existir na Evolution, criar lá
    if (!evolutionInstanceExists) {
      if (!apiKey) {
        return NextResponse.json({ error: "EVOLUTION_API_KEY não configurada" }, { status: 500 });
      }

      const createRes = await fetch(`${url}/instance/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": apiKey,
        },
        body: JSON.stringify({
          instanceName: instanceName,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok) {
        return NextResponse.json({ error: "Falha ao criar instância na Evolution API", details: createData }, { status: 500 });
      }

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
