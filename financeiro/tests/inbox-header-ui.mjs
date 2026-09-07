import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getEvaluationScheduleUnitConfigByUnit } from '../src/lib/whatsapp/evaluation-schedule-confirmation-message.ts';

const origin = 'http://127.0.0.1:3210';
const output = await mkdtemp(join(tmpdir(), 'virtuosa-inbox-header-'));
console.log(JSON.stringify({ output }));
const browser = await puppeteer.launch({ headless: true });
const results = [];
const cases = ['SCS', 'SBC', 'Osasco'].flatMap(unit => [390, 430, 1440].map(width => ({ unit, width })));
cases.push(
  { unit: 'SCS', width: 390, viewer: true },
  { unit: 'SBC', width: 430, blocked: true },
  { unit: 'SCS', width: 390, unnamed: true },
  { unit: 'Osasco', width: 430, closed: true },
  { unit: 'SBC', width: 1440, light: true },
  { unit: 'Osasco', width: 390, confirmation: true },
  { unit: 'SCS', width: 1440, confirmation: true, alreadySent: true },
);
const trigger = '[aria-haspopup="menu"][aria-label="Ferramentas da conversa"]';
const select = async (page, label) => {
  const handle = await page.waitForFunction(text => [...document.querySelectorAll('[role="menuitem"]')].find(el => {
    if (el.textContent.trim() !== text || !el.getClientRects().length) return false;
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  }), {}, label);
  await handle.asElement().click();
  await handle.dispose();
};
const openMenu = async page => {
  await page.waitForFunction(selector => {
    const el = document.querySelector(selector);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  }, {}, trigger);
  await page.click(trigger);
  await page.waitForSelector('[role="menu"]', { visible: true });
};
const fit = async page => {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sem overflow horizontal');
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('[role="menu"], [role="dialog"]')].every(el => {
    const r = el.getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1;
  })), 'menu/modal dentro da tela');
};

try {
  for (const config of cases) {
    const { unit, width, viewer = false, blocked = false, unnamed = false, closed = false, light = false, confirmation = false, alreadySent = false } = config;
    let confirmed = alreadySent;
    const page = await browser.newPage();
    const errors = [], calls = [], writes = [];
    const user = { id: 'operator', name: 'Operadora Teste', role: viewer ? 'VENDEDOR' : 'ADMINISTRADOR', unit, permissions: { crm: true } };
    const instance = { id: confirmation ? getEvaluationScheduleUnitConfigByUnit(unit).instanceId : 'instance', unit, name: 'Comercial', instanceName: 'Comercial', userId: user.id, ownerId: user.id, canReply: !viewer, status: 'connected' };
    const conv = {
      id: 'chat', instanceId: instance.id, instance, status: closed ? 'closed' : 'open',
      assignedTo: user.id, unreadCount: 1, blockedAt: blocked ? new Date().toISOString() : null,
      contact: { id: 'contact', name: unnamed ? '5511900000000' : 'Mariana com nome muito longo para conferir o cabeçalho', phone: '5511900000000', unit },
      campaignAccountOrigin: unnamed ? 'primary' : 'secondary', campaignName: 'Glúteo Perfeito', campaignUrl: 'https://example.com/anuncio',
      lastMessage: 'Gostaria de marcar uma avaliação.', lastMessageAt: new Date().toISOString(),
    };
    await page.setViewport({ width, height: 850 });
    await page.evaluateOnNewDocument(u => localStorage.setItem('virtuosa_user', JSON.stringify(u)), user);
    await page.setRequestInterception(true);
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', async req => {
      const url = new URL(req.url());
      if (url.origin !== origin && !['data:', 'blob:'].includes(url.protocol)) return req.abort();
      if (!url.pathname.startsWith('/api/')) return req.continue();
      calls.push(url.pathname);
      if (req.method() !== 'GET') writes.push(url.pathname);
      let data = { success: true };
      if (url.pathname === '/api/auth/me') data = { authenticated: true, user };
      else if (url.pathname.includes('/instances')) data = { instances: [instance], users: [user] };
      else if (url.pathname === '/api/whatsapp/status') data = { connected: true, instance, status: 'connected' };
      else if (url.pathname === '/api/whatsapp/conversations') data = { conversations: [conv], appointmentSnapshot: {}, serverTime: new Date().toISOString(), hasMore: false, queueCounts: { open: 1, unread: 1 } };
      else if (url.pathname === '/api/whatsapp/messages') data = { messages: [{ id: 'message', messageId: 'wa', body: conv.lastMessage, type: 'text', fromMe: false, timestamp: conv.lastMessageAt }], hasMore: false };
      else if (url.pathname.endsWith('/internal-notes')) data = { notes: [], mentionableUsers: [] };
      else if (url.pathname.endsWith('/evaluation-confirmation')) {
        if (req.method() === 'POST') confirmed = true;
        data = { visible: true, alreadySent: confirmed, status: 'sent' };
      }
      else if (url.pathname === '/api/clients') data = { clients: [{ id: 'client', name: conv.contact.name, phone: conv.contact.phone, unit }] };
      else if (url.pathname === '/api/pipelines') data = [{ id: 'pipeline', unit: 'Barueri', stages: [{ id: 'new', name: 'Novo Lead' }, { id: 'scheduled', name: 'Agendado' }] }];
      else if (url.pathname === '/api/pipeline') data = [{ id: 'deal', clientId: 'client', unit, pipelineId: 'pipeline', stageId: 'new', notes: '' }];
      else if (url.pathname === '/api/crm/evaluations/assignees') data = { assignees: [{ id: 'assignee', name: 'Responsável Teste', unit }] };
      else if (url.pathname === '/api/whatsapp/saved-replies') data = { replies: [] };
      else if (url.pathname === '/api/whatsapp/saved-replies/categories') data = { categories: [] };
      else if (url.pathname === '/api/users') data = [];
      await req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(`${origin}/crm/inbox`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-conversation-id="chat"]');
    await page.click('[data-conversation-id="chat"]');
    await page.waitForSelector(trigger);
    if (light) await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
      document.documentElement.dataset.theme = 'light';
      document.documentElement.dataset.mode = 'light';
    });
    const label = `${unit}-${width}-${confirmation ? 'confirmation' : viewer ? 'viewer' : blocked ? 'blocked' : unnamed ? 'unnamed' : closed ? 'closed' : light ? 'light' : 'main'}`;
    await fit(page);
    const header = await page.$eval('.inbox-thread-header', el => el.innerText);
    if (viewer || blocked) assert.doesNotMatch(header, /Agendar/);
    else assert.match(header, /Agendar/);
    if (unnamed) assert.equal(header.split(conv.contact.phone).length - 1, 1, 'telefone não duplicado');
    else assert.match(header, /Conta secundária/);
    assert.doesNotMatch(header, /Horários|Notas|Ver anúncio|Perfil & Funil/);
    await page.screenshot({ path: join(output, `${label}-chat.png`) });
    await openMenu(page);
    await fit(page);
    assert.equal(calls.includes('/api/clients'), false, 'menu não consulta o funil');
    let menu = await page.$eval('[role="menu"]', el => el.innerText);
    for (const item of ['Notas', 'Ver anúncio', 'Perfil & Funil', 'Mais ações']) assert.ok(menu.includes(item), item);
    assert.equal(menu.includes('Horários'), !viewer);
    if (confirmation) {
      if (!alreadySent) {
        await select(page, 'Confirmar avaliação');
        await page.waitForSelector('[role="menu"]', { hidden: true });
        await openMenu(page);
      }
      await page.waitForFunction(() => [...document.querySelectorAll('[role="menuitem"]')].some(el => el.textContent.trim() === 'Confirmação já enviada' && el.getAttribute('aria-disabled') === 'true'));
    }
    assert.equal(await page.$eval('[role="menuitem"][href="https://example.com/anuncio"]', el => el.getAttribute('target')), '_blank');
    await page.screenshot({ path: join(output, `${label}-tools.png`) });
    await select(page, 'Mais ações');
    await fit(page);
    menu = await page.$eval('[role="menu"]', el => el.innerText);
    assert.match(menu, blocked ? /Desbloquear contato/ : /Bloquear contato/);
    assert.equal(menu.includes('Excluir conversa'), !viewer);
    assert.equal(menu.includes('Marcar como não lida'), !viewer);
    if (!viewer) assert.match(menu, closed ? /Reabrir conversa/ : /Finalizar conversa/);
    await page.screenshot({ path: join(output, `${label}-more.png`) });
    await select(page, 'Voltar às ferramentas');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[role="menu"]', { hidden: true });
    assert.ok(await page.$('.inbox-thread-header'), 'Escape do menu não sai da conversa');
    await page.waitForFunction(selector => document.activeElement === document.querySelector(selector), {}, trigger);
    await page.keyboard.press('ArrowDown');
    await page.waitForSelector('[role="menu"]', { visible: true });
    await select(page, 'Notas');
    await page.waitForSelector('[aria-labelledby="internal-notes-title"]', { visible: true });
    await fit(page);
    await page.keyboard.press('Escape');
    await page.waitForSelector('[aria-labelledby="internal-notes-title"]', { hidden: true });
    assert.ok(await page.$('.inbox-thread-header'));
    if (!viewer) {
      await openMenu(page);
      await select(page, 'Horários');
      await page.waitForSelector('#evaluation-availability-title');
      await fit(page);
      await page.click('[role="dialog"] [aria-label="Fechar"]');
      await page.waitForSelector('[role="dialog"]', { hidden: true });
    }
    await openMenu(page);
    await select(page, 'Perfil & Funil');
    await page.waitForSelector('.inbox-contact-panel', { visible: true });
    await page.keyboard.press('Escape');
    await page.waitForSelector('.inbox-contact-panel', { hidden: true });
    await openMenu(page);
    if (!viewer) {
      await select(page, 'Mais ações');
      await select(page, 'Adicionar observação');
      await page.waitForSelector('[placeholder="Digite o histórico ou observações sobre o contato..."]', { visible: true });
      await fit(page);
    }
    assert.deepEqual(writes, confirmation && !alreadySent ? ['/api/whatsapp/conversations/chat/evaluation-confirmation'] : [], 'somente confirmação explicitamente acionada na API simulada');
    assert.deepEqual(errors, []);
    results.push(config);
    console.log(`OK ${label}`);
    await page.close();
  }
  console.log(JSON.stringify({ output, passed: results.length, cases: results }));
} finally {
  await browser.close();
}
