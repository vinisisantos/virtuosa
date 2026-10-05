import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function validCronAuthorization(value: string | null) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const digest = (input: string) => createHash("sha256").update(input).digest();
  return timingSafeEqual(digest(value || ""), digest(`Bearer ${secret}`));
}

export async function POST(req: Request) {
  if (!validCronAuthorization(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  return NextResponse.json({ error: "Observador de aprendizado legado desativado." }, { status: 410 });
}
