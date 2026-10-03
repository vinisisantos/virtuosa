// Run against a local Next server. Every API request is synthetic and intercepted.
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer';

const origin = process.env.ORDERS_UI_ORIGIN || 'http://127.0.0.1:3099';
assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);

const user = {
  id: 'orders-responsive-ui',
  name: 'Teste responsivo',
  role: 'ADMINISTRADOR',
  unit: 'SBC',
  permissions: { admin: true, pedidos: true, financeiro: true, finCustos: true },
};

const orders = [
  {
    id: 'order-responsive-1',
    productName: 'Anestésico lidocaína 2% sem vaso com descrição extensa',
    quantity: 3,
    urgency: 'Urgente',
    status: 'Aguardando',
    notes: 'Observação longa que precisa aparecer por completo, sem depender de rolagem horizontal.',
    unit: 'SBC',
    unitPrice: 125.5,
    totalPrice: 376.5,
    sourceUrl: 'https://example.com/produto',
    batchNumber: 92,
    createdAt: '2026-09-04T15:06:00.000Z',
    costRecognizedAt: null,
  },
  {
    id: 'order-responsive-2',
    productName: 'Seringa botox',
    quantity: 30,
    urgency: 'Média',
    status: 'Pedido',
    notes: '',
    unit: 'SBC',
    unitPrice: 4.2,
    totalPrice: 126,
    batchNumber: 92,
    createdAt: '2026-09-04T15:06:00.000Z',
    estimatedArrival: '2026-09-20',
    costRecognizedAt: '2026-09-05T12:00:00.000Z',
  },
  {
    id: 'order-responsive-3',
    productName: 'Luvas de procedimento',
    quantity: 10,
    urgency: 'Baixa',
    status: 'Entregue',
    notes: 'Outro lote para testar a seleção compacta.',
    unit: 'SBC',
    unitPrice: 41.8,
    totalPrice: 418,
    batchNumber: 93,
    createdAt: '2026-09-03T09:30:00.000Z',
    costRecognizedAt: null,
  },
];

const viewports = [
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
  { width: 834, height: 1194 },
  { width: 1023, height: 900 },
  { width: 1024, height: 768 },
  { width: 1180, height: 820 },
  { width: 1440, height: 900 },
].filter(viewport => !process.env.ORDERS_UI_WIDTH || viewport.width === Number(process.env.ORDERS_UI_WIDTH));

const browser = await puppeteer.launch({ headless: true });
const screenshotDirectory = await mkdtemp(join(tmpdir(), 'virtuosa-orders-responsive-'));
const activate = (page, selector) => page.$eval(selector, element => element.click());

try {
  for (const viewport of viewports) {
    const page = await browser.newPage();
    const errors = [];
    let savedView = 'detailed';
    let preferenceWrites = 0;
    await page.setViewport({
      width: viewport.width,
      height: viewport.height,
      hasTouch: viewport.width <= 1024,
      isMobile: viewport.width <= 600,
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) {
        if (url.origin === origin) void request.continue();
        else void request.abort();
        return;
      }

      let data = {};
      if (url.pathname === '/api/auth/me') data = { authenticated: true, user };
      else if (url.pathname === '/api/orders') data = orders;
      else if (url.pathname === '/api/orders/view-preference') {
        if (request.method() === 'PATCH') {
          const body = JSON.parse(request.postData() || '{}');
          assert.ok(['detailed', 'compact'].includes(body.view));
          savedView = body.view;
          preferenceWrites++;
        }
        data = { view: savedView };
      }
      else if (url.pathname === '/api/orders/approvals') data = [];
      else if (url.pathname === '/api/orders/audit') data = { logs: [], total: 0, totalPages: 0 };
      else if (url.pathname === '/api/mercadolivre/status') data = { connected: false, mlUsername: null, unit: 'SBC' };
      else if (url.pathname === '/api/mercadolivre/orders') data = [];
      void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.evaluateOnNewDocument(userValue => {
      localStorage.setItem('virtuosa_user', JSON.stringify(userValue));
      localStorage.setItem('virtuosa_global_unit', 'SBC');
    }, user);

    await page.goto(`${origin}/pedidos`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForSelector('.orders-item-card');
    await page.waitForSelector('.orders-view-switch button:not(:disabled)');

    const layout = await page.evaluate(() => {
      const root = document.documentElement;
      const card = document.querySelector('.orders-item-card');
      const select = card?.querySelector('select');
      const labels = [...(card?.querySelectorAll('.orders-field-label') || [])].map(element => element.textContent?.trim());
      const mobileBar = document.querySelector('.mobile-tab-bar');
      const headerNav = document.querySelector('.app-header-nav');
      const filterSelects = [...document.querySelectorAll('.orders-filter-select select')].map(element => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
      if (!card || !select || !headerNav) return null;
      const cardRect = card.getBoundingClientRect();
      const selectRect = select.getBoundingClientRect();
      return {
        viewportWidth: root.clientWidth,
        documentWidth: root.scrollWidth,
        cardWidth: cardRect.width,
        cardScrollWidth: card.scrollWidth,
        selectLeft: selectRect.left,
        selectRight: selectRect.right,
        cardLeft: cardRect.left,
        cardRight: cardRect.right,
        labels,
        optionCount: select.options.length,
        filterSelects,
        mobileBarDisplay: mobileBar ? getComputedStyle(mobileBar).display : 'absent',
        headerNavDisplay: getComputedStyle(headerNav).display,
        tableCount: document.querySelectorAll('.orders-batch table').length,
        viewMode: document.querySelector('.orders-view-switch button[aria-pressed="true"]')?.textContent?.trim(),
      };
    });

    assert.ok(layout, `lista renderizada em ${viewport.width}x${viewport.height}`);
    assert.ok(layout.documentWidth <= layout.viewportWidth + 1, `sem overflow da página em ${viewport.width}px`);
    assert.ok(layout.cardScrollWidth <= layout.cardWidth + 1, `sem rolagem horizontal no pedido em ${viewport.width}px`);
    assert.ok(layout.selectLeft >= layout.cardLeft - 1 && layout.selectRight <= layout.cardRight + 1, `status visível em ${viewport.width}px`);
    assert.deepEqual(layout.labels, ['Produto', 'Quantidade', 'Unidade', 'Preço unitário', 'Preço total', 'Urgência', 'Status', 'Observações', 'Ações']);
    assert.equal(layout.optionCount, 4, 'todas as opções de status continuam disponíveis');
    assert.equal(layout.filterSelects.length, 2, 'status e urgência estão disponíveis');
    assert.ok(Math.abs(layout.filterSelects[0].width - layout.filterSelects[1].width) <= 1, `filtros com a mesma largura em ${viewport.width}px`);
    assert.ok(Math.abs(layout.filterSelects[0].height - layout.filterSelects[1].height) <= 1, `filtros com a mesma altura em ${viewport.width}px`);
    assert.ok(layout.filterSelects[0].height >= 44, `filtros com alvo de toque legível em ${viewport.width}px`);
    assert.equal(layout.tableCount, 0, 'a lista não depende mais de tabela horizontal');
    assert.match(layout.viewMode, /Lotes detalhados/, 'lotes detalhados é o padrão');

    const secondaryDetailed = await page.$eval('.orders-item-card .orders-unit-field', element => getComputedStyle(element).display);
    assert.notEqual(secondaryDetailed, 'none', 'lotes detalhados mantêm os campos visíveis');

    if ([390, 834, 1440].includes(viewport.width)) {
      await page.screenshot({
        path: join(screenshotDirectory, `pedidos-${viewport.width}.png`),
        fullPage: true,
      });
    }

    if (viewport.width <= 1023) {
      assert.equal(layout.mobileBarDisplay, 'flex', `navegação compacta no tablet de ${viewport.width}px`);
      assert.equal(layout.headerNavDisplay, 'none', `menu desktop recolhido no tablet de ${viewport.width}px`);
    } else {
      assert.ok(['none', 'absent'].includes(layout.mobileBarDisplay), `barra inferior ausente no desktop de ${viewport.width}px`);
      assert.notEqual(layout.headerNavDisplay, 'none', `menu desktop presente em ${viewport.width}px`);
    }

    if ([390, 430, 1440].includes(viewport.width)) {
      const compactSaved = page.waitForResponse(response => response.url().includes('/api/orders/view-preference') && response.request().method() === 'PATCH');
      await activate(page, '.orders-view-switch button:nth-child(2)');
      await compactSaved;
      await page.waitForSelector('.orders-batch-sidebar');
      if ([390, 1440].includes(viewport.width)) {
        await page.$eval('.orders-list-heading', element => element.scrollIntoView({ block: 'start' }));
        await page.screenshot({ path: join(screenshotDirectory, `pedidos-compact-${viewport.width}.png`) });
      }
      assert.equal(savedView, 'compact', 'troca salva por usuário');
      assert.equal(await page.$$eval('.orders-batch-choice', elements => elements.length), 2, 'lotes renderizados na fila');
      assert.equal(await page.$$eval('.orders-item-card', elements => elements.length), 2, 'itens do lote selecionado visíveis');
      const secondaryBefore = await page.$eval('.orders-item-card .orders-unit-field', element => getComputedStyle(element).display);
      assert.equal(secondaryBefore, 'none', 'a fila compacta começa com dados secundários recolhidos');
      await activate(page, '.orders-item-card .orders-detail-toggle');
      const secondaryAfter = await page.$eval('.orders-item-card .orders-unit-field', element => getComputedStyle(element).display);
      assert.notEqual(secondaryAfter, 'none', 'detalhes e ações podem ser expandidos na fila');
      await activate(page, '.orders-batch-choice:nth-of-type(2)');
      assert.equal(await page.$$eval('.orders-item-card', elements => elements.length), 1, 'troca de lote mostra seus itens');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.orders-batch-sidebar');
      await page.waitForFunction(() => [...document.querySelectorAll('.orders-view-switch button')].every(button => !button.disabled));
      const activeCompact = await page.$eval('.orders-view-switch button[aria-pressed="true"]', element => element.textContent || '');
      assert.match(activeCompact, /Fila compacta/, 'preferência preservada após recarga');
      const detailedSaved = page.waitForResponse(response => response.url().includes('/api/orders/view-preference') && response.request().method() === 'PATCH');
      await activate(page, '.orders-view-switch button:nth-child(1)');
      await detailedSaved;
      assert.equal(savedView, 'detailed', 'escolha pode ser alterada novamente');
      assert.equal(preferenceWrites, 2, 'uma gravação por troca, nenhuma por item');
    }

    await activate(page, '.orders-page-action');
    await page.waitForSelector('.order-modal-panel');
    const modalLayout = await page.evaluate(() => {
      const panel = document.querySelector('.order-modal-panel');
      const overlay = document.querySelector('.order-modal-overlay');
      if (!panel || !overlay) return null;
      const panelRect = panel.getBoundingClientRect();
      return {
        panelLeft: panelRect.left,
        panelRight: panelRect.right,
        viewportWidth: document.documentElement.clientWidth,
        overlayScrollWidth: overlay.scrollWidth,
        overlayClientWidth: overlay.clientWidth,
      };
    });
    assert.ok(modalLayout, 'modal de pedido renderizado');
    assert.ok(modalLayout.panelLeft >= -1 && modalLayout.panelRight <= modalLayout.viewportWidth + 1, `modal dentro da tela em ${viewport.width}px`);
    assert.ok(modalLayout.overlayScrollWidth <= modalLayout.overlayClientWidth + 1, `modal sem rolagem horizontal em ${viewport.width}px`);
    assert.deepEqual(errors, [], `sem erros de página em ${viewport.width}px`);
    await page.close();
  }

  console.log(`Pedidos responsivos validados em ${viewports.length} viewports. Capturas: ${screenshotDirectory}`);
} finally {
  await browser.close();
}
