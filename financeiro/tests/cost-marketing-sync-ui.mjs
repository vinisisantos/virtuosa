// Local regression only. All APIs are intercepted; no production data is used or written.
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const origin = process.env.COSTS_UI_ORIGIN || 'http://127.0.0.1:3098';
assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const output = await mkdtemp(join(tmpdir(), 'virtuosa-marketing-sync-ui-'));
const user = { id: 'costs-local', name: 'Teste local', role: 'ADMINISTRADOR', unit: 'SBC', permissions: { admin: true, financeiro: true, finCustos: true } };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

async function click(page, text) {
  const found = await page.evaluate(text => {
    const button = [...document.querySelectorAll('button')]
      .find(item => item.offsetParent !== null && item.textContent?.trim() === text);
    button?.click();
    return Boolean(button);
  }, text);
  assert.ok(found, `botão disponível: ${text}`);
  await pause(100);
}
async function fill(page, selector, text) {
  const input = await page.waitForSelector(selector);
  await input.evaluate(node => node.scrollIntoView({ block: 'center' }));
  await input.click({ clickCount: 3 });
  await input.type(text);
}
async function fillCost(page, value, date, detail) {
  await fill(page, '#cost-value', value);
  await fill(page, '#cost-detail', detail);
  await fill(page, '[role="dialog"] .date-picker-text-input', date);
  await page.keyboard.press('Tab');
  await page.click('[role="dialog"] h2');
}
async function assertTotal(page, expected) {
  await page.waitForFunction(expected => document.querySelector('.costs-kpis > div:nth-child(3)')?.textContent.replace(/\s/g, ' ').includes(expected), {}, expected);
}

const browser = await puppeteer.launch({ headless: true });
const results = [];
try {
  for (const width of [390, 430, 1440]) {
    const postStarted = deferred();
    const releasePost = deferred();
    const refreshStarted = deferred();
    const releaseRefresh = deferred();
    let revision = '2026-10-22T12:00:00.000Z';
    let remoteFixed = [];
    let remoteBills = [];
    let postCount = 0;
    let holdRefresh = false;
    const accepted = [];
    const errors = [];
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => { errors.push(dialog.message()); void dialog.dismiss(); });
    await page.setViewport({ width, height: 900, isMobile: width < 600, hasTouch: width < 600 });
    await page.setRequestInterception(true);
    page.on('request', request => { void (async () => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) {
        const publicFont = ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname);
        return url.origin === origin || publicFont ? request.continue() : request.abort();
      }
      let status = 200;
      let data = {};
      if (url.pathname === '/api/auth/me') data = { authenticated: true, user };
      else if (url.pathname === '/api/backup') {
        if (request.method() === 'POST') {
          postCount++;
          if (postCount === 1) {
            postStarted.resolve();
            await releasePost.promise;
            remoteBills = [{ id: 777, name: 'Outro aparelho', value: 50, category: 'Luz', unit: 'SBC', type: 'variavel', dueDateManual: '2026-10-09', payments: {} }];
            revision = '2026-10-22T12:00:01.000Z';
            holdRefresh = true;
            status = 409;
            data = { code: 'FINANCIAL_BACKUP_VERSION_CONFLICT', reloadRequired: true };
          } else {
            const payload = JSON.parse(request.postData());
            assert.equal(payload.expectedUpdatedAt, revision);
            remoteFixed = payload.fixed;
            remoteBills = payload.bills;
            revision = new Date(Date.parse(revision) + 1000).toISOString();
            accepted.push(payload);
            data = { success: true, updatedAt: revision };
          }
        } else {
          if (holdRefresh) {
            holdRefresh = false;
            refreshStarted.resolve();
            await releaseRefresh.promise;
          }
          data = { exists: true, fixed: remoteFixed, bills: remoteBills, logs: [], goals: {}, updatedAt: revision };
        }
      } else if (url.pathname === '/api/costs/automatic') data = { payrollCompetence: { month: 9, year: 2026 }, missingPayrollUnits: [], payroll: null, vacationAdvances: [], productOrders: [], productOrdersTotal: 0 };
      else if (url.pathname === '/api/packages') data = [];
      await request.respond({ status, contentType: 'application/json', body: JSON.stringify(data) });
    })().catch(error => errors.push(error.message)); });
    await page.evaluateOnNewDocument(user => {
      localStorage.setItem('virtuosa_user', JSON.stringify(user));
      localStorage.setItem('virtuosa_global_unit', 'SBC');
    }, user);
    try {
      await page.goto(`${origin}/?tab=custos&month=9&year=2026`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => document.body.textContent?.includes('Despesas manuais') && !document.body.textContent?.includes('Carregando despesas…'));
      await click(page, 'addNova Despesa');
      await click(page, 'grid_viewMais');
      await click(page, 'campaignMarketing');
      await fillCost(page, '100000', '03102026', 'Marketing primeira campanha');
      await click(page, 'Salvar e lançar outro');
      await assertTotal(page, '1.000,00');
      assert.equal(await page.$eval('#cost-value', input => input.value), '');
      assert.equal(await page.$eval('#cost-detail', input => input.value), '');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'cost-value');
      assert.equal(await page.$eval('[role="radio"][aria-checked="true"]', tile => tile.textContent), 'campaignMarketing');
      assert.equal(await page.$eval('.date-picker-text-input', input => input.value), '03/10/2026');
      await Promise.race([postStarted.promise, pause(15000).then(() => { throw new Error('POST local não iniciou'); })]);

      // The second cost is newer than the payload of the still-pending first POST.
      await fillCost(page, '40000', '06102026', 'Marketing segunda campanha');
      await click(page, 'Salvar e lançar outro');
      await assertTotal(page, '1.400,00');
      await page.waitForFunction(() => document.querySelector('.cost-form-saved')?.textContent.includes('1.400,00'));
      const controlsFit = await page.$$eval('.cost-form-actions button', buttons => buttons.every(button => {
        const box = button.getBoundingClientRect();
        return box.height >= 44 && box.right <= innerWidth + 1 && button.scrollWidth <= button.clientWidth + 1;
      }));
      assert.ok(controlsFit, `controles cabem em ${width}px`);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(output, `marketing-banner-${width}.png`), fullPage: true });
      await click(page, 'Fechar');
      releasePost.resolve();
      await refreshStarted.promise;

      // Also preserve a recurring cost created during the conflict's GET.
      await click(page, 'addNova Despesa');
      await click(page, 'homeAluguel');
      await fillCost(page, '3000', '23102026', 'Fixo criado durante reconciliação');
      await click(page, 'Todo mês');
      await click(page, 'Adicionar · R$ 30,00');
      await assertTotal(page, '1.430,00');
      releaseRefresh.resolve();
      await page.waitForFunction(() => document.body.textContent.includes('Seus lançamentos novos foram mantidos'));
      await assertTotal(page, '1.480,00');
      assert.match(await page.$eval('.costs-period', element => element.textContent), /Outubro 2026/);
      for (let n = 0; n < 75 && accepted.length === 0; n++) await pause(200);
      assert.equal(accepted.length, 1, 'custos reconciliados são persistidos em um único snapshot');
      assert.deepEqual(accepted[0].bills.map(bill => bill.value).sort((a, b) => a - b), [50, 400, 1000]);
      assert.equal(accepted[0].fixed[0]?.value, 30);
      const cache = await page.evaluate(() => JSON.parse(localStorage.getItem('virtuosa_bills_v2')));
      assert.equal(cache.length, 3, 'cache mantém os três lançamentos sem duplicar');

      await page.evaluate(() => [...document.querySelectorAll('[data-cost-group="true"] > button')].find(b => b.textContent.includes('Marketing'))?.click());
      const paymentButton = await page.waitForSelector('[aria-label="Marcar como pago: Marketing primeira campanha"]');
      await paymentButton.evaluate(button => button.click());
      await page.waitForFunction(() => document.querySelector('.costs-kpis > div:nth-child(2)')?.textContent.includes('1.000,00'));
      await assertTotal(page, '1.480,00');
      for (let n = 0; n < 75 && accepted.length < 2; n++) await pause(200);
      assert.equal(accepted.length, 2);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await assertTotal(page, '1.480,00');
      await page.evaluate(() => [...document.querySelectorAll('[data-cost-group="true"] > button')].find(b => b.textContent.includes('Marketing'))?.click());
      await page.waitForFunction(() => document.body.textContent.includes('Marketing segunda campanha'));
      const pageFits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
      assert.ok(pageFits, `página sem overflow em ${width}px`);
      await page.screenshot({ path: join(output, `marketing-after-reload-${width}.png`), fullPage: true });
      assert.deepEqual(errors, []);
      results.push({ width, pendingMarketingTotal: 1400, finalTotal: 1480, acceptedPosts: accepted.length });
    } finally {
      releasePost.resolve();
      releaseRefresh.resolve();
      await page.close();
    }
  }
  console.log(JSON.stringify({ output, results, productionWrites: 0 }));
} finally { await browser.close(); }
