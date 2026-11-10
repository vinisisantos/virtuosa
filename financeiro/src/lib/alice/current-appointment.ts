import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { phoneLookupKey } from "@/lib/phone";
import { ALICE_AUTONOMY_INSTANCE_ID } from "@/lib/ai-assistant/autonomy/policy";
import type { AliceMemoryScope } from "@/lib/alice/memory";
import type { AliceRegisteredAppointment } from "@/lib/alice/build-context";

export async function currentAliceAppointment(scope: AliceMemoryScope, phone: string,
  database: Pick<typeof prisma, "$queryRaw"> = prisma): Promise<AliceRegisteredAppointment | null> {
  if (scope.unidade !== "SBC" || scope.instanceId !== ALICE_AUTONOMY_INSTANCE_ID || !scope.conversationId) throw new Error("alice_appointment_invalid_scope");
  const key = phoneLookupKey(phone);
  if (!key || key.length < 10) return null;
  const rows = await database.$queryRaw<{ startTime: Date; status: string }[]>(Prisma.sql`
    SELECT "startTime", status FROM "Agendamento" WHERE unit='SBC' AND procedimento ILIKE '%avalia%'
      AND status IN ('pendente','confirmado','nao_confirmou')
      AND "endTime" > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      AND regexp_replace(COALESCE("clientPhone",''),'[^0-9]','','g') IN (${key},${`55${key}`})
    ORDER BY "startTime" ASC, id LIMIT 1`);
  return rows[0] ? { conversationId: scope.conversationId, unidade: "SBC", date: rows[0].startTime,
    state: rows[0].status === "confirmado" ? "CONFIRMADO" : "AGENDADO" } : null;
}
