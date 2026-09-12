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
    await page.click(`button[aria-label="Editar ${entry.employeeName}"]`);
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
