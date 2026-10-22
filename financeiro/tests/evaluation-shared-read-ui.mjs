import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

// APIs interceptadas, inclusive em produção: não usa sessão nem dados reais.
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3210';
const browser = await puppeteer.launch({ headless: true, args: ['--disable-gpu'], protocolTimeout: 15000 });
const wait = (page, fn, ...args) => page.waitForFunction(fn, { polling: 100, timeout: 15000 }, ...args);
const today = new Date(); today.setHours(14, 0, 0, 0);
const ownName = 'Cliente Própria Sintética';
const otherName = 'Cliente de Outra Responsável com Nome Longo para Validar o Calendário Compartilhado';
const entries = [true, false].map((canEdit, i) => ({
  id: canEdit ? 'own' : 'other', clientName: canEdit ? ownName : otherName, canEdit,
  clientPhone: '5511999999999', procedimento: 'Avaliação', unit: 'Osasco',
  evaluationProcedure: 'Procedimento corporal com descrição longa para conferir a leitura dos detalhes em celular e computador',
  startTime: new Date(+today + i * 3600000).toISOString(), endTime: new Date(+today + (i + 1) * 3600000).toISOString(),
  status: 'pendente', profissionalId: `professional-${i}`, assignedUserId: canEdit ? 'operator' : 'another',
  profissional: { id: `professional-${i}`, name: canEdit ? 'Operadora Sintética' : 'Outra Responsável', color: '#8b5cf6' },
}));
async function clickText(page, text, selector = 'button') {
  const handle = await wait(page, (text, selector) => [...document.querySelectorAll(selector)].find(e =>
    e.textContent.includes(text) && !e.disabled && e.getBoundingClientRect().width > 0), text, selector);
  await handle.asElement().evaluate(e => { e.scrollIntoView({ block: 'center' }); e.click(); });
}
async function fit(page, width) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow da página em ${width}`);
  const dialog = await page.$('[role="dialog"]');
  if (dialog) assert.ok(await dialog.evaluate((e, width) => {
    const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= width + 1 && e.scrollWidth <= e.clientWidth + 1;
  }, width), `overflow do detalhe em ${width}`);
}
try {
  for (const width of [390, 430, 1440]) for (const name of ['Thais Amorim', 'Aline Fernanda']) {
    const page = await browser.newPage(), errors = [], writes = [], requests = [];
    let fail = false, manage = false, releaseLoading;
    const loadingGate = new Promise(resolve => { releaseLoading = resolve; });
    const user = { id: 'operator', name, role: 'VENDEDOR', unit: 'Osasco', permissions: { crm: true, unitOsasco: true, crmEvaluationsViewUnit: true } };
    await page.setViewport({ width, height: 932, isMobile: width < 600, hasTouch: width < 600 });
    await page.emulateTimezone('America/Sao_Paulo');
    await page.evaluateOnNewDocument(user => {
      localStorage.setItem('virtuosa_user', JSON.stringify(user)); localStorage.setItem('virtuosa_global_unit', 'Osasco');
    }, user);
    page.on('pageerror', e => errors.push(e.message));
    await page.setRequestInterception(true);
    page.on('request', async req => {
      const url = new URL(req.url());
      if (url.origin !== origin && !['data:', 'blob:'].includes(url.protocol)) return req.abort();
      if (!url.pathname.startsWith('/api/')) return req.continue();
      requests.push(url.pathname);
      if (req.method() !== 'GET') { writes.push(url.pathname); return req.respond({ status: 403, body: '{}' }); }
      let data = {}, status = 200;
      if (url.pathname === '/api/auth/me') data = { authenticated: true, user };
      else if (url.pathname === '/api/crm/evaluations') {
        await loadingGate;
        if (fail) { status = 503; data = { error: 'Falha sintética ao carregar' }; }
        else data = { unit: 'Osasco', canViewAll: true, canManageAll: manage,
          evaluations: (url.searchParams.get('profissionalId') ? entries.filter(e => e.profissionalId === url.searchParams.get('profissionalId')) : entries)
            .map(e => ({ ...e, canEdit: manage || e.canEdit })),
          professionals: entries.map(e => e.profissional), newEvaluationsToday: 2 };
      } else if (url.pathname === '/api/catalog') data = { services: [] };
      else if (url.pathname.endsWith('/assignees')) data = { assignees: [{ id: 'operator', name: 'Operadora Sintética' }, { id: 'another', name: 'Outra Responsável' }] };
      else if (url.pathname.includes('notifications')) data = { notifications: [], unreadCount: 0 };
      else if (url.pathname.endsWith('/confirmation')) data = { visible: false, alreadySent: false };
      await req.respond({ status, contentType: 'application/json', body: JSON.stringify(data) });
    });
    try {
      await page.goto(`${origin}/crm/ouvidoria`, { waitUntil: 'domcontentloaded' });
      await wait(page, () => document.body.innerText.includes('Carregando avaliações'));
      await fit(page, width); releaseLoading();
      await wait(page, name => document.body.innerText.includes(name), otherName);
      await fit(page, width);
      assert.equal(requests.filter(p => p.endsWith('/assignees')).length, 0, 'consulta não carrega responsáveis para reatribuir');
      await clickText(page, otherName);
      await page.waitForSelector('[data-testid="evaluation-read-only"]');
      await wait(page, () => document.querySelector('[role="dialog"]').getBoundingClientRect().width > 300);
      await fit(page, width);
      const readOnly = await page.$eval('[role="dialog"]', e => ({ text: e.innerText, inputs: e.querySelectorAll('input,textarea,select').length,
        buttons: [...e.querySelectorAll('button')].map(b => b.textContent.trim()) }));
      assert.ok(readOnly.text.includes('Outra Responsável')); assert.ok(readOnly.text.includes('Somente consulta'));
      assert.equal(readOnly.inputs, 0); assert.ok(!readOnly.buttons.some(text => /Salvar|Confirmar|Chat|Editar orçamento/.test(text)));
      assert.ok(!requests.some(p => p.endsWith('/confirmation') || p.includes('/chat-link')), 'detalhe alheio não consulta envios/chat');
      const close = await page.$('[role="dialog"] button:last-child');
      await close.evaluate(e => e.click());
      await wait(page, () => !document.querySelector('[role="dialog"]'));
      await clickText(page, ownName);
      await page.waitForSelector('#evaluationScheduleTime');
      await fit(page, width);
      assert.equal(await page.$('#evaluationScheduleAssignee'), null, 'consulta não permite reatribuir nem a própria avaliação');
      assert.ok(await page.$eval('[role="dialog"]', e => [...e.querySelectorAll('button')].some(b => b.textContent.includes('Salvar data e horário'))));
      await clickText(page, 'Fechar', '[role="dialog"] button');
      await wait(page, () => !document.querySelector('[role="dialog"]'));
      if (width >= 640) {
        for (const mode of ['Semana', 'Lista', 'Mês']) { await clickText(page, mode); await wait(page, name => document.body.innerText.includes(name), otherName); await fit(page, width); }
        assert.ok(await page.evaluate(name => [...document.querySelectorAll('[aria-roledescription="draggable"]')].every(e => !e.innerText.includes(name)), otherName));
      }
      await page.select('select', 'professional-1');
      await wait(page, name => !document.body.innerText.includes(name), ownName); await fit(page, width);
      fail = true; await page.select('select', '');
      await wait(page, () => document.body.innerText.includes('Não foi possível carregar as avaliações'));
      await fit(page, width);
      fail = false; await clickText(page, 'Tentar novamente');
      await wait(page, name => document.body.innerText.includes(name), otherName);
      manage = true; user.permissions.crmEvaluationsAll = true;
      await page.reload({ waitUntil: 'domcontentloaded' });
      await wait(page, name => document.body.innerText.includes(name), otherName);
      await clickText(page, otherName);
      await page.waitForSelector('#evaluationScheduleAssignee');
      assert.equal(await page.$('[data-testid="evaluation-read-only"]'), null, 'gestão existente segue editável');
      await fit(page, width);
      assert.deepEqual(writes, []); assert.deepEqual(errors, []);
      console.log(`PASS ${name} ${width}px: calendário, leitura, edição própria, filtro, carregamento, falha e gestão existente.`);
    } catch (error) {
      console.log({ width, name, errors, writes, body: await page.evaluate(() => document.body.innerText.slice(-1600)) }); throw error;
    } finally { releaseLoading(); await page.close(); }
  }
} finally { await browser.close(); }
