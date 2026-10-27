// Local browser regression. Every API response is intercepted; never use a remote origin.
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const origin = process.env.COSTS_UI_ORIGIN || 'http://127.0.0.1:3098';
assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const output = await mkdtemp(join(tmpdir(), 'virtuosa-cost-groups-ui-'));
const user = { id: 'costs-local', name: 'Teste local', role: 'ADMINISTRADOR', unit: 'Osasco', permissions: { admin: true, financeiro: true, finCustos: true } };
const description = 'Anúncio terça-feira com descrição extensa para conferir quebra de linha e legibilidade no celular';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function clickText(page, label, scope = 'body', contains = false) {
  const handle = await page.evaluateHandle((label, scope, contains) => [...document.querySelector(scope).querySelectorAll('button')].find(button => contains ? button.textContent?.includes(label) : button.textContent?.trim() === label) || null, label, scope, contains);
  const element = handle.asElement();
  assert.ok(element, `botão disponível: ${label}`);
  await element.evaluate(node => node.scrollIntoView({ block: 'center' }));
  await element.click();
  await handle.dispose();
}
async function clickSelector(page, selector) {
  const element = await page.waitForSelector(selector);
  await element.evaluate(node => node.scrollIntoView({ block: 'center' }));
  await element.click();
}
async function fill(page, selector, text) {
  const input = await page.waitForSelector(selector);
  await input.evaluate(node => node.scrollIntoView({ block: 'center' }));
  await input.click({ clickCount: 3 });
  await input.type(text);
}
async function layout(page, selector) {
  const dimensions = await page.$eval(selector, element => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: document.documentElement.clientWidth, overflow: element.scrollWidth > element.clientWidth + 1 };
  });
  if (dimensions.overflow) {
    console.error(await page.$$eval(`${selector} *`, elements => elements.map(element => ({ tag: element.tagName, className: element.className, text: element.textContent?.slice(0, 80), right: element.getBoundingClientRect().right, width: element.clientWidth, scroll: element.scrollWidth })).filter(element => element.right > document.documentElement.clientWidth + 1).slice(0, 15)));
    await page.screenshot({ path: join(output, 'overflow.png'), fullPage: true });
  }
  assert.ok(dimensions.left >= -1 && dimensions.right <= dimensions.width + 1 && !dimensions.overflow, `${selector} cabe no viewport: ${JSON.stringify(dimensions)}`);
}

const browser = await puppeteer.launch({ headless: true });
const results = [];
try {
  for (const width of [390, 430, 1440]) {
    let fixed = [{ id: 1, name: 'Marketing mensal', value: 1000, category: 'Marketing', unit: 'Osasco', date: '2026-10-01', recurrence: 'monthly' }];
    let bills = [{ id: 2, name: 'Anúncio segunda-feira', value: 200, category: 'Marketing', unit: 'Osasco', type: 'variavel', dueDateManual: '2026-10-19', refMonth: '2026-10', payments: {} },
      { id: 3, name: 'Não pertence a Osasco', value: 900, category: 'Marketing', unit: 'SBC', type: 'variavel', dueDateManual: '2026-10-19', payments: {} }];
    let revision = '2026-10-22T12:00:00.000Z';
    let failBackup = false;
    let delayBackup = true;
    const mutations = [];
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => { console.error('Dialog:', dialog.message()); void dialog.accept(); });
    await page.setViewport({ width, height: 900, isMobile: width < 600, hasTouch: width < 600 });
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) {
        const publicFont = ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname);
        void (url.origin === origin || publicFont ? request.continue() : request.abort());
        return;
      }
      void (async () => {
        let data = {};
        let status = 200;
        if (url.pathname === '/api/auth/me') data = { authenticated: true, user };
        else if (url.pathname === '/api/backup') {
          if (request.method() === 'POST') {
            const body = JSON.parse(request.postData());
            mutations.push(body);
            assert.equal(body.expectedUpdatedAt, revision);
            fixed = body.fixed; bills = body.bills;
            revision = new Date(Date.parse(revision) + 1000).toISOString();
            data = { success: true, updatedAt: revision };
          } else {
            if (delayBackup) { await pause(1500); delayBackup = false; }
            status = failBackup ? 503 : 200;
            data = failBackup ? { error: 'Falha de teste no carregamento' } : { exists: true, fixed, bills, logs: [], goals: {}, updatedAt: revision };
          }
        } else if (url.pathname === '/api/costs/automatic') data = { payrollCompetence: { month: 9, year: 2026 }, missingPayrollUnits: [], payroll: null, vacationAdvances: [], productOrders: [], productOrdersTotal: 0 };
        else if (url.pathname === '/api/packages') data = [];
        await request.respond({ status, contentType: 'application/json', body: JSON.stringify(data) });
      })().catch(error => errors.push(error.message));
    });
    await page.evaluateOnNewDocument(user => {
      localStorage.setItem('virtuosa_user', JSON.stringify(user));
      localStorage.setItem('virtuosa_global_unit', 'Osasco');
      localStorage.setItem('virtuosa_financeiro_tab', 'custos');
    }, user);
    await page.goto(`${origin}/?tab=custos&month=9&year=2026`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => document.body.textContent?.includes('Carregando despesas…'), { polling: 50 });
    await layout(page, 'section[aria-label="Despesas manuais"]');
    await page.waitForFunction(() => document.body.textContent?.includes('Anúncio segunda-feira'));
    await page.evaluate(() => document.fonts.ready);
    await layout(page, '.costs-page');
    await page.screenshot({ path: join(output, `costs-top-${width}.png`), fullPage: true });
    assert.equal(await page.evaluate(() => document.body.textContent.includes('Não pertence a Osasco')), false);
    await clickText(page, 'addNova Despesa');
    // Category comes first; Marketing sits behind "Mais" in the collapsed grid.
    assert.equal(await page.$eval('[role="dialog"] [role="radio"][aria-checked="true"]', tile => tile.textContent), 'more_horizOutros');
    await pause(400);
    await page.screenshot({ path: join(output, `costs-form-empty-${width}.png`), fullPage: true });
    await clickText(page, 'grid_viewMais', '[role="dialog"]');
    await clickText(page, 'campaignMarketing', '[role="dialog"]');
    await fill(page, '#cost-detail', description);
    await fill(page, '#cost-value', '5000');
    await fill(page, '[role="dialog"] .date-picker-text-input', '03112026');
    await page.keyboard.press('Tab');
    await clickSelector(page, '[role="dialog"] h2');
    await clickText(page, 'Mais opções', '[role="dialog"]', true);
    await page.select('select[aria-label="Mês de referência"]', '10');
    await clickSelector(page, '[role="dialog"] input[type="checkbox"]');
    await pause(200);
    if (!await page.$('#cost-group-target')) {
      console.error(await page.$eval('[role="dialog"]', dialog => ({ text: dialog.textContent, checkbox: dialog.querySelector('input[type="checkbox"]')?.checked, inputs: [...dialog.querySelectorAll('input')].map(input => ({ value: input.value, disabled: input.disabled })) })));
      await page.screenshot({ path: join(output, 'group-picker-failure.png'), fullPage: true });
      console.error({ output });
    }
    await page.waitForSelector('#cost-group-target');
    assert.deepEqual(await page.select('#cost-group-target', 'bill:2'), ['bill:2']);
    await layout(page, '[role="dialog"] > div');
    await page.screenshot({ path: join(output, `costs-form-${width}.png`), fullPage: true });
    assert.equal(await page.$eval('#cost-group-target', select => [...select.options].some(option => option.text.includes('Não pertence'))), false);
    assert.match(await page.$eval('[role="dialog"]', dialog => dialog.textContent.replace(/\s/g, ' ')), /Adicionar · R\$ 50,00/);
    await clickText(page, 'Adicionar ·', '[role="dialog"]', true);
    await pause(200);
    if (!await page.$('[data-cost-group="true"]')) {
      console.error(await page.evaluate(() => ({ text: document.body.textContent, inputs: [...document.querySelectorAll('[role="dialog"] input, [role="dialog"] select')].map(input => ({ value: input.value, name: input.getAttribute('aria-label') })) })));
      await page.screenshot({ path: join(output, 'save-failure.png'), fullPage: true });
      console.error({ output });
    }
    await page.waitForSelector('[data-cost-group="true"]');
    const closed = await page.$eval('[data-cost-group="true"]', element => element.textContent);
    assert.match(closed, /250,00/);
    assert.equal(closed.includes(description), false, 'grupo fechado mostra o total, não o detalhamento');
    for (let count = 0; count < 40 && mutations.length === 0; count++) await pause(200);
    assert.equal(mutations.length, 1, 'uma única gravação contém âncora e novo lançamento');
    const newBill = bills.find(item => item.name === description);
    assert.equal(newBill.refMonth, '2026-10');
    assert.equal(newBill.dueDateManual, '2026-11-03');
    assert.equal(newBill.type, 'variavel');
    assert.equal(newBill.expenseGroups['2026-10'], bills[0].expenseGroups['2026-10']);
    assert.equal(newBill.value, 50);
    await clickSelector(page, '[data-cost-group="true"] > button');
    await page.waitForFunction(description => document.body.textContent?.includes(description), {}, description);
    assert.match(await page.$eval('[data-cost-group="true"]', element => element.textContent), /03\/11\/2026/);
    await layout(page, '[data-cost-group="true"]');
    const targetSize = await page.$$eval('[data-cost-group="true"] button', buttons => buttons.map(button => button.getBoundingClientRect().height));
    assert.ok(targetSize.every(height => height >= 44), 'controles têm alvo de toque de 44px');
    await clickSelector(page, `button[aria-label="Marcar como pago: ${description}"]`);
    assert.match(await page.$eval('[data-cost-group="true"] > button', element => element.textContent), /Parcial/);
    await page.screenshot({ path: join(output, `costs-${width}.png`), fullPage: true });
    await clickSelector(page, 'button[aria-label="Editar Anúncio segunda-feira"]');
    assert.equal(await page.$$eval('[role="dialog"] input[type="checkbox"]', inputs => inputs.length), 0, 'editar mantém o vínculo existente');
    await fill(page, '[role="dialog"] input[placeholder="R$ 0,00"]', '21000');
    await clickText(page, 'Salvar Alterações', '[role="dialog"]');
    await page.waitForFunction(() => document.querySelector('[data-cost-group="true"] > button')?.textContent?.includes('260,00'));
    await clickSelector(page, `button[aria-label="Desagrupar ${description}"]`);
    assert.equal(await page.$$eval('[data-cost-group="false"]', cards => cards.some(card => card.textContent.includes('Anúncio terça-feira'))), true);
    // Ungrouping changes presentation only; the paid amount and original dates survive.
    const localBills = await page.evaluate(() => JSON.parse(localStorage.getItem('virtuosa_bills_v2')));
    const detached = localBills.find(item => item.name === description);
    assert.equal(detached.payments['2026-11-03'], true);
    assert.equal(detached.expenseGroups, undefined);
    await clickSelector(page, 'button[aria-label="Excluir Anúncio segunda-feira"]');
    await page.waitForFunction(() => !document.querySelector('[data-cost-group="true"]'));
    for (let count = 0; count < 40 && mutations.length < 2; count++) await pause(200);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(description => document.body.textContent?.includes(description), {}, description);
    assert.equal(await page.$$eval('[data-cost-group="false"]', cards => cards.some(card => card.textContent.includes('Anúncio terça-feira'))), true);
    failBackup = true;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => [...document.querySelectorAll('[role="alert"]')].some(alert => alert.textContent?.includes('alterações ficam indisponíveis')));
    await layout(page, '.costs-page');
    await page.screenshot({ path: join(output, `costs-error-${width}.png`), fullPage: true });
    assert.equal(await page.$$eval('section[aria-label="Despesas manuais"] button', buttons => buttons.filter(button => button.hasAttribute('title')).every(button => button.disabled)), true);
    assert.deepEqual(errors, []);
    results.push({ width, writes: mutations.length, touchTargets: targetSize.length });
    await page.close();
  }
  console.log(JSON.stringify({ output, results }));
} finally { await browser.close(); }
