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
            ? { conversations: [], serverTime: '2026-10-08T12:00:00.000Z' }
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
