// Local browser regression for adding several costs in a row. Every API response is intercepted.
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const origin = process.env.COSTS_UI_ORIGIN || 'http://127.0.0.1:3098';
assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const output = await mkdtemp(join(tmpdir(), 'virtuosa-cost-add-flow-ui-'));
const user = { id: 'costs-local', name: 'Teste local', role: 'ADMINISTRADOR', unit: 'SBC', permissions: { admin: true, financeiro: true, finCustos: true } };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function clickButton(page, text, contains = false) {
  const clicked = await page.evaluate((text, contains) => {
    const button = [...document.querySelectorAll('button')]
      .filter(item => item.offsetParent !== null)
      .find(item => contains ? item.textContent?.includes(text) : item.textContent?.trim() === text);
    button?.scrollIntoView({ block: 'center' });
    button?.click();
    return Boolean(button);
  }, text, contains);
  assert.ok(clicked, `botão disponível: ${text}`);
  await pause(120);
}
async function fill(page, selector, text) {
  const input = await page.waitForSelector(selector);
  await input.evaluate(node => node.scrollIntoView({ block: 'center' }));
  await input.click({ clickCount: 3 });
  await input.type(text);
}
const monthTotal = page => page.$eval('.costs-kpis > div:nth-child(3)', card => card.textContent.replace(/\s/g, ' '));
const monthLabel = page => page.$eval('.costs-period', element => element.textContent);
async function fillCost(page, category, value, dueDigits) {
  await clickButton(page, category);
  await fill(page, '#cost-value', value);
  await fill(page, '[role="dialog"] .date-picker-text-input', dueDigits);
  await page.keyboard.press('Tab');
  await page.click('[role="dialog"] h2');
}

const browser = await puppeteer.launch({ headless: true });
const results = [];
try {
  for (const width of [390, 430, 1440]) {
    let fixed = [{ id: 1, name: 'Marketing mensal', value: 1000, category: 'Marketing', unit: 'SBC', date: '2026-10-01', recurrence: 'monthly' }];
    let bills = [];
    let revision = '2026-10-22T12:00:00.000Z';
    let conflictOnce = false;
    const posts = [];
    const errors = [];
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => { errors.push(`dialog: ${dialog.message()}`); void dialog.accept(); });
    await page.setViewport({ width, height: 900, isMobile: width < 600, hasTouch: width < 600 });
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) {
        void (url.origin === origin || ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname) ? request.continue() : request.abort());
        return;
      }
      void (async () => {
        let data = {};
        let status = 200;
        if (url.pathname === '/api/auth/me') data = { authenticated: true, user };
        else if (url.pathname === '/api/backup' && request.method() === 'POST') {
          const body = JSON.parse(request.postData());
          if (conflictOnce) {
            // Another device saved first: its cost is on the server, ours is not.
            conflictOnce = false;
            bills = [...bills, { id: 777, name: 'Outro aparelho', value: 40, category: 'Luz', unit: 'SBC', type: 'variavel', dueDateManual: '2026-10-09', payments: {} }];
            revision = new Date(Date.parse(revision) + 1000).toISOString();
            status = 409;
            data = { error: 'conflito', reloadRequired: true };
          } else {
            assert.equal(body.expectedUpdatedAt, revision);
            posts.push(body);
            fixed = body.fixed; bills = body.bills;
            revision = new Date(Date.parse(revision) + 1000).toISOString();
            data = { success: true, updatedAt: revision };
          }
        } else if (url.pathname === '/api/backup') data = { exists: true, fixed, bills, logs: [], goals: {}, updatedAt: revision };
        else if (url.pathname === '/api/costs/automatic') data = { payrollCompetence: { month: 9, year: 2026 }, missingPayrollUnits: [], payroll: null, vacationAdvances: [], productOrders: [], productOrdersTotal: 0 };
        else if (url.pathname === '/api/packages') data = [];
        await request.respond({ status, contentType: 'application/json', body: JSON.stringify(data) });
      })().catch(error => errors.push(error.message));
    });
    await page.evaluateOnNewDocument(user => {
      localStorage.setItem('virtuosa_user', JSON.stringify(user));
      localStorage.setItem('virtuosa_global_unit', 'SBC');
      localStorage.setItem('virtuosa_financeiro_tab', 'custos');
    }, user);
    await page.goto(`${origin}/?tab=custos&month=9&year=2026`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => document.body.textContent?.includes('Marketing mensal'));
    assert.match(await monthTotal(page), /1\.000,00/);

    // Two costs in a row: the dialog stays open and the month total follows each save.
    await clickButton(page, 'addNova Despesa');
    await fillCost(page, 'wifiInternet', '10000', '15102026');
    await clickButton(page, 'Salvar e lançar outro');
    assert.ok(await page.$('[role="dialog"]'), 'modal continua aberto');
    await page.waitForFunction(() => document.querySelector('.cost-form-saved')?.textContent?.includes('1.100,00'));
    assert.equal(await page.$eval('#cost-value', input => input.value), '', 'valor limpo para o próximo');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'cost-value', 'foco volta ao valor');
    await fillCost(page, 'homeAluguel', '25000', '20102026');
    await clickButton(page, 'Salvar e lançar outro');
    await page.waitForFunction(() => document.querySelector('.cost-form-saved')?.textContent?.includes('1.350,00'));
    await pause(500);
    const bannerTop = await page.$eval('.cost-form-saved', banner => banner.getBoundingClientRect().top);
    assert.ok(bannerTop >= 0, `confirmação com total visível (top=${bannerTop})`);
    await page.screenshot({ path: join(output, `add-flow-dialog-${width}.png`), fullPage: true });
    const footer = await page.$$eval('.cost-form-actions button', buttons => buttons.map(button => {
      const rect = button.getBoundingClientRect();
      return { text: button.textContent, height: rect.height, right: rect.right, overflow: button.scrollWidth > button.clientWidth + 1 };
    }));
    assert.ok(footer.every(button => button.height >= 44 && button.right <= width + 1 && !button.overflow), `rodapé cabe: ${JSON.stringify(footer)}`);

    // A cost due next month no longer moves the screen away from October.
    await fillCost(page, 'badgeSalários', '5000', '05112026');
    await clickButton(page, 'Adicionar ·', true);
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    assert.match(await monthLabel(page), /Outubro 2026/);
    assert.match(await monthTotal(page), /1\.350,00/);
    await page.waitForFunction(() => document.body.textContent?.includes('Despesa adicionada em Novembro/2026.'));
    for (let count = 0; count < 40 && posts.length === 0; count++) await pause(200);
    assert.equal(posts.length, 1, 'três lançamentos seguidos viram uma única gravação');
    assert.equal(posts[0].bills.length, 3);

    // Conflict with another device keeps the cost created here and loads the other one.
    conflictOnce = true;
    await clickButton(page, 'addNova Despesa');
    await fillCost(page, 'wifiInternet', '3000', '10102026');
    await clickButton(page, 'Adicionar ·', true);
    await page.waitForFunction(() => document.body.textContent?.includes('Seus lançamentos novos foram mantidos'), { timeout: 15000 });
    for (let count = 0; count < 60 && posts.length < 2; count++) await pause(200);
    assert.equal(posts.length, 2, 'lançamento reaplicado é regravado sobre a versão nova');
    const names = posts[1].bills.map(bill => `${bill.category}:${bill.value}`);
    assert.ok(names.includes('Luz:40') && names.includes('Internet:30'), `ambos os custos preservados: ${names}`);
    await page.waitForFunction(() => document.querySelector('.costs-kpis > div:nth-child(3)')?.textContent?.replace(/\s/g, ' ').includes('1.420,00'));
    await page.screenshot({ path: join(output, `add-flow-after-${width}.png`), fullPage: true });
    assert.deepEqual(errors, []);
    results.push({ width, posts: posts.length });
    await page.close();
  }
  console.log(JSON.stringify({ output, results }));
} finally { await browser.close(); }
