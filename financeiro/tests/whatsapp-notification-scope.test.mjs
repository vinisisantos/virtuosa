import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWhatsappUnreadSummaryUrl,
  dueWhatsAppFollowUpKeys,
  hasAudibleWhatsAppNotification,
  newDueWhatsAppFollowUps,
  whatsappFollowUpNotificationKey,
} from "../src/lib/whatsapp/notification-scope.ts";

test("restringe as notificações à instância selecionada no Inbox", () => {
  assert.equal(
    buildWhatsappUnreadSummaryUrl(
      "/crm/inbox",
      "?targetInstanceId=instance-osasco&conversationId=conversation-1",
    ),
    "/api/whatsapp/conversations?summary=unread&targetInstanceId=instance-osasco",
  );
});

test("preserva o escopo legado por colaborador e unidade", () => {
  assert.equal(
    buildWhatsappUnreadSummaryUrl(
      "/crm/inbox",
      "?targetUserId=user-scs&unit=SCS",
    ),
    "/api/whatsapp/conversations?summary=unread&targetUserId=user-scs&unit=SCS",
  );
});

test("prioriza a instância explícita quando os dois alvos aparecem", () => {
  assert.equal(
    buildWhatsappUnreadSummaryUrl(
      "/crm/inbox",
      "?targetUserId=user-1&targetInstanceId=instance-sbc",
    ),
    "/api/whatsapp/conversations?summary=unread&targetInstanceId=instance-sbc",
  );
});

test("mantém a visão agregada em Todas as minhas contas", () => {
  assert.equal(
    buildWhatsappUnreadSummaryUrl("/crm/inbox", "?conversationId=conversation-1"),
    "/api/whatsapp/conversations?summary=unread",
  );
});

test("mantém notificações agregadas fora do Inbox", () => {
  assert.equal(
    buildWhatsappUnreadSummaryUrl("/crm/pipeline", "?targetInstanceId=instance-osasco"),
    "/api/whatsapp/conversations?summary=unread",
  );
});

test("não toca quando todas as novas mensagens são de instâncias silenciadas", () => {
  assert.equal(
    hasAudibleWhatsAppNotification(
      [{ instanceId: "instancia-a" }, { instanceId: "instancia-b" }],
      new Set(["instancia-a", "instancia-b"]),
    ),
    false,
  );
});

test("toca quando ao menos uma nova mensagem vem de instância não silenciada", () => {
  assert.equal(
    hasAudibleWhatsAppNotification(
      [{ instanceId: "instancia-a" }, { instanceId: "instancia-b" }],
      new Set(["instancia-a"]),
    ),
    true,
  );
});

test("mantém compatibilidade com resumos antigos sem instanceId", () => {
  assert.equal(
    hasAudibleWhatsAppNotification([{}], new Set(["instancia-a"])),
    true,
  );
});

test("avisa somente retornos novos de instâncias não silenciadas", () => {
  const dueAt = "2026-08-12T15:00:00.000Z";
  const followUps = [
    { id: "retorno-a", scheduledAt: dueAt, conversation: { id: "c-a", instanceId: "instancia-a" } },
    { id: "retorno-b", scheduledAt: dueAt, conversation: { id: "c-b", instanceId: "instancia-b" } },
    { id: "retorno-c", scheduledAt: dueAt, conversation: { id: "c-c", instanceId: "instancia-c" } },
  ];
  const seen = new Set([whatsappFollowUpNotificationKey(followUps[0])]);
  const result = newDueWhatsAppFollowUps(followUps, seen, new Set(["instancia-b"]));

  assert.deepEqual(result.map((item) => item.id), ["retorno-c"]);
});

test("remove retornos concluídos da linha de base para permitir um novo ciclo", () => {
  const firstCycle = { id: "retorno", scheduledAt: "2026-08-12T15:00:00.000Z", conversation: { id: "c" } };
  assert.deepEqual([...dueWhatsAppFollowUpKeys([firstCycle])], [whatsappFollowUpNotificationKey(firstCycle)]);
  assert.deepEqual([...dueWhatsAppFollowUpKeys([])], []);
});
