import assert from "node:assert/strict";
import puppeteer from "puppeteer";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const origin = process.env.TEST_ORIGIN || "http://127.0.0.1:3098";
const output = await mkdtemp(join(tmpdir(), "alice-attendance-ui-"));
const browser = await puppeteer.launch({ headless: true });
try {
  for (const width of [390, 430, 1440]) {
    const page = await browser.newPage();
    const errors = [], writes = [];
    const now = new Date().toISOString();
    const user = { id: "operator", name: "Claudenice", role: "ADMIN", unit: "SBC", permissions: { crm: true, admin: true } };
    const instance = { id: "a6871ee7-8352-4b66-bfb2-b8dba9e4f8e3", displayName: "Leads SBC", instanceName: "synthetic", unit: "SBC", userId: user.id, status: "connected", canReply: true };
    const chat = { id: "alice", instanceId: instance.id, status: "waiting_response", aiMode: "agent", aliceAttending: true,
      assignedTo: null, assignedToName: "Claudenice", unreadCount: 2, contact: { id: "contact", name: "Cliente sintética com nome longo para conferir o atendimento da Alice", phone: "5511900001234", unit: "SBC" },
      lastMessage: "Você já realizou esse procedimento?", lastMessageAt: now, lastOutboundAt: now };
    const pending = { ...chat, id: "pending", aliceAttending: false, assignedToName: null, contact: { ...chat.contact, id: "pending-contact", name: "Ainda aguardando a primeira resposta" } };
    const manual = { ...chat, id: "manual", aiMode: "manual", assignedTo: "human", assignedToName: "Atendente humana", status: "open", contact: { ...chat.contact, id: "manual-contact", name: "Assumido pela equipe" } };
    const messages = [
      { id: "welcome", body: "Seja bem-vinda à Virtuosa.", respondedByName: "Automação de recepção" },
      { id: "alice-first", body: "Sou a Alice e vou continuar seu atendimento.", respondedByName: "Alice (automação)" },
      { id: "alice-second", body: "Você já realizou esse procedimento?", respondedByName: "Alice" },
      { id: "human", body: "Agora a equipe assumiu.", respondedByName: "Atendente humana", respondedBy: "human" },
    ].map((message, index) => ({ ...message, messageId: message.id, type: "text", fromMe: true, status: "sent", timestamp: new Date(Date.now() + index * 1000).toISOString() }));
    await page.setViewport({ width, height: 900 });
    await page.evaluateOnNewDocument(value => { localStorage.setItem("virtuosa_user", JSON.stringify(value)); localStorage.setItem("virtuosa_global_unit", "SBC"); }, user);
    page.on("pageerror", error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = new URL(request.url());
      if (url.origin !== origin && !["data:", "blob:"].includes(url.protocol)) return request.abort();
      if (!url.pathname.startsWith("/api/")) return request.continue();
      if (request.method() !== "GET") writes.push(url.pathname);
      let data = {};
      if (url.pathname === "/api/auth/me") data = { user, authenticated: true };
      else if (url.pathname === "/api/whatsapp/instances") data = { instances: [instance] };
      else if (url.pathname === "/api/whatsapp/conversations") data = { conversations: [chat, pending, manual], hasMore: false, serverTime: now, queueCounts: { open: 3, unread: 3 } };
      else if (url.pathname === "/api/whatsapp/messages") data = { messages, hasMore: false };
      else if (url.pathname === "/api/users") data = [];
      else if (url.pathname.includes("/saved-replies")) data = { replies: [], categories: [] };
      else if (url.pathname.endsWith("/notification-preferences")) data = { mutedInstanceIds: [] };
      return request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
    });
    await page.goto(`${origin}/crm/inbox?unit=SBC&targetInstanceId=${instance.id}`, { waitUntil: "networkidle0" });
    await page.waitForSelector('[data-conversation-id="alice"]');
    const text = await page.$eval('[data-conversation-id="alice"]', element => element.innerText);
    assert.doesNotMatch(text, /Sem atendente/, "Alice já iniciou o atendimento");
    assert.match(text, /Alice/);
    assert.match(await page.$eval('[data-conversation-id="pending"]', element => element.innerText), /Sem atendente/, "ainda sem envio não pode esconder a pendência");
    assert.doesNotMatch(await page.$eval('[data-conversation-id="manual"]', element => element.innerText), /Alice|Sem atendente/, "retomada humana não herda tag da IA");
    await page.screenshot({ path: join(output, `list-${width}.png`) });
    await page.click('[data-conversation-id="alice"]');
    await page.waitForFunction(() => document.querySelector(".inbox-thread-messages")?.innerText.includes("Agora a equipe assumiu."));
    assert.ok(await page.evaluate(() => document.body.innerText.includes("Alice está atendendo esta conversa")));
    assert.ok(await page.evaluate(() => [...document.querySelectorAll("button")].some(element => element.textContent.trim() === "Assumir atendimento")));
    assert.ok(!await page.evaluate(() => document.body.innerText.includes("Atendimento ainda não iniciado")));
    const authorNames = await page.$$eval(".inbox-thread-messages [data-message-author]", elements => elements.map(element => element.textContent));
    assert.equal(authorNames.filter(name => name === "Alice").length, 1, "nome aparece após recepção, mas não repete no complemento");
    assert.ok(authorNames.includes("Atendente humana"), "autoria humana preservada");
    assert.ok(!authorNames.some(name => name.includes("Alice (automação)")));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "sem overflow lateral");
    await page.screenshot({ path: join(output, `thread-${width}.png`) });
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, [], "nenhum envio ou alteração no CRM");
    console.log(`PASS ${width}px: Alice, pendência real, retomada humana e autoria sequencial`);
    await page.close();
  }
  console.log(JSON.stringify({ output }));
} finally { await browser.close(); }
