import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { mkdtemp, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3210';
const output = await mkdtemp(join(tmpdir(), 'virtuosa-client-report-'));
const browser = await puppeteer.launch({ headless: true });
console.log(JSON.stringify({ output }));
const user = { id: 'operator', name: 'Operadora Teste', role: 'ADMINISTRADOR', unit: 'SBC', permissions: { crm: true } };
const instance = { id: 'instance', unit: 'SBC', instanceName: 'Comercial', name: 'Comercial', userId: 'operator', ownerId: 'operator', canReply: true, status: 'connected' };
const conv = { id: 'chat', instanceId: instance.id, status: 'open', assignedTo: 'operator', unreadCount: 0,
  contact: { id: 'contact', name: 'Cliente do relatório', phone: '5511900000000', unit: 'SBC' },
  lastMessage: 'Olá', lastMessageAt: new Date().toISOString() };
const closing = {
  id: 'sale', clientName: 'Cliente com nome muito longo para validar a quebra de linha e os limites de impressão no celular', closedAt: '2026-10-27T15:00:00Z',
  origin: { name: 'LIPO LASER 2', url: 'https://example.com/anuncio', description: 'Link do anúncio registrado no cadastro do cliente.' },
  procedures: [{ name: 'Lipo Laser - tratamento corporal com descrição completa e extensa para conferir legibilidade em todos os aparelhos', sessions: 5, value: 2999, courtesy: false }, { name: 'Drenagem', sessions: 5, value: 0, courtesy: true }],
  total: 2999, warnings: [], exportable: true,
};
const payload = { unit: 'SBC', conversationId: 'chat', contactName: conv.contact.name, generatedAt: '2026-10-28T15:00:00Z', multipleClients: false,
  closings: [closing, { ...closing, id: 'second-sale', closedAt: '2026-10-15T15:00:00Z', total: 699, procedures: [{ name: 'Lipo Laser', sessions: 1, value: 699, courtesy: false }] }] };
const toolTrigger = '[aria-label="Ferramentas da conversa"][aria-haspopup="menu"]';
const dialog = '[role="dialog"][aria-labelledby="client-report-title"]';
const button = async (page, text) => {
  const handle = await page.waitForFunction(label => [...document.querySelectorAll('button,[role="menuitem"]')].find(el => el.textContent.trim() === label && el.getClientRects().length), {}, text);
  await handle.asElement().click(); await handle.dispose();
};
const fit = async page => {
  await page.waitForFunction(selector => getComputedStyle(document.querySelector(selector)).opacity === '1', {}, dialog);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'página sem overflow');
  const bounds = await page.$eval(dialog, el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, overflow: el.scrollWidth > el.clientWidth + 1 }; });
  assert.ok(bounds.left >= -1 && bounds.right <= page.viewport().width + 1 && bounds.top >= -1 && bounds.bottom <= page.viewport().height + 1 && !bounds.overflow, JSON.stringify(bounds));
  assert.ok(await page.$eval(`${dialog} footer`, el => { const r = el.getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; }), 'ações sempre acessíveis');
};

async function setup(width, mode = 'normal') {
  const page = await browser.newPage();
  const errors = [], writes = [], reportCalls = [];
  let release, failed = mode === 'error';
  const gate = new Promise(resolve => { release = resolve; });
  await page.setViewport({ width, height: 850 });
  await page.evaluateOnNewDocument(u => localStorage.setItem('virtuosa_user', JSON.stringify(u)), user);
  await page.setRequestInterception(true);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', async req => {
    const url = new URL(req.url());
    if (url.origin !== origin && !['data:', 'blob:'].includes(url.protocol)) return req.abort();
    if (!url.pathname.startsWith('/api/')) return req.continue();
    if (req.method() !== 'GET') writes.push(url.pathname);
    let data = { success: true }, status = 200;
    if (url.pathname === '/api/auth/me') data = { authenticated: true, user };
    else if (url.pathname.includes('/instances')) data = { instances: [instance], users: [user] };
    else if (url.pathname === '/api/whatsapp/status') data = { connected: true, instance, status: 'connected' };
    else if (url.pathname === '/api/whatsapp/conversations') data = { conversations: [conv], appointmentSnapshot: {}, serverTime: new Date().toISOString(), hasMore: false, queueCounts: { open: 1, unread: 0 } };
    else if (url.pathname === '/api/whatsapp/messages') data = { messages: [{ id: 'message', messageId: 'wa', body: 'Olá', type: 'text', fromMe: false, timestamp: conv.lastMessageAt }], hasMore: false };
    else if (url.pathname.endsWith('/internal-notes')) data = { notes: [], mentionableUsers: [] };
    else if (url.pathname.endsWith('/evaluation-confirmation')) data = { visible: false };
    else if (url.pathname === '/api/whatsapp/client-report') {
      reportCalls.push(Object.fromEntries(url.searchParams));
      assert.equal(req.method(), 'GET');
      if (mode === 'loading') await gate;
      if (failed) { data = { error: 'Falha sintética de leitura' }; status = 503; }
      else if (mode === 'empty') data = { ...payload, closings: [] };
      else if (mode === 'mismatch') data = { ...payload, closings: [{ ...closing, exportable: false, warnings: ['A composição dos procedimentos diverge do valor final registrado.'] }] };
      else data = payload;
    }
    else if (url.pathname === '/api/whatsapp/saved-replies') data = { replies: [] };
    else if (url.pathname === '/api/whatsapp/saved-replies/categories') data = { categories: [] };
    else if (url.pathname === '/api/users') data = [];
    await req.respond({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto(`${origin}/crm/inbox`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-conversation-id="chat"]');
  await page.click('[data-conversation-id="chat"]');
  await page.waitForSelector(toolTrigger);
  assert.equal(reportCalls.length, 0, 'nenhuma consulta do relatório ao abrir chat');
  await page.click(toolTrigger); await page.waitForSelector('[role="menu"]', { visible: true });
  assert.equal(reportCalls.length, 0, 'nenhuma consulta ao abrir Ferramentas');
  await button(page, 'Relatório do cliente'); await page.waitForSelector(dialog);
  return { page, errors, writes, reportCalls, release, resolveError: () => { failed = false; } };
}

try {
  for (const width of [390, 430, 1440]) {
    const { page, errors, writes, reportCalls } = await setup(width);
    await page.waitForSelector('[aria-label="Selecionar fechamento"]');
    await fit(page);
    let text = await page.$eval(dialog, el => el.innerText);
    assert.match(text, /LIPO LASER 2/); assert.match(text, /2\.999,00/); assert.match(text, /Cortesia/);
    // Next dev uses React StrictMode's setup/cleanup/setup; production mounts once.
    assert.ok(reportCalls.length >= 1 && reportCalls.length <= 2);
    for (const call of reportCalls) assert.deepEqual(call, { unit: 'SBC', conversationId: 'chat', targetInstanceId: 'instance' });
    const openingCalls = reportCalls.length;
    await page.select('[aria-label="Selecionar fechamento"]', 'second-sale');
    text = await page.$eval(dialog, el => el.innerText);
    assert.match(text, /699,00/); assert.doesNotMatch(text, /Cortesia/);
    assert.equal(reportCalls.length, openingCalls, 'trocar fechamento não refaz consultas');
    await page.select('[aria-label="Selecionar fechamento"]', 'sale');
    await page.screenshot({ path: join(output, `relatorio-${width}.png`) });
    if (width === 1440) {
      const cdp = await page.createCDPSession();
      await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: output });
      await button(page, 'Baixar PDF');
      await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Baixar PDF')?.disabled);
      for (let attempt = 0; attempt < 40 && !(await readdir(output)).some(f => f.endsWith('.pdf')); attempt++) await new Promise(resolve => setTimeout(resolve, 250));
      const pdf = (await readdir(output)).find(f => f.endsWith('.pdf')); assert.ok(pdf, 'PDF baixado');
      assert.ok((await stat(join(output, pdf))).size > 1000);
      await page.evaluate(() => { const open = window.open; window.open = (...args) => { const popup = open.apply(window, args); if (popup) popup.print = () => { popup.__printed = true; }; return popup; }; });
      const popupPromise = new Promise(resolve => page.once('popup', resolve));
      await button(page, 'Imprimir');
      const popup = await popupPromise;
      await popup.waitForFunction(() => document.body?.innerText.includes('Valor final contratado'));
      await popup.waitForFunction(() => window.__printed === true);
      assert.match(await popup.$eval('body', el => el.innerText), /2\.999,00/);
      assert.equal(await popup.evaluate(() => window.__printed), true, 'fluxo de impressão acionado');
      await popup.close();
      await page.evaluate(() => { window.open = () => null; });
      await button(page, 'Imprimir');
      await page.waitForSelector('[role="alert"]');
      assert.match(await page.$eval('[role="alert"]', el => el.innerText), /bloqueou/);
    }
    await page.keyboard.press('Escape'); await page.waitForSelector(dialog, { hidden: true });
    await page.waitForFunction(selector => document.activeElement === document.querySelector(selector), {}, toolTrigger);
    assert.ok(await page.$('.inbox-thread-header'), 'Escape fecha relatório sem sair da conversa');
    assert.deepEqual(writes, []); assert.deepEqual(errors, []);
    await page.close(); console.log(`OK normal ${width}`);
  }
  for (const mode of ['loading', 'error', 'empty', 'mismatch']) {
    const { page, errors, writes, release, reportCalls, resolveError } = await setup(390, mode);
    if (mode === 'loading') {
      await page.waitForFunction(() => document.body.innerText.includes('Consultando os fechamentos'));
      await fit(page); await page.screenshot({ path: join(output, 'carregando.png') });
      release(); await page.waitForSelector('[aria-label="Selecionar fechamento"]');
    } else if (mode === 'error') {
      await page.waitForSelector('[role="alert"]'); await fit(page);
      resolveError();
      await button(page, 'Tentar novamente'); await page.waitForSelector('[aria-label="Selecionar fechamento"]');
      assert.ok(reportCalls.length <= 3);
    } else if (mode === 'empty') await page.waitForFunction(() => document.body.innerText.includes('Nenhum fechamento disponível'));
    else {
      await page.waitForSelector('[aria-label="Avisos do fechamento"]');
      assert.equal(await page.$$eval(`${dialog} footer button`, list => list.every(b => b.disabled)), true);
    }
    await fit(page); assert.deepEqual(writes, []); assert.deepEqual(errors, []);
    await page.screenshot({ path: join(output, `${mode}.png`) }); await page.close(); console.log(`OK ${mode}`);
  }
  console.log(JSON.stringify({ output, passed: 7 }));
} finally { await browser.close(); }
