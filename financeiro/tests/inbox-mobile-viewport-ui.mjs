import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Dados e APIs simulados, inclusive quando TEST_ORIGIN aponta para produção.
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3210';
const output = process.env.TEST_OUTPUT;
if (output) await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ['--disable-gpu'], protocolTimeout: 15000 });
const wait = (page, fn, ...args) => page.waitForFunction(fn, { polling: 100, timeout: 15000 }, ...args);
const cases = [
  { width: 360, height: 640, mobile: true }, // Redmi, barras do navegador visíveis.
  { width: 320, height: 568, mobile: true },
  { width: 393, height: 680, mobile: true },
  { width: 390, height: 844, mobile: true },
  { width: 412, height: 732, mobile: true },
  { width: 430, height: 932, mobile: true },
  { width: 800, height: 360, mobile: true }, // Paisagem com toque.
  { width: 756, height: 400, mobile: false }, // Zoom/layout curto com mouse.
  { width: 1440, height: 900, mobile: false },
];
const results = [];
async function click(page, selector) { await page.waitForSelector(selector); await page.$eval(selector, e => e.click()); }
async function text(page, value) {
  await page.$eval('textarea[placeholder="Digite uma mensagem"]', (el, value) => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}
async function geometry(page) {
  return page.evaluate(() => {
    const box = selector => { const el = document.querySelector(selector); if (!el) return null;
      const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };
    return { width: innerWidth, height: innerHeight, visibleHeight: visualViewport.height, offset: visualViewport.offsetTop,
      shell: box('.crm-viewport-lock'), composer: box('.inbox-thread-composer'), input: box('textarea[placeholder="Digite uma mensagem"]'),
      messages: box('.inbox-thread-messages'), scrollWidth: document.documentElement.scrollWidth, scrollY,
      position: getComputedStyle(document.querySelector('.crm-viewport-lock')).position,
      keyboard: document.documentElement.hasAttribute('data-keyboard-open'), scale: visualViewport.scale,
      visualHeightVar: document.documentElement.style.getPropertyValue('--crm-visual-height'),
      activeTag: document.activeElement?.tagName, bodyClass: document.body.className,
      buttons: [...document.querySelectorAll('.inbox-composer-field button')].filter(e => e.getBoundingClientRect().width > 0)
        .map(e => ({ label: e.getAttribute('aria-label'), width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height })),
    };
  });
}
async function fits(page, config, state) {
  await wait(page, () => Math.abs(parseFloat(document.documentElement.style.getPropertyValue('--crm-visual-height')) - visualViewport.height) < 1);
  const g = await geometry(page);
  assert.ok(g.scrollWidth <= g.width + 1, `${state}: overflow lateral ${JSON.stringify(g)}`);
  if (config.mobile) {
    assert.equal(g.position, 'fixed', `${state}: shell móvel não deve impor altura de desktop`);
    assert.ok(g.shell.bottom <= g.visibleHeight + g.offset + 1, `${state}: shell ultrapassa área útil ${JSON.stringify(g)}`);
    assert.ok(g.composer.bottom <= g.visibleHeight + g.offset + 1, `${state}: compositor cortado ${JSON.stringify(g)}`);
    assert.ok(g.input.top >= g.offset && g.input.bottom <= g.visibleHeight + g.offset + 1, `${state}: digitação visível`);
    assert.ok(g.input.width >= 90 && g.input.height >= 43.9, `${state}: campo utilizável`);
    assert.ok(g.messages.height >= 60, `${state}: conversa preserva área de leitura`);
    assert.ok(g.buttons.every(b => b.width >= 43.9 && b.height >= 43.9), `${state}: alvos de toque ${JSON.stringify(g.buttons)}`);
  } else if (config.height < 672) {
    assert.equal(g.position, 'relative'); assert.ok(g.shell.height >= 704, 'zoom desktop mantém rolagem da página');
  } else {
    assert.ok(g.composer.bottom <= g.height + 1);
  }
  return g;
}
try {
  for (const config of cases) {
    const { width, height, mobile } = config;
    const page = await browser.newPage(), errors = [], writes = [];
    let failMessages = width === 360, releaseMessages;
    const messagesReady = new Promise(resolve => { releaseMessages = resolve; });
    const user = { id: 'operator', name: 'Operadora Sintética', role: 'VENDEDOR', unit: 'Osasco', permissions: { crm: true, unitOsasco: true } };
    const instance = { id: 'instance', name: 'Leads Osasco', instanceName: 'Leads Osasco', unit: 'Osasco', status: 'connected', userId: user.id, ownerId: user.id, canReply: true };
    const now = new Date().toISOString();
    const conv = { id: 'chat', instanceId: instance.id, instance, status: 'open', assignedTo: user.id, unreadCount: 0,
      contact: { id: 'contact', name: 'Paloma com nome longo para testar a identificação', phone: '5511999999999', unit: 'Osasco' },
      campaignAccountOrigin: 'secondary', lastMessage: 'Obrigada!', lastMessageAt: now, lastInboundAt: now };
    const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="640"><rect width="320" height="640" fill="#e9edef"/><text x="40" y="320" fill="#111b21">Imagem sintética</text></svg>');
    const messages = [
      { id: 'image', messageId: 'image', type: 'image', mediaUrl: image, body: 'Recebi uma mensagem no Instagram. Vocês conseguem me ajudar com mais informações?', fromMe: false, timestamp: now },
      { id: 'answer', messageId: 'answer', type: 'text', body: 'Claro! Vou ajudar você por aqui.', fromMe: true, timestamp: now, status: 'read' },
      { id: 'thanks', messageId: 'thanks', type: 'text', body: 'Obrigada!', fromMe: false, timestamp: now },
    ];
    await page.setViewport({ width, height, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
    await page.evaluateOnNewDocument(({ user, timerFrames }) => {
      // Alguns hosts headless não recebem frames do compositor. Só o relógio
      // do teste é substituído; dimensões/visualViewport continuam do Chrome.
      if (timerFrames) {
        window.requestAnimationFrame = callback => window.setTimeout(() => callback(performance.now()), 16);
        window.cancelAnimationFrame = id => window.clearTimeout(id);
      }
      localStorage.setItem('virtuosa_user', JSON.stringify(user)); localStorage.setItem('virtuosa_global_unit', 'Osasco');
    }, { user, timerFrames: process.env.HEADLESS_FRAME_CLOCK === 'timer' });
    page.on('pageerror', e => errors.push(e.message));
    await page.setRequestInterception(true);
    page.on('request', async req => {
      const url = new URL(req.url());
      if (url.origin !== origin && !['data:', 'blob:'].includes(url.protocol)) return req.abort();
      if (!url.pathname.startsWith('/api/')) return req.continue();
      if (req.method() !== 'GET') writes.push(url.pathname);
      let data = {};
      if (url.pathname === '/api/auth/me') data = { authenticated: true, user };
      else if (url.pathname.endsWith('/instances')) data = { instances: [instance], users: [user] };
      else if (url.pathname === '/api/whatsapp/status') data = { connected: true, status: 'connected', instance };
      else if (url.pathname === '/api/whatsapp/conversations') data = { conversations: [conv], hasMore: false, serverTime: now, queueCounts: { open: 1, unread: 0 } };
      else if (url.pathname === '/api/whatsapp/messages') {
        await messagesReady;
        if (failMessages) return req.respond({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Falha sintética de histórico' }) });
        data = { messages, hasMore: false };
      }
      else if (url.pathname.includes('/saved-replies')) data = { replies: [], categories: [] };
      else if (url.pathname.includes('notifications')) data = { notifications: [], unreadCount: 0 };
      else if (url.pathname === '/api/crm/evaluations/assignees') data = { assignees: [] };
      else if (url.pathname === '/api/catalog') data = { services: [] };
      else if (url.pathname === '/api/clients') data = { clients: [] };
      else if (url.pathname === '/api/pipeline') data = [];
      else if (url.pathname === '/api/pipelines') data = [{ id: 'pipeline', name: 'Funil Sintético', unit: 'Osasco', stages: [{ id: 'new', name: 'Novo Lead', position: 0 }] }];
      else if (url.pathname === '/api/crm/dashboard') data = {
        metrics: { activeConversations: { current: 65, previous: 50 }, unreadConversations: 1, openDealsValue: 0, openDealsCount: 74, wonDealsValue: 0, wonDealsCount: 0 },
        leadsSeries: [{ date: now.slice(0, 10), newLeads: 62, manualAdjustments: 0 }],
        whatsapp: { connectedCount: 1, connectingCount: 0, disconnectedCount: 0, disconnectedInstances: [] },
      };
      else if (url.pathname === '/api/crm/evaluations') data = { unit: 'Osasco', evaluations: [], professionals: [], newEvaluationsToday: 0 };
      else if (url.pathname.endsWith('/evaluation-confirmation')) data = { visible: false, alreadySent: false };
      await req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    try {
      await page.goto(`${origin}/crm/inbox`, { waitUntil: 'domcontentloaded' });
      await click(page, '[data-conversation-id="chat"]');
      await page.waitForSelector('textarea[placeholder="Digite uma mensagem"]');
      await fits(page, config, 'carregamento'); releaseMessages();
      if (failMessages) {
        await wait(page, () => document.querySelector('.inbox-thread-messages')?.innerText.includes('Não foi possível carregar as mensagens'));
        await fits(page, config, 'falha de histórico'); failMessages = false;
        await click(page, '.inbox-thread-messages button');
      }
      await wait(page, () => document.querySelector('.inbox-thread-messages')?.innerText.includes('Obrigada!'));
      const initial = await fits(page, config, 'inicial');
      await click(page, '[aria-label="Ferramentas da conversa"]');
      await page.waitForSelector('[role="menu"]');
      const menu = await page.$eval('[role="menu"]', e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
      assert.ok(menu.left >= 0 && menu.right <= width + 1 && menu.top >= 0 && menu.bottom <= height + 1, 'ferramentas cabem na tela');
      await page.keyboard.press('Escape');
      if (mobile && width < 640) {
        await text(page, 'Texto longo de atendimento\ncom várias linhas\npara conferir a digitação\nsem perder os controles.');
        await page.$eval('textarea[placeholder="Digite uma mensagem"]', e => e.focus({ preventScroll: true }));
        const reduced = Math.max(300, height - 280);
        await page.setViewport({ width, height: reduced, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
        await wait(page, expected => innerHeight === expected, reduced);
        await fits(page, { ...config, height: reduced }, 'teclado');
        await page.$eval('textarea[placeholder="Digite uma mensagem"]', e => e.blur());
        await page.setViewport({ width, height, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
        await wait(page, () => !document.documentElement.hasAttribute('data-keyboard-open'));
        await text(page, '');
        await fits(page, config, 'teclado fechado');
        const cdp = await page.createCDPSession();
        await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
        await wait(page, () => document.documentElement.hasAttribute('data-crm-pinch-zoom'));
        const zoom = await geometry(page); assert.equal(zoom.position, 'relative');
        assert.ok(Math.abs(zoom.shell.height - initial.shell.height) <= 2, 'pinch mantém altura de layout');
        await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
        await wait(page, () => !document.documentElement.hasAttribute('data-crm-pinch-zoom'));
        await fits(page, config, 'retorno do zoom');
      }
      if (output && process.env.CAPTURE_SCREENSHOTS === '1' && [360, 390, 430, 1440].includes(width)) {
        try {
          const cdp = await page.createCDPSession();
          const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: false, captureBeyondViewport: false });
          await writeFile(join(output, `${width}x${height}.png`), Buffer.from(shot.data, 'base64'));
        } catch (error) { console.log(`Captura indisponível: ${error.message}`); }
      }
      assert.deepEqual(errors, []); assert.deepEqual(writes, [], 'não envia nem altera dados');
      if ([360, 390, 430, 1440].includes(width)) {
        for (const path of ['/crm', '/crm/pipeline', '/crm/ouvidoria']) {
          await page.goto(origin + path, { waitUntil: 'domcontentloaded' });
          await page.waitForSelector('.crm-viewport-lock');
          await wait(page, () => Math.abs(parseFloat(document.documentElement.style.getPropertyValue('--crm-visual-height')) - visualViewport.height) < 1);
          const g = await geometry(page);
          assert.ok(g.scrollWidth <= g.width + 1 && g.shell.bottom <= g.visibleHeight + 1, `${path}: shell adaptado em ${width}px`);
        }
        assert.deepEqual(errors, []); assert.deepEqual(writes, []);
      }
      results.push({ ...config, passed: true });
      console.log(`PASS ${width}x${height} ${mobile ? 'toque' : 'mouse'}: digitação, mensagens, ferramentas e viewport.`);
    } catch (error) { console.log(JSON.stringify({ config, geometry: await geometry(page), errors, writes })); throw error; }
    finally { releaseMessages(); await page.close(); }
  }
  console.log(JSON.stringify({ results }));
} finally { await browser.close(); }
