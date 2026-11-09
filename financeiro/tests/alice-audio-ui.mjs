import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { readFileSync } from 'node:fs';
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3098';
const output = resolve('../.impeccable/review/alice-audio');
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({ headless: true });
try {
  for (const width of [390, 430, 1440]) {
    const page = await browser.newPage();
    const now = new Date().toISOString(), errors = [], writes = [];
    const user = { id: 'operator', name: 'Operadora sintética', role: 'ADMIN', unit: 'SBC', permissions: { crm: true, admin: true } };
    const instance = { id: 'a6871ee7-8352-4b66-bfb2-b8dba9e4f8e3', displayName: 'Leads SBC', unit: 'SBC', userId: user.id, status: 'connected', canReply: true };
    const chat = { id: 'audio', instanceId: instance.id, status: 'open', aiMode: 'agent', assignedTo: null, unreadCount: 1,
      contact: { id: 'contact', name: 'Cliente sintética de áudio', phone: '5511900001234', unit: 'SBC' }, lastMessage: 'Áudio', lastMessageAt: now };
    const text = 'Gostaria de saber como funciona o Lipo Laser para o abdômen. Tenho disponibilidade durante a semana e prefiro o período da tarde.\n\nAinda estou tirando minhas dúvidas antes de decidir.';
    const messages = ['ready', 'processing', 'failed'].map((status, index) => ({ id: status, messageId: status, type: 'audio', body: '', fromMe: false,
      status: 'received', timestamp: new Date(Date.now() + index * 1000).toISOString(), mediaUrl: `data:audio/ogg;base64,${readFileSync(new URL('./fixtures/alice-audio-synthetic.ogg', import.meta.url)).toString('base64')}`, mediaMimeType: 'audio/ogg',
      audioTranscript: { status, text: status === 'ready' ? `${text}\n${'palavralonga'.repeat(16)}` : null, durationMs: 15000 } }));
    await page.setViewport({ width, height: 1000 });
    await page.evaluateOnNewDocument(value => { localStorage.setItem('virtuosa_user', JSON.stringify(value)); localStorage.setItem('virtuosa_global_unit', 'SBC'); }, user);
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.origin !== origin && !['data:', 'blob:'].includes(url.protocol)) return request.abort();
      if (!url.pathname.startsWith('/api/')) return request.continue();
      if (request.method() !== 'GET') writes.push(url.pathname);
      let data = {};
      if (url.pathname === '/api/auth/me') data = { user, authenticated: true };
      else if (url.pathname === '/api/whatsapp/instances') data = { instances: [instance] };
      else if (url.pathname === '/api/whatsapp/conversations') data = { conversations: [chat], hasMore: false, serverTime: now, queueCounts: { open: 1, unread: 1 } };
      else if (url.pathname === '/api/whatsapp/messages') data = { messages, hasMore: false };
      else if (url.pathname === '/api/users') data = [];
      else if (url.pathname.includes('/saved-replies')) data = { replies: [], categories: [] };
      else if (url.pathname.endsWith('/notification-preferences')) data = { mutedInstanceIds: [] };
      return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(`${origin}/crm/inbox?unit=SBC&targetInstanceId=${instance.id}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-conversation-id="audio"]');
    await page.click('[data-conversation-id="audio"]');
    await page.waitForSelector('[data-audio-transcript] summary');
    assert.equal(await page.$eval('[data-audio-transcript]', el => el.open), false);
    await page.focus('[data-audio-transcript] summary');
    await page.keyboard.press('Enter');
    assert.equal(await page.$eval('[data-audio-transcript]', el => el.open), true);
    assert.ok((await page.$eval('[data-audio-transcript]', el => el.innerText)).includes(text));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.match(await page.$eval('.inbox-thread-messages', el => el.innerText), /está transcrevendo|equipe precisa ouvir/);
    await page.$eval('.inbox-thread-messages', el => { el.scrollTop = 0; });
    await page.screenshot({ path: join(output, `audio-${width}.png`) });
    await page.$eval('.inbox-thread-messages', el => { el.scrollTop = el.scrollHeight; });
    await page.screenshot({ path: join(output, `audio-failure-${width}.png`) });
    assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    console.log(`PASS ${width}px: transcrição expandida, teclado, processamento e falha, sem escrita`);
    await page.close();
  }
  console.log(JSON.stringify({ output }));
} finally { await browser.close(); }
