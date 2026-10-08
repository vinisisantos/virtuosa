import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const origin = process.env.CRM_ZOOM_UI_ORIGIN || 'http://127.0.0.1:3099';
assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);

const user = {
  id: 'crm-zoom-ui',
  name: 'Usuário de Teste',
  role: 'ADMINISTRADOR',
  unit: 'SBC',
  permissions: { admin: true, crm: true },
};
const conversation = {
  id: 'crm-zoom-conversation',
  instanceId: 'crm-zoom-instance',
  status: 'open',
  assignedTo: user.id,
  unreadCount: 0,
  lastMessage: 'Uma resposta de teste com conteúdo longo.',
  lastMessageAt: '2026-10-08T12:00:00.000Z',
  contact: { id: 'crm-zoom-contact', phone: '5511999999999', name: 'Contato de Teste', unit: 'SBC' },
};
const messages = [
  {
    id: 'crm-zoom-message-1', conversationId: conversation.id, body: 'Gostaria de saber mais detalhes.',
    type: 'text', fromMe: false, status: 'delivered', timestamp: '2026-10-08T11:59:00.000Z',
  },
  {
    id: 'crm-zoom-message-2', conversationId: conversation.id,
    body: 'Este é um texto longo de teste para confirmar que o balão mantém sua largura e não é cortado quando o navegador amplia a área apontada pelo usuário.',
    type: 'text', fromMe: true, status: 'sent', timestamp: '2026-10-08T12:00:00.000Z',
  },
];

const viewports = [
  { width: 390, height: 844, compactHeight: false },
  { width: 430, height: 932, compactHeight: false },
  { width: 756, height: 400, compactHeight: true },
  { width: 1024, height: 600, compactHeight: true },
  { width: 1440, height: 900, compactHeight: false },
];

const browser = await puppeteer.launch({ headless: true });
const screenshotDirectory = process.env.CRM_ZOOM_UI_SCREENSHOTS
  ? await mkdtemp(join(tmpdir(), 'virtuosa-crm-zoom-'))
  : null;

try {
  for (const viewport of viewports) {
    const page = await browser.newPage();
    await page.setViewport({ width: viewport.width, height: viewport.height });
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.origin !== origin) {
        void request.abort();
        return;
      }
      if (!url.pathname.startsWith('/api/')) {
        void request.continue();
        return;
      }
      const data = url.pathname === '/api/auth/me'
        ? { authenticated: true, user }
        : url.pathname.includes('/instances')
          ? { instances: [] }
          : url.pathname === '/api/whatsapp/conversations'
            ? { conversations: [conversation], serverTime: '2026-10-08T12:00:00.000Z' }
            : url.pathname === '/api/whatsapp/messages'
              ? { messages, markedAsRead: true }
            : {};
      void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.evaluateOnNewDocument(value => {
      localStorage.setItem('virtuosa_user', JSON.stringify(value));
      localStorage.setItem('virtuosa_global_unit', 'SBC');
    }, user);

    await page.goto(`${origin}/crm/inbox`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForSelector('.crm-viewport-lock .crm-shell-header');
    await page.waitForSelector('[data-inbox-thread-open]');

    const layout = await page.evaluate(() => {
      const shell = document.querySelector('.crm-viewport-lock');
      const account = document.querySelector('[aria-label="Open account menu"]');
      const title = document.querySelector('.crm-shell-header h1');
      const content = document.querySelector('.crm-shell-content');
      return {
        shellPosition: getComputedStyle(shell).position,
        shellHeight: shell.getBoundingClientRect().height,
        accountRight: account.getBoundingClientRect().right,
        titleWidth: title.getBoundingClientRect().width,
        contentHeight: content.getBoundingClientRect().height,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        documentHeight: document.documentElement.scrollHeight,
      };
    });

    assert.ok(layout.accountRight <= viewport.width + 1, `conta acessível em ${viewport.width}×${viewport.height}`);
    assert.ok(layout.titleWidth >= 50, `título legível em ${viewport.width}×${viewport.height}`);
    assert.ok(layout.documentWidth <= layout.viewportWidth + 1, `sem overflow horizontal em ${viewport.width}×${viewport.height}`);

    if (viewport.compactHeight) {
      assert.equal(layout.shellPosition, 'relative', 'zoom/altura curta libera a rolagem da página');
      assert.ok(layout.contentHeight > viewport.height, 'painéis têm espaço útil além do viewport curto');
      assert.ok(layout.documentHeight > viewport.height, 'a parte inferior do CRM é alcançável');
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const scrollY = await page.evaluate(() => window.scrollY);
      assert.ok(scrollY > 0, 'a página realmente rola em zoom alto');
      await page.evaluate(() => window.scrollTo(0, 0));
    } else {
      assert.equal(layout.shellPosition, 'fixed', 'layout habitual permanece fixo');
    }

    if ([390, 430, 756, 1440].includes(viewport.width)) {
      if (viewport.width === 1440) {
        await page.waitForFunction(() => document.body.textContent.includes('Contato de Teste'));
        await page.evaluate(() => {
          const item = [...document.querySelectorAll('button')].find(button => button.textContent.includes('Contato de Teste'));
          item?.click();
        });
        await page.waitForSelector('[data-inbox-thread-open="true"] .inbox-thread-messages');
      }
      const originalThreadHeight = await page.$eval('.inbox-thread-messages', thread => thread.getBoundingClientRect().height).catch(() => null);
      const session = await page.createCDPSession();
      if (viewport.width === 1440) {
        await session.send('Input.synthesizePinchGesture', {
          x: 1080, y: 250, scaleFactor: 2, gestureSourceType: 'touch',
        });
        await page.waitForFunction(() => window.visualViewport?.scale >= 1.9);
        const gestureLayout = await page.evaluate(() => {
          const visual = window.visualViewport;
          const header = document.querySelector('.crm-shell-header');
          const composer = document.querySelector('[data-inbox-thread-open="true"] .inbox-thread-composer');
          return {
            offsetTop: visual.offsetTop,
            offsetLeft: visual.offsetLeft,
            visualHeight: visual.height,
            headerBottom: header.getBoundingClientRect().bottom,
            composerTop: composer.getBoundingClientRect().top,
            shellPosition: getComputedStyle(document.querySelector('.crm-viewport-lock')).position,
          };
        });
        assert.ok(gestureLayout.offsetTop > 0 && gestureLayout.offsetLeft > 0, 'o navegador ancora o zoom no ponto do gesto');
        assert.equal(gestureLayout.shellPosition, 'relative', 'o CRM percorre a página como um conjunto durante o gesto');
        assert.ok(gestureLayout.headerBottom < gestureLayout.offsetTop, 'cabeçalho não fica preso sobre a conversa ampliada');
        assert.ok(gestureLayout.composerTop > gestureLayout.offsetTop + gestureLayout.visualHeight, 'compositor não fica preso sobre a conversa ampliada');
        if (screenshotDirectory) {
          const gesturePath = join(screenshotDirectory, `${viewport.width}x${viewport.height}-gesture.png`);
          await page.screenshot({ path: gesturePath });
          console.log(gesturePath);
        }
        await session.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
        await page.waitForFunction(() => window.visualViewport?.scale === 1);
      }
      for (const scale of [2, 3]) {
        await session.send('Emulation.setPageScaleFactor', { pageScaleFactor: scale });
        await page.waitForFunction(expected => window.visualViewport?.scale >= expected - 0.1, {}, scale);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const pinchLayout = await page.evaluate(() => {
          const shell = document.querySelector('.crm-viewport-lock');
          const thread = document.querySelector('.inbox-thread-messages');
          return {
            scale: window.visualViewport.scale,
            visualHeight: window.visualViewport.height,
            layoutHeight: window.innerHeight,
            shellPosition: getComputedStyle(shell).position,
            shellHeight: shell.getBoundingClientRect().height,
            shellTop: shell.getBoundingClientRect().top,
            threadHeight: thread?.getBoundingClientRect().height ?? null,
          };
        });
        assert.ok(pinchLayout.visualHeight < pinchLayout.layoutHeight, 'pinch reduz só a viewport visual');
        assert.equal(pinchLayout.shellPosition, 'relative', `zoom ${scale}× mantém todo o CRM na mesma camada da página`);
        assert.ok(
          Math.abs(pinchLayout.shellHeight - pinchLayout.visualHeight * pinchLayout.scale) <= 2,
          'pinch preserva a altura de layout inteira, não só a fatia visível',
        );
        assert.ok(Math.abs(pinchLayout.shellTop) <= 1, 'pinch não desloca o shell');
        if (pinchLayout.threadHeight !== null) {
          assert.ok(pinchLayout.threadHeight > pinchLayout.visualHeight, 'a conversa não encolhe para a fatia visual ampliada');
          assert.ok(Math.abs(pinchLayout.threadHeight - originalThreadHeight) <= 1, 'cabeçalho e compositor não comprimem a conversa no zoom');
        }
        if (screenshotDirectory && viewport.width === 1440) {
          const path = join(screenshotDirectory, `${viewport.width}x${viewport.height}-zoom-${scale}x.png`);
          await page.screenshot({ path });
          console.log(path);
        }
      }
      await session.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
      await page.waitForFunction(() => window.visualViewport?.scale === 1);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const restoredLayout = await page.$eval('.crm-viewport-lock', shell => ({
        height: shell.getBoundingClientRect().height,
        position: getComputedStyle(shell).position,
      }));
      assert.ok(Math.abs(restoredLayout.height - layout.shellHeight) <= 1, 'o shell volta à altura normal após desfazer o pinch');
      assert.equal(restoredLayout.position, layout.shellPosition, 'o shell recupera o modo de rolagem original após desfazer o pinch');
      await session.detach();
    }

    if (screenshotDirectory) {
      const path = join(screenshotDirectory, `${viewport.width}x${viewport.height}.png`);
      await page.screenshot({ path, fullPage: viewport.compactHeight });
      console.log(path);
    }

    await page.close();
  }
} finally {
  await browser.close();
}
