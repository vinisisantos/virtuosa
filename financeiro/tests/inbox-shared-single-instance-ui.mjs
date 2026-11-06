import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = process.env.INBOX_TEST_ORIGIN || 'http://127.0.0.1:3211';
const browser = await puppeteer.launch({ headless: true });
const output = await mkdtemp(join(tmpdir(), 'virtuosa-shared-inbox-'));
console.log(JSON.stringify({ output }));
const cases = [
  ...['Osasco', 'SBC'].flatMap(unit => [390, 430, 1440].map(width => ({ unit, width, mode: 'shared' }))),
  { unit: 'Osasco', width: 390, mode: 'viewer' },
  { unit: 'Osasco', width: 430, mode: 'owner' },
  { unit: 'Osasco', width: 1440, mode: 'multiple' },
  { unit: 'SBC', width: 390, mode: 'error' },
  { unit: 'Osasco', width: 430, mode: 'explicit' },
];

try {
  for (const config of cases) {
    const { unit, width, mode } = config;
    const user = { id: 'operator', name: 'Usuária sintética', role: 'VENDEDOR', unit, permissions: { crm: true } };
    const shared = { id: 'shared-box', displayName: 'Leads compartilhados', instanceName: 'synthetic', unit, userId: user.id, status: 'connected', accessRole: mode === 'viewer' ? 'VIEWER' : 'AGENT_SHARED', canReply: mode !== 'viewer', isShared: true };
    const owner = { ...shared, id: 'own-box', displayName: 'Número pessoal', accessRole: 'OWNER', isShared: false };
    const instances = mode === 'owner' ? [owner] : mode === 'multiple' ? [owner, shared] : [shared];
    const conversation = { id: 'chat', instanceId: shared.id, status: 'open', assignedTo: 'other', unreadCount: 0, contact: { id: 'contact', name: 'Cliente com nome comprido para conferir a leitura da conversa no celular', phone: '5511900000000', unit }, lastMessage: 'Mensagem sintética de teste', lastMessageAt: new Date().toISOString() };
    const page = await browser.newPage();
    const calls = [], errors = [], writes = [];
    await page.setViewport({ width, height: 844 });
    await page.evaluateOnNewDocument(value => localStorage.setItem('virtuosa_user', JSON.stringify(value)), user);
    await page.setRequestInterception(true);
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.origin !== origin && !['data:', 'blob:'].includes(url.protocol)) return request.abort();
      if (!url.pathname.startsWith('/api/')) return request.continue();
      calls.push(`${url.pathname}${url.search}`);
      if (request.method() !== 'GET') writes.push(url.pathname);
      let data = {};
      if (url.pathname === '/api/auth/me') data = { user, authenticated: true };
      else if (url.pathname === '/api/whatsapp/instances') {
        if (mode === 'error') return request.respond({ status: 500, contentType: 'application/json', body: '{}' });
        data = { instances };
      } else if (url.pathname === '/api/whatsapp/conversations') data = { conversations: url.searchParams.get('targetInstanceId') === 'shared-box' ? [conversation] : [], appointmentSnapshot: {}, hasMore: false, serverTime: new Date().toISOString(), queueCounts: { open: 1, unread: 0, callback: 0, followup: 0, lost: 0 } };
      else if (url.pathname === '/api/whatsapp/messages') data = { messages: [{ id: 'message', messageId: 'synthetic', body: conversation.lastMessage, type: 'text', fromMe: false, timestamp: conversation.lastMessageAt }], hasMore: false };
      else if (url.pathname === '/api/users') data = [];
      else if (url.pathname.endsWith('/notification-preferences')) data = { mutedInstanceIds: [] };
      else if (url.pathname.endsWith('/saved-replies')) data = { replies: [] };
      else if (url.pathname.endsWith('/categories')) data = { categories: [] };
      return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    const explicit = mode === 'explicit' ? '&targetInstanceId=shared-box' : '';
    await page.goto(`${origin}/crm/inbox?unit=${unit}${explicit}`, { waitUntil: 'networkidle0' });
    if (['shared', 'viewer', 'explicit'].includes(mode)) {
      await page.waitForFunction(() => new URL(location.href).searchParams.get('targetInstanceId') === 'shared-box', { timeout: 5000 });
      await page.waitForSelector('[aria-label="Trocar instância do Inbox"]', { visible: true });
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(el => el.textContent.includes('Leads compartilhados')));
      await page.waitForFunction(() => performance.getEntriesByType('resource').some(e => e.name.includes('/api/whatsapp/conversations?targetInstanceId=shared-box')));
      if (mode === 'viewer') assert.match(await page.$eval('[aria-label="Trocar instância do Inbox"]', el => el.textContent), /Consulta/);
      await page.waitForSelector('[data-conversation-id="chat"]');
      await page.screenshot({ path: join(output, `${unit}-${width}-${mode}-list.png`) });
      await page.click('[data-conversation-id="chat"]');
      await page.waitForFunction(() => document.body.innerText.includes('Mensagem sintética de teste'));
      await page.screenshot({ path: join(output, `${unit}-${width}-${mode}-conversation.png`) });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (unit === 'Osasco' && width === 1440 && mode === 'shared') {
        await page.click('[aria-label="Trocar instância do Inbox"]');
        await page.waitForSelector('[role="listbox"]');
        await page.evaluate(() => [...document.querySelectorAll('[role="listbox"] button')].find(el => el.textContent.includes('Meu número')).click());
        await page.waitForFunction(() => !new URL(location.href).searchParams.has('targetInstanceId'));
        assert.equal(new URL(page.url()).searchParams.get('targetInstanceId'), null, 'seleção manual não é sobrescrita');
      }
    } else if (mode === 'multiple') {
      await page.waitForSelector('[aria-label="Trocar instância do Inbox"]', { visible: true });
      assert.equal(new URL(page.url()).searchParams.get('targetInstanceId'), null);
      await page.click('[aria-label="Trocar instância do Inbox"]');
      assert.match(await page.$eval('[role="listbox"]', el => el.innerText), /Leads compartilhados/);
      await page.evaluate(() => [...document.querySelectorAll('[role="listbox"] span')].find(el => el.textContent.trim() === 'Leads compartilhados').click());
      await page.waitForFunction(() => new URL(location.href).searchParams.get('targetInstanceId') === 'shared-box');
    } else if (mode === 'error') {
      await page.waitForSelector('[role="alert"]');
      assert.equal(new URL(page.url()).searchParams.get('targetInstanceId'), null);
    } else {
      assert.equal(new URL(page.url()).searchParams.get('targetInstanceId'), null);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sem overflow horizontal');
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, []);
    console.log(JSON.stringify({ ...config, calls: calls.filter(call => call.startsWith('/api/whatsapp/instances')).length }));
    await page.close();
  }
} finally {
  await browser.close();
}
