// Local only: all APIs intercepted, including every write. No production data.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
const origin = process.env.COSTS_UI_ORIGIN || 'http://127.0.0.1:3098';
assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const browser = await puppeteer.launch({ headless: true });
const wait = (page, fn, ...args) => page.waitForFunction(fn, { timeout: 20000 }, ...args);
async function click(page, label, scope = 'body') {
  const button = await wait(page, (label, scope) => [...document.querySelector(scope).querySelectorAll('button')].find(b => b.textContent.includes(label) && !b.disabled && b.getBoundingClientRect().width), label, scope);
  await button.asElement().evaluate(b => { b.scrollIntoView({ block: 'center' }); b.click(); });
}
async function fill(page, selector, value) {
  const field = await page.waitForSelector(selector); await field.evaluate(e => e.scrollIntoView({ block: 'center' }));
  await field.click({ clickCount: 3 }); await field.type(value);
}
async function fit(page, selector = '.costs-page') {
  const box = await page.$eval(selector, e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, viewport: innerWidth, scroll: e.scrollWidth, width: e.clientWidth }; });
  assert.ok(box.left >= -1 && box.right <= box.viewport + 1 && box.scroll <= box.width + 1, `${selector} sem overflow: ${JSON.stringify(box)}`);
}
try {
  for (const width of [390, 430, 1440]) {
    const page = await browser.newPage(), errors = [], posts = [];
    let revision = '2026-10-27T12:00:00.000Z', fail = false, release;
    const gate = new Promise(resolve => { release = resolve; });
    const fixed = [{ id: 10, name: 'Internet mensal', category: 'Internet', unit: 'SBC', value: 50, date: '2026-10-01', recurrence: 'monthly' }];
    let bills = [
      { id: 1, name: 'Marketing anterior', category: 'Marketing', unit: 'SBC', value: 1000, type: 'variavel', dueDateManual: '2026-10-04', payments: { '2026-10-04': true } },
      { id: 2, name: 'Marketing de outro dia', category: 'Marketing', unit: 'SBC', value: 400, type: 'variavel', dueDateManual: '2026-10-06', payments: {} },
      { id: 3, name: 'Outro mês não misturar', category: 'Marketing', unit: 'SBC', value: 900, type: 'variavel', dueDateManual: '2026-11-06', payments: {} },
      { id: 4, name: 'Outra unidade não misturar', category: 'Marketing', unit: 'Osasco', value: 900, type: 'variavel', dueDateManual: '2026-10-06', payments: {} },
    ];
    const user = { id: 'synthetic', name: 'Teste', role: 'ADMINISTRADOR', unit: 'SBC', permissions: { admin: true, finCustos: true } };
    await page.setViewport({ width, height: 932, isMobile: width < 600, hasTouch: width < 600 });
    await page.evaluateOnNewDocument(user => { localStorage.setItem('virtuosa_user', JSON.stringify(user)); localStorage.setItem('virtuosa_global_unit', 'SBC'); }, user);
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', async req => {
      const url = new URL(req.url());
      if (url.origin !== origin) return ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname) ? req.continue() : req.abort();
      if (!url.pathname.startsWith('/api/')) return req.continue();
      let data = {}, status = 200;
      if (url.pathname === '/api/auth/me') data = { authenticated: true, user };
      else if (url.pathname === '/api/backup') {
        await gate;
        if (req.method() === 'POST') {
          const body = JSON.parse(req.postData()); posts.push(body); assert.equal(body.expectedUpdatedAt, revision);
          bills = body.bills; revision = new Date(Date.parse(revision) + 1000).toISOString(); data = { success: true, updatedAt: revision };
        } else { status = fail ? 503 : 200; data = fail ? { error: 'Falha sintética' } : { exists: true, fixed, bills, logs: [], goals: {}, updatedAt: revision }; }
      } else if (url.pathname === '/api/costs/automatic') data = { payrollCompetence: { month: 9, year: 2026 }, missingPayrollUnits: [], payroll: null, vacationAdvances: [], productOrders: [], productOrdersTotal: 0 };
      else if (url.pathname === '/api/packages') data = [];
      else if (req.method() !== 'GET') throw new Error(`Escrita inesperada: ${url.pathname}`);
      await req.respond({ status, contentType: 'application/json', body: JSON.stringify(data) });
    });
    try {
      await page.goto(`${origin}/?tab=custos&month=9&year=2026`, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => document.fonts.ready);
      await wait(page, () => document.body.textContent.includes('Carregando despesas')); await fit(page); release();
      await page.waitForSelector('[data-cost-group="true"] > button');
      const marketing = () => page.evaluateHandle(() => [...document.querySelectorAll('[data-cost-group="true"]')].find(e => e.querySelector('strong')?.textContent === 'Marketing'));
      let group = await marketing(); assert.match(await group.evaluate(e => e.textContent), /1\.400,00/);
      assert.equal(await page.evaluate(() => document.body.textContent.includes('não misturar')), false);
      await fit(page);
      await click(page, 'Nova Despesa'); await click(page, 'Mais', '[role="dialog"]'); await click(page, 'Marketing', '[role="dialog"]');
      await fill(page, '#cost-value', '20000'); await fill(page, '[role="dialog"] .date-picker-text-input', '26102026'); await page.keyboard.press('Tab');
      await page.click('[role="dialog"] h2');
      await fill(page, '#cost-detail', 'Novo anúncio com descrição longa para validar leitura e quebra de linha no celular');
      await wait(page, () => document.querySelector('[data-testid="cost-automatic-grouping"]')?.textContent.includes('1.600,00'));
      assert.equal(await page.$('#cost-group-target'), null); await fit(page, '[role="dialog"] > div');
      await page.screenshot({ path: `/tmp/sbc-auto-form-${width}.tmp.png`, fullPage: true });
      await click(page, 'Salvar e lançar outro', '[role="dialog"]');
      await wait(page, () => document.querySelector('.cost-form-saved')?.textContent.includes('1.650,00'));
      await wait(page, () => document.activeElement.id === 'cost-value');
      await fill(page, '#cost-value', '40000'); await fill(page, '[role="dialog"] .date-picker-text-input', '27102026'); await page.keyboard.press('Tab');
      await page.click('[role="dialog"] h2');
      await fill(page, '#cost-detail', 'Novo anúncio do dia seguinte');
      await click(page, 'Adicionar ·', '[role="dialog"]'); await wait(page, () => !document.querySelector('[role="dialog"]'));
      group = await marketing(); assert.match(await group.evaluate(e => e.textContent), /2\.000,00/); assert.match(await group.evaluate(e => e.textContent), /4 lançamentos/);
      await group.evaluate(e => e.querySelector('button').click());
      await wait(page, () => document.body.textContent.includes('Novo anúncio do dia seguinte')); await fit(page);
      await page.screenshot({ path: `/tmp/sbc-auto-group-${width}.tmp.png`, fullPage: true });
      assert.ok(await page.evaluate(() => document.body.textContent.includes('26/10/2026') && document.body.textContent.includes('27/10/2026')));
      assert.ok(await page.$$eval('[data-cost-group="true"] button', buttons => buttons.every(b => b.getBoundingClientRect().height >= 44)));
      await page.$eval('button[aria-label="Desagrupar Novo anúncio do dia seguinte"]', b => b.click());
      await wait(page, () => document.querySelector('button[aria-label="Reagrupar Novo anúncio do dia seguinte"]'));
      await page.$eval('button[aria-label="Reagrupar Novo anúncio do dia seguinte"]', b => b.click());
      group = await marketing(); assert.match(await group.evaluate(e => e.textContent), /2\.000,00/);
      await wait(page, () => JSON.parse(localStorage.getItem('virtuosa_bills_v2')).length === 6);
      for (let tries = 0; !posts.length && tries < 60; tries++) await new Promise(resolve => setTimeout(resolve, 150));
      assert.equal(posts.length, 1); assert.equal(bills.length, 6);
      await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('[data-cost-group="true"] > button');
      group = await marketing(); assert.match(await group.evaluate(e => e.textContent), /2\.000,00/);
      fail = true; await page.reload({ waitUntil: 'domcontentloaded' });
      await wait(page, () => document.querySelector('[role="alert"]')?.textContent.includes('alterações ficam indisponíveis')); await fit(page);
      assert.deepEqual(errors, []); console.log(`PASS SBC ${width}px: dias distintos, soma imediata, reabertura, separar/reagrupar, isolamento e erro.`);
    } catch (error) {
      console.error({ width, body: await page.evaluate(() => document.body.innerText.slice(-3500)), bills: await page.evaluate(() => localStorage.getItem('virtuosa_bills_v2')) });
      throw error;
    } finally { release(); await page.close(); }
  }
} finally { await browser.close(); }
