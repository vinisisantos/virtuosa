// Run against a local Next server. Every API request is synthetic and intercepted.
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const origin = process.env.PAYROLL_UI_ORIGIN || 'http://127.0.0.1:3098';
assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const output = await mkdtemp(join(tmpdir(), 'virtuosa-payroll-costs-ui-'));
const user = {
  id: 'payroll-ui',
  name: 'Teste local',
  role: 'ADMINISTRADOR',
  unit: 'Osasco',
  permissions: { admin: true, financeiro: true, finCustos: true },
};
const serverFixed = [{
  id: 10,
  name: 'Aluguel sincronizado',
  value: 13717.15,
  category: 'Aluguel',
  unit: 'Osasco',
  recurrence: 'monthly',
  effectiveFrom: '2026-09-01',
}];
const staleLocalFixed = [{
  id: 99,
  name: 'Aluguel antigo do celular',
  value: 13000,
  category: 'Aluguel',
  unit: 'Osasco',
  recurrence: 'monthly',
}];

function automaticCosts(paymentStatus, paymentDate) {
  const paid = paymentStatus === 'paid';
  return {
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
      paidTotal: paid ? 2700 : 0,
      pendingTotal: paid ? 0 : 2700,
      paidSalaryTotal: paid ? 2500 : 0,
      pendingSalaryTotal: paid ? 0 : 2500,
      paidFgtsTotal: paid ? 200 : 0,
      pendingFgtsTotal: paid ? 0 : 200,
      units: [{ unit: 'Osasco', salaryTotal: 2500, fgtsTotal: 200, total: 2700, employeeCount: 1 }],
      entries: [{
        id: 'entry-1',
        employeeName: 'Colaborador de teste com nome longo',
        unit: 'Osasco',
        salary: 2500,
        fgts: 200,
        total: 2700,
        paymentStatus,
        paymentDate,
        updatedAt: '2026-09-12T14:00:00.000Z',
      }],
    },
    productOrders: [],
    productOrdersTotal: 0,
  };
}

const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function clickLastExactText(page, selector, label) {
  const handle = await page.evaluateHandle((selector, label) => {
    const matches = [...document.querySelectorAll(selector)]
      .filter(element => element.textContent?.trim() === label);
    return matches.at(-1) || null;
  }, selector, label);
  const element = handle.asElement();
  assert.ok(element, `controle disponível: ${label}`);
  await element.evaluate(node => node.scrollIntoView({ block: 'center' }));
  await element.click();
  await handle.dispose();
}

const browser = await puppeteer.launch({ headless: true });
const results = [];

try {
  for (const width of [390, 430, 1440]) {
    let paymentStatus = 'unpaid';
    let paymentDate = null;
    let activeServerFixed = serverFixed;
    let backupUpdatedAt = '2026-09-12T21:10:53.179Z';
    const mutations = [];
    const page = await browser.newPage();
    const errors = [];
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
      else if (url.pathname === '/api/backup') data = {
        exists: true,
        logs: [],
        goals: {},
        fixed: activeServerFixed,
        bills: [],
        updatedAt: backupUpdatedAt,
      };
      else if (url.pathname === '/api/costs/automatic') data = automaticCosts(paymentStatus, paymentDate);
      else if (url.pathname === '/api/payroll/payment') {
        const body = JSON.parse(request.postData() || '{}');
        mutations.push(body);
        paymentStatus = body.paymentStatus;
        paymentDate = paymentStatus === 'paid' ? '2026-09-12T15:00:00.000Z' : null;
        data = { id: body.id, paymentStatus, paymentDate, changed: true };
      } else if (url.pathname === '/api/packages') data = [];

      void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.evaluateOnNewDocument((userValue, staleLocalFixedValue) => {
      localStorage.setItem('virtuosa_user', JSON.stringify(userValue));
      localStorage.setItem('virtuosa_global_unit', 'Osasco');
      localStorage.setItem('virtuosa_financeiro_tab', 'custos');
      localStorage.setItem('virtuosa_fixed_expenses_v2', JSON.stringify(staleLocalFixedValue));
      localStorage.setItem('virtuosa_bills_v2', '[]');
    }, user, staleLocalFixed);

    await page.goto(`${origin}/?tab=custos&month=8&year=2026`, { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForFunction(() => document.body.textContent?.includes('Folha de pagamento · competência 08/2026'));
    await page.waitForFunction(() => document.body.textContent?.includes('Aluguel sincronizado'));
    assert.equal(await page.evaluate(() => document.body.textContent?.includes('Aluguel antigo do celular')), false);
    if (width === 390) {
      activeServerFixed = [{
        ...serverFixed[0],
        name: 'Aluguel atualizado em outro dispositivo',
        value: 14000,
      }];
      backupUpdatedAt = '2026-09-12T21:11:53.179Z';
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForFunction(() => document.body.textContent?.includes('Aluguel atualizado em outro dispositivo'));
    }
    await page.click('button[aria-label^="Exibir detalhes de Folha de pagamento"]');
    await page.waitForFunction(() => document.body.textContent?.includes('Pagamentos por colaborador'));

    const layout = await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')]
        .find(element => element.textContent?.trim() === 'Confirmar pagamento');
      const detail = [...document.querySelectorAll('div')]
        .find(element => element.textContent?.trim() === 'Pagamentos por colaborador')?.parentElement;
      if (!button || !detail) return null;
      const buttonRect = button.getBoundingClientRect();
      const detailRect = detail.getBoundingClientRect();
      return {
        buttonHeight: buttonRect.height,
        detailLeft: detailRect.left,
        detailRight: detailRect.right,
        viewport: document.documentElement.clientWidth,
      };
    });
    assert.ok(layout, 'detalhamento e ação renderizados');
    assert.ok(layout.buttonHeight >= 44, 'alvo de toque da confirmação tem pelo menos 44px');
    assert.ok(layout.detailLeft >= 0 && layout.detailRight <= layout.viewport + 1, 'detalhamento permanece dentro do viewport');

    await clickLastExactText(page, 'button', 'Confirmar pagamento');
    await page.waitForFunction(() => [...document.querySelectorAll('h3')].some(element => element.textContent === 'Confirmar pagamento'));
    await clickLastExactText(page, 'button', 'Confirmar');
    await page.waitForFunction(() => document.body.textContent?.includes('Desfazer pagamento'));
    assert.deepEqual(mutations.at(-1), {
      id: 'entry-1',
      unit: 'Osasco',
      paymentStatus: 'paid',
      expectedUpdatedAt: '2026-09-12T14:00:00.000Z',
    });

    await pause(100);
    await page.screenshot({ path: join(output, `costs-${width}.png`), fullPage: true });
    assert.deepEqual(errors, []);
    results.push({ width, buttonHeight: layout.buttonHeight, mutations: mutations.length });
    await page.close();
  }

  console.log(JSON.stringify({ output, results }));
} finally {
  await browser.close();
}
