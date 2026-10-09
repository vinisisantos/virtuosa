import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Synthetic API responses only: no real appointments, database queries or WhatsApp messages.
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3210';
const output = await mkdtemp(join(tmpdir(), 'virtuosa-group-confirmation-'));
console.log({ output });
const browser = await puppeteer.launch({ headless: true });
const user = { id: 'operator', name: 'Operadora Teste', role: 'ADMINISTRADOR', unit: 'SBC', permissions: { crm: true, unitSBC: true } };
const professional = { id: 'professional', name: user.name, color: '#8b5cf6' };

async function button(page, label) {
  const handle = await page.waitForFunction((text) => [...document.querySelectorAll('button')].find((element) =>
    element.getClientRects().length && element.textContent.trim() === text), {}, label);
  return handle.asElement();
}
async function click(page, element) {
  await element.evaluate((target) => target.scrollIntoView({ block: 'center' }));
  await page.waitForFunction((target) => {
    const rect = target.getBoundingClientRect();
    return !target.disabled && rect.top >= 0 && rect.bottom <= innerHeight
      && target.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
  }, {}, element);
  assert.ok(await element.evaluate((target) => target.getBoundingClientRect().height >= 44), 'touch target');
  await element.click();
}
async function clickStatus(page) {
  const element = await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] button')].find((item) =>
    item.textContent.includes('Cliente confirmou presença na avaliação.')));
  await click(page, element.asElement());
}
async function assertFit(page, width) {
  assert.ok(await page.$eval('[role="dialog"]', (dialog) => {
    const rect = dialog.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= innerWidth + 1 && dialog.scrollWidth <= dialog.clientWidth + 1;
  }), `modal overflow ${width}`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `page overflow ${width}`);
}

try {
  for (const width of [390, 430, 1440]) {
    const page = await browser.newPage();
    const errors = [], requests = [], writes = [];
    let mode = 'missing', failOnce = false;
    const start = new Date(); start.setHours(23, 0, 0, 0);
    const appointment = {
      id: 'synthetic-evaluation', clientName: 'Pessoa Sintética com nome muito longo para conferência da confirmação',
      clientPhone: '5511900000001', unit: 'SBC', procedimento: 'Avaliação', evaluationProcedure: null,
      campaignProcedureName: 'Categoria de campanha longa que não deve ser inferida como tratamento',
      status: 'pendente', startTime: start.toISOString(), endTime: new Date(+start + 3600000).toISOString(),
      assignedUserId: user.id, profissional: professional,
    };
    await page.setViewport({ width, height: 932, isMobile: width < 600, hasTouch: width < 600 });
    await page.evaluateOnNewDocument((user) => {
      localStorage.setItem('virtuosa_user', JSON.stringify(user));
      localStorage.setItem('virtuosa_global_unit', user.unit);
    }, user);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', async (request) => {
      const url = new URL(request.url());
      if (url.origin !== origin && !['data:', 'blob:'].includes(url.protocol)) return request.abort();
      if (!url.pathname.startsWith('/api/')) return request.continue();
      requests.push(url.pathname);
      let status = 200, data = {};
      if (url.pathname === '/api/auth/me') data = { authenticated: true, user };
      else if (url.pathname === '/api/crm/evaluations' && request.method() === 'PATCH') {
        const payload = JSON.parse(request.postData()); writes.push(payload);
        await new Promise((resolve) => setTimeout(resolve, 350));
        if (mode === 'missing' && !payload.evaluationProcedure) {
          status = 422; data = { code: 'EVALUATION_PROCEDURE_REQUIRED', error: 'Confirme o procedimento.' };
        } else if (failOnce) {
          failOnce = false; status = 500; data = { error: 'Falha sintética. Tente novamente.' };
        } else {
          appointment.status = payload.status;
          if (payload.evaluationProcedure) appointment.evaluationProcedure = payload.evaluationProcedure;
          const groupNotice = mode === 'blocked'
            ? { status: 'skipped', reason: 'unverified_source' }
            : mode === 'existing'
              ? { status: 'already_recorded', noticeId: 'existing', state: 'uncertain' }
              : { status: 'queued', noticeId: 'synthetic-notice', state: 'queued' };
          data = { evaluation: appointment, groupNotice };
        }
      } else if (url.pathname === '/api/crm/evaluations') {
        data = { evaluations: [appointment], professionals: [professional], canViewAll: true, unit: 'SBC', newEvaluationsToday: 0 };
      } else if (url.pathname.endsWith('/assignees')) data = { assignees: [{ id: user.id, name: user.name, unit: 'SBC' }] };
      else if (url.pathname === '/api/pipeline/chat-link') data = { available: false, reason: 'Sem conversa vinculada' };
      else if (url.pathname.endsWith('/confirmation') || url.pathname.endsWith('/evaluation-day-reminder')) data = { visible: false, alreadySent: false };
      else if (url.pathname === '/api/catalog') data = { services: [] };
      else if (url.pathname === '/api/users') data = [];
      else if (url.pathname.includes('notifications')) data = { notifications: [], unreadCount: 0 };
      await request.respond({ status, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(`${origin}/crm/ouvidoria`, { waitUntil: 'networkidle0' });
    assert.equal(writes.length, 0);
    assert.equal(requests.some((path) => path.includes('evaluation-group')), false, 'no group query per card');
    const open = await page.waitForFunction((name) => [...document.querySelectorAll('button')].find((element) =>
      element.getClientRects().length && element.textContent.includes(name)), {}, appointment.clientName);
    await open.asElement().click();
    await page.waitForSelector('[role="dialog"]', { visible: true });
    await clickStatus(page);
    await page.waitForSelector('[data-testid="evaluation-confirmation-procedure"]');
    assert.equal(appointment.status, 'pendente');
    assert.equal(await page.$eval('[aria-label="Procedimento de interesse"]', (input) => input.value), '', 'campaign never prefilled');
    assert.match(await page.$eval('[data-testid="evaluation-confirmation-procedure"]', (panel) => panel.textContent), /O status ainda não foi alterado/);
    assert.ok(await (await button(page, 'Confirmar avaliação')).evaluate((element) => element.disabled));
    await page.$eval('[data-testid="evaluation-confirmation-procedure"]', (panel) => panel.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.waitForFunction(() => {
      const input = document.querySelector('[aria-label="Procedimento de interesse"]');
      return input && input.getBoundingClientRect().top >= 0 && input.getBoundingClientRect().bottom <= innerHeight;
    });
    await assertFit(page, width);
    await page.screenshot({ path: join(output, `${width}-procedure.png`) });
    await click(page, await button(page, 'Cancelar'));
    await page.waitForSelector('[data-testid="evaluation-confirmation-procedure"]', { hidden: true });
    assert.equal(writes.length, 1, 'cancel does not save');
    assert.equal(appointment.status, 'pendente');
    await clickStatus(page);
    await page.waitForSelector('[aria-label="Procedimento de interesse"]');
    await page.type('[aria-label="Procedimento de interesse"]', 'Avaliação');
    assert.ok(await (await button(page, 'Confirmar avaliação')).evaluate((element) => element.disabled), 'generic procedure rejected');
    await page.$eval('[aria-label="Procedimento de interesse"]', (input) => input.select());
    const treatment = 'Tratamento explicitamente confirmado com a pessoa e descrição longa';
    await page.type('[aria-label="Procedimento de interesse"]', treatment);
    failOnce = true;
    await click(page, await button(page, 'Confirmar avaliação'));
    await page.waitForFunction(() => document.body.innerText.includes('Falha sintética. Tente novamente.'));
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((element) => element.textContent.trim() === 'Confirmar avaliação' && !element.disabled));
    assert.equal(await page.$eval('[aria-label="Procedimento de interesse"]', (input) => input.value), treatment, 'API failure preserves field');
    assert.equal(appointment.status, 'pendente');
    await page.screenshot({ path: join(output, `${width}-error.png`) });
    await click(page, await button(page, 'Confirmar avaliação'));
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((element) => element.textContent.includes('Confirmar avaliação') && element.disabled));
    await page.waitForSelector('[data-testid="evaluation-group-feedback"]');
    assert.equal(writes.at(-1).evaluationProcedure, treatment);
    assert.equal(appointment.status, 'confirmado');
    assert.match(await page.$eval('[data-testid="evaluation-group-feedback"]', (panel) => panel.textContent), /Aviso incluído na fila/);
    assert.match(await page.$eval('[data-testid="evaluation-group-feedback"]', (panel) => panel.textContent), /entrega ainda não está confirmada/);
    await page.$eval('[data-testid="evaluation-group-feedback"]', (panel) => panel.scrollIntoView({ block: 'center' }));
    await assertFit(page, width);
    await page.screenshot({ path: join(output, `${width}-queued.png`) });
    for (const scenario of ['blocked', 'existing']) {
      mode = scenario;
      await clickStatus(page);
      await page.waitForSelector('[data-testid="evaluation-group-feedback"]');
      const text = await page.$eval('[data-testid="evaluation-group-feedback"]', (panel) => panel.textContent);
      assert.match(text, scenario === 'blocked' ? /não foi possível comprovar o vínculo/ : /Nenhum reenvio automático/);
      assert.equal(appointment.status, 'confirmado');
      await page.$eval('[data-testid="evaluation-group-feedback"]', (panel) => panel.scrollIntoView({ block: 'center' }));
      await assertFit(page, width);
      await page.screenshot({ path: join(output, `${width}-${scenario}.png`) });
    }
    assert.deepEqual(errors, [], `JS errors at ${width}px`);
    console.log(`PASS ${width}px: cancel, explicit procedure, error/retry, queued, blocked and uncertain feedback; ${writes.length} intercepted writes.`);
    await page.close();
  }
} finally {
  await browser.close();
}
