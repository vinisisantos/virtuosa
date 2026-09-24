import { NextResponse } from "next/server";
import { getInstancesForRequest } from "@/lib/whatsapp/instance-resolver";
import {
  INBOX_REALTIME_EVENT,
  inboxRealtimePublicConfig,
  inboxRealtimeTopic,
} from "@/lib/whatsapp/inbox-realtime";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const requesterId = req.headers.get("x-user-id") || "";
  if (!requesterId) {
    return NextResponse.json({ error: "Usuário não identificado" }, { status: 401 });
  }

  try {
    const config = inboxRealtimePublicConfig();
    if (!config) {
      return NextResponse.json(
        { enabled: false, event: INBOX_REALTIME_EVENT, topics: [] },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const { instances } = await getInstancesForRequest(req);
    const topics = instances
      .filter((instance) => instance.status !== "archived")
      .map((instance) => inboxRealtimeTopic(instance.id))
      .filter((topic): topic is string => Boolean(topic));

    return NextResponse.json({
      enabled: topics.length > 0,
      event: INBOX_REALTIME_EVENT,
      topics,
      url: config.url,
      publishableKey: config.publishableKey,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[WhatsApp Realtime Config Error]:", error);
    return NextResponse.json(
      { enabled: false, event: INBOX_REALTIME_EVENT, topics: [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
