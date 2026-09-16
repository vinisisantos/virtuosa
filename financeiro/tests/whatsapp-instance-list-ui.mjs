import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = 'http://127.0.0.1:3210';
const output = await mkdtemp(join(tmpdir(), 'virtuosa-instance-list-'));
const browser = await puppeteer.launch({ headless: true });
console.log(JSON.stringify({ output }));
try {
  for (const width of [390, 430, 834, 1440]) {
    for (const role of ['ADMINISTRADOR', 'VENDEDOR']) {
      const page = await browser.newPage();
      const user = { id: 'operator', name: 'Operadora Teste', role, unit: 'Osasco', permissions: { crm: true } };
      const instances = ['Leads Osasco', 'Recepção'].map((name, index) => ({ id: `box-${index}`, instanceName: name, displayName: name, unit: 'Osasco', userId: user.id, status: index ? 'disconnected' : 'connected', canReply: true }));
      let attempts = 0, recovered = false;
      const errors = [], calls = [];
      await page.setViewport({ width, height: 900 });
      await page.evaluateOnNewDocument(value => localStorage.setItem('virtuosa_user', JSON.stringify(value)), user);
      await page.setRequestInterception(true);
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', async request => {
        const url = new URL(request.url());
        if (url.origin !== origin && !['data:', 'blob:'].includes(url.protocol)) return request.abort();
        if (!url.pathname.startsWith('/api/')) return request.continue();
        calls.push(url);
        let data = {};
        if (url.pathname === '/api/auth/me') data = { user, authenticated: true };
        else if (url.pathname.endsWith('/instances')) {
          attempts++;
          assert.equal(url.searchParams.has('refresh'), false);
          if (!recovered) {
            if (width === 430) return request.abort('failed');
            return request.respond({ status: width === 834 ? 200 : 500, contentType: 'application/json', body: JSON.stringify({ error: 'Falha simulada' }) });
          }
          data = { instances };
        } else if (url.pathname === '/api/whatsapp/conversations') {
          data = { conversations: [], appointmentSnapshot: {}, hasMore: false, serverTime: new Date().toISOString(), queueCounts: { open: 73, unread: 9, callback: 0, followup: 0, lost: 0 } };
        } else if (url.pathname === '/api/whatsapp/status') data = { connected: true, status: 'connected', instance: instances[0] };
        else if (url.pathname === '/api/users') data = [];
        else if (url.pathname.endsWith('/notification-preferences')) data = { mutedInstanceIds: [] };
        else if (url.pathname.endsWith('/saved-replies')) data = { replies: [] };
        else if (url.pathname.endsWith('/categories')) data = { categories: [] };
        await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      });
      await page.goto(`${origin}/crm/inbox?targetInstanceId=box-0&unit=Osasco`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('[role="alert"]', { timeout: 10000 }).catch(async error => { console.log(JSON.stringify({ width, role, url: page.url(), attempts, errors, calls: calls.map(url => url.pathname), screen: await page.$eval('body', el => el.innerText.slice(0,1800)) })); throw error; });
      assert.equal(new URL(page.url()).searchParams.get('targetInstanceId'), 'box-0', 'erro não abandona caixa');
      assert.match(await page.$eval('[role="alert"]', el => el.textContent), /seleção foi preservada/);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: join(output, `${role}-${width}-error.png`) });
      recovered = true;
      await page.click('[role="alert"] button');
      await page.waitForSelector('[role="alert"]', { hidden: true });
      await page.waitForFunction(() => document.querySelector('[aria-label="Trocar instância do Inbox"]')?.textContent.includes('Leads Osasco'));
      assert.equal(new URL(page.url()).searchParams.get('targetInstanceId'), 'box-0');
      await page.click('[aria-label="Trocar instância do Inbox"]');
      await page.waitForSelector('[role="listbox"]');
      const list = await page.$eval('[role="listbox"]', el => el.innerText);
      assert.match(list, /Leads Osasco/);
      assert.match(list, /Recepção/);
      assert.match(list, /Desconectado/);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.ok(attempts >= 2);
      assert.deepEqual(errors, []);
      const scopedCalls = calls.filter(url => url.pathname === '/api/whatsapp/conversations' && !url.searchParams.has('summary'));
      assert.equal(scopedCalls.at(-1)?.searchParams.get('targetInstanceId'), 'box-0', scopedCalls.map(url => url.search).join('\n'));
      await page.screenshot({ path: join(output, `${role}-${width}-recovered.png`) });
      console.log(JSON.stringify({ width, role, attempts, errors }));
      await page.close();
    }
  }
} finally { await browser.close(); }
