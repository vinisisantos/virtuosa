import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUnitGuard } from "@/lib/unit-guard";

const GENERIC_NAMES = [
  "virtuosa sao caetano do sul",
  "virtuosa sao caetano",
  "clinica virtuosa",
];

function normalize(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isGenericName(value?: string | null) {
  const text = normalize(value);
  return GENERIC_NAMES.some((name) => text === name || text.startsWith(`${name} `));
}

function titleName(value: string) {
  return value
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|\s)([\p{L}\p{M}])/gu, (_, space, letter) => `${space}${letter.toLocaleUpperCase("pt-BR")}`)
    .replace(/\s+/g, " ")
    .trim();
}

function isValidPersonalName(value?: string | null) {
  const text = (value || "").replace(/\s+/g, " ").trim();
  const normalized = normalize(text);
  if (text.length < 3 || text.length > 50) return false;
  if (/\d|https?:\/\/|www\.|@/.test(text)) return false;
  if (isGenericName(text)) return false;

  const blocked = new Set([
    "oi", "ola", "olá", "bom", "boa", "dia", "tarde", "noite", "tudo", "bem",
    "por", "favor", "sim", "nao", "não", "ok", "valor", "preco", "preço",
    "pacote", "sessao", "sessão", "sessoes", "sessões", "abdomen", "abdômen",
    "barriga", "flancos", "culote", "bracos", "braços", "outro", "outra",
    "desconto", "procedimento", "tratamento", "clinica", "clínica",
  ]);
  const words = normalized.split(" ").filter(Boolean);
  if (words.some((word) => blocked.has(word))) return false;
  if (words.length > 4) return false;

  return /^[\p{L}\p{M}'’.-]+(?:\s+[\p{L}\p{M}'’.-]+){0,3}$/u.test(text);
}

function cleanCandidate(value: string) {
  return value
    .replace(/[🌷✨💗☺️🥀💥🔥⭐]/g, " ")
    .split(/[,.!?;:\n]/)[0]
    .replace(/\s+/g, " ")
    .trim();
}

function inferNameFromMessages(messages: Array<{ body: string; fromMe: boolean }>) {
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    const body = message.body || "";

    if (!message.fromMe && isValidPersonalName(body)) {
      const previousOutbound = messages
        .slice(Math.max(0, index - 4), index)
        .reverse()
        .find((item) => item.fromMe && /(?:como é seu nome|pode me informar o seu nome|seu nome,?\s+por favor)/i.test(item.body || ""));

      if (previousOutbound) {
        return { name: titleName(cleanCandidate(body)), source: "resposta_do_lead" };
      }
    }

    if (!message.fromMe) continue;

    const firstLine = cleanCandidate(body);
    const patterns = [
      /^(?:ol[aá]|oii?|oi)\s+([\p{L}\p{M}'’.-]{3,}(?:\s+[\p{L}\p{M}'’.-]{2,}){0,2})\s+(?:bom|boa)\s+(?:dia|tarde|noite)\b/iu,
      /^(?:ol[aá]|oii?|oi)\s+([\p{L}\p{M}'’.-]{3,}(?:\s+[\p{L}\p{M}'’.-]{2,}){0,2})(?:\s*,|\s*!|$)/iu,
      /^(?:bom\s+dia|boa\s+tarde|boa\s+noite)\s+([\p{L}\p{M}'’.-]{3,}(?:\s+[\p{L}\p{M}'’.-]{2,}){0,2})(?:\s*,|\s*!|$)/iu,
    ];

    for (const pattern of patterns) {
      const match = firstLine.match(pattern);
      const candidate = match?.[1] ? titleName(match[1]) : null;
      if (candidate && isValidPersonalName(candidate)) {
        return { name: candidate, source: "saudacao_da_equipe" };
      }
    }
  }

  return null;
}

function phoneKey(value?: string | null) {
  const digits = (value || "").replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-8) : "";
}

export async function POST(req: NextRequest) {
  const guard = requireUnitGuard(req);
  if (guard instanceof NextResponse) return guard;
  if (!guard.isAdmin) {
    return NextResponse.json({ error: "Apenas administradores" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const instanceId = typeof body.instanceId === "string" ? body.instanceId : null;
  const unit = typeof body.unit === "string" ? body.unit : null;
  const apply = body.apply === true;
  const limit = Math.min(Math.max(Number(body.limit || 300), 1), 1000);

  if (!instanceId && !unit) {
    return NextResponse.json({ error: "Informe instanceId ou unit" }, { status: 400 });
  }

  const conversations = await prisma.whatsAppConversation.findMany({
    where: {
      ...(instanceId ? { instanceId } : { instance: { unit } }),
      contact: {
        OR: [
          { name: { contains: "Virtuosa São Caetano", mode: "insensitive" } },
          { name: { contains: "Clinica Virtuosa", mode: "insensitive" } },
          { name: { contains: "Clínica Virtuosa", mode: "insensitive" } },
        ],
      },
    },
    include: {
      contact: true,
      messages: {
        orderBy: { timestamp: "asc" },
        select: { body: true, fromMe: true },
      },
    },
    orderBy: { lastMessageAt: "desc" },
    take: limit,
  });

  const phones = conversations.map((conversation) => conversation.contact.phone).filter(Boolean) as string[];
  const phoneFilters = phones.map((phone) => ({ phone: { contains: phoneKey(phone) } }));
  const clients = phoneFilters.length
    ? await prisma.client.findMany({
        where: { OR: phoneFilters },
        select: { id: true, name: true, phone: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      })
    : [];

  const clientByPhone = new Map<string, (typeof clients)[number]>();
  for (const client of clients) {
    const key = phoneKey(client.phone);
    if (key && !clientByPhone.has(key) && isValidPersonalName(client.name)) {
      clientByPhone.set(key, client);
    }
  }

  const candidates = [];
  const skipped = [];

  for (const conversation of conversations) {
    const contact = conversation.contact;
    const client = clientByPhone.get(phoneKey(contact.phone));
    const inferred = client
      ? { name: titleName(client.name), source: "cadastro_cliente" }
      : inferNameFromMessages(conversation.messages);

    if (!inferred || !isValidPersonalName(inferred.name)) {
      skipped.push({
        contactId: contact.id,
        phone: contact.phone,
        currentName: contact.name,
        reason: "Sem nome pessoal confiável no histórico",
      });
      continue;
    }

    candidates.push({
      contactId: contact.id,
      phone: contact.phone,
      currentName: contact.name,
      nextName: inferred.name,
      source: inferred.source,
    });
  }

  if (apply && candidates.length > 0) {
    await prisma.$transaction(
      candidates.map((candidate) =>
        prisma.whatsAppContact.update({
          where: { id: candidate.contactId },
          data: { name: candidate.nextName },
        })
      )
    );
  }

  return NextResponse.json({
    apply,
    scanned: conversations.length,
    candidates: candidates.length,
    skipped: skipped.length,
    updated: apply ? candidates.length : 0,
    items: candidates,
    skippedItems: skipped.slice(0, 40),
  });
}
