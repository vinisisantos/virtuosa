import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageStatusIcon, MessageTimestamp } from "./helpers/whatsapp-message-status-components.mjs";

const render = (status) => renderToStaticMarkup(createElement(MessageStatusIcon, { status }));

for (const [status, label, icon, blue] of [
  ["pending", "Aguardando confirmação de envio", "clock-3", false],
  ["sent", "Enviada", "check", false],
  ["delivered", "Entregue", "check-check", false],
  ["read", "Lida", "check-check", true],
  ["played", "Reproduzida", "check-check", true],
  ["error", "Falha no envio", "circle-alert", false],
]) {
  test(`exibe ícone e texto acessível para ${status}`, () => {
    const html = render(status);
    assert.match(html, new RegExp(`data-message-status="${status}"`));
    assert.match(html, new RegExp(`aria-label="${label}"`));
    assert.match(html, new RegExp(`title="${label}"`));
    assert.match(html, new RegExp(`lucide-${icon}(?: |")`));
    assert.equal(html.includes("text-[#53bdeb]"), blue);
    assert.equal(html.includes("text-red-500"), status === "error");
    assert.match(html, /role="img"/);
    assert.match(html, /aria-hidden="true"/);
  });
}

test("não indica entrega nem leitura quando o status é desconhecido", () => {
  for (const status of [undefined, null, "unrecognized", 99, {}, "received"]) {
    const html = render(status);
    assert.match(html, /data-message-status="unknown"/);
    assert.match(html, /aria-label="Status não confirmado"/);
    assert.doesNotMatch(html, /lucide-check|text-\[#53bdeb\]/);
  }
});

test("normaliza estados legados e numéricos na apresentação", () => {
  for (const [value, canonical] of [["SERVER_ACK", "sent"], [3, "delivered"], ["READ", "read"], [5, "played"]]) {
    assert.equal(render(value), render(canonical));
  }
});

test("não exibe confirmação para mensagem excluída", () => {
  assert.equal(render("deleted"), "");
  assert.equal(render("DELETED"), "");
});

test("timestamp do Inbox integra os tiques somente nas mensagens da clínica", () => {
  const props = { msg: { status: "read", timestamp: "2026-09-11T15:30:00.000Z" }, className: "absolute bottom-1 right-2" };
  const outgoing = renderToStaticMarkup(createElement(MessageTimestamp, { ...props, isMe: true }));
  const incoming = renderToStaticMarkup(createElement(MessageTimestamp, { ...props, isMe: false }));
  assert.match(outgoing, /data-message-status="read"/);
  assert.match(outgoing, /inbox-message-timestamp-outgoing/);
  assert.match(outgoing, /absolute bottom-1 right-2/);
  assert.match(incoming, /inbox-message-timestamp-incoming/);
  assert.doesNotMatch(incoming, /data-message-status|role="img"/);
  assert.match(incoming, /\d{2}:\d{2}/);
});
