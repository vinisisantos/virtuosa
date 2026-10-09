import assert from "node:assert/strict";
import puppeteer from "puppeteer";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const origin = "http://127.0.0.1:3210";
const instanceId = "a6871ee7-8352-4b66-bfb2-b8dba9e4f8e3";
const panel = '[aria-label="Avisos ao grupo de avaliações SBC"]';
const output = await mkdtemp(join(tmpdir(), "virtuosa-evaluation-group-"));
console.log(JSON.stringify({ output }));
const browser = await puppeteer.launch({ headless: true });
const results = [];
const findButton = async (page, label, selector = "button") => {
  const handle = await page.waitForFunction((label, selector) => [...document.querySelectorAll(selector)]
    .find(el => el.textContent.trim() === label && el.getClientRects().length), {}, label, selector);
  return handle.asElement();
};
const clickButton = async (page, label, selector) => {
  const handle = await findButton(page, label, selector);
  await page.waitForFunction(element => !element.disabled, {}, handle);
  await handle.evaluate(el => el.scrollIntoView({ block: "center" }));
  await page.waitForFunction(element => {
    const rect = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  }, {}, handle);
  await handle.click(); await handle.dispose();
};
const isDisabled = async (page, label) => {
  const handle = await findButton(page, label);
  const disabled = await handle.evaluate(el => el.disabled);
  await handle.dispose(); return disabled;
};
const fit = async (page, label) => {
  await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"]')]
    .every(el => el.getAnimations().every(animation => animation.playState !== "running")));
  const layout = await page.evaluate(selector => ({
    pageFits: document.documentElement.scrollWidth <= innerWidth + 1,
    panelFits: [...document.querySelectorAll(selector)].every(el => el.scrollWidth <= el.clientWidth + 1),
    dialogFits: [...document.querySelectorAll('[role="dialog"]')].every(el => {
      const rect = el.getBoundingClientRect();
      return rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1
        && el.scrollWidth <= el.clientWidth + 1;
    }),
  }), panel);
  assert.deepEqual(layout, { pageFits: true, panelFits: true, dialogFits: true }, label);
};
const screenshot = (page, name) => page.screenshot({ path: join(output, `${name}.png`), fullPage: true });

try {
  for (const width of [390, 430, 1440]) {
    if (process.env.TEST_WIDTH && width !== Number(process.env.TEST_WIDTH)) continue;
    const page = await browser.newPage();
    const errors = [], calls = [], writes = [];
    const user = { id: "test-admin", name: "Administrador Teste", role: "ADMINISTRADOR", unit: "SBC", permissions: { crm: true, admin: true } };
    const state = { config: null, notices: [], canManage: true, connected: true };
    let loadFails = true, groups = [], saveFails = false;
    const groupA = { id: "120000000000000000000000000000000000000000000000000000000000000000000000000000000@g.us", name: "AVALIAÇOES SBC", size: 8, announce: false };
    const groupB = { id: "120000000001-123456789@g.us", name: "AVALIAÇOES SBC", size: 15, announce: true };
    await page.setViewport({ width, height: width === 430 ? 932 : 844, isMobile: width < 600, hasTouch: width < 600 });
    await page.evaluateOnNewDocument(value => {
      localStorage.setItem("virtuosa_user", JSON.stringify(value));
      localStorage.setItem("virtuosa_global_unit", "SBC");
    }, user);
    page.on("pageerror", error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on("request", async req => {
      const url = new URL(req.url());
      if (url.origin !== origin && !["data:", "blob:"].includes(url.protocol)) return req.abort();
      if (!url.pathname.startsWith("/api/")) return req.continue();
      calls.push({ path: url.pathname, method: req.method() });
      let data = { success: true }, status = 200;
      const body = req.postData() ? JSON.parse(req.postData()) : null;
      if (req.method() !== "GET") writes.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), body });
      if (url.pathname === "/api/auth/me") data = { authenticated: true, user };
      else if (url.pathname === "/api/crm/automations") data = { automations: [] };
      else if (url.pathname.includes("/instances")) data = { instances: [], users: [] };
      else if (url.pathname === "/api/users") data = [];
      else if (url.pathname === "/api/whatsapp/conversations") data = { conversations: [], hasMore: false, queueCounts: {}, serverTime: new Date().toISOString() };
      else if (url.pathname === "/api/whatsapp/evaluation-group") {
        assert.equal(url.searchParams.get("targetInstanceId"), instanceId);
        assert.equal(url.searchParams.get("unit"), "SBC");
        await new Promise(resolve => setTimeout(resolve, 600));
        if (req.method() === "GET") {
          data = state;
          if (loadFails) { status = 503; data = { error: "Falha simulada ao carregar os avisos. Tente novamente." }; }
        } else if (body.action === "discover") data = { groups };
        else if (body.action === "configure") {
          if (saveFails) { status = 502; data = { error: "O grupo foi alterado. Consulte novamente antes de ativar." }; }
          else {
            state.config = { enabled: body.enabled, groupJid: body.groupJid || state.config?.groupJid, groupName: "AVALIAÇOES SBC", instanceId,
              activatedAt: "2026-10-09T10:00:00.000Z", approvedBy: user.id };
            data = { success: true, config: state.config };
          }
        }
      }
      await req.respond({ status, contentType: "application/json", body: JSON.stringify(data) });
    });

    await page.goto(`${origin}/crm/automations`, { waitUntil: "networkidle0" });
    await page.waitForSelector(panel);
    assert.equal(calls.filter(call => call.path === "/api/whatsapp/evaluation-group").length, 0, "painel fechado não consulta grupo");
    await page.click(`${panel} > button`);
    await page.waitForFunction(() => document.body.innerText.includes("Carregando os avisos"));
    await fit(page, `${width} loading`);
    await screenshot(page, `${width}-loading`);
    await page.waitForSelector(`${panel} [role=alert]`);
    await fit(page, `${width} load-error`);
    await screenshot(page, `${width}-load-error`);
    loadFails = false;
    await clickButton(page, "Atualizar", `${panel} button`);
    await page.waitForFunction(() => document.body.innerText.includes("Nenhum aviso registrado."));
    assert.equal(writes.length, 0, "consultar histórico não envia nem configura nada");
    await fit(page, `${width} empty-history`);
    await clickButton(page, "Configurar grupo");
    await page.waitForSelector('[role="dialog"]', { visible: true });
    assert.equal(await isDisabled(page, "Ativar para novas avaliações"), true);
    await clickButton(page, "Conferir grupo na Leads - Paloma");
    await page.waitForFunction(() => document.body.innerText.includes("Nenhum grupo com esse nome foi encontrado."));
    assert.equal(await isDisabled(page, "Ativar para novas avaliações"), true);
    await fit(page, `${width} group-not-found`);
    await screenshot(page, `${width}-group-not-found`);

    groups = [groupA, groupB];
    await clickButton(page, "Conferir grupo na Leads - Paloma");
    await page.waitForSelector('[role="dialog"] input[type="radio"]');
    assert.equal(await page.$$eval('[role="dialog"] input[type="radio"]', inputs => inputs.filter(input => input.checked).length), 0,
      "homônimos não são escolhidos automaticamente");
    await page.click('[role="dialog"] input[type="radio"]');
    assert.equal(await isDisabled(page, "Ativar para novas avaliações"), true, "consentimento continua obrigatório");
    await page.click('[role="dialog"] input[type="checkbox"]');
    assert.equal(await isDisabled(page, "Ativar para novas avaliações"), false);
    await page.$$eval('[role="dialog"] input[type="radio"]', inputs => inputs[1].click());
    assert.equal(await page.$eval('[role="dialog"] input[type="checkbox"]', input => input.checked), false, "trocar grupo invalida confirmação");
    await fit(page, `${width} duplicate-groups`);
    await screenshot(page, `${width}-duplicate-groups`);
    await page.click('[role="dialog"] input[type="checkbox"]');
    saveFails = true;
    await clickButton(page, "Ativar para novas avaliações");
    await page.waitForSelector('[role="dialog"] [role="alert"]');
    await fit(page, `${width} save-error`);
    await screenshot(page, `${width}-save-error`);
    assert.equal(state.config, null);
    saveFails = false;
    await clickButton(page, "Ativar para novas avaliações");
    await page.waitForSelector('[role="dialog"]', { hidden: true });
    await page.waitForFunction(() => document.body.innerText.includes("Automação ativa"));
    const save = writes.filter(write => write.body?.action === "configure").at(-1);
    assert.deepEqual(save.body, { action: "configure", enabled: true, groupJid: groupB.id, confirmTeamAccess: true });
    assert.equal(state.notices.length, 0, "ativação não cria avisos retroativos");
    await fit(page, `${width} activated`);
    await screenshot(page, `${width}-activated`);

    state.notices = ["queued", "processing", "sending", "submitted", "uncertain", "cancelled"].map((value, index) => ({
      id: `notice-${index}`, clientName: index === 4 ? "NomeMuitoLongoSemEspacos".repeat(6) : `Cliente fictícia ${index}`,
      clientPhone: "5511900000000", evaluationProcedure: "Procedimento com descrição extensa para validar a leitura no celular e no computador sem ocultar informações importantes",
      startTime: "2026-11-20T17:30:00.000Z", state: value, createdAt: "2026-10-09T12:00:00.000Z", submittedAt: null, lastError: null,
    }));
    await clickButton(page, "Atualizar", `${panel} button`);
    await page.waitForSelector(`${panel} article`);
    await fit(page, `${width} long-history`);
    assert.match(await page.$eval(panel, element => element.innerText), /Conferir no WhatsApp/);
    assert.match(await page.$eval(panel, element => element.innerText), /não comprova entrega ou leitura/);
    await screenshot(page, `${width}-history`);
    await page.$$eval(`${panel} article`, articles => articles[4].scrollIntoView({ block: "center" }));
    await screenshot(page, `${width}-long-history`);

    state.connected = false;
    await clickButton(page, "Atualizar", `${panel} button`);
    await page.waitForFunction(() => document.body.innerText.includes("Leads - Paloma está desconectada"));
    await clickButton(page, "Configurar grupo");
    await page.waitForSelector('[role="dialog"]', { visible: true });
    assert.equal(await isDisabled(page, "Conferir grupo na Leads - Paloma"), true);
    await clickButton(page, "Pausar avisos");
    await page.waitForSelector('[role="dialog"]', { hidden: true });
    await page.waitForFunction(() => document.body.innerText.includes("Automação desativada"));
    assert.equal(writes.at(-1).body.enabled, false);
    state.canManage = false;
    await clickButton(page, "Atualizar", `${panel} button`);
    await page.waitForFunction(selector => !document.querySelector(selector)?.innerText.includes("Configurar grupo"), {}, panel);
    await fit(page, `${width} read-only`);
    assert.equal(writes.some(write => !["discover", "configure"].includes(write.body?.action)), false, "nenhum envio de mensagem/teste");
    assert.deepEqual(errors, []);
    results.push({ width, requests: calls.filter(call => call.path === "/api/whatsapp/evaluation-group").length,
      writes: writes.length, passed: true });
    console.log(`PASS ${width}: carregamento/erros/consentimento/homônimos/ativação/histórico/pausa/consulta`);
    await page.close();
  }
  console.log(JSON.stringify({ results, output }));
} catch (error) {
  const page = (await browser.pages()).at(-1);
  if (page) {
    await screenshot(page, "failure");
    console.error(await page.evaluate(() => ({ text: document.querySelector('[role="dialog"]')?.innerText,
      inputs: [...document.querySelectorAll('[role="dialog"] input')].map(input => ({ type: input.type, checked: input.checked, disabled: input.disabled })),
      buttons: [...document.querySelectorAll('[role="dialog"] button')].map(button => ({ text: button.textContent, disabled: button.disabled })) })));
  }
  throw error;
} finally {
  await browser.close();
}
