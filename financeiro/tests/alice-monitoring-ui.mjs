import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import puppeteer from "puppeteer";

// Todas as APIs são interceptadas, inclusive envios, leitura e geração de IA.
const origin = process.env.ALICE_UI_ORIGIN || "http://127.0.0.1:3210";
const output = resolve("../.impeccable/review");
await mkdir(output, { recursive: true });
const user = { id: "admin-ui-test", name: "Administradora Teste", role: "ADMINISTRADOR", unit: "SBC", permissions: { crm: true }, canUseAliceSuggestions: true };
const now = "2026-11-09T03:30:00.000Z";
const fixture = () => ({
  config: { enabled: true, activatedAt: now, instanceId: "instance-test", backlogAnchorConversationId: "conversation-test", initialDelaySeconds: 30, complementDelaySeconds: 3, monthlyLimitUsd: null },
  readiness: { ready: true, blockers: [] },
  summary: { conversations: 12, queued: 3, sent: 8, uncertain: 1, failed: 1, needsHuman: 2, appointments: 2, inputTokens: 34000, outputTokens: 2200, costMicroUsd: 135000, unknownCostTurns: 1, backlogTurns: 4, averageGenerationMs: 4800, averageResponseMs: 36200, averageBacklogResponseMs: 42100 },
  items: [
    { id: "turn-test", conversationId: "conversation-test", contactName: "Cliente de demonstração com nome extenso para testar legibilidade no celular", phoneLast4: "1234", status: "needs_human", createdAt: now, firstSentAt: null, costMicroUsd: 10500, error: "É necessário revisar o contexto com a equipe antes de continuar este atendimento.", appointmentId: null, instanceId: "instance-test" },
    { id: "turn-sent", conversationId: "conversation-sent", contactName: "Outra cliente de demonstração", phoneLast4: "5678", status: "sent", createdAt: now, firstSentAt: now, costMicroUsd: 9100, error: null, appointmentId: "appointment-test", instanceId: "instance-test" },
    { id: "turn-uncertain", conversationId: "conversation-uncertain", contactName: null, phoneLast4: "9012", status: "uncertain", createdAt: now, firstSentAt: null, costMicroUsd: 100, error: null, appointmentId: null, instanceId: "instance-test" },
    { id: "turn-timeout", conversationId: "conversation-timeout", contactName: "Cliente de demonstração com geração interrompida", phoneLast4: "5670", status: "failed", createdAt: now, firstSentAt: null, costMicroUsd: null, error: "A geração excedeu o tempo de espera. O uso ainda não foi informado pelo provedor.", appointmentId: null, instanceId: "instance-test" },
  ],
  backlogCandidates: [
    { conversationId: "anchor-first", contactName: "Cliente inicial de demonstração", phoneLast4: "1122", lastInboundAt: "2026-11-04T13:00:00.000Z", unreadCount: 2, previewToken: "preview-first-test" },
    { conversationId: "anchor-second", contactName: "Cliente seguinte de demonstração", phoneLast4: "3344", lastInboundAt: "2026-11-05T13:00:00.000Z", unreadCount: 3, previewToken: "preview-second-test" },
  ],
  nextCursor: "page-2-test",
  backlogTruncated: false,
});
const browser = await puppeteer.launch({ headless: true });
const report = [];

async function text(page) { return page.$eval("body", (element) => element.innerText); }
async function clickText(page, value) {
  await page.evaluate((label) => [...document.querySelectorAll("button")].find((button) => button.textContent.trim() === label)?.click(), value);
}
async function noOverflow(page, label) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), label);
  assert.ok(await page.evaluate(() => [...document.querySelectorAll(location.pathname.startsWith("/crm/inbox")
    ? '[aria-label="Modo de resposta"] button, [aria-label="Controle do atendimento autônomo"] button'
    : "main button, main select")].filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.height < 43;
  }).length === 0), `${label}: alvos com pelo menos 44px`);
}

try {
  for (const width of process.env.ALICE_UI_WIDTHS ? process.env.ALICE_UI_WIDTHS.split(",").map(Number) : [390, 430, 1440]) {
    const page = await browser.newPage();
    let data = fixture();
    let failure = false;
    let forbidden = false;
    let slow = false;
    let mode = "manual";
    let unit = "SBC";
    const calls = [];
    const errors = [];
    const instance = { id: "instance-test", name: "Comercial Teste", instanceName: "Comercial Teste", unit, status: "connected", userId: user.id, ownerId: user.id, canReply: true };
    const conversation = { id: "conversation-test", instanceId: instance.id, instance, status: "open", assignedTo: user.id, assignedToName: user.name, unreadCount: 0, contact: { id: "contact-test", name: "Cliente Demonstração", phone: "5511999991234", unit, tags: [] }, lastMessage: "Gostaria de saber mais.", lastMessageAt: now, campaignName: "Lipo Laser" };
    await page.setViewport({ width, height: width < 600 ? 932 : 1000, isMobile: width < 600, hasTouch: width < 600 });
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
      calls.push({ path: url.pathname, method: request.method(), body: request.postData() || "", search: url.search });
      let result = { success: true };
      let status = 200;
      if (url.pathname === "/api/auth/me") result = { authenticated: true, user };
      else if (url.pathname === "/api/crm/ai-assistant/autonomy") {
        if (slow) await new Promise((done) => setTimeout(done, 600));
        if (forbidden) { status = 403; result = { error: "Dado privado não deve aparecer" }; }
        else if (failure) { status = 503; result = { error: "Serviço temporariamente indisponível. Tente novamente." }; }
        else if (request.method() === "PATCH") {
          const input = JSON.parse(request.postData());
          data.config.enabled = input.enabled;
          if (input.enabled) data.config.activatedAt = now;
          result = { config: data.config };
        } else if (url.searchParams.has("cursor")) result = { ...data, nextCursor: null, items: [{ ...data.items[0], id: "turn-next-page", conversationId: "conversation-next-page", contactName: "Cliente de demonstração da próxima página" }] };
        else result = data;
      } else if (url.pathname === "/api/crm/ai-assistant/suggestions") {
        const input = request.postData() ? JSON.parse(request.postData()) : {};
        if (input.action === "mode") mode = input.mode;
        result = { mode, draft: null };
      } else if (url.pathname.includes("/instances")) result = { instances: [{ ...instance, unit }], users: [user] };
      else if (url.pathname === "/api/whatsapp/status") result = { connected: true, instance: { ...instance, unit }, status: "connected" };
      else if (url.pathname === "/api/whatsapp/conversations") result = { conversations: [{ ...conversation, aiMode: mode, instance: { ...instance, unit }, contact: { ...conversation.contact, unit } }], appointmentSnapshot: {}, serverTime: now, hasMore: false, queueCounts: { open: 1 } };
      else if (url.pathname === "/api/whatsapp/messages") result = { messages: [{ id: "message-test", messageId: "wa-test", body: conversation.lastMessage, type: "text", fromMe: false, status: "read", timestamp: now }], hasMore: false };
      else if (url.pathname === "/api/whatsapp/saved-replies") result = { replies: [], categories: [] };
      else if (url.pathname.includes("internal-notes")) result = { notes: [], mentionableUsers: [user] };
      else if (url.pathname === "/api/users") result = [];
      await request.respond({ status, contentType: "application/json", body: JSON.stringify(result) });
    });

    await page.goto(`${origin}/crm/alice`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.body.innerText.includes("Alice ativa em SBC"));
    assert.match(await text(page), /somente das últimas 100 horas/);
    await noOverflow(page, `painel ${width}`);
    assert.match(await text(page), /Envio aceito/);
    assert.match(await text(page), /não comprova entrega nem leitura/);
    assert.match(await text(page), /Custo conhecido \(parcial\)/);
    assert.match(await text(page), /Custo não apurado/);
    await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector(".crm-shell-content")?.scrollTo(0, 0); });
    await page.waitForFunction(() => innerWidth < 1024 || Math.abs(document.querySelector(".crm-sidebar").getBoundingClientRect().width - 72) < 1);
    await new Promise((done) => setTimeout(done, 150));
    await page.screenshot({ path: `${output}/${width === 1440 ? "desktop" : width === 390 ? "mobile" : "user-430"}.png`, fullPage: true });
    await page.$eval("#alice-turns-title", (element) => element.closest("section").scrollIntoView({ block: "start" }));
    await page.screenshot({ path: `${output}/alice-list-${width}.png`, fullPage: true });
    await page.select('section[aria-labelledby="alice-turns-title"] select', "attention");
    assert.equal(await page.$$eval('section[aria-labelledby="alice-turns-title"] li', (items) => items.length), 3);
    await clickText(page, "Carregar próximos registros");
    await page.waitForFunction(() => document.body.innerText.includes("Cliente de demonstração da próxima página"));
    assert.equal(await page.$eval('section[aria-labelledby="alice-turns-title"] select', (element) => element.value), "attention", "paginação preserva filtro");
    assert.ok(calls.some((call) => call.path.endsWith("autonomy") && call.search.includes("cursor=page-2-test")));
    await page.select('section[aria-labelledby="alice-turns-title"] select', "queue");
    assert.match(await text(page), /Nenhum atendimento neste filtro/);
    await page.select('section[aria-labelledby="alice-turns-title"] select', "all");
    await page.focus('button[aria-pressed="false"]');
    const focusStyle = await page.$eval('button[aria-pressed="false"]', (element) => getComputedStyle(element).outlineStyle);
    assert.notEqual(focusStyle, "none", "foco de teclado visível");
    await clickText(page, "30 dias");
    await page.waitForFunction(() => document.querySelector('button[aria-pressed="true"]')?.textContent === "30 dias");
    await new Promise((done) => setTimeout(done, 150));
    assert.ok(calls.some((call) => call.path.endsWith("autonomy") && call.search.includes("days=30")));
    assert.doesNotMatch(await text(page), /Cliente de demonstração da próxima página/, "troca de período reinicia a paginação");

    await clickText(page, "Pausar envios agora");
    await page.waitForFunction(() => document.body.innerText.includes("Atendimento autônomo pausado"));
    assert.ok(calls.some((call) => call.method === "PATCH" && call.body === '{"enabled":false}'));
    data.config.activatedAt = null;
    data.config.backlogAnchorConversationId = null;
    await clickText(page, "Atualizar");
    await page.waitForSelector("#alice-backlog-anchor");
    await page.select("#alice-backlog-anchor", "anchor-first");
    await clickText(page, "Revisar e ativar em SBC");
    await page.waitForFunction(() => document.activeElement?.getAttribute("type") === "checkbox");
    assert.ok(await page.$eval('input[type="checkbox"]', (element) => !element.checked));
    await page.click('input[type="checkbox"]');
    await noOverflow(page, `ativação ${width}`);
    await page.screenshot({ path: `${output}/alice-controls-${width}.png`, fullPage: true });
    await clickText(page, "Ativar agora em SBC");
    await page.waitForFunction(() => document.body.innerText.includes("Alice ativa em SBC"));
    assert.ok(calls.some((call) => call.body.includes('"backlogAnchorConversationId":"anchor-first"')));
    assert.ok(calls.some((call) => call.body.includes('"backlogPreviewToken":"preview-first-test"')));

    failure = true;
    await clickText(page, "Atualizar");
    await page.waitForSelector('[role="alert"]');
    assert.match(await text(page), /Alice ativa em SBC/, "erro de refresh preserva estado conhecido e botão pausa");
    await noOverflow(page, `erro ${width}`);
    await page.$eval('[role="alert"]', (element) => element.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: `${output}/alice-error-${width}.png`, fullPage: true });
    failure = false;
    data.items = [];
    await clickText(page, "Tentar novamente");
    await page.waitForFunction(() => document.body.innerText.includes("Ainda não há atendimentos neste período"));
    await page.$eval("#alice-turns-title", (element) => element.closest("section").scrollIntoView({ block: "start" }));
    await page.screenshot({ path: `${output}/alice-empty-${width}.png`, fullPage: true });
    forbidden = true;
    await clickText(page, "Atualizar");
    await page.waitForFunction(() => document.body.innerText.includes("Seu acesso não permite"));
    assert.doesNotMatch(await text(page), /Dado privado|Cliente de demonstração/);
    forbidden = false;
    slow = true;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.innerText.includes("Carregando acompanhamento da Alice"));
    await page.screenshot({ path: `${output}/alice-loading-${width}.png`, fullPage: true });
    await page.waitForFunction(() => document.body.innerText.includes("Alice ativa em SBC"));
    slow = false;
    assert.equal(calls.filter((call) => call.path.includes("suggestions") && call.method === "POST").length, 0);
    assert.equal(calls.filter((call) => call.path.includes("/whatsapp/send")).length, 0);

    await page.goto(`${origin}/crm/inbox?unit=SBC`, { waitUntil: "networkidle0" });
    await page.waitForSelector('[data-conversation-id="conversation-test"]');
    await page.click('[data-conversation-id="conversation-test"]');
    await page.waitForSelector('button[aria-label="Atendimento autônomo da Alice"]');
    await page.click('button[aria-label="Atendimento autônomo da Alice"]');
    assert.equal(mode, "manual", "primeiro clique ainda não ativa envios");
    await page.waitForSelector('section[aria-label="Confirmar modo autônomo"]');
    await clickText(page, "Ativar nesta conversa");
    await page.waitForFunction(() => document.body.innerText.includes("Alice em modo autônomo nesta conversa"));
    assert.equal(mode, "agent");
    await noOverflow(page, `compositor ${width}`);
    await page.waitForFunction(() => !document.querySelector('[style*="toastSlideIn"], [style*="toastSlideOut"]'));
    await page.keyboard.press("Tab");
    await page.focus('button[aria-label="Atendimento autônomo da Alice"]');
    assert.notEqual(await page.$eval('button[aria-label="Atendimento autônomo da Alice"]', (element) => getComputedStyle(element).outlineStyle), "none", "controle selecionado mantém foco visível");
    const contrast = await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      const color = (css) => { context.clearRect(0, 0, 1, 1); context.fillStyle = css; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data]; };
      const luminance = (rgb) => rgb.slice(0, 3).map((v) => v / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, index) => sum + v * [.2126, .7152, .0722][index], 0);
      const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
      const background = (element) => { let rgb = [255, 255, 255]; const parents = []; for (let node = element; node; node = node.parentElement) parents.push(node); for (const node of parents.reverse()) { const rgba = color(getComputedStyle(node).backgroundColor); const alpha = rgba[3] / 255; rgb = rgb.map((v, i) => rgba[i] * alpha + v * (1 - alpha)); } return rgb; };
      const measured = {};
      for (const name of ["modeBarLabel", "modeBarCaption"]) { const element = document.querySelector(`[class*="${name}"]`); measured[name] = ratio(color(getComputedStyle(element).color), background(element)); }
      const selected = document.querySelector('button[aria-label="Atendimento autônomo da Alice"]');
      measured.selectedOutline = ratio(color(getComputedStyle(selected).outlineColor), background(selected));
      return measured;
    });
    assert.ok(contrast.modeBarLabel >= 4.5 && contrast.modeBarCaption >= 4.5 && contrast.selectedOutline >= 3, JSON.stringify(contrast));
    await page.screenshot({ path: `${output}/alice-conversation-${width}.png`, fullPage: true });
    await clickText(page, "Assumir atendimento");
    await page.waitForFunction(() => document.querySelector('button[aria-label="Resposta manual"]')?.getAttribute("aria-pressed") === "true");
    assert.equal(mode, "manual");
    assert.equal(calls.filter((call) => call.path.includes("suggestions") && call.method === "POST").length, 0, "modo não chama modelo automaticamente");
    assert.equal(calls.filter((call) => call.path.includes("/whatsapp/send")).length, 0, "teste não envia mensagem");
    unit = "Osasco";
    await page.goto(`${origin}/crm/inbox?unit=Osasco`, { waitUntil: "networkidle0" });
    await page.waitForSelector('[data-conversation-id="conversation-test"]');
    await page.click('[data-conversation-id="conversation-test"]');
    await page.waitForSelector('button[aria-label="Sugestões da Alice"]');
    assert.equal(await page.$('button[aria-label="Atendimento autônomo da Alice"]'), null, "Osasco não oferece modo autônomo");
    assert.equal(errors.length, 0, errors.join("\n"));
    report.push({ width, result: "passed", contrast, screenshotDirectory: output });
    await page.close();
  }
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
