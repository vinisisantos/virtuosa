// Run against a local Next server. Every API request is synthetic and intercepted.
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const origin = process.env.PAYROLL_UI_ORIGIN || 'http://127.0.0.1:3099';
assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const output = await mkdtemp(join(tmpdir(), 'virtuosa-payroll-responsive-ui-'));

const user = {
  id: 'payroll-responsive-ui',
  name: 'Teste local',
  role: 'ADMINISTRADOR',
  unit: 'Osasco',
  permissions: { admin: true, financeiro: true },
};

const entry = {
  id: 'entry-responsive-1',
  payrollImportId: 'import-responsive-1',
  employeeName: 'Colaboradora com nome completo bastante extenso para validar o cartão',
  netSalary: 3250,
  baseSalary: 3250,
  cargo: 'Especialista em atendimento e procedimentos estéticos',
  bonus: 450,
  paymentStatus: 'unpaid',
  paymentDate: null,
  updatedAt: '2026-09-01T12:00:00.000Z',
  confidenceScore: 1,
  extractionSource: 'manual',
  hasPenalty: false,
  hasAdiantamento: false,
  isRecurring: true,
  hasFgts: true,
  employmentType: 'CLT',
  hazardPayRate: 20,
  hazardPayBase: 1621,
  notes: null,
  adjustments: [
    {
      id: 'adjustment-responsive-1',
      payrollEntryId: 'entry-responsive-1',
      kind: 'absence',
      direction: 'debit',
      label: 'Falta justificada com uma descrição extensa',
      quantity: 1,
      amount: null,
      createdAt: '2026-09-01T12:00:00.000Z',
      updatedAt: '2026-09-01T12:00:00.000Z',
    },
  ],
  vacation: { days: 5, salaryPortion: 595.7, workedSalary: 2978.5, third: 198.57, advanceDeduction: 0 },
  vacationPeriods: [{
    id: 'vacation-responsive-1', unit: 'Osasco', employeeKey: 'colaboradora com nome completo bastante extenso para validar o cartão',
    employeeName: 'Colaboradora com nome completo bastante extenso para validar o cartão',
    startDate: '2026-09-10T00:00:00.000Z', endDate: '2026-09-14T00:00:00.000Z',
    advanceAmount: 0, advancePaidAt: null, updatedAt: '2026-09-01T12:00:00.000Z',
  }],
};

const payrollResponse = {
  revision: 'responsive-revision-1',
  lastModifiedAt: '2026-09-01T12:00:00.000Z',
  entries: [entry],
  summary: {
    totalPayroll: 3506.71,
    totalPaid: 0,
    totalPending: 3506.71,
    totalEmployees: 1,
    paidCount: 0,
    pendingCount: 1,
    reviewCount: 0,
    totalBaseSalary: 3250,
    totalBonus: 450,
    totalCredits: 450,
    totalDebits: 108.33,
    totalHazardPay: 324.2,
    totalGrossSalary: 3574.2,
    totalInss: 409.16,
    totalFgts: 285.94,
    cltCount: 1,
    pjCount: 0,
    undefinedRegimeCount: 0,
  },
};

const viewports = [
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 769, height: 900 },
  { width: 820, height: 900 },
  { width: 900, height: 900 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 844, height: 390, landscape: true },
];

const browser = await puppeteer.launch({ headless: true });
const results = [];

try {
  for (const viewport of viewports) {
    const page = await browser.newPage();
    const errors = [];
    await page.setViewport({
      width: viewport.width,
      height: viewport.height,
      hasTouch: viewport.width <= 1024,
      isMobile: viewport.width <= 600,
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) {
        if (url.origin === origin) void request.continue();
        else void request.abort();
        return;
      }

      const data = url.pathname === '/api/auth/me'
        ? { authenticated: true, user }
        : url.pathname === '/api/backup'
          ? { exists: false }
          : url.pathname === '/api/payroll/entries'
            ? payrollResponse
            : url.pathname === '/api/payroll/revision'
              ? {
                  revision: payrollResponse.revision,
                  lastModifiedAt: payrollResponse.lastModifiedAt,
                  competenceMonth: Number(url.searchParams.get('month')),
                  competenceYear: Number(url.searchParams.get('year')),
                  unit: url.searchParams.get('unit') || 'all',
                }
            : {};
      void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.evaluateOnNewDocument(userValue => {
      localStorage.setItem('virtuosa_user', JSON.stringify(userValue));
      localStorage.setItem('virtuosa_global_unit', 'Osasco');
      localStorage.setItem('virtuosa_financeiro_tab', 'folha');
    }, user);

    await page.goto(`${origin}/?tab=folha`, { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForFunction(name => document.body.textContent?.includes(name), {}, entry.employeeName);

    const layout = await page.evaluate(() => {
      const detailsButton = document.querySelector('button[aria-controls^="payroll-details-"]');
      const tableLabel = [...document.querySelectorAll('span')]
        .find(element => element.textContent?.trim() === 'Colaborador' && element.parentElement?.getAttribute('aria-hidden') === 'true');
      if (!detailsButton || !tableLabel) return null;
      const buttonRect = detailsButton.getBoundingClientRect();
      return {
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        detailsText: detailsButton.innerText,
        detailsWidth: buttonRect.width,
        detailsHeight: buttonRect.height,
        tableDisplay: getComputedStyle(tableLabel.parentElement).display,
      };
    });

    assert.ok(layout, 'cartão e cabeçalho da folha renderizados');
    assert.ok(layout.documentWidth <= layout.viewportWidth + 1, `sem overflow horizontal em ${viewport.width}x${viewport.height}`);
    assert.ok(await page.$('button[aria-label^="Confirmar pagamento de"]'), 'confirmação individual disponível na lista');
    await page.evaluate(() => [...document.querySelectorAll('[aria-label="Filtrar pagamentos"] button')]
      .find(button => button.textContent?.includes('Pagos'))?.click());
    await page.waitForFunction(() => document.body.textContent?.includes('Nenhum colaborador corresponde à busca ou ao filtro.'));
    await page.evaluate(() => [...document.querySelectorAll('[aria-label="Filtrar pagamentos"] button')]
      .find(button => button.textContent?.includes('Todos'))?.click());
    await page.waitForFunction(name => document.body.textContent?.includes(name), {}, entry.employeeName);
    await page.type('input[aria-label="Buscar colaborador"]', 'sem correspondência');
    await page.waitForFunction(() => document.body.textContent?.includes('Nenhum colaborador corresponde à busca ou ao filtro.'));
    await page.evaluate(() => document.querySelector('button') && [...document.querySelectorAll('button')]
      .find(button => button.textContent?.trim() === 'Limpar filtros')?.click());
    await page.waitForFunction(name => document.body.textContent?.includes(name), {}, entry.employeeName);
    await page.evaluate(() => document.querySelector('button[aria-label="Fechar detalhes"]')?.click());
    await page.waitForFunction(() => !document.querySelector('[id^="payroll-details-"]'));
    await page.evaluate(() => document.querySelector('button[aria-controls^="payroll-details-"]')?.click());
    await page.waitForSelector('[id^="payroll-details-"]');
    if (viewport.width <= 1024) {
      assert.match(layout.detailsText, /Detalhes e ajustes/, 'ação textual de ajustes visível');
      assert.ok(layout.detailsWidth > 44, 'ação textual ocupa largura confortável');
      assert.ok(layout.detailsHeight >= 44, 'alvo de detalhes tem pelo menos 44px');
      assert.equal(layout.tableDisplay, 'none', 'cartões substituem a tabela até 1024px');
    } else {
      assert.equal(layout.detailsWidth, 44, 'desktop preserva controle compacto da tabela');
      assert.notEqual(layout.tableDisplay, 'none', 'desktop preserva cabeçalho tabular');
    }

    await page.screenshot({
      path: join(output, `payroll-page-${viewport.width}x${viewport.height}.png`),
      fullPage: !viewport.landscape,
    });
    const detailsHandle = await page.$('button[aria-controls^="payroll-details-"]');
    const cardHandle = detailsHandle
      ? (await detailsHandle.evaluateHandle(element => element.closest('article'))).asElement()
      : null;
    assert.ok(cardHandle, 'cartão do colaborador disponível para captura');
    await cardHandle.screenshot({ path: join(output, `payroll-card-${viewport.width}x${viewport.height}.png`) });
    await cardHandle.dispose();
    await page.evaluate(() => {
      [...document.querySelectorAll('[aria-label^="Informações de "] button')]
        .find(button => button.textContent?.trim() === 'Férias')?.click();
    });
    await page.waitForSelector('section[aria-label^="Férias de "]');
    await page.evaluate(() => {
      const panel = document.querySelector('section[aria-label^="Férias de "]');
      const add = [...(panel?.querySelectorAll('button') || [])]
        .find(button => button.textContent?.includes('Adicionar período'));
      add?.click();
    });
    await page.waitForSelector('section[aria-label^="Férias de "] input[type="date"]');
    const vacationLayout = await page.evaluate(() => {
      const panel = document.querySelector('section[aria-label^="Férias de "]');
      const inputs = [...(panel?.querySelectorAll('input[type="date"]') || [])];
      return {
        count: inputs.length,
        minHeight: Math.min(...inputs.map(input => input.getBoundingClientRect().height)),
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      };
    });
    assert.equal(vacationLayout.count, 2, 'apenas as datas das férias são informadas; recibo é automático');
    assert.ok(vacationLayout.minHeight >= 44, 'campos de férias com alvo de toque');
    assert.ok(vacationLayout.documentWidth <= vacationLayout.viewportWidth + 1, 'editor de férias sem overflow horizontal');
    await page.evaluate(() => {
      const dates = [...document.querySelectorAll('section[aria-label^="Férias de "] input[type="date"]')];
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      for (const [input, value] of [[dates[0], '2026-09-16'], [dates[1], '2026-10-05']]) {
        setValue.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForFunction(() => document.body.textContent?.includes('Prévia da Folha · competência 09/2026'));
    const visibleCompetences = await page.evaluate(() => document.body.textContent || '');
    assert.match(visibleCompetences, /Folha 09\/2026 → Custos 10\/2026/);
    assert.match(visibleCompetences, /Folha 09\/2026: 15 dias de férias → Custos 10\/2026/);
    assert.match(visibleCompetences, /Folha 10\/2026: 5 dias de férias → Custos 11\/2026/);
    const advanceLayout = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));
    assert.ok(advanceLayout.documentWidth <= advanceLayout.viewportWidth + 1, 'prévia de férias sem overflow horizontal');
    const vacationHandle = await page.$('section[aria-label^="Férias de "]');
    await vacationHandle.screenshot({ path: join(output, `payroll-vacation-${viewport.width}x${viewport.height}.png`) });
    await vacationHandle.dispose();
    const previewNetReachable = await page.evaluate(() => {
      const net = document.querySelector('section[aria-label^="Férias de "] [class*="vacationPreviewNet"]');
      net?.scrollIntoView({ block: 'center' });
      if (!net) return false;
      const bounds = net.getBoundingClientRect();
      const x = bounds.left + bounds.width / 2;
      const y = bounds.top + bounds.height / 2;
      return y > 0 && y < innerHeight && net.contains(document.elementFromPoint(x, y));
    });
    assert.ok(previewNetReachable, 'líquido estimado acessível sem ficar encoberto pela navegação');
    await page.evaluate(() => {
      const panel = document.querySelector('section[aria-label^="Férias de "]');
      [...(panel?.querySelectorAll('button') || [])]
        .find(button => button.textContent?.trim() === 'Cancelar')?.click();
    });
    await page.waitForFunction(() => !document.querySelector('section[aria-label^="Férias de "] input[type="date"]'));
    await page.evaluate(name => document.querySelector(`button[aria-label="Editar ${name}"]`)?.click(), entry.employeeName);
    await page.waitForSelector('[role="dialog"]');
    const modal = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const close = dialog?.querySelector('button[aria-label="Fechar"]');
      const fields = dialog?.querySelector('input[placeholder="Nome completo"]')?.closest('label')?.parentElement;
      if (!dialog || !close || !fields) return null;
      const dialogRect = dialog.getBoundingClientRect();
      const closeRect = close.getBoundingClientRect();
      return {
        top: dialogRect.top,
        bottom: dialogRect.bottom,
        viewportHeight: window.innerHeight,
        closeWidth: closeRect.width,
        closeHeight: closeRect.height,
        fieldsClientHeight: fields.clientHeight,
        fieldsScrollHeight: fields.scrollHeight,
      };
    });

    assert.ok(modal, 'modal de edição renderizado');
    assert.ok(modal.top >= -1 && modal.bottom <= modal.viewportHeight + 1, 'modal permanece dentro da altura visível');
    if (viewport.width <= 1024) {
      assert.ok(modal.closeWidth >= 44 && modal.closeHeight >= 44, 'fechar preserva alvo de toque 44x44');
    }
    if (viewport.landscape) {
      assert.ok(modal.fieldsScrollHeight > modal.fieldsClientHeight, 'campos do modal rolam em paisagem');
    }

    await page.evaluate(() => {
      const toggle = [...document.querySelectorAll('[role="dialog"] label')]
        .find(label => label.textContent?.includes('Descontar vale-transporte'))?.querySelector('input[type="checkbox"]');
      if (toggle && !toggle.checked) toggle.click();
    });
    const transportLayout = await page.evaluate(() => ({
      hasActualCost: Boolean([...document.querySelectorAll('[role="dialog"] label')]
        .find(label => label.textContent?.includes('Custo real do VT neste mês'))?.querySelector('input')),
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));
    assert.equal(transportLayout.hasActualCost, true, 'teto real do VT acessível na edição');
    assert.ok(transportLayout.documentWidth <= transportLayout.viewportWidth + 1, 'campo do VT sem overflow horizontal');

    await page.screenshot({
      path: join(output, `payroll-modal-${viewport.width}x${viewport.height}.png`),
      fullPage: !viewport.landscape,
    });
    assert.deepEqual(errors, []);
    results.push({ ...viewport, detailsWidth: layout.detailsWidth, modalScroll: modal.fieldsScrollHeight > modal.fieldsClientHeight });
    await page.close();
  }

  console.log(JSON.stringify({ output, results }));
} finally {
  await browser.close();
}
