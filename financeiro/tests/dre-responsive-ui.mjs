// Run against a local Next server. Every API request is synthetic and intercepted.
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const origin = process.env.DRE_UI_ORIGIN || 'http://127.0.0.1:3099';
assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);

const output = await mkdtemp(join(tmpdir(), 'virtuosa-dre-ui-'));
const baseUser = {
  id: 'dre-ui',
  name: 'Teste DRE',
  role: 'GERENTE',
  unit: 'Osasco',
};
const accessCases = [
  { width: 390, permissions: { finCustos: true } },
  { width: 430, permissions: { admin: true } },
  { width: 1024, permissions: { finAnalise: true } },
  { width: 1440, permissions: { financeiro: true } },
];
const logs = [
  { id: 'received-1', type: 'sale', source: 'manual', status: 'received', name: 'Receita recebida', value: 10000, unit: 'Osasco', date: '2026-09-10T12:00:00.000Z' },
  { id: 'pending-1', type: 'sale', source: 'manual', status: 'pending', name: 'Receita pendente', value: 2000, unit: 'Osasco', date: '2026-09-11T12:00:00.000Z' },
];
const fixed = [
  { id: 1, name: 'Aluguel da unidade', value: 1000, category: 'Aluguel', unit: 'Osasco', recurrence: 'monthly', effectiveFrom: '2026-01-01' },
];
const bills = [
  { id: 2, name: 'Energia', value: 500, type: 'variavel', category: 'Luz', unit: 'Osasco', dueDay: null, dueDateManual: '2026-09-15', refMonth: '2026-09', payments: {} },
  { id: 3, name: 'Parcela mensal', value: 300, type: 'fixo', category: 'Parcela', unit: 'Osasco', dueDay: 10, dueDateManual: null, refMonth: null, payments: {} },
];
const staleLocalLogs = [
  { id: 'stale-received', type: 'sale', source: 'manual', status: 'received', name: 'Receita antiga', value: 100, unit: 'Osasco', date: '2026-09-10T12:00:00.000Z' },
];
const staleLocalFixed = [
  { id: 99, name: 'Custo antigo', value: 9999, category: 'Outros', unit: 'Osasco', recurrence: 'monthly', effectiveFrom: '2026-01-01' },
];
const staleLocalBills = [];
const automaticCosts = {
  payrollCompetence: { month: 8, year: 2026 },
  missingPayrollUnits: [],
  canManagePayrollPayments: true,
  payroll: {
    competenceMonth: 8,
    competenceYear: 2026,
    salaryTotal: 2500,
    fgtsTotal: 200,
    total: 2700,
    employeeCount: 1,
    paidTotal: 0,
    pendingTotal: 2700,
    paidSalaryTotal: 0,
    pendingSalaryTotal: 2500,
    paidFgtsTotal: 0,
    pendingFgtsTotal: 200,
    units: [{ unit: 'Osasco', salaryTotal: 2500, fgtsTotal: 200, total: 2700, employeeCount: 1 }],
    entries: [],
  },
  productOrders: [{ id: 'order-1', productName: 'Produto de teste', totalPrice: 500, costRecognizedAt: '2026-09-12', status: 'Entregue', unit: 'Osasco' }],
  productOrdersTotal: 500,
};
const revisedAutomaticCosts = {
  ...automaticCosts,
  payroll: {
    ...automaticCosts.payroll,
    salaryTotal: 3000,
    total: 3200,
    pendingTotal: 3200,
    pendingSalaryTotal: 3000,
    units: [{ unit: 'Osasco', salaryTotal: 3000, fgtsTotal: 200, total: 3200, employeeCount: 1 }],
  },
};

async function clickExactText(page, selector, label) {
  const handle = await page.evaluateHandle((query, text) => (
    [...document.querySelectorAll(query)].find(element => element.textContent?.trim() === text) || null
  ), selector, label);
  const element = handle.asElement();
  assert.ok(element, `controle disponível: ${label}`);
  await element.evaluate(node => node.scrollIntoView({ block: 'center' }));
  await element.click();
  await handle.dispose();
}

const browser = await puppeteer.launch({ headless: true });
const results = [];

try {
  for (const { width, permissions } of accessCases) {
    const user = { ...baseUser, permissions };
    const page = await browser.newPage();
    const errors = [];
    let payrollRevision = 'rev-1';
    let failAutomaticCostsOnce = false;
    let failBackup = false;
    let backupPostCount = 0;
    await page.setViewport({ width, height: 900, hasTouch: width < 600, isMobile: width < 600 });
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) {
        if (url.origin === origin) void request.continue();
        else void request.abort();
        return;
      }

      let data = {};
      if (url.pathname === '/api/auth/me') data = { authenticated: true, user };
      else if (url.pathname === '/api/backup') {
        if (failBackup && request.method() === 'GET') {
          void request.respond({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'backup indisponível' }),
          });
          return;
        }
        if (request.method() === 'POST') backupPostCount += 1;
        data = request.method() === 'POST'
          ? { success: true, updatedAt: '2026-09-12T12:00:01.000Z' }
          : { exists: true, logs, goals: {}, fixed, bills, updatedAt: '2026-09-12T12:00:00.000Z' };
      }
      else if (url.pathname === '/api/costs/automatic') {
        if (failAutomaticCostsOnce) {
          failAutomaticCostsOnce = false;
          void request.respond({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'falha temporária sintética' }),
          });
          return;
        }
        data = {
          ...(payrollRevision === 'rev-1' ? automaticCosts : revisedAutomaticCosts),
          payrollRevision: { revision: payrollRevision, lastModifiedAt: '2026-09-12T12:00:00.000Z' },
          automaticCostsRevision: { revision: payrollRevision, lastModifiedAt: '2026-09-12T12:00:00.000Z' },
        };
      } else if (url.pathname === '/api/payroll/revision') {
        data = { revision: payrollRevision, lastModifiedAt: '2026-09-12T12:00:00.000Z' };
      }
      else if (url.pathname === '/api/packages') data = [];

      void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.evaluateOnNewDocument(({ userValue, logsValue, fixedValue, billsValue }) => {
      localStorage.setItem('virtuosa_user', JSON.stringify(userValue));
      localStorage.setItem('virtuosa_global_unit', 'Osasco');
      localStorage.setItem('virtuosa_finance_logs_v2', JSON.stringify(logsValue));
      localStorage.setItem('virtuosa_fixed_expenses_v2', JSON.stringify(fixedValue));
      localStorage.setItem('virtuosa_bills_v2', JSON.stringify(billsValue));
    }, { userValue: user, logsValue: staleLocalLogs, fixedValue: staleLocalFixed, billsValue: staleLocalBills });

    await page.goto(`${origin}/dre?month=8&year=2026`, { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForFunction(() => document.body.textContent?.includes('DRE gerencial do mês'));
    await new Promise(resolve => setTimeout(resolve, 500));

    const layout = await page.evaluate(() => {
      const tabs = document.querySelector('[role="tablist"]');
      const statement = document.querySelector('[aria-labelledby="dre-summary-title"] article:last-of-type');
      const dreTab = [...document.querySelectorAll('[role="tab"]')].find(element => element.textContent?.trim() === 'DRE gerencial');
      if (!tabs || !statement || !dreTab) return null;
      const tabsRect = tabs.getBoundingClientRect();
      const statementRect = statement.getBoundingClientRect();
      return {
        viewport: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        tabsLeft: tabsRect.left,
        tabsRight: tabsRect.right,
        statementLeft: statementRect.left,
        statementRight: statementRect.right,
        tabHeights: [...tabs.querySelectorAll('button')].map(button => button.getBoundingClientRect().height),
        tabLabels: [...tabs.querySelectorAll('button')].map(button => button.textContent?.trim()),
        dreSelected: dreTab.getAttribute('aria-selected'),
        directLinks: [...document.querySelectorAll('a[href="/dre"]')].length,
        text: document.querySelector('[aria-labelledby="dre-summary-title"]')?.textContent || '',
      };
    });

    assert.ok(layout, 'DRE e navegação renderizados');
    assert.equal(layout.documentWidth, layout.viewport, 'página sem overflow horizontal');
    assert.ok(layout.tabsLeft >= 0 && layout.tabsRight <= layout.viewport + 1, 'abas dentro do viewport');
    assert.ok(layout.statementLeft >= 0 && layout.statementRight <= layout.viewport + 1, 'demonstrativo dentro do viewport');
    assert.equal(layout.dreSelected, 'true', 'DRE abre selecionado pelo atalho direto');
    assert.deepEqual(layout.tabLabels, ['DRE gerencial'], 'atalho direto expõe apenas a visão DRE');
    assert.match(layout.text, /R\$\s*10\.000,00/, 'receita realizada usa os dados financeiros existentes');
    assert.match(layout.text, /R\$\s*5\.000,00/, 'resultado reflete receitas, despesas mensais, folha e pedidos');

    if (width === 390) {
      await new Promise(resolve => setTimeout(resolve, 5200));
      assert.equal(backupPostCount, 0, 'DRE somente leitura nunca reenvia cache local ou fotografia do servidor');
    }

    if (permissions.admin === true) {
      const allUnitsRequest = page.waitForRequest(request => {
        const url = new URL(request.url());
        return url.pathname === '/api/costs/automatic' && url.searchParams.get('unit') === 'all';
      }, { timeout: 5000 });
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('virtuosa-unit-change', { detail: '' }));
      });
      await allUnitsRequest;
    }

    const failedAutomaticCosts = page.waitForRequest(request => (
      new URL(request.url()).pathname === '/api/costs/automatic'
    ), { timeout: 5000 });
    payrollRevision = 'rev-2';
    failAutomaticCostsOnce = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await failedAutomaticCosts;
    await page.waitForFunction(() => document.body.textContent?.includes('falha temporária sintética'));
    assert.match(
      await page.$eval('[aria-labelledby="dre-summary-title"]', element => element.textContent || ''),
      /R\$\s*5\.000,00/,
      'falha temporária mantém a última fotografia válida do DRE',
    );

    const retriedAutomaticCosts = page.waitForRequest(request => (
      new URL(request.url()).pathname === '/api/costs/automatic'
    ), { timeout: 5000 });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await retriedAutomaticCosts;
    await page.waitForFunction(() => (
      /R\$\s*4\.500,00/.test(document.querySelector('[aria-labelledby="dre-summary-title"]')?.textContent || '')
    ));

    const broadcastAutomaticCosts = page.waitForRequest(request => (
      new URL(request.url()).pathname === '/api/costs/automatic'
    ), { timeout: 5000 });
    payrollRevision = 'rev-3';
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('virtuosa-payroll-sync', {
        detail: {
          competenceMonth: 8,
          competenceYear: 2026,
          unit: 'Osasco',
          revision: 'rev-3',
          sourceId: 'outra-aba',
          publishedAt: Date.now(),
        },
      }));
    });
    await broadcastAutomaticCosts;

    if (width <= 768) {
      assert.ok(layout.tabHeights.every(height => height >= 44), 'abas têm alvo de toque de 44px');
      await clickExactText(page, '.mobile-tab-label', 'Mais');
      await page.waitForSelector('a[href="/dre"]');
      await page.evaluate(() => document.querySelector('.mobile-more-overlay')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      await page.waitForSelector('.mobile-more-overlay', { hidden: true });
    } else {
      await page.evaluate(() => {
        const financeButton = [...document.querySelectorAll('button.nav-link')]
          .find(button => button.textContent?.includes('Financeiro'));
        if (financeButton instanceof HTMLButtonElement) financeButton.click();
      });
      await page.waitForSelector('a[href="/dre"]');
      await page.evaluate(() => document.querySelector('main')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      await page.waitForSelector('a[href="/dre"]', { hidden: true });
    }

    assert.deepEqual(errors, []);
    await page.screenshot({ path: join(output, `dre-${width}.png`), fullPage: true });
    results.push({ width, tabs: layout.tabHeights.length, minTabHeight: Math.min(...layout.tabHeights) });

    if (width === 390) {
      failBackup = true;
      await page.reload({ waitUntil: 'networkidle0', timeout: 120000 });
      await page.waitForFunction(() => document.body.textContent?.includes('O DRE foi bloqueado'));
      assert.equal(
        await page.$('[aria-labelledby="dre-summary-title"]'),
        null,
        'falha do snapshot manual bloqueia o demonstrativo incompleto',
      );
    }
    await page.close();
  }

  console.log(JSON.stringify({ output, results }));
} finally {
  await browser.close();
}
