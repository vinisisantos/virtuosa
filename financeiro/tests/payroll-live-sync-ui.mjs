// Run against a local Next server. Every API request is synthetic and intercepted.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const origin = process.env.PAYROLL_SYNC_UI_ORIGIN || 'http://127.0.0.1:3101';
assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);

const user = {
  id: 'payroll-live-sync-ui',
  name: 'Teste local',
  role: 'ADMINISTRADOR',
  unit: 'Osasco',
  permissions: { admin: true, financeiro: true },
};

let activeRevision = 'revision-1';
let fullDelayMs = 0;
let writeDelayMs = 0;
let delayedMonth = null;
let failRevision = null;
let activeEntryUpdatedAt = '2026-09-12T12:00:00.000Z';
let revisionRequests = 0;
const entryRequests = [];
const entryWrites = [];

function payrollResponse(month, revision) {
  const employeeName = `Colaboradora ${month}/${revision}`;
  return {
    revision,
    lastModifiedAt: '2026-09-12T12:00:00.000Z',
    entries: [{
      id: `entry-${month}`,
      payrollImportId: `import-${month}`,
      employeeName,
      netSalary: 3250,
      baseSalary: 3250,
      cargo: 'Especialista',
      bonus: 0,
      paymentStatus: 'unpaid',
      paymentDate: null,
      updatedAt: activeEntryUpdatedAt,
      confidenceScore: 1,
      extractionSource: 'manual',
      hasPenalty: false,
      hasAdiantamento: false,
      isRecurring: true,
      hasFgts: false,
      employmentType: 'PJ',
      hazardPayRate: 0,
      hazardPayBase: null,
      transportDiscountEnabled: false,
      notes: null,
      adjustments: [],
    }],
    summary: {
      totalPayroll: 3250,
      totalPaid: 0,
      totalPending: 3250,
      totalEmployees: 1,
      paidCount: 0,
      pendingCount: 1,
      reviewCount: 0,
      totalBaseSalary: 3250,
      totalBonus: 0,
      totalCredits: 0,
      totalDebits: 0,
      totalHazardPay: 0,
      totalGrossSalary: 3250,
      totalInss: 0,
      totalFgts: 0,
      cltCount: 0,
      pjCount: 1,
      undefinedRegimeCount: 0,
    },
  };
}

async function waitUntil(predicate, message, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail(message);
}

async function respond(request, response) {
  try {
    await request.respond(response);
  } catch (error) {
    if (!request.isInterceptResolutionHandled()) throw error;
  }
}

const browser = await puppeteer.launch({ headless: true });

try {
  const page = await browser.newPage();
  const browserErrors = [];
  await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.evaluateOnNewDocument(userValue => {
    localStorage.setItem('virtuosa_user', JSON.stringify(userValue));
    localStorage.setItem('virtuosa_global_unit', 'Osasco');
    localStorage.setItem('virtuosa_financeiro_tab', 'folha');
    const nativeSetInterval = window.setInterval.bind(window);
    window.__payrollTestIntervals = [];
    window.setInterval = (handler, timeout, ...args) => {
      window.__payrollTestIntervals.push(timeout);
      return nativeSetInterval(handler, timeout, ...args);
    };
  }, user);
  await page.setRequestInterception(true);
  page.on('request', request => {
    void (async () => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) {
        if (url.origin === origin) await request.continue();
        else await request.abort();
        return;
      }

      if (url.pathname === '/api/auth/me') {
        await respond(request, { status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, user }) });
        return;
      }
      if (url.pathname === '/api/backup') {
        await respond(request, { status: 200, contentType: 'application/json', body: JSON.stringify({ exists: false }) });
        return;
      }
      if (url.pathname === '/api/payroll/revision') {
        revisionRequests += 1;
        await respond(request, {
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            revision: activeRevision,
            lastModifiedAt: '2026-09-12T12:00:00.000Z',
            competenceMonth: Number(url.searchParams.get('month')),
            competenceYear: Number(url.searchParams.get('year')),
            unit: url.searchParams.get('unit') || 'all',
          }),
        });
        return;
      }
      if (url.pathname === '/api/payroll/entries') {
        if (request.method() !== 'GET') {
          const body = JSON.parse(request.postData() || '{}');
          entryWrites.push(body);
          if (writeDelayMs > 0) await new Promise(resolve => setTimeout(resolve, writeDelayMs));
          if (body.expectedUpdatedAt !== activeEntryUpdatedAt) {
            await respond(request, {
              status: 409,
              contentType: 'application/json',
              body: JSON.stringify({
                error: 'A folha foi atualizada em outro dispositivo.',
                code: 'PAYROLL_VERSION_CONFLICT',
                reloadRequired: true,
              }),
            });
            return;
          }
          await respond(request, {
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(payrollResponse(9, activeRevision).entries[0]),
          });
          return;
        }
        const month = Number(url.searchParams.get('month'));
        const revision = delayedMonth === month ? `revision-month-${month}` : activeRevision;
        entryRequests.push({ month, revision });
        const delay = delayedMonth === month ? 450 : fullDelayMs;
        if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
        if (failRevision === revision) {
          await respond(request, {
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'falha sintética silenciosa' }),
          });
          return;
        }
        await respond(request, {
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(payrollResponse(month, revision)),
        });
        return;
      }

      await respond(request, { status: 200, contentType: 'application/json', body: '{}' });
    })().catch(error => browserErrors.push(error.message));
  });

  await page.goto(`${origin}/?tab=folha`, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.waitForFunction(() => document.body.textContent?.includes('Colaboradora 9/revision-1'));
  assert.equal(entryRequests.length, 1, 'carregamento inicial faz uma consulta completa');
  assert.ok(
    await page.evaluate(() => window.__payrollTestIntervals.includes(60_000)),
    'polling leve usa intervalo de 60 segundos',
  );

  const revisionsBeforeFocus = revisionRequests;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await waitUntil(() => revisionRequests > revisionsBeforeFocus, 'focus deve consultar a revisão');
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(entryRequests.length, 1, 'revisão inalterada não repete a consulta completa');

  activeRevision = 'revision-2';
  fullDelayMs = 300;
  const entriesBeforeChange = entryRequests.length;
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await waitUntil(() => entryRequests.length > entriesBeforeChange, 'pageshow com revisão nova deve atualizar a folha');
  assert.equal(
    await page.evaluate(() => document.body.textContent?.includes('Carregando folha...')),
    false,
    'atualização automática não substitui a tela por loading',
  );
  assert.ok(
    await page.evaluate(() => document.body.textContent?.includes('Colaboradora 9/revision-1')),
    'dados anteriores permanecem visíveis durante atualização silenciosa',
  );
  await page.waitForFunction(() => document.body.textContent?.includes('Colaboradora 9/revision-2'));

  fullDelayMs = 0;
  activeRevision = 'revision-3';
  failRevision = activeRevision;
  const entriesBeforeFailure = entryRequests.length;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await waitUntil(() => entryRequests.length > entriesBeforeFailure, 'revisão nova deve tentar recarregar');
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(
    await page.evaluate(() => document.body.textContent?.includes('Colaboradora 9/revision-2')),
    'erro silencioso preserva a última fotografia válida',
  );
  assert.equal(
    await page.evaluate(() => document.body.textContent?.includes('falha sintética silenciosa')),
    false,
    'erro silencioso não substitui a folha por mensagem de erro',
  );

  failRevision = null;
  activeRevision = 'revision-4';
  const revisionsBeforeSignal = revisionRequests;
  const entriesBeforeSignal = entryRequests.length;
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('virtuosa-payroll-sync', {
      detail: {
        competenceMonth: 9,
        competenceYear: 2026,
        unit: 'Osasco',
        revision: 'revision-4',
        sourceId: 'outra-aba',
        publishedAt: Date.now(),
      },
    }));
  });
  await waitUntil(() => entryRequests.length > entriesBeforeSignal, 'sinal local deve atualizar a mesma competência');
  await page.waitForFunction(() => document.body.textContent?.includes('Colaboradora 9/revision-4'));
  assert.equal(revisionRequests, revisionsBeforeSignal, 'sinal da mesma unidade usa diretamente a revisão recebida');

  activeRevision = 'revision-5';
  fullDelayMs = 250;
  const entriesBeforeBurst = entryRequests.length;
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('virtuosa-payroll-sync', {
      detail: {
        competenceMonth: 9,
        competenceYear: 2026,
        unit: 'Osasco',
        revision: 'revision-5',
        sourceId: 'outra-aba',
        publishedAt: Date.now(),
      },
    }));
  });
  await waitUntil(() => entryRequests.length > entriesBeforeBurst, 'primeiro sinal do burst deve iniciar atualização');
  activeRevision = 'revision-6';
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('virtuosa-payroll-sync', {
      detail: {
        competenceMonth: 9,
        competenceYear: 2026,
        unit: 'Osasco',
        revision: 'revision-6',
        sourceId: 'outra-aba',
        publishedAt: Date.now(),
      },
    }));
  });
  await waitUntil(
    () => entryRequests.length >= entriesBeforeBurst + 2,
    'sinal mais recente deve ser reconciliado após uma atualização já em curso',
  );
  await page.waitForFunction(() => document.body.textContent?.includes('Colaboradora 9/revision-6'));

  fullDelayMs = 0;
  const entriesBeforeStaleSignal = entryRequests.length;
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('virtuosa-payroll-sync', {
      detail: {
        competenceMonth: 9,
        competenceYear: 2026,
        unit: 'Osasco',
        revision: 'revision-5',
        sourceId: 'outra-aba',
        publishedAt: Date.now(),
      },
    }));
  });
  await waitUntil(
    () => entryRequests.length > entriesBeforeStaleSignal,
    'sinal atrasado ainda deve reconciliar uma vez com o servidor',
  );
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(entryRequests.length, entriesBeforeStaleSignal + 1, 'sinal atrasado não cria loop de recargas');
  assert.ok(
    await page.evaluate(() => document.body.textContent?.includes('Colaboradora 9/revision-6')),
    'fotografia mais nova do servidor prevalece sobre sinal atrasado',
  );

  await page.click('button[aria-label^="Editar Colaboradora 9/revision-6"]');
  await page.waitForSelector('[role="dialog"]');
  await page.$eval('input[placeholder="Nome completo"]', input => {
    input.value = 'Valor local que não deve sobrescrever o remoto';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  activeEntryUpdatedAt = '2026-09-12T13:00:00.000Z';
  activeRevision = 'revision-7';
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('virtuosa-payroll-sync', {
      detail: {
        competenceMonth: 9,
        competenceYear: 2026,
        unit: 'Osasco',
        revision: 'revision-7',
        sourceId: 'outro-dispositivo',
        publishedAt: Date.now(),
      },
    }));
  });
  await page.waitForFunction(() => document.body.textContent?.includes('Colaboradora 9/revision-7'));
  const writesBeforeConflict = entryWrites.length;
  await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const save = [...(dialog?.querySelectorAll('button') || [])]
      .find(button => button.textContent?.trim() === 'Salvar colaborador');
    if (save instanceof HTMLButtonElement) save.click();
  });
  await waitUntil(() => entryWrites.length > writesBeforeConflict, 'edição antiga deve chegar ao controle de versão');
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  assert.equal(
    entryWrites.at(-1).expectedUpdatedAt,
    '2026-09-12T12:00:00.000Z',
    'modal preserva a versão da abertura e não reaproveita a revisão remota',
  );

  delayedMonth = 10;
  const octoberRequests = entryRequests.filter(item => item.month === 10).length;
  await page.select('select[aria-label="Mês"]', '10');
  await waitUntil(
    () => entryRequests.filter(item => item.month === 10).length > octoberRequests,
    'troca para outubro deve iniciar consulta',
  );
  await page.select('select[aria-label="Mês"]', '11');
  await page.waitForFunction(() => document.body.textContent?.includes('Colaboradora 11/revision-7'));
  await new Promise(resolve => setTimeout(resolve, 550));
  assert.equal(
    await page.evaluate(() => document.body.textContent?.includes('Colaboradora 10/revision-month-10')),
    false,
    'resposta antiga abortada não sobrescreve a competência mais recente',
  );

  const novemberReadsBeforeMutation = entryRequests.filter(item => item.month === 11).length;
  await page.click('button[aria-label^="Editar Colaboradora 11/revision-7"]');
  await page.waitForSelector('[role="dialog"]');
  writeDelayMs = 300;
  const writesBeforeScopeSwitch = entryWrites.length;
  await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const save = [...(dialog?.querySelectorAll('button') || [])]
      .find(button => button.textContent?.trim() === 'Salvar colaborador');
    if (save instanceof HTMLButtonElement) save.click();
  });
  await waitUntil(() => entryWrites.length > writesBeforeScopeSwitch, 'edição deve iniciar antes da troca de competência');
  await page.select('select[aria-label="Mês"]', '12');
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  await page.waitForFunction(() => document.body.textContent?.includes('Colaboradora 12/revision-7'));
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(
    entryRequests.filter(item => item.month === 11).length,
    novemberReadsBeforeMutation,
    'mutação antiga não dispara refresh da competência anterior após trocar de escopo',
  );
  assert.equal(
    await page.evaluate(() => document.body.textContent?.includes('Carregando folha...')),
    false,
    'troca de competência conclui o loading mesmo com mutação antiga em andamento',
  );

  assert.deepEqual(browserErrors, []);
  console.log(JSON.stringify({ revisionRequests, entryRequests }));
  await page.close();
} finally {
  await browser.close();
}
