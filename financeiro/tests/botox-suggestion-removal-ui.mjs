import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Apenas ambiente local: todas as APIs são simuladas e saídas externas bloqueadas.
const origin = 'http://127.0.0.1:3210';
const output = await mkdtemp(join(tmpdir(), 'virtuosa-botox-card-'));
const removedTitle = 'Botox Terço Superior — apresentação';
const campaigns = [
  { name: 'Botox Terço Superior', model: null },
  { name: 'Botox Dysport 3 Regiões', model: 'Botox Dysport — apresentação' },
  { name: 'Combo Barriga Chapada', model: 'Combo Barriga Chapada — apresentação' },
];
const root = '.saved-replies-dialog';
const browser = await puppeteer.launch({ headless: true });
try {
  for (const width of [390, 430, 1440]) for (const campaign of campaigns) {
    const page = await browser.newPage();
    const user = { id: 'operator', name: 'Operadora Teste', role: 'ADMINISTRADOR', unit: 'SBC', permissions: { crm: true } };
    const instance = { id: 'instance', unit: 'SBC', name: 'Comercial', instanceName: 'Comercial', userId: user.id, ownerId: user.id, canReply: true, status: 'connected' };
    const now = new Date().toISOString();
    const content = `Olá! Texto pessoal preservado.\n${'Conteúdo longo para conferir leitura e rolagem. '.repeat(30)}\nFIM DO TEXTO`;
    const categories = [{ id: 'own', title: campaign.name, campaignName: campaign.name }];
    const replies = [
      { id: 'personal', categoryId: 'own', title: 'Minha explicação', content, position: 0 },
      { id: 'global', categoryId: null, title: 'Horários', content: 'Consulte nossos horários.', position: 1 },
    ].map(reply => ({ ...reply, createdAt: now, updatedAt: now }));
    const conversation = { id: 'chat', instanceId: instance.id, instance, status: 'open', assignedTo: user.id, unreadCount: 0, contact: { id: 'contact', name: 'Cliente Teste', phone: '5511900000000', unit: 'SBC' }, campaignName: campaign.name, lastMessage: 'Olá', lastMessageAt: now };
    const errors = [], writes = [];
    let libraryCalls = 0;
    await page.setViewport({ width, height: width === 430 ? 932 : 900, isMobile: width < 600, hasTouch: width < 600 });
    await page.evaluateOnNewDocument(value => localStorage.setItem('virtuosa_user', JSON.stringify(value)), user);
    await page.setRequestInterception(true);
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', async request => {
      const url = new URL(request.url());
      if (url.origin !== origin && !['data:', 'blob:'].includes(url.protocol)) return request.abort();
      if (!url.pathname.startsWith('/api/')) return request.continue();
      if (request.method() !== 'GET') writes.push(url.pathname);
      let data = { success: true };
      if (url.pathname === '/api/auth/me') data = { authenticated: true, user };
      else if (url.pathname.includes('/instances')) data = { instances: [instance], users: [user] };
      else if (url.pathname === '/api/whatsapp/status') data = { connected: true, instance, status: 'connected' };
      else if (url.pathname === '/api/whatsapp/conversations') data = { conversations: [conversation], appointmentSnapshot: {}, serverTime: now, hasMore: false, queueCounts: { open: 1 } };
      else if (url.pathname === '/api/whatsapp/messages') data = { messages: [], hasMore: false };
      else if (url.pathname === '/api/whatsapp/saved-replies') {
        libraryCalls++;
        await new Promise(resolve => setTimeout(resolve, 700));
        data = { replies, categories, campaignOptions: [{ name: campaign.name, units: ['SBC'] }] };
      } else if (url.pathname === '/api/users') data = [];
      await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    const fit = async () => {
      assert.ok(await page.$eval(root, element => { const rect = element.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth + 1 && rect.top >= 0 && rect.bottom <= innerHeight + 1 && element.scrollWidth <= element.clientWidth + 1; }), 'modal dentro da tela');
      assert.ok(await page.$eval('.saved-replies-list', element => element.scrollWidth <= element.clientWidth + 1), 'lista sem overflow horizontal');
    };
    try {
      await page.goto(`${origin}/crm/inbox`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('[data-conversation-id="chat"]');
      await page.click('[data-conversation-id="chat"]');
      await page.waitForSelector('[aria-label="Abrir respostas rápidas"]');
      await page.type('textarea[placeholder="Digite uma mensagem"]', 'Rascunho preservado');
      await page.click('[aria-label="Abrir respostas rápidas"]');
      await page.waitForSelector('.saved-replies-list[aria-busy="true"]');
      await fit();
      await page.waitForSelector('.saved-replies-list[aria-busy="false"]');
      const titles = await page.$$eval(`${root} p`, elements => elements.map(element => element.textContent));
      assert.ok(!titles.includes(removedTitle), 'cartão removido');
      if (campaign.model) assert.ok(titles.includes(campaign.model), 'modelo de outra campanha preservado');
      else assert.ok(!titles.some(title => title.endsWith('— apresentação')), 'nenhum modelo automático de Botox Terço Superior');
      await page.waitForSelector('[data-saved-reply-id="personal"]');
      assert.ok(await page.$('[data-saved-reply-id="global"]'), 'resposta global preservada');
      await page.click('[data-saved-reply-id="personal"] button[aria-expanded]');
      assert.match(await page.$eval('[data-saved-reply-id="personal"] [role="region"]', element => element.innerText), /FIM DO TEXTO/);
      await fit();
      await page.screenshot({ path: join(output, `${width}-${campaign.name}.png`) });
      const use = await page.$('[data-saved-reply-id="personal"] [role="region"] button');
      await use.click();
      await page.waitForSelector(root, { hidden: true });
      assert.equal(await page.$eval('textarea[placeholder="Digite uma mensagem"]', element => element.value), `Rascunho preservado\n\n${content}`);
      assert.deepEqual(writes, [], 'nenhuma escrita ou mensagem enviada');
      assert.equal(libraryCalls, 1, 'uma carga, sem polling adicional');
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ width, campaign: campaign.name, removed: true, savedRepliesPreserved: true, noOverflow: true, writes: writes.length }));
    } finally { await page.close(); }
  }
  console.log(JSON.stringify({ passed: 9, output }));
} finally { await browser.close(); }
