import assert from "node:assert/strict";
import test from "node:test";
import {
  WHATSAPP_WEB_HISTORY_MAX_ROWS,
  WHATSAPP_WEB_HISTORY_ORDERING,
  canonicalHistoryMessageId,
  historyContactName,
  historyMessageBody,
  historyMessagePreview,
  historyMessageStatus,
  historyMessageType,
  parseWhatsAppWebHistorySnapshot,
} from "../src/lib/whatsapp/history-reconciliation.ts";

const INSTANCE_ID = "bbb24b4e-ef6d-4b64-93e8-9998d0514c65";
const ACCOUNT = "+55 11 93619-7836";

function row(overrides = {}) {
  return {
    chatJid: "5511957743311@c.us",
    phoneJid: "5511957743311@s.whatsapp.net",
    title: "Maria",
    contactName: null,
    unreadCount: 2,
    chatOrderIndex: 0,
    messageId: "false_5511957743311@c.us_3EB012345678",
    timestamp: 1_789_175_400,
    fromMe: false,
    type: "chat",
    subtype: null,
    body: "Bom dia!",
    caption: null,
    notifyName: "Maria S.",
    ack: 3,
    isNewMsg: true,
    duration: null,
    mimetype: null,
    fileName: null,
    size: null,
    externalAdReply: null,
    conversionSource: null,
    entryPointConversionSource: null,
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  return {
    schemaVersion: 2,
    source: "whatsapp_web_chrome_scs",
    account: "5511936197836@c.us",
    instanceId: INSTANCE_ID,
    windowFrom: "2026-09-11T00:00:00.000Z",
    windowToExclusive: "2026-09-12T12:00:00.000Z",
    extractedAt: "2026-09-12T17:00:00.000Z",
    ordering: WHATSAPP_WEB_HISTORY_ORDERING,
    rows: [row()],
    ...overrides,
  };
}

function parse(input) {
  return parseWhatsAppWebHistorySnapshot(input, {
    instanceId: INSTANCE_ID,
    account: ACCOUNT,
  });
}

test("valida e normaliza snapshot v2 da conta e instância esperadas", () => {
  const parsed = parse(snapshot());

  assert.equal(parsed.schemaVersion, 2);
  assert.equal(parsed.source, "whatsapp_web_chrome_scs");
  assert.equal(parsed.windowFrom, "2026-09-11T00:00:00.000Z");
  assert.equal(parsed.rows[0].messageId, "3EB012345678");
  assert.equal(parsed.rows[0].timestamp, 1_789_175_400);
});

test("aceita chat LID quando existe phoneJid enviável separado", () => {
  const parsed = parse(snapshot({
    rows: [row({
      chatJid: "123456789012345@lid",
      messageId: "false_123456789012345@lid_3EB012345678",
    })],
  }));

  assert.equal(parsed.rows[0].chatJid, "123456789012345@lid");
  assert.equal(parsed.rows[0].phoneJid, "5511957743311@s.whatsapp.net");
});

test("canonicaliza IDs compostos e preserva IDs simples", () => {
  assert.equal(
    canonicalHistoryMessageId(" true_5511957743311@c.us_ABC_123 "),
    "ABC_123",
  );
  assert.equal(canonicalHistoryMessageId("3EB0ABC123"), "3EB0ABC123");
});

test("deduplica por telefone e ID canônico, sem colidir o mesmo ID entre contatos", () => {
  const first = row();
  const duplicate = row({
    chatJid: "123456789012345@lid",
    messageId: "false_123456789012345@lid_3EB012345678",
  });
  const otherChat = row({
    chatJid: "5511933651373@c.us",
    phoneJid: "5511933651373@s.whatsapp.net",
    messageId: "3EB012345678",
    body: "outra conversa",
  });

  const parsed = parse(snapshot({ rows: [first, duplicate, otherChat] }));

  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].body, "Bom dia!");
  assert.equal(parsed.rows[1].body, "outra conversa");
});

test("rejeita duplicatas conflitantes e chat associado a telefones diferentes", () => {
  assert.throws(
    () => parse(snapshot({
      rows: [row(), row({ messageId: "3EB012345678", body: "conteúdo divergente" })],
    })),
    /mensagens conflitantes/,
  );

  assert.throws(
    () => parse(snapshot({
      rows: [
        row({ chatJid: "123456789012345@lid", messageId: "false_123456789012345@lid_A" }),
        row({
          chatJid: "123456789012345@lid",
          phoneJid: "5511999999999@c.us",
          messageId: "false_123456789012345@lid_B",
        }),
      ],
    })),
    /mesmo chatJid/,
  );
});

test("tombstone revogado prevalece ao deduplicar a mesma mensagem", () => {
  const original = row();
  const revoked = row({ messageId: "3EB012345678", type: "revoked", body: null });
  const parsed = parse(snapshot({ rows: [original, revoked] }));

  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].type, "revoked");
  assert.equal(historyMessageBody(parsed.rows[0]), "Mensagem apagada");
});

test("mapeia tipos, corpo, status e preview para o formato do CRM", () => {
  assert.equal(historyMessageType("chat"), "text");
  assert.equal(historyMessageType("automated_greeting_message"), "text");
  assert.equal(historyMessageType("ptt"), "audio");
  assert.equal(historyMessageType("audio"), "audio");
  assert.equal(historyMessageType("revoked"), "text");
  assert.equal(historyMessageType("image"), "image");

  const inbound = parse(snapshot()).rows[0];
  const voice = { ...inbound, body: null, caption: null, type: "ptt" };
  const deleted = { ...inbound, body: "conteúdo antigo", type: "revoked" };
  const image = { ...inbound, body: null, caption: null, type: "image" };

  assert.equal(historyMessageBody(voice), "Áudio histórico não recuperado");
  assert.equal(historyMessagePreview(voice), "Áudio histórico não recuperado");
  assert.equal(historyMessageStatus(voice), "delivered");
  assert.equal(historyMessageStatus({ ...voice, fromMe: true }), "sent");
  assert.equal(historyMessageStatus(deleted), "deleted");
  assert.equal(historyMessagePreview(deleted), "Mensagem apagada");
  assert.equal(historyMessagePreview(image), "📷 Imagem");
});

test("aceita metadado inteiro em string e rejeita valores negativos ou fracionários", () => {
  const parsed = parse(snapshot({ rows: [row({ duration: "2", unreadCount: "3" })] }));
  assert.equal(parsed.rows[0].duration, 2);
  assert.equal(parsed.rows[0].unreadCount, 3);

  assert.throws(
    () => parse(snapshot({ rows: [row({ duration: -1 })] })),
    /inteiro não negativo/,
  );
  assert.throws(
    () => parse(snapshot({ rows: [row({ chatOrderIndex: 1.5 })] })),
    /inteiro não negativo/,
  );
});

test("ordena por timestamp e usa chatOrderIndex decrescente dentro do mesmo segundo", () => {
  const parsed = parse(snapshot({ rows: [
    row({ messageId: "false_5511957743311@c.us_LATE", timestamp: 1_789_175_500, chatOrderIndex: 0 }),
    row({ messageId: "false_5511957743311@c.us_NEWEST_SECOND", timestamp: 1_789_175_400, chatOrderIndex: 0 }),
    row({ messageId: "false_5511957743311@c.us_OLDEST_SECOND", timestamp: 1_789_175_400, chatOrderIndex: 3 }),
  ] }));

  assert.deepEqual(parsed.rows.map((item) => item.messageId), [
    "OLDEST_SECOND",
    "NEWEST_SECOND",
    "LATE",
  ]);
});

test("valida o envelope serializado do ID contra chat e direção", () => {
  assert.throws(
    () => parse(snapshot({ rows: [row({ messageId: "true_5511957743311@c.us_X" })] })),
    /contradiz a direção/,
  );
  assert.throws(
    () => parse(snapshot({ rows: [row({ messageId: "false_5511999999999@c.us_X" })] })),
    /não pertence ao chatJid/,
  );
});

test("usa legenda como corpo e escolhe o melhor nome de contato", () => {
  const parsed = parse(snapshot({
    rows: [row({ body: null, caption: "Foto enviada", contactName: "  Maria   Silva  " })],
  })).rows[0];

  assert.equal(historyMessageBody(parsed), "Foto enviada");
  assert.equal(historyMessagePreview(parsed), "Foto enviada");
  assert.equal(historyContactName(parsed, "+55 11 95774-3311"), "Maria Silva");

  assert.equal(
    historyContactName(
      { title: "+55 11 95774-3311", contactName: null, notifyName: "Mari" },
      "+55 11 95774-3311",
    ),
    "Mari",
  );
});

test("rejeita schema, source, instância e conta incompatíveis", async (t) => {
  const cases = [
    [snapshot({ schemaVersion: 1 }), /schemaVersion 2/],
    [snapshot({ source: "outro_exportador" }), /source whatsapp_web_chrome_scs/],
    [snapshot({ instanceId: "outra-instancia" }), /não à instância esperada/],
    [snapshot({ account: "5511999999999@c.us" }), /não pertence à conta esperada/],
    [snapshot({ account: "lixo5511936197836lixo" }), /telefone ou JID telefônico válido/],
  ];

  for (const [input, expectedError] of cases) {
    await t.test(String(expectedError), () => {
      assert.throws(() => parse(input), expectedError);
    });
  }
});

test("rejeita declaração de ordenação desconhecida", () => {
  assert.throws(
    () => parse(snapshot({ ordering: "qualquer-coisa" })),
    /ordenação esperada/,
  );
});

test("rejeita janela inválida, maior que 48 horas e timestamp fora dela", async (t) => {
  const cases = [
    [snapshot({ windowToExclusive: "2026-09-10T23:59:59.000Z" }), /início anterior/],
    [snapshot({ windowToExclusive: "2026-09-13T00:00:01.000Z" }), /48 horas/],
    [snapshot({ rows: [row({ timestamp: "2026-09-12T12:00:00.000Z" })] }), /fora da janela/],
  ];

  for (const [input, expectedError] of cases) {
    await t.test(String(expectedError), () => {
      assert.throws(() => parse(input), expectedError);
    });
  }
});

test("rejeita mais de 500 rows antes da deduplicação", () => {
  const rows = Array.from({ length: WHATSAPP_WEB_HISTORY_MAX_ROWS + 1 }, () => row());
  assert.throws(() => parse(snapshot({ rows })), /não pode ultrapassar 500 itens/);
});

test("rejeita JID telefônico LID ou de grupo e chat inválido", async (t) => {
  const cases = [
    [row({ phoneJid: "123456789@lid" }), /JID telefônico enviável/],
    [row({ phoneJid: "5511957743311@g.us" }), /JID telefônico enviável/],
    [row({ chatJid: "120363000000@g.us" }), /conversa individual válida/],
    [row({ chatJid: "status@broadcast" }), /conversa individual válida/],
  ];

  for (const [invalidRow, expectedError] of cases) {
    await t.test(String(invalidRow.chatJid || invalidRow.phoneJid), () => {
      assert.throws(() => parse(snapshot({ rows: [invalidRow] })), expectedError);
    });
  }
});

test("rejeita tipo sem suporte e associação entre telefones diferentes", () => {
  assert.throws(
    () => parse(snapshot({ rows: [row({ type: "call_log" })] })),
    /não é suportado/,
  );
  assert.throws(
    () => parse(snapshot({ rows: [row({ phoneJid: "5511999999999@c.us" })] })),
    /contatos diferentes/,
  );
});
