import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LIPO_LASER_SAVED_REPLIES } from '../src/lib/whatsapp/lipo-laser-saved-replies.ts';

// Todas as APIs são simuladas; nenhuma chamada externa ou envio alcança produção.
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3210';
const unit = process.env.TEST_UNIT || 'SBC';
assert.ok(['SBC', 'Osasco'].includes(unit));
const output = await mkdtemp(join(tmpdir(), 'virtuosa-lipo-laser-ui-'));
console.log(JSON.stringify({ output }));
const browser = await puppeteer.launch({ headless: true });
const now = new Date().toISOString();
const categories = [{ id: 'standard', title: 'LIPO LASER', campaignName: 'LIPO LASER' }, { id: 'pack', title: 'LIPO LASER 2', campaignName: 'LIPO LASER 2' }];
const replies = LIPO_LASER_SAVED_REPLIES.map((reply, index) => ({ ...reply, id: `reply-${index}`, categoryId: index < 3 ? 'standard' : 'pack', position: index, createdAt: now, updatedAt: now }));
replies.push({ id: 'global', categoryId: null, title: 'LOCALIZAÇÃO', content: 'Nossa localização é {{endereco}}.', position: 6, createdAt: now, updatedAt: now });
const user = { id: 'operator', name: 'Operadora Teste', role: 'ADMINISTRADOR', unit, permissions: { crm: true } };
const instance = { id: 'instance', unit, name: 'Comercial Teste', instanceName: 'Comercial Teste', userId: user.id, ownerId: user.id, canReply: true, status: 'connected' };
const conversations = categories.map(category => ({ id: `chat-${category.id}`, instanceId: instance.id, instance, status: 'open', assignedTo: user.id, unreadCount: 0, contact: { id: `contact-${category.id}`, name: 'Cliente Teste', phone: '5511900000000', unit }, campaignName: category.campaignName, lastMessage: 'Olá', lastMessageAt: now }));
async function clickVisible(page, selector) {
  const handle = await page.waitForFunction(selector => [...document.querySelectorAll(selector)].find(element => { const rect = element.getBoundingClientRect(); return element.getClientRects().length && rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < innerWidth; }), {}, selector);
  await handle.asElement().click();
  await handle.dispose();
}
try {
  const activeCategories = unit === 'Osasco' ? categories.filter(category => category.id === 'standard') : categories;
  for (const { width, category } of [390, 430, 1440].flatMap(width => activeCategories.map(category => ({ width, category })))) {
    const page = await browser.newPage();
    const sends = [], errors = [];
    let libraryCalls = 0;
    await page.setViewport({ width, height: width === 430 ? 932 : 900, isMobile: width < 600, hasTouch: width < 600 });
    await page.evaluateOnNewDocument(value => { localStorage.clear(); localStorage.setItem('virtuosa_user', JSON.stringify(value)); }, user);
    await page.setRequestInterception(true);
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', async request => {
      const url = new URL(request.url());
      if (url.origin !== origin && !['data:', 'blob:'].includes(url.protocol)) return request.abort();
      if (!url.pathname.startsWith('/api/')) return request.continue();
      if (/\/send(?:\/|$)/.test(url.pathname)) sends.push(url.pathname);
      let data = { success: true };
      if (url.pathname === '/api/auth/me') data = { authenticated: true, user };
      else if (url.pathname.includes('/instances')) data = { instances: [instance], users: [user] };
      else if (url.pathname === '/api/whatsapp/status') data = { connected: true, instance, status: 'connected' };
      else if (url.pathname === '/api/whatsapp/conversations') data = { conversations, appointmentSnapshot: {}, serverTime: now, hasMore: false, queueCounts: { open: 2 } };
      else if (url.pathname === '/api/whatsapp/messages') data = { messages: [{ id: 'message', messageId: 'wa', body: 'Olá', type: 'text', fromMe: false, timestamp: now }], hasMore: false };
      else if (url.pathname === '/api/whatsapp/saved-replies') {
        libraryCalls++;
        await new Promise(resolve => setTimeout(resolve, 500));
        data = { replies, categories, campaignOptions: categories.map(category => ({ name: category.campaignName, units: [unit] })) };
      } else if (url.pathname === '/api/users') data = [];
      await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(`${origin}/crm/inbox`, { waitUntil: 'networkidle0' });
    {
      console.log(JSON.stringify({ width, category: category.id, stage: 'open-conversation' }));
      await clickVisible(page, `[data-conversation-id="chat-${category.id}"]`);
      await clickVisible(page, '[aria-label="Abrir respostas rápidas"]');
      await page.waitForSelector('.saved-replies-list[aria-busy="false"]');
      const ownIds = category.id === 'standard' ? ['reply-0','reply-1','reply-2'] : ['reply-3','reply-4','reply-5'];
      const otherIds = category.id === 'standard' ? ['reply-3','reply-4','reply-5'] : ['reply-0','reply-1','reply-2'];
      for (const id of ownIds) assert.ok(await page.$(`[data-saved-reply-id="${id}"]`));
      for (const id of otherIds) assert.equal(await page.$(`[data-saved-reply-id="${id}"]`), null);
      assert.ok(await page.$('[data-saved-reply-id="global"]'));
      const priceId = ownIds.at(-1);
      await page.click(`[data-saved-reply-id="${priceId}"] button[aria-expanded]`);
      const text = await page.$eval(`[data-saved-reply-id="${priceId}"] [role="region"]`, element => element.innerText);
      assert.match(text, category.id === 'standard' ? /699,00/ : /2\.999,00.*249,92/s);
      assert.doesNotMatch(text, /174,91/);
      assert.ok(await page.$eval('.saved-replies-dialog', element => { const rect = element.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth + 1 && element.scrollWidth <= element.clientWidth + 1; }));
      assert.ok(await page.$eval('.saved-replies-list', element => element.scrollWidth <= element.clientWidth + 1));
      await page.screenshot({ path: join(output, `${width}-${category.id}.png`) });
      const use = await page.waitForFunction(() => [...document.querySelectorAll('.saved-replies-dialog button')].find(button => button.textContent.trim() === 'Usar resposta'));
      await use.asElement().click();
      await use.dispose();
      await page.waitForSelector('.saved-replies-dialog', { hidden: true });
      assert.match(await page.$eval('textarea[placeholder="Digite uma mensagem"]', element => element.value), category.id === 'standard' ? /699,00/ : /249,92/);
      assert.equal(sends.length, 0);
    }
    assert.equal(libraryCalls, 1, 'Uma única carga da biblioteca, sem polling');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ width, unit, offer: category.id, manualInsertion: true, sends: sends.length, libraryCalls, noOverflow: true }));
    await page.close();
  }
  console.log(JSON.stringify({ output }));
} finally { await browser.close(); }
