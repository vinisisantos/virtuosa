import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWhatsappUnreadSummaryUrl,
  diffUnreadConversationSnapshot,
  dueWhatsAppFollowUpKeys,
  excludeConversationsReadAfterRequest,
  hasAudibleWhatsAppNotification,
  isNewInboundRealtimePayload,
  realtimeRefreshDelay,
  withConversationReadBaseline,
  newDueWhatsAppFollowUps,
  whatsappFollowUpNotificationKey,
} from "../src/lib/whatsapp/notification-scope.ts";

test("primeiro Broadcast é rápido e rajadas respeitam cooldown de lista e resumo", () => {
  assert.equal(realtimeRefreshDelay(10_000, 0, 3_000, 120), 120);
  assert.equal(realtimeRefreshDelay(10_000, 9_000, 3_000, 120), 2_000);
  assert.equal(realtimeRefreshDelay(10_000, 0, 5_000, 250), 250);
  assert.equal(realtimeRefreshDelay(10_000, 8_000, 5_000, 250), 3_000);
});

test("ignora Broadcasts de saída, status, reação e hidratação de mídia", () => {
  assert.equal(isNewInboundRealtimePayload({ kind: "message", isNewInboundMessage: true }), true);
  for (const payload of [
    { kind: "message" },
    { kind: "status", isNewInboundMessage: true },
    { kind: "reaction", isNewInboundMessage: true },
    null,
  ]) {
    assert.equal(isNewInboundRealtimePayload(payload), false);
  }
});

test("substitui o snapshot ao ler a conversa, permitindo aviso no próximo recebimento", () => {
  const first = diffUnreadConversationSnapshot([{ id: "conversa", instanceId: "ativa", unreadCount: 3 }], {});
  const readBaseline = withConversationReadBaseline(first.nextCounts, "conversa");
  const nextMessage = diffUnreadConversationSnapshot(
    [{ id: "conversa", instanceId: "ativa", unreadCount: 1 }],
    readBaseline,
  );

  assert.deepEqual(first.newlyUnread.map((conversation) => conversation.id), ["conversa"]);
  assert.deepEqual(readBaseline, { conversa: 0 });
  assert.deepEqual(withConversationReadBaseline(readBaseline, "sem-acesso"), readBaseline);
  assert.deepEqual(nextMessage.newlyUnread.map((conversation) => conversation.id), ["conversa"]);

  const read = diffUnreadConversationSnapshot([], first.nextCounts);
  assert.deepEqual(read.nextCounts, {});
  assert.deepEqual(read.newlyUnread, []);
  assert.equal(hasAudibleWhatsAppNotification(nextMessage.newlyUnread, new Set(["ativa"])), false);
});

test("resumo iniciado antes da leitura não restaura a contagem antiga", () => {
  const staleResponse = [{ id: "conversa", unreadCount: 3 }, { id: "outra", unreadCount: 2 }];
  const readVersions = new Map([["conversa", 2]]);
  assert.deepEqual(
    excludeConversationsReadAfterRequest(staleResponse, readVersions, 1),
    [{ id: "outra", unreadCount: 2 }],
  );
  assert.deepEqual(
    excludeConversationsReadAfterRequest(staleResponse, readVersions, 2),
    staleResponse,
  );
});

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
