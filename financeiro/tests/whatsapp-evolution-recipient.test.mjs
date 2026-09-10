import assert from "node:assert/strict";
import test from "node:test";

import { prepareEvolutionRecipientJid } from "../src/lib/whatsapp/evolution-recipient.ts";

test("usa o LID atualizado antes de iniciar uma conversa na Evolution", async () => {
  const calls = [];
  const jid = await prepareEvolutionRecipientJid(
    {
      instanceName: "virt-teste",
      phone: "5511999999999",
      fallbackJid: "5511999999999@s.whatsapp.net",
    },
    async (path, body) => {
      calls.push({ path, body });
      return {
        ok: true,
        payload: {
          devices: [{ user: "123456789@lid", device: 0 }],
        },
      };
    },
  );

  assert.equal(jid, "123456789@lid");
  assert.deepEqual(calls, [
    {
      path: "/baileys/getUSyncDevices/virt-teste",
      body: {
        jids: ["5511999999999@s.whatsapp.net"],
        useCache: false,
        ignoreZeroDevices: false,
      },
    },
  ]);
});

test("mantém o telefone quando o provedor atualiza o cache sem retornar LID", async () => {
  const jid = await prepareEvolutionRecipientJid(
    {
      instanceName: "virt-teste",
      phone: "+55 (11) 99999-9999",
      fallbackJid: null,
    },
    async () => ({ ok: true, payload: { devices: [] } }),
  );

  assert.equal(jid, "5511999999999@s.whatsapp.net");
});

test("não repete a sincronização quando a conversa já possui LID", async () => {
  let calls = 0;
  const jid = await prepareEvolutionRecipientJid(
    {
      instanceName: "virt-teste",
      phone: "5511999999999",
      fallbackJid: "123456789@lid",
    },
    async () => {
      calls += 1;
      return { ok: true, payload: null };
    },
  );

  assert.equal(jid, "123456789@lid");
  assert.equal(calls, 0);
});

test("degrada para o JID conhecido quando a sincronização é recusada", async () => {
  const jid = await prepareEvolutionRecipientJid(
    {
      instanceName: "virt-teste",
      phone: "5511999999999",
      fallbackJid: "5511999999999@s.whatsapp.net",
    },
    async () => ({ ok: false, payload: { error: "not supported" } }),
  );

  assert.equal(jid, "5511999999999@s.whatsapp.net");
});
