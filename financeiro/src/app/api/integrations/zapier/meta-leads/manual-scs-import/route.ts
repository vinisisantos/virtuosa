import { createHash, timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { POST as processMetaLead } from "../route";

const JOB_TOKEN_HASH = "f1335b24315040817471dbc1b03d6de17b3e6c3837de6a352c3425e8dba39bd9";
const SCS_FORM_ID = "1363070175195046";
const SCS_CAMPAIGN_IDS = new Set([
  "120249007079180109",
  "120249310857180006",
]);
const SCS_AD_IDS = new Set([
  "120249007079190109",
  "120249007495800109",
  "120249310857190006",
]);
const RANGE_START = new Date("2026-08-03T17:38:29-03:00").getTime();
const RANGE_END = new Date("2026-08-04T00:57:07-03:00").getTime();

function scalar(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isAuthorized(request: NextRequest) {
  const token = request.headers.get("x-virtuosa-manual-job") || "";
  const received = createHash("sha256").update(token).digest();
  const expected = Buffer.from(JOB_TOKEN_HASH, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function isAllowedPayload(payload: Record<string, unknown>) {
  if (!/^\d+$/.test(scalar(payload, "leadgen_id"))) return false;
  if (scalar(payload, "form_id") !== SCS_FORM_ID) return false;
  if (!SCS_CAMPAIGN_IDS.has(scalar(payload, "campaign_id"))) return false;
  if (!SCS_AD_IDS.has(scalar(payload, "ad_id"))) return false;
  if (!/^\+?55\d{10,11}$/.test(scalar(payload, "phone_number"))) return false;

  const createdAt = new Date(scalar(payload, "created_time")).getTime();
  if (!Number.isFinite(createdAt) || createdAt < RANGE_START || createdAt > RANGE_END) {
    return false;
  }

  const adName = normalizeText(scalar(payload, "ad_name"));
  return adName.includes("harmonizacao")
    || (adName.includes("glute") && adName.includes("perfeit"));
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Lote manual não autorizado" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload || !isAllowedPayload(payload)) {
    return NextResponse.json({ error: "Lead fora do lote autorizado" }, { status: 422 });
  }

  const secret = process.env.META_ZAPIER_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Integração não configurada" }, { status: 503 });
  }

  const internalRequest = new NextRequest(request.url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return processMetaLead(internalRequest);
}
