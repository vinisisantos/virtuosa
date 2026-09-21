import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer";

// Todas as APIs e saídas externas são simuladas; este teste não toca dados reais.
const origin = "http://127.0.0.1:3210";
const output = await mkdtemp(join(tmpdir(), "virtuosa-ai-assistant-"));
const user = { id: "admin", name: "Administradora Teste", role: "ADMINISTRADOR", unit: "SBC", permissions: { crm: true } };
const instance = { id: "instance-sbc", name: "Comercial SBC", instanceName: "Comercial SBC", unit: "SBC", status: "connected", userId: user.id, ownerId: user.id, canReply: true };
const now = new Date().toISOString();
const config = {
  enabled: true,
  unit: "SBC",
  businessDescription: "Clínica Virtuosa São Bernardo.",
  businessHours: "Segunda a sábado, mediante agenda.",
  email: "",
  website: "",
  purchasePolicy: "O atendimento começa por uma avaliação.",
  paymentPolicy: "",
  discountPolicy: "",
  customInstructions: "Conduza uma etapa por vez.",
  allowEmojis: true,
  sharePrices: true,
  askClientInfoAt: "ready_to_schedule",
  dailyBudgetMicroUsd: 1_000_000,
  agentEnabled: false,
  address: "Rua teste, 123 - São Bernardo do Campo",
  locationUrl: "https://maps.example/sbc",
  clinicName: "Clínica Virtuosa São Bernardo",
  model: "deepseek-flash",
};

const browser = await puppeteer.launch({ headless: true });
const results = [];
try {
  for (const width of [390, 430, 1440]) {
    const page = await browser.newPage();
    const errors = [];
    const assistantCalls = [];
    let conversationMode = "manual";
    const conversation = {
      id: "conversation-sbc",
      instanceId: instance.id,
      instance,
      status: "open",
      assignedTo: user.id,
      assignedToName: user.name,
      unreadCount: 0,
      contact: { id: "contact", name: "Cliente Teste", phone: "5511999999999", unit: "SBC", tags: [] },
      campaignName: "Preenchimento Facial",
      lastMessage: "Gostaria de saber mais sobre o procedimento.",
      lastMessageAt: now,
      aiMode: conversationMode,
    };
    await page.setViewport({ width, height: width === 430 ? 932 : width === 390 ? 844 : 900, isMobile: width < 600, hasTouch: width < 600 });
    await page.evaluateOnNewDocument((currentUser) => {
      localStorage.setItem("virtuosa_user", JSON.stringify(currentUser));
      localStorage.setItem("virtuosa_unit", "SBC");
      localStorage.setItem("selectedUnit", "SBC");
    }, user);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on("request", async (request) => {
      const url = new URL(request.url());
      if (url.origin !== origin && !["data:", "blob:"].includes(url.protocol)) return request.abort();
      if (!url.pathname.startsWith("/api/")) return request.continue();
      let data = { success: true };
      if (url.pathname === "/api/auth/me") data = { authenticated: true, user };
      else if (url.pathname === "/api/crm/ai-assistant/settings") {
        data = request.method() === "GET"
          ? { config, knowledge: { catalogItems: 24, approvedKnowledge: 7, pendingKnowledge: 2, savedReplies: 12 }, usage: { requestsToday: 3, reservedMicroUsdToday: 7_500, actualMicroUsdToday: 2_100 } }
          : { config };
      } else if (url.pathname === "/api/crm/ai-assistant/test") data = { response: "Resposta de teste segura." };
      else if (url.pathname === "/api/crm/ai-assistant/suggestions") {
        assistantCalls.push({ method: request.method(), body: request.postData() || "" });
        const input = request.postData() ? JSON.parse(request.postData()) : {};
        if (request.method() === "PATCH" && input.action === "mode") {
          conversationMode = input.mode;
          conversation.aiMode = input.mode;
          data = { mode: input.mode };
        } else if (request.method() === "POST") {
          data = { draft: { id: "draft-1", content: "Entendi. Para eu te orientar melhor, qual região você gostaria de tratar?", status: "active", version: 1, updatedAt: now, usage: { confidence: "high", needsHuman: false } } };
        } else if (request.method() === "PATCH") data = { success: true };
        else data = { mode: conversationMode, draft: null };
      } else if (url.pathname.includes("/instances")) data = { instances: [instance], users: [user] };
      else if (url.pathname === "/api/whatsapp/status") data = { connected: true, instance, status: "connected" };
      else if (url.pathname === "/api/whatsapp/conversations") data = { conversations: [{ ...conversation, aiMode: conversationMode }], appointmentSnapshot: {}, serverTime: now, hasMore: false, queueCounts: { open: 1 } };
      else if (url.pathname === "/api/whatsapp/messages") data = { messages: [{ id: "message-1", messageId: "wa-1", body: conversation.lastMessage, type: "text", fromMe: false, status: "read", timestamp: now }], hasMore: false };
      else if (url.pathname === "/api/whatsapp/saved-replies") data = { replies: [], categories: [] };
      else if (url.pathname.includes("internal-notes")) data = { notes: [], mentionableUsers: [user] };
      else if (url.pathname === "/api/users") data = [];
      await request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
    });

    await page.goto(`${origin}/crm/assistente-ia`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.body.innerText.includes("Assistente de IA do WhatsApp"));
    assert.match(await page.$eval("body", (element) => element.innerText), /Agente bloqueado/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `configuração sem overflow em ${width}`);
    await page.screenshot({ path: join(output, `settings-${width}.png`), fullPage: true });

    await page.goto(`${origin}/crm/inbox`, { waitUntil: "networkidle0" });
    await page.waitForSelector('[data-conversation-id="conversation-sbc"]');
    await page.click('[data-conversation-id="conversation-sbc"]');
    await page.waitForFunction(() => document.body.innerText.includes("Minha resposta"));
    assert.equal(assistantCalls.filter((call) => call.method === "POST").length, 0, "modo manual não consulta o provedor");
    await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Minha resposta"))?.click());
    await page.waitForFunction(() => document.body.innerText.includes("A IA sugere; você revisa, edita e envia."));
    await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent.trim().startsWith("Sugestões"))?.click());
    await page.waitForFunction(() => document.body.innerText.includes("Gerar sugestão"));
    assert.equal(assistantCalls.filter((call) => call.method === "POST").length, 0, "ativar sugestões ainda não consulta o provedor");
    await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Gerar sugestão"))?.click());
    await page.waitForFunction(() => document.body.innerText.includes("Usar e editar"));
    await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Usar e editar"))?.click());
    await page.waitForFunction(() => document.querySelector('textarea[placeholder="Digite uma mensagem"]')?.value.includes("qual região"));
    assert.equal(assistantCalls.filter((call) => call.method === "POST").length, 1, "uma chamada somente após ação explícita");
    assert.match(await page.$eval('textarea[placeholder="Digite uma mensagem"]', (element) => element.value), /qual região/);

    await page.click('button[aria-label="Opções da mensagem"]');
    await page.waitForFunction(() => document.body.innerText.includes("Responder com IA"));
    await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Responder com IA"))?.click());
    await page.waitForFunction(() => document.body.textContent.includes("Respondendo esta mensagem"));
    await new Promise((resolve, reject) => {
      const deadline = Date.now() + 3_000;
      const timer = setInterval(() => {
        if (assistantCalls.filter((call) => call.method === "POST").length >= 2) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() >= deadline) {
          clearInterval(timer);
          reject(new Error("A sugestão ancorada não foi solicitada."));
        }
      }, 25);
    });
    const assistantPosts = assistantCalls.filter((call) => call.method === "POST");
    assert.equal(assistantPosts.length, 2, "ação por mensagem faz uma nova chamada explícita");
    const targetedRequest = JSON.parse(assistantPosts.at(-1).body);
    assert.equal(targetedRequest.targetMessageId, "message-1");
    assert.equal(targetedRequest.force, true);
    assert.match(await page.$eval("body", (element) => element.innerText), /Respondendo esta mensagem/i);
    assert.match(await page.$eval("body", (element) => element.innerText), /Gostaria de saber mais sobre o procedimento/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `inbox sem overflow em ${width}`);
    await page.screenshot({ path: join(output, `inbox-${width}.png`), fullPage: true });
    results.push({ width, errors, assistantCalls: assistantCalls.length });
    await page.close();
  }
  assert.deepEqual(results.flatMap((result) => result.errors), []);
  console.log(JSON.stringify({ output, results }));
} finally {
  await browser.close();
}
