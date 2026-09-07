import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Toda API é simulada e toda saída externa é bloqueada: não toca dados reais.
const origin = 'http://127.0.0.1:3210';
const output = await mkdtemp(join(tmpdir(), 'virtuosa-saved-replies-'));
console.log(JSON.stringify({ output }));
const browser = await puppeteer.launch({ headless: true });
const cases = ['SCS', 'SBC', 'Osasco'].flatMap(unit => [390, 430, 1440].map(width => ({ unit, width })));
cases.push(
  { unit: 'SCS', width: 390, unclassified: true },
  { unit: 'SBC', width: 1440, light: true },
  { unit: 'Osasco', width: 430, empty: true },
  { unit: 'SCS', width: 390, error: true },
);
const selectedCases = cases.filter(config => !process.env.TEST_WIDTH || config.width === Number(process.env.TEST_WIDTH));
const root = '.saved-replies-dialog';
const row = id => `[data-saved-reply-id="${id}"]`;
const titleButton = id => `${row(id)} button[aria-expanded]`;
const visibleElement = async (page, selector, text) => {
  const handle = await page.waitForFunction((selector, text) => [...document.querySelectorAll(selector)]
    .find(el => el.getClientRects().length && (!text || el.textContent.trim() === text)), {}, selector, text);
  return handle.asElement();
};
const clickText = async (page, text, selector = `${root} button`) => {
  const el = await visibleElement(page, selector, text);
  await el.click();
  await el.dispose();
};
const fit = async page => {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'viewport sem overflow');
  assert.ok(await page.$eval(root, el => {
    const r = el.getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 && el.scrollWidth <= el.clientWidth + 1;
  }), 'modal dentro do viewport');
  assert.ok(await page.$eval('.saved-replies-list', el => el.scrollWidth <= el.clientWidth + 1), 'lista sem overflow horizontal');
};
const openLibrary = async page => {
  await page.click('[aria-label="Abrir respostas rápidas"]');
  await page.waitForSelector(root, { visible: true });
};
const searchFor = async (page, term) => {
  await page.click('[aria-label="Buscar resposta"]', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  if (term) await page.type('[aria-label="Buscar resposta"]', term);
};

try {
  for (const config of selectedCases) {
    const { unit, width, unclassified, light, empty, error } = config;
    const page = await browser.newPage();
    const errors = [], calls = [], writes = [];
    let failReorder = false;
    const user = { id: 'operator', name: 'Operadora Teste', role: 'ADMINISTRADOR', unit, permissions: { crm: true } };
    const instance = { id: 'instance', unit, name: 'Comercial', instanceName: 'Comercial', userId: user.id, ownerId: user.id, canReply: true, status: 'connected' };
    const now = new Date().toISOString();
    let categories = empty ? [] : [
      { id: 'campaign', title: 'Glúteos Perfeitos', campaignName: 'Glúteo Perfeito', createdAt: now, updatedAt: now },
      { id: 'other', title: 'Botox', campaignName: 'Botox', createdAt: now, updatedAt: now },
    ];
    let replies = empty ? [] : [
      { id: 'greeting', categoryId: 'campaign', title: 'Saudação', content: 'Olá, {{primeiro_nome}}! Seja bem-vinda à Clínica Virtuosa.\n\nRecebi seu contato e vou ajudar por aqui.' },
      { id: 'region', categoryId: 'campaign', title: 'Entendendo a região', content: 'Qual é a sua principal dúvida? Vamos conversar sobre suas expectativas.' },
      { id: 'long', categoryId: 'campaign', title: 'Explicação com título longo para validar a quebra de linha sem perder informações importantes', content: `Mensagem integral com conteúdo longo.\n\n${'Texto ilustrativo para testar rolagem, leitura e preservação de parágrafos. '.repeat(36)}\nhttps://example.com/${'endereco'.repeat(28)}\nFIM DA MENSAGEM COMPLETA` },
      { id: 'global', categoryId: null, title: 'Horários de atendimento', content: 'Atendemos na unidade {{unidade}}. Consulte os horários disponíveis.' },
      { id: 'hidden', categoryId: 'other', title: 'Resposta exclusiva de Botox', content: 'Esta resposta pertence a outra campanha.' },
    ].map((reply, position) => ({ ...reply, position, createdAt: now, updatedAt: now }));
    const conv = { id: 'chat', instanceId: instance.id, instance, status: 'open', assignedTo: user.id, unreadCount: 0,
      contact: { id: 'contact', name: 'Mariana Teste', phone: '5511900000000', unit },
      campaignName: unclassified ? null : 'Glúteo Perfeito', lastMessage: 'Olá', lastMessageAt: now };
    await page.setViewport({ width, height: width === 430 ? 932 : 844, isMobile: width < 600, hasTouch: width < 600 });
    await page.evaluateOnNewDocument(u => localStorage.setItem('virtuosa_user', JSON.stringify(u)), user);
    await page.setRequestInterception(true);
    page.on('pageerror', err => errors.push(err.message));
    page.on('request', async req => {
      const url = new URL(req.url());
      if (url.origin !== origin && !['data:', 'blob:'].includes(url.protocol)) return req.abort();
      if (!url.pathname.startsWith('/api/')) return req.continue();
      calls.push({ path: url.pathname, method: req.method() });
      if (req.method() !== 'GET') writes.push({ path: url.pathname, method: req.method(), data: req.postData() });
      let status = 200, data = { success: true };
      if (url.pathname === '/api/auth/me') data = { authenticated: true, user };
      else if (url.pathname.includes('/instances')) data = { instances: [instance], users: [user] };
      else if (url.pathname === '/api/whatsapp/status') data = { connected: true, instance, status: 'connected' };
      else if (url.pathname === '/api/whatsapp/conversations') data = { conversations: [conv], appointmentSnapshot: {}, serverTime: now, hasMore: false, queueCounts: { open: 1 } };
      else if (url.pathname === '/api/whatsapp/messages') data = { messages: [{ id: 'message', messageId: 'wa', body: 'Olá', type: 'text', fromMe: false, timestamp: now }], hasMore: false };
      else if (url.pathname === '/api/whatsapp/saved-replies' && req.method() === 'GET') {
        await new Promise(resolve => setTimeout(resolve, 650));
        if (error) { status = 503; data = { error: 'Biblioteca temporariamente indisponível.' }; }
        else data = { replies, categories, campaignOptions: [{ name: 'Glúteo Perfeito', units: [unit] }, { name: 'Botox', units: [unit] }] };
      }
      else if (url.pathname === '/api/whatsapp/saved-replies/reorder') {
        if (failReorder) { status = 503; data = { error: 'Falha simulada ao ordenar.' }; }
        else {
          const ids = JSON.parse(req.postData()).ids;
          replies = ids.map((id, position) => ({ ...replies.find(reply => reply.id === id), position }));
        }
      }
      else if (url.pathname.startsWith('/api/whatsapp/saved-replies/categories')) {
        const input = JSON.parse(req.postData() || '{}');
        const id = url.pathname.split('/').at(-1);
        const category = { ...categories.find(item => item.id === id), ...input };
        categories = categories.map(item => item.id === id ? category : item);
        data = { category };
      }
      else if (url.pathname.startsWith('/api/whatsapp/saved-replies')) {
        const id = req.method() === 'POST' ? 'created' : url.pathname.split('/').at(-1);
        if (req.method() === 'DELETE') replies = replies.filter(reply => reply.id !== id);
        else {
          const input = JSON.parse(req.postData());
          const reply = { position: replies.length, createdAt: now, updatedAt: now, ...replies.find(reply => reply.id === id), ...input, id };
          replies = [...replies.filter(reply => reply.id !== id), reply].sort((a, b) => a.position - b.position);
          data = { reply };
        }
      }
      else if (url.pathname === '/api/users') data = [];
      await req.respond({ status, contentType: 'application/json', body: JSON.stringify(data) });
    });
    const label = `${unit}-${width}-${unclassified ? 'global-duplicada' : light ? 'claro' : empty ? 'vazia' : error ? 'erro' : 'completa'}`;
    try {
      await page.goto(`${origin}/crm/inbox`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('[data-conversation-id="chat"]');
      await page.click('[data-conversation-id="chat"]');
      await page.waitForSelector('[aria-label="Abrir respostas rápidas"]');
      if (light) await page.evaluate(() => {
        document.documentElement.classList.remove('dark');
        document.documentElement.dataset.theme = 'light';
        document.documentElement.dataset.mode = 'light';
      });
      await page.type('textarea[placeholder="Digite uma mensagem"]', 'Rascunho preservado');
      await openLibrary(page);
      await page.waitForSelector('.saved-replies-list[aria-busy="true"]');
      await fit(page);
      await page.waitForSelector('.saved-replies-list[aria-busy="false"]');
      if (error) {
        await visibleElement(page, `${root} div`, 'Biblioteca temporariamente indisponível.');
        await fit(page);
        await page.screenshot({ path: join(output, `${label}.png`) });
      } else if (empty) {
        assert.equal((await page.$$('[data-saved-reply-id]')).length, 0);
        await fit(page);
        await page.screenshot({ path: join(output, `${label}.png`) });
        await clickText(page, 'Nova');
        await page.waitForSelector('#saved-reply-title');
        await page.type('#saved-reply-title', 'Nova mensagem');
        await page.type('#saved-reply-content', 'Mensagem criada em teste.');
        await clickText(page, 'Salvar resposta');
        await page.waitForSelector(row('created'));
      } else {
        assert.equal((await page.$$(`${root} [role="region"]`)).length, 0, 'começa totalmente recolhida');
        assert.equal((await page.$$(`${root} [aria-label^="Editar "]`)).length, 0, 'sem ações poluindo títulos');
        if (!unclassified) assert.equal((await page.$$(row('hidden'))).length, 0, 'campanha isolada');
        await page.screenshot({ path: join(output, `${label}-compacta.png`) });
        await page.click(titleButton('greeting'));
        assert.equal((await page.$$(`${root} [role="region"]`)).length, 1);
        assert.match(await page.$eval(`${row('greeting')} [role="region"]`, el => el.innerText), /Olá, Mariana!/);
        assert.equal(writes.length, 0, 'expandir não salva nem envia');
        assert.equal(await page.$eval('textarea[placeholder="Digite uma mensagem"]', el => el.value), 'Rascunho preservado');
        await fit(page);
        await page.screenshot({ path: join(output, `${label}-expandida.png`) });
        await page.focus(titleButton('region'));
        await page.keyboard.press('Enter');
        assert.equal((await page.$$(`${row('greeting')} [role="region"]`)).length, 0, 'apenas uma aberta');
        await page.keyboard.press('Space');
        assert.equal((await page.$$(`${root} [role="region"]`)).length, 0, 'teclado recolhe');
        await page.click(titleButton('long'));
        assert.match(await page.$eval(`${row('long')} [role="region"]`, el => el.innerText), /FIM DA MENSAGEM COMPLETA/);
        await fit(page);
        await page.$eval(`${row('long')} [aria-label^="Mais ações"]`, el => el.scrollIntoView({ block: 'center' }));
        await page.click(`${row('long')} [aria-label^="Mais ações"]`);
        await page.waitForSelector('[role="menu"]', { visible: true });
        assert.ok(await page.$eval('[role="menu"]', el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }), 'menu cabe no mobile');
        await page.keyboard.press('Escape');
        await page.waitForSelector('[role="menu"]', { hidden: true });
        assert.ok(await page.$(root), 'Escape do menu preserva biblioteca');
        await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label')?.startsWith('Mais ações de'));
        await searchFor(page, 'FIM DA MENSAGEM');
        assert.equal((await page.$$('[data-saved-reply-id]')).length, 1, 'busca no conteúdo oculto');
        await searchFor(page, 'naoexistexyz');
        await visibleElement(page, `${root} p`, 'Nenhuma resposta encontrada');
        await searchFor(page, '');
        await page.waitForSelector(titleButton('greeting'));
        if (unclassified) {
          const duplicates = await page.$$(titleButton('global'));
          assert.equal(duplicates.length, 2);
          await duplicates[0].click();
          await duplicates[1].click();
          assert.equal((await page.$$(`${root} [role="region"]`)).length, 1, 'resposta global só expande na ocorrência tocada');
        }
        await page.click(titleButton('greeting'));
        await clickText(page, 'Usar resposta');
        await page.waitForSelector(root, { hidden: true });
        assert.match(await page.$eval('textarea[placeholder="Digite uma mensagem"]', el => el.value), /^Rascunho preservado\n\nOlá, Mariana!/);
        await openLibrary(page);
        assert.equal((await page.$$(`${root} [role="region"]`)).length, 0, 'reabrir recolhe');
        assert.equal(calls.filter(call => call.path === '/api/whatsapp/saved-replies' && call.method === 'GET').length, 1, 'cache sem nova consulta');
        await page.click(titleButton('greeting'));
        await page.click('[aria-label="Editar Saudação"]');
        await page.waitForSelector('#saved-reply-content');
        assert.match(await page.$eval('#saved-reply-content', el => el.value), /\{\{primeiro_nome\}\}/, 'edição mantém template bruto');
        await page.$eval('#saved-reply-content', el => el.setSelectionRange(el.value.length, el.value.length));
        await page.type('#saved-reply-content', '\nRevisada.');
        await clickText(page, 'Salvar resposta');
        await page.waitForSelector(titleButton('greeting'));
        assert.match(replies.find(reply => reply.id === 'greeting').content, /Revisada\.$/);
        await clickText(page, 'Organizar');
        assert.equal((await page.$$(`${root} [role="region"]`)).length, 0);
        const before = replies.map(reply => reply.id);
        if (width < 600) {
          const down = `${row('greeting')} [aria-label="Mover Saudação para baixo"]`;
          assert.ok(await page.$eval(down, el => el.getBoundingClientRect().height >= 43.5), 'alvo de toque de 44 px');
          await page.click(down);
        } else {
          await page.focus('[aria-label="Arraste para mover Saudação"]');
          await page.keyboard.press('Space');
          await page.waitForSelector('[aria-label="Arraste para mover Saudação"][aria-pressed="true"]');
          // dnd-kit mede os destinos no frame seguinte à ativação do sensor.
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          await page.keyboard.press('ArrowDown');
          await page.waitForFunction(() => {
            const transform = document.querySelector('[data-saved-reply-id="greeting"]').style.transform;
            return transform && new DOMMatrix(transform).m42 > 5;
          });
          await page.waitForFunction(() => [...document.querySelectorAll('[role="status"]')].some(el => el.textContent.includes('over droppable area region')));
          await page.keyboard.press('Space');
        }
        await page.waitForFunction(() => document.querySelector('[data-saved-reply-id]')?.dataset.savedReplyId === 'region');
        assert.deepEqual(replies.map(reply => reply.id), ['region', 'greeting', ...before.slice(2)], 'ordem persiste sem mover item oculto');
        await page.waitForFunction(() => [...document.querySelectorAll('.saved-replies-dialog button')].some(el => el.textContent.trim() === 'Concluir' && !el.disabled));
        if (width < 600) {
          failReorder = true;
          await page.click('[aria-label="Mover Saudação para cima"]');
          await visibleElement(page, `${root} div`, 'Falha simulada ao ordenar.');
          assert.equal(await page.$eval('[data-saved-reply-id]', el => el.dataset.savedReplyId), 'region', 'falha restaura ordem');
          failReorder = false;
        } else {
          const savedMoves = writes.length;
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          await page.focus('[aria-label="Arraste para mover Saudação"]');
          await page.keyboard.press('Space');
          await page.waitForSelector('[aria-label="Arraste para mover Saudação"][aria-pressed="true"]');
          await page.keyboard.press('Escape');
          await page.waitForSelector(root, { hidden: true });
          assert.equal(writes.length, savedMoves, 'cancelar arraste não persiste');
          await openLibrary(page);
          await clickText(page, 'Organizar');
          if (unit === 'Osasco') {
            const from = await page.$eval('[aria-label="Arraste para mover Entendendo a região"]', el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
            const to = await page.$eval('[aria-label="Arraste para mover Saudação"]', el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
            await page.mouse.move(from.x, from.y);
            await page.mouse.down();
            await page.mouse.move(from.x, from.y + 8, { steps: 3 });
            await page.mouse.move(to.x, to.y + 3, { steps: 8 });
            await page.waitForFunction(() => [...document.querySelectorAll('[role="status"]')].some(el => el.textContent.includes('over droppable area greeting')));
            await page.mouse.up();
            await page.waitForFunction(() => document.querySelector('[data-saved-reply-id]')?.dataset.savedReplyId === 'greeting');
          }
        }
        await page.screenshot({ path: join(output, `${label}-organizar.png`) });
        await clickText(page, 'Concluir');
        await page.click('[aria-label="Gerenciar categorias"]');
        await page.waitForSelector('#saved-reply-category-campaign');
        await page.click('[aria-label="Editar categoria Glúteos Perfeitos"]');
        assert.equal(await page.$eval('#saved-reply-category-campaign', el => el.value), 'Glúteo Perfeito');
        await page.click('[aria-label="Adicionar resposta em Glúteos Perfeitos"]');
        await page.waitForSelector('#saved-reply-category');
        assert.equal(await page.$eval('#saved-reply-category', el => el.value), 'campaign');
        await clickText(page, 'Cancelar');
        await page.click('[aria-label="Voltar para respostas rápidas"]');
        await page.waitForSelector(titleButton('greeting'));
        await page.click(titleButton('greeting'));
        await page.click('[aria-label="Mais ações de Saudação"]');
        await clickText(page, 'Excluir resposta', '[role="menuitem"]');
        await visibleElement(page, 'h3', 'Excluir resposta rápida');
        await clickText(page, 'Cancelar', 'button');
        await page.waitForFunction(() => ![...document.querySelectorAll('h3')].some(el => el.textContent === 'Excluir resposta rápida'));
        assert.ok(replies.some(reply => reply.id === 'greeting'), 'cancelar exclusão preserva texto');
        await page.click('[aria-label="Mais ações de Saudação"]');
        await clickText(page, 'Excluir resposta', '[role="menuitem"]');
        await clickText(page, 'Excluir', 'button');
        await page.waitForSelector(row('greeting'), { hidden: true });
        assert.equal(replies.some(reply => reply.id === 'greeting'), false);
        await fit(page);
      }
      assert.ok(writes.every(call => call.path.startsWith('/api/whatsapp/saved-replies')), 'nenhum envio ou mutação fora da biblioteca');
      assert.deepEqual(errors, []);
      console.log(`OK ${label}`);
    } catch (err) {
      await page.screenshot({ path: join(output, `${label}-FALHA.png`) });
      console.error(await page.$$eval('[data-saved-reply-id]', rows => rows.map(el => ({ id: el.dataset.savedReplyId, transform: el.style.transform, height: el.getBoundingClientRect().height }))));
      console.error(JSON.stringify({ label, errors, calls, writes }));
      throw err;
    } finally {
      await page.close();
    }
  }
  console.log(JSON.stringify({ output, passed: selectedCases.length }));
} finally {
  await browser.close();
}
