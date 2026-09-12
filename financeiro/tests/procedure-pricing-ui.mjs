// Run against a local Next server. All API calls are synthetic and intercepted before reaching it.
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';
import { defaultState, defaultPricing, serializeProtocol } from '../src/lib/procedure-pricing.ts';
const origin = process.env.PRICING_UI_ORIGIN || 'http://127.0.0.1:3097';
assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const output = await mkdtemp(join(tmpdir(), 'virtuosa-pricing-ui-'));
const state = { ...defaultState, nome: 'Procedimento de demonstração com nome longo para testar quebra de texto e detalhes do custo por sessão', aluguel: 12000, diasTrabalhados: 20, horasDia: 5, qtdSalas: 2, insumos: [{ nome: 'Produto sintético para demonstração', valor: 300, quantidade: 1, perdaPercentual: 0, unidade: 'ml' }], impostos: 6, taxaCartao: 4, descontoPaciente: 10, pricing: { ...defaultPricing, unit: 'Osasco', referenceMonth: '2026-09', occupancy: 50, salesCommission: 10, targetMargin: 20, minMargin: 10, installments: 3 } };
const protocol = { ...serializeProtocol(state), id: 'fixture-protocol', updatedAt: '2026-09-11T12:00:00Z' };
const user = { id: 'pricing-ui', name: 'Teste local', role: 'ADMINISTRADOR', unit: 'Osasco', permissions: { admin: true } };
const browser = await puppeteer.launch({ headless: true });
const results = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function clickText(page, selector, text) {
  const handle = await page.evaluateHandle((selector, text) => [...document.querySelectorAll(selector)].find(el => el.textContent.trim() === text), selector, text);
  assert.ok(await handle.evaluate(el => Boolean(el)), `controle disponível: ${text}`);
  await handle.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await pause(80);
  await handle.asElement().click(); await handle.dispose();
}
try {
  for (const theme of ['light', 'dark']) for (const width of [390, 430, 1440]) {
    const page = await browser.newPage();
    const errors = [], calls = [], mutations = [];
    await page.setViewport({ width, height: 900, hasTouch: width < 600, isMobile: width < 600 });
    page.on('pageerror', e => errors.push(e.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) {
        calls.push(url.pathname);
        let data = {};
        if (url.pathname === '/api/auth/me') data = { authenticated: true, user };
        if (url.pathname === '/api/pricing') {
          data = { protocols: [protocol] };
          if (request.method() !== 'GET') { const body = JSON.parse(request.postData() || '{}'); mutations.push(body); data = { ...body, id: protocol.id, updatedAt: protocol.updatedAt }; }
        }
        if (url.pathname === '/api/payment-fee-configs') data = { configurations: [{ id: 'fixture-fee', unit: 'Osasco', name: 'Operadora de demonstração', method: 'credito', fixedRate: 1, fixedFee: 2, installmentRates: { 3: 3 }, brand: 'Teste' }] };
        void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) }); return;
      }
      if (url.origin === origin) void request.continue(); else void request.abort();
    });
    await page.evaluateOnNewDocument((user, theme) => {
      localStorage.setItem('virtuosa_user', JSON.stringify(user));
      localStorage.setItem('virtuosa_global_unit', 'Osasco');
      localStorage.setItem('virtuosa_theme', theme);
    }, user, theme);
    await page.goto(`${origin}/calculadora`, { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForSelector('.pricing-page');
    await page.evaluate(theme => { document.documentElement.dataset.mode = theme; document.documentElement.dataset.theme = theme; document.documentElement.classList.toggle('dark', theme === 'dark'); }, theme);
    assert.equal(await page.$eval('.pricing-target h2', el => el.textContent), '—', 'cenário vazio sem preço enganoso');
    await clickText(page, '.pricing-tabs button', 'Procedimentos salvos');
    await page.waitForSelector('.pricing-saved-grid button');
    await clickText(page, '.pricing-saved-grid button', 'Abrir');
    await page.waitForFunction(() => document.querySelector('.pricing-target h2')?.textContent.includes('700,00'));
    const fieldCheck = await page.evaluate(() => [...document.querySelectorAll('.calc-step input')].map(input => ({ id: input.id, label: Boolean(document.querySelector(`label[for="${input.id}"]`)), help: Boolean(input.getAttribute('aria-describedby')), height: input.getBoundingClientRect().height })));
    assert.ok(fieldCheck.length >= 35);
    assert.ok(fieldCheck.every(f => f.id && f.label && f.help && f.height >= 44));
    const inputId = await page.evaluate(() => [...document.querySelectorAll('label')].find(l => l.textContent === 'Margem-alvo da clínica').htmlFor);
    const input = await page.$(`[id="${inputId}"]`);
    const before = calls.length;
    await input.click(); await input.evaluate(el => el.select()); await input.type('25'); await page.keyboard.press('Tab'); await page.keyboard.press('Escape');
    await pause(250);
    assert.equal(calls.length, before, 'nenhuma consulta por digitação');
    await input.click(); await input.evaluate(el => el.select()); await input.type('20'); await page.keyboard.press('Tab'); await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('.pricing-target h2')?.textContent.includes('700,00'));
    const help = await page.$('button[aria-label="Ajuda: Margem-alvo da clínica"]');
    await help.evaluate(el => el.scrollIntoView({ block: 'center' }));
    if (width < 600) await help.tap(); else await help.hover();
    await page.waitForSelector('.calc-help-popup', { visible: true });
    const popup = await page.$eval('.calc-help-popup', el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, text: el.textContent }; });
    assert.ok(popup.left >= 0 && popup.right <= width + 1, 'ajuda dentro do viewport');
    assert.ok(popup.text.includes('Não é acréscimo sobre custo'));
    await page.screenshot({ path: join(output, `${theme}-${width}-help.png`) });
    await page.keyboard.press('Escape');
    await page.waitForSelector('.calc-help-popup', { hidden: true });
    // Keyboard focus also opens the help; Escape dismisses it without changing the value.
    await page.mouse.move(0, 0); await page.keyboard.press('Tab');
    await page.evaluate(() => document.querySelector('button[aria-label="Ajuda: Unidade do cálculo"]').focus());
    await page.waitForSelector('.calc-help-popup', { visible: true });
    await page.keyboard.press('Escape');
    await page.waitForSelector('.calc-help-popup', { hidden: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await pause(100);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, 'sem overflow horizontal');
    if (width < 768) assert.ok(await page.evaluate(() => { const bar = document.querySelector('.pricing-bottom').getBoundingClientRect(); const nav = document.querySelector('.mobile-tab-bar')?.getBoundingClientRect(); return !nav || bar.bottom <= nav.top; }), 'barra de salvar não fica atrás da navegação mobile');
    await page.screenshot({ path: join(output, `${theme}-${width}-top.png`) });
    await clickText(page, '.pricing-actions button', 'Atualizar protocolo');
    await page.waitForFunction(() => document.body.textContent.includes('Protocolo salvo.'));
    assert.equal(mutations.at(-1).insumos.version, 2);
    assert.equal(mutations.at(-1).insumos.pricing.targetMargin, 20);
    assert.equal(mutations.at(-1).precoSugerido, 700);
    await clickText(page, '.pricing-panel button', 'Consultar taxas cadastradas');
    await page.waitForSelector('#pricing-fee');
    await page.select('#pricing-fee', 'fixture-fee:3');
    await clickText(page, '.pricing-actions button', 'Salvar cópia');
    await page.waitForFunction(() => document.body.textContent.includes('Cópia salva.'));
    assert.equal(mutations.at(-1).insumos.pricing.paymentFixed, 2);
    assert.equal(mutations.at(-1).insumos.pricing.installments, 3);
    assert.equal(mutations.at(-1).taxaCartao, 4);
    assert.ok(!mutations.at(-1).id, 'cópia não atualiza original');
    if (width === 390 && theme === 'light') {
      await page.waitForFunction(() => !document.body.textContent.includes('Cópia salva. O original foi preservado.'), { timeout: 10000 });
      await input.evaluate(el => el.scrollIntoView({ block: 'center' }));
      await input.click(); await input.evaluate(el => el.select()); await input.type('23'); await page.keyboard.press('Tab'); await page.keyboard.press('Escape');
      assert.equal(await input.evaluate(el => el.value), '23', 'edição do cenário antes de testar descarte');
      await clickText(page, '.pricing-header button', 'Novo cálculo');
      await page.screenshot({ path: join(output, 'unsaved-dialog.png') });
      await page.waitForFunction(() => document.body.textContent.includes('Alterações não salvas'));
      await clickText(page, 'button', 'Cancelar');
      await pause(250);
      assert.equal(await input.evaluate(el => el.value), '23', 'cancelar troca preserva alterações');
    }
    assert.deepEqual(errors, []);
    results.push({ theme, width, fields: fieldCheck.length, apiCalls: calls.length, syntheticWrites: mutations.length });
    console.log(`OK ${theme} ${width}px`);
    await page.close();
  }
  console.log(JSON.stringify({ output, results }));
} finally { await browser.close(); }
