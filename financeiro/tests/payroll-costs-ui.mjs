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
      salaryTotal: 3500,
      fgtsTotal: 280,
      total: 3780,
      employeeCount: 2,
      paidTotal: paid ? 2700 : 0,
      pendingTotal: paid ? 1080 : 3780,
      paidSalaryTotal: paid ? 2500 : 0,
      pendingSalaryTotal: paid ? 1000 : 3500,
      paidFgtsTotal: paid ? 200 : 0,
      pendingFgtsTotal: paid ? 80 : 280,
      units: [{ unit: 'Osasco', salaryTotal: 3500, fgtsTotal: 280, total: 3780, employeeCount: 2 }],
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
      }, {
        id: 'entry-2',
        employeeName: 'Segunda colaboradora de teste',
        unit: 'Osasco',
        salary: 1000,
        fgts: 80,
        total: 1080,
        paymentStatus: 'unpaid',
        paymentDate: null,
        updatedAt: '2026-09-12T14:00:00.000Z',
      }],
    },
    productOrders: [{ id: 'order-1', productName: 'Produto sintético', totalPrice: 500, costRecognizedAt: '2026-09-12', status: 'Entregue', unit: 'Osasco' }],
    productOrdersTotal: 500,
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

async function clickPayrollPayment(page, employeeName) {
  const handle = await page.evaluateHandle(employeeName => [...document.querySelectorAll('button')]
    .find(button => button.textContent?.trim() === 'Confirmar pagamento'
      && button.parentElement?.textContent?.includes(employeeName)) || null, employeeName);
  const element = handle.asElement();
  assert.ok(element, `confirmação disponível para ${employeeName}`);
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
        logs: [{
          id: 'revenue-1',
          type: 'sale',
          source: 'manual',
          status: 'received',
          name: 'Receita sintética',
          value: 800,
          unit: 'Osasco',
          date: '2026-09-10T12:00:00.000Z',
        }],
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
    await page.waitForFunction(() => document.body.textContent?.includes('Folha de pagamento'));
    await page.waitForFunction(() => document.body.textContent?.includes('Aluguel sincronizado'));
    assert.equal(await page.evaluate(() => document.body.textContent?.includes('Aluguel antigo do celular')), false);
    await page.click('button[aria-label="Ocultar valores"]');
    await page.waitForFunction(() => document.body.textContent?.includes('R$ ••••••'));
    assert.equal(await page.evaluate(() => /R\$\s*13\.717,15/.test(document.body.textContent || '')), false, 'despesa deixa de exibir o valor quando ocultada');
    assert.equal(await page.$eval('button[aria-label="Mostrar valores"]', button => button.getAttribute('aria-pressed')), 'true');
    for (const [label, visibleAmount] of [
      ['Produtos', 'R\\$\\s*500,00'],
      ['Receitas', 'R\\$\\s*800,00'],
      ['Calendário', 'R\\$\\s*13\\.717,15'],
      ['DRE gerencial', 'R\\$\\s*800,00'],
    ]) {
      await clickLastExactText(page, 'button', label);
      await page.waitForFunction(activeLabel => (
        [...document.querySelectorAll('[role="tab"]')]
          .some(tab => tab.textContent?.trim() === activeLabel && tab.getAttribute('aria-selected') === 'true')
      ), {}, label);
      assert.match(await page.evaluate(() => document.body.textContent || ''), /R\$\s*••••••/, `${label} mantém os valores ocultos`);
      assert.equal(await page.evaluate(amountPattern => new RegExp(amountPattern).test(document.body.textContent || ''), visibleAmount), false, `${label} não revela o valor no estado oculto`);
    }
    await clickLastExactText(page, 'button', 'Despesas');
    await page.waitForFunction(() => [...document.querySelectorAll('[role="tab"]')]
      .some(tab => tab.textContent?.trim() === 'Despesas' && tab.getAttribute('aria-selected') === 'true'));
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
    assert.equal(await page.evaluate(() => /R\$\s*2\.500,00/.test(document.body.textContent || '')), false, 'detalhamento da folha também fica oculto');
    await page.click('button[aria-label="Mostrar valores"]');
    await page.waitForFunction(() => /R\$\s*2\.500,00/.test(document.body.textContent || ''));
    const payrollRowValue = () => page.evaluate(() => {
      const row = [...document.querySelectorAll('tr.cost-main-row')]
        .find(element => element.textContent?.includes('Folha de pagamento'));
      return row?.querySelector('.cost-value-cell')?.textContent?.trim().replace(/\s+/g, ' ') || null;
    });
    const initialPayrollRowValue = await payrollRowValue();
    assert.ok(initialPayrollRowValue?.startsWith('R$ 3.500,00'), 'a linha mostra o total líquido de salários na visão geral');

    const layout = await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')]
        .find(element => element.textContent?.trim() === 'Confirmar pagamento');
      const visibilityButton = document.querySelector('button[aria-label="Ocultar valores"]');
      const detail = [...document.querySelectorAll('div')]
        .find(element => element.textContent?.trim() === 'Pagamentos por colaborador')?.parentElement;
      if (!button || !detail || !visibilityButton) return null;
      const buttonRect = button.getBoundingClientRect();
      const visibilityRect = visibilityButton.getBoundingClientRect();
      const detailRect = detail.getBoundingClientRect();
      return {
        buttonHeight: buttonRect.height,
        visibilityButtonHeight: visibilityRect.height,
        visibilityButtonLeft: visibilityRect.left,
        visibilityButtonRight: visibilityRect.right,
        detailLeft: detailRect.left,
        detailRight: detailRect.right,
        viewport: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
      };
    });
    assert.ok(layout, 'detalhamento e ação renderizados');
    assert.ok(layout.buttonHeight >= 44, 'alvo de toque da confirmação tem pelo menos 44px');
    assert.ok(layout.visibilityButtonHeight >= 44, 'olho tem alvo de toque de pelo menos 44px');
    assert.ok(layout.visibilityButtonLeft >= 0 && layout.visibilityButtonRight <= layout.viewport + 1, 'olho permanece dentro do viewport');
    assert.equal(layout.documentWidth, layout.viewport, 'página sem overflow horizontal');
    assert.ok(layout.detailLeft >= 0 && layout.detailRight <= layout.viewport + 1, 'detalhamento permanece dentro do viewport');

    await clickPayrollPayment(page, 'Colaborador de teste com nome longo');
    await page.waitForFunction(() => [...document.querySelectorAll('h3')].some(element => element.textContent === 'Confirmar pagamento'));
    await clickLastExactText(page, 'button', 'Confirmar');
    await page.waitForFunction(() => document.body.textContent?.includes('Desfazer pagamento'));
    await page.waitForFunction(() => {
      const row = [...document.querySelectorAll('tr.cost-main-row')]
        .find(element => element.textContent?.includes('Folha de pagamento'));
      return row?.querySelector('.cost-value-cell')?.textContent?.trim().replace(/\s+/g, ' ').startsWith('R$ 3.500,00')
        && row.textContent?.includes('Parcial');
    });
    const payrollSummary = await page.evaluate(() => {
      const paymentsLabel = [...document.querySelectorAll('div')]
        .find(element => element.textContent?.trim() === 'Pagamentos por colaborador');
      return paymentsLabel?.parentElement?.parentElement?.textContent || '';
    });
    assert.match(payrollSummary, /CUSTO PENDENTE · SALÁRIO \+ FGTS\s*R\$\s*1\.080,00/);
    assert.match(payrollSummary, /Pago\s*R\$\s*2\.700,00\s*·\s*Total somado aos custos\s*R\$\s*3\.780,00/);
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
