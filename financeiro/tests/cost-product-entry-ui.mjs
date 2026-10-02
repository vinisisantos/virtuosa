// Local browser regression: all APIs are intercepted and no production data is accessed.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const origin = process.env.PAYROLL_UI_ORIGIN || 'http://127.0.0.1:3098';
assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);

async function clickButton(page, label) {
  const buttons = await page.$$('button');
  for (const button of buttons) {
    if ((await button.evaluate(node => node.textContent?.trim())) === label) {
      await button.click();
      return;
    }
  }
  throw new Error(`Botão não encontrado: ${label}`);
}

const browser = await puppeteer.launch({ headless: true });
try {
  for (const width of [390, 430, 1440]) {
    let bills = [];
    let backupUpdatedAt = '2026-09-01T12:00:00.000Z';
    let writes = 0;
    const page = await browser.newPage();
    const errors = [];
    const dialogs = [];
    await page.setViewport({ width, height: 900, hasTouch: width < 600, isMobile: width < 600 });
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.accept(); });
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) {
        void (url.origin === origin ? request.continue() : request.abort());
        return;
      }
      let data = {};
      if (url.pathname === '/api/auth/me') data = { authenticated: true, user: {
        id: 'test-cost-entry', name: 'Teste', role: 'ADMINISTRADOR', unit: 'Osasco',
        permissions: { admin: true, financeiro: true, finCustos: true },
      } };
      else if (url.pathname === '/api/backup') {
        if (request.method() === 'POST') {
          const payload = JSON.parse(request.postData() || '{}');
          bills = payload.bills;
          backupUpdatedAt = new Date(Date.parse(backupUpdatedAt) + 1000).toISOString();
          writes += 1;
          data = { success: true, updatedAt: backupUpdatedAt };
        } else data = { exists: true, logs: [], goals: {}, fixed: [], bills, updatedAt: backupUpdatedAt };
      } else if (url.pathname === '/api/costs/automatic') data = {
        payrollCompetence: { month: 8, year: 2026 }, missingPayrollUnits: [],
        canManagePayrollPayments: false, payroll: null, productOrders: [], productOrdersTotal: 0,
      };
      void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('virtuosa_user', JSON.stringify({
        id: 'test-cost-entry', name: 'Teste', role: 'ADMINISTRADOR', unit: 'Osasco',
        permissions: { admin: true, financeiro: true, finCustos: true },
      }));
      localStorage.setItem('virtuosa_global_unit', 'Osasco');
      localStorage.setItem('virtuosa_financeiro_tab', 'custos');
    });
    await page.goto(`${origin}/?tab=custos&month=8&year=2026`, { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForFunction(() => document.body.textContent?.includes('Nova Despesa'));
    await clickButton(page, 'addNova Despesa');
    await page.waitForSelector('input[placeholder="Ex: Aluguel, Internet..."]');
    await page.evaluate(() => {
      const label = [...document.querySelectorAll('label')].find(node => node.textContent?.trim() === 'Categoria');
      label?.parentElement?.querySelector('button')?.click();
    });
    await clickButton(page, 'inventory_2Produtos');
    await page.type('input[placeholder="Ex: Compra de setembro, Fornecedor..."]', 'Compra de insumos teste');
    await page.type('input[placeholder="Nome do produto"]', 'Produto de teste');
    await page.type('input[placeholder="0,00"]', '9900');
    await page.type('input[placeholder="DD/MM/AAAA"]', '02/09/2026');
    await page.keyboard.press('Tab');
    const saveButtonExposed = await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find(node => node.textContent?.trim() === 'Adicionar Pedido');
      button?.scrollIntoView({ block: 'center' });
      const rect = button?.getBoundingClientRect();
      return rect ? document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest('button') === button : false;
    });
    assert.equal(saveButtonExposed, true, 'botão de salvar não fica coberto pela barra móvel');
    await clickButton(page, 'Adicionar Pedido');
    assert.deepEqual(dialogs, [], `formulário aceito: ${dialogs.join(', ')}`);
    await page.waitForFunction(() => [...document.querySelectorAll('[role="tab"][aria-selected="true"]')].some(node => node.textContent?.trim() === 'Produtos'));
    await page.waitForFunction(() => document.body.textContent?.includes('Compra de insumos teste'));
    await page.waitForFunction(() => document.body.textContent?.includes('Produto de teste'));
    await page.waitForFunction(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    await page.waitForFunction(() => localStorage.getItem('virtuosa_bills_v2')?.includes('Compra de insumos teste'));
    await new Promise(resolve => setTimeout(resolve, 5700));
    assert.ok(writes > 0, 'despesa sincronizada com o backup simulado');
    assert.equal(bills.length, 1);
    assert.equal(bills[0].value, 99);
    await page.reload({ waitUntil: 'networkidle0' });
    await clickButton(page, 'Produtos');
    await page.waitForFunction(() => document.body.textContent?.includes('Compra de insumos teste'));
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`Despesa de produto visível e persistida: ${width}px`);
  }
} finally {
  await browser.close();
}
