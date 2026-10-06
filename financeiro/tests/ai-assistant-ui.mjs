import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer";

// Todas as APIs e saídas externas são simuladas; este teste não toca dados reais.
const origin = "http://127.0.0.1:3210";
const output = await mkdtemp(join(tmpdir(), "virtuosa-ai-assistant-"));
const user = { id: "admin", name: "Administradora Teste", role: "ADMINISTRADOR", unit: "SBC", permissions: { crm: true }, canUseAliceSuggestions: true };
const now = new Date().toISOString();
const config = {
  enabled: true,
  unit: "Todas",
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
  model: "gpt-6-luna",
};

const browser = await puppeteer.launch({ headless: true });
const results = [];
try {
  for (const unit of ["SBC", "Osasco"]) for (const width of [390, 430, 1440]) {
    const page = await browser.newPage();
    const errors = [];
    const assistantCalls = [];
    const sendCalls = [];
    let conversationMode = "manual";
    const instance = { id: `instance-${unit.toLowerCase()}`, name: `Comercial ${unit}`, instanceName: `Comercial ${unit}`, unit, status: "connected", userId: user.id, ownerId: user.id, canReply: true };
    const conversation = {
      id: `conversation-${unit.toLowerCase()}`,
      instanceId: instance.id,
      instance,
      status: "open",
      assignedTo: user.id,
      assignedToName: user.name,
      unreadCount: 0,
      contact: { id: "contact", name: "Cliente Teste", phone: "5511999999999", unit, tags: [] },
      campaignName: "Glúteos Perfeitos 120ml",
      lastMessage: "Vim pelo anúncio Glúteos Perfeitos 120ml e gostaria de saber mais.",
      lastMessageAt: now,
      aiMode: conversationMode,
    };
    await page.setViewport({ width, height: width === 430 ? 932 : width === 390 ? 844 : 900, isMobile: width < 600, hasTouch: width < 600 });
    await page.evaluateOnNewDocument((currentUser, selectedUnit) => {
      localStorage.setItem("virtuosa_user", JSON.stringify(currentUser));
      localStorage.setItem("virtuosa_unit", selectedUnit);
      localStorage.setItem("selectedUnit", selectedUnit);
    }, user, unit);
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
          ? { config, knowledge: { available: true, repository: "private/alice", revision: "4771d4f46702872a50c41b9bdc1cb1bc5e8f6612", activeUnits: ["SBC", "Osasco"], activeDocuments: 27, excludedTopics: ["Harmonização de Mamas", "Preenchimento Facial"], humanReviewRequired: true, automaticSending: false }, runtime: { ready: true, privateKnowledge: true, hermesBridgeConfigured: true, ownerConfigured: true, secondaryUserConfigured: true, conversationDataApproved: true, liveSuggestionsEnabled: true, blockers: [] }, usage: { requestsToday: 3, reservedMicroUsdToday: 0, actualMicroUsdToday: 0 } }
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
      } else if (url.pathname === "/api/whatsapp/send") {
        sendCalls.push({ method: request.method(), body: request.postData() || "" });
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
    await page.waitForFunction(() => document.body.innerText.includes("Alice no CRM"));
    assert.match(await page.$eval("body", (element) => element.innerText), /Envio automático bloqueado/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `configuração sem overflow em ${width}`);
    await page.screenshot({ path: join(output, `settings-${width}.png`), fullPage: true });

    await page.goto(`${origin}/crm/inbox?unit=${encodeURIComponent(unit)}`, { waitUntil: "networkidle0" });
    await page.waitForSelector(`[data-conversation-id="conversation-${unit.toLowerCase()}"]`);
    await page.click(`[data-conversation-id="conversation-${unit.toLowerCase()}"]`);
    await page.waitForSelector('button[aria-label="Resposta manual"]');
    const modeButton = await page.$('button[aria-label="Resposta manual"]');
    const modeBounds = await modeButton.boundingBox();
    assert.ok(modeBounds.height >= 44, `botão Manual tocável em ${width}`);
    assert.equal(await page.$eval('button[aria-label="Resposta manual"]', (element) => element.getAttribute("aria-pressed")), "true");
    assert.match(await page.$eval('[role="group"][aria-label="Modo de resposta"]', (element) => element.parentElement.innerText), /Envio sempre manual/);
    await page.screenshot({ path: join(output, `manual-${unit}-${width}.png`), fullPage: true });
    assert.equal(assistantCalls.filter((call) => call.method === "POST").length, 0, "modo manual não consulta o provedor");
    await page.click('button[aria-label="Sugestões da Alice"]');
    await page.waitForFunction(() => document.body.innerText.includes("Gerar sugestão"));
    assert.equal(await page.$eval('button[aria-label="Sugestões da Alice"]', (element) => element.getAttribute("aria-pressed")), "true");
    assert.equal(assistantCalls.filter((call) => call.method === "POST").length, 0, "ativar sugestões ainda não consulta o provedor");
    await new Promise((resolve) => setTimeout(resolve, 200));
    await page.screenshot({ path: join(output, `alice-${unit}-${width}.png`), fullPage: true });
    await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Gerar sugestão"))?.click());
    await page.waitForFunction(() => document.body.innerText.includes("Usar e editar"));
    await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Usar e editar"))?.click());
    await page.waitForFunction(() => document.querySelector('textarea[placeholder="Digite uma mensagem"]')?.value.includes("qual região"));
    assert.equal(assistantCalls.filter((call) => call.method === "POST").length, 1, "uma chamada somente após ação explícita");
    assert.match(await page.$eval('textarea[placeholder="Digite uma mensagem"]', (element) => element.value), /qual região/);

    await page.click('button[aria-label="Opções da mensagem"]');
    await page.waitForFunction(() => document.body.innerText.includes("Pedir à Alice"));
    await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Pedir à Alice"))?.click());
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
    assert.match(await page.$eval("body", (element) => element.innerText), /Glúteos Perfeitos 120ml/);
    assert.equal(sendCalls.length, 0, "nenhuma sugestão é enviada ao cliente automaticamente");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `inbox sem overflow em ${width}`);
    await page.screenshot({ path: join(output, `inbox-${unit}-${width}.png`), fullPage: true });
    await page.click('button[aria-label="Resposta manual"]');
    await page.waitForFunction(() => !document.body.innerText.includes("Gerar outra"));
    assert.equal(await page.$eval('button[aria-label="Resposta manual"]', (element) => element.getAttribute("aria-pressed")), "true");
    assert.equal(assistantCalls.filter((call) => call.method === "POST").length, 2, "retornar ao modo manual não gera sugestão");
    results.push({ unit, width, errors, assistantCalls: assistantCalls.length, sendCalls: sendCalls.length });
    await page.close();
  }
  assert.deepEqual(results.flatMap((result) => result.errors), []);
  console.log(JSON.stringify({ output, results }));
} finally {
  await browser.close();
}
