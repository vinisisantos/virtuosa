import assert from "node:assert/strict";
import test from "node:test";

import {
  unauthorizedWhatsAppInternalNoteMentionIds,
  validateWhatsAppInternalNoteInput,
  whatsappInternalNoteNotificationLink,
} from "../src/lib/whatsapp/internal-notes.ts";

test("normaliza o texto e elimina menções duplicadas", () => {
  assert.deepEqual(validateWhatsAppInternalNoteInput({
    content: "  Retornar amanhã  ",
    mentionedUserIds: ["user-1", " user-1 ", "user-2"],
  }), {
    value: {
      content: "Retornar amanhã",
      mentionedUserIds: ["user-1", "user-2"],
    },
  });
});

test("rejeita nota vazia e conteúdo acima do limite", () => {
  assert.equal(validateWhatsAppInternalNoteInput({ content: "   " }).error, "Informe o conteúdo da nota interna");
  assert.match(validateWhatsAppInternalNoteInput({ content: "x".repeat(2001) }).error, /até 2000 caracteres/);
});

test("rejeita formato de menção inválido e mais de dez pessoas", () => {
  assert.equal(
    validateWhatsAppInternalNoteInput({ content: "Nota", mentionedUserIds: "user-1" }).error,
    "As menções informadas são inválidas",
  );
  assert.match(validateWhatsAppInternalNoteInput({
    content: "Nota",
    mentionedUserIds: Array.from({ length: 11 }, (_, index) => `user-${index}`),
  }).error, /até 10 pessoas/);
});

test("identifica menções fora dos participantes autorizados", () => {
  assert.deepEqual(
    unauthorizedWhatsAppInternalNoteMentionIds(["owner", "agent", "outsider"], ["owner", "agent"]),
    ["outsider"],
  );
});

test("gera link exato para a conversa preservando instância e unidade", () => {
  assert.equal(whatsappInternalNoteNotificationLink({
    conversationId: "conversation-1",
    instanceId: "instance-osasco",
    instanceUnit: "Osasco",
  }), "/crm/inbox?unit=Osasco&targetInstanceId=instance-osasco&conversationId=conversation-1");
  assert.equal(whatsappInternalNoteNotificationLink({
    conversationId: "conversation-2",
    instanceId: "instance-shared",
    instanceUnit: "Todas",
  }), "/crm/inbox?targetInstanceId=instance-shared&conversationId=conversation-2");
  assert.equal(whatsappInternalNoteNotificationLink({
    conversationId: "conversation-3",
    instanceId: "instance-scs",
    instanceUnit: "SCS",
    archivedAt: "2026-08-14T03:00:00.000Z",
  }), "/crm/inbox?unit=SCS&targetInstanceId=instance-scs&conversationId=conversation-3&archived=1");
});
