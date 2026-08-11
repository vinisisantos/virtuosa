import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWhatsappUnreadSummaryUrl,
  hasAudibleWhatsAppNotification,
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
