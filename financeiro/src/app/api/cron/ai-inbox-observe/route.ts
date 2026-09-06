import { timingSafeEqual } from "node:crypto";
import { aiErrorResponse } from "@/lib/ai-inbox/access";
import { observeBatch } from "@/lib/ai-inbox/observer";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const expected = Buffer.from(`Bearer ${secret || ""}`);
  const received = Buffer.from(req.headers.get("authorization") || "");
  if (
    !secret ||
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  )
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return Response.json(await observeBatch());
  } catch (error) {
    return aiErrorResponse(error);
  }
}
