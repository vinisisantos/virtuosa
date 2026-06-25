import { NextResponse } from "next/server";
import { getUserInstance, generateInstanceName, hasWhatsAppPermission } from "@/lib/whatsapp/instance-resolver";

import { prisma } from "@/lib/db";

const getEvolutionConfig = () => ({
  url: process.env.EVOLUTION_API_URL || "http://localhost:8080",
  apiKey: process.env.EVOLUTION_API_KEY || "",
});

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

    // ── Unidade da instância (separação total por unidade) ──────────────────
    // A unidade NÃO vem mais do JWT de quem conecta — vem da seleção explícita
    // feita na tela, validada contra as unidades que o usuário pode operar.
    // Assim o WhatsApp de SCS é criado como SCS mesmo que quem conecte seja um
    // admin com outra unidade no token. Sem isso, tudo caía na unidade errada.
    const isAdmin = userRole === "ADMINISTRADOR";
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
    let instanceUnit: string | undefined = userUnit || undefined;
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

    if (createNew) {
      instanceName = generateInstanceName(userId) + "-" + Math.floor(Date.now() / 1000).toString();
    } else {
      dbInstance = await getUserInstance(userId);
      instanceName = dbInstance?.name || generateInstanceName(userId);
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
            userId: userId,
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
          userId: userId,
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
          events: [
            "MESSAGES_UPSERT",
            "MESSAGES_UPDATE",
            "CONNECTION_UPDATE",
            "QRCODE_UPDATED",
          ],
        }
      }),
    });

    if (!webhookRes.ok) {
      console.warn("[WhatsApp] Webhook registration failed:", await webhookRes.text());
    } else {
      console.log(`[WhatsApp] Webhook registered for ${instanceName}:`, webhookUrl);
    }

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
