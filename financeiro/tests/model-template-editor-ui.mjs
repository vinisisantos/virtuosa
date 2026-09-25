// Teste local com DOCX sintético; todas as APIs são interceptadas, sem acesso ao banco.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import PizZip from 'pizzip';

const origin = process.env.DOCS_UI_ORIGIN || 'http://127.0.0.1:3097';
assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);

const templateId = 'synthetic-future-contract';
const updatedAt = '2026-09-25T15:00:00.000Z';
const zip = new PizZip();
zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>');
zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
zip.file('word/_rels/document.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>');
zip.file('word/header1.xml', '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Virtuosa - modelo sintético</w:t></w:r></w:p></w:hdr>');
zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:r><w:t>Contrato para {{nome_contratada}}</w:t></w:r></w:p><w:p><w:r><w:t>Cláusula base do modelo.</w:t></w:r></w:p><w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:bottom="1134" w:left="720" w:right="720" w:header="708" w:footer="708"/></w:sectPr></w:body></w:document>');

const template = {
  id: templateId,
  name: 'Modelo sintético de contrato',
  category: 'contrato_trabalho',
  description: null,
  fields: [{ tag: 'nome_contratada', label: 'Nome contratada', type: 'text', required: true }],
  unit: 'SBC',
  fileType: 'docx',
  fileData: zip.generate({ type: 'base64' }),
  updatedAt,
};
const user = { id: 'synthetic-admin', name: 'Teste local', role: 'ADMINISTRADOR', unit: 'SBC', permissions: { admin: true, termos: true } };
const browser = await puppeteer.launch({ headless: true });

try {
  for (const width of [390, 430, 1440]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 1000, isMobile: width < 600, hasTouch: width < 600 });
    const updates = [];
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', async request => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) {
        if (url.origin === origin) await request.continue();
        else await request.abort();
        return;
      }
      let body = {}, status = 200;
      if (url.pathname === '/api/auth/me') body = { authenticated: true, user };
      if (url.pathname === `/api/docs/templates/${templateId}` && request.method() === 'GET') body = template;
      if (url.pathname === `/api/docs/templates/${templateId}` && request.method() === 'PUT') {
        updates.push(JSON.parse(request.postData()));
        body = { success: true };
      }
      await request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });

    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('virtuosa_user', JSON.stringify({ id: 'synthetic-admin', name: 'Teste local', role: 'ADMINISTRADOR', unit: 'SBC', permissions: { admin: true, termos: true } }));
      localStorage.setItem('virtuosa_global_unit', 'SBC');
    });
    await page.goto(`${origin}/docs/modelos/${templateId}`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction(() => document.body.textContent.includes('Editar modelo: Modelo sintético de contrato'));
    await page.waitForFunction(() => document.querySelector('section.docx-preview-wrapper'));
    await page.waitForFunction(() => document.querySelectorAll('input[type="number"]').length === 4);
    assert.equal(await page.$$eval('button', buttons => buttons.find(button => button.textContent.includes('Salvar para próximas gerações')).disabled), true, 'não permite salvar modelo sem alterações aplicadas');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `modelo sem overflow em ${width}px`);
    const firstLine = await page.$eval('.template-editor-preview', container => {
      const page = container.querySelector('section.docx-preview-wrapper');
      const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode()) && !node.textContent?.trim()) {}
      const range = document.createRange();
      range.selectNodeContents(node);
      const textLeft = range.getBoundingClientRect().left;
      const bounds = container.getBoundingClientRect();
      return { textLeft, viewportLeft: bounds.left, viewportRight: bounds.right };
    });
    assert.ok(firstLine.textLeft >= firstLine.viewportLeft - 1 && firstLine.textLeft < firstLine.viewportRight, `primeira linha do DOCX começa visível na prévia em ${width}px: ${JSON.stringify(firstLine)}`);
    await page.screenshot({ path: `/tmp/model-template-editor-${width}.png` });

    await page.$$eval('input[type="number"]', inputs => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(inputs[2], '30');
      inputs[2].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[2].dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => [...document.querySelectorAll('input[type="number"]')][2]?.value === '30');
    const clause = await page.$('#model-paragraph-1');
    assert.ok(clause, 'texto do modelo disponível para edição');
    await page.$eval('#model-paragraph-1', field => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(field, 'Cláusula revisada para próximas gerações.');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Aplicar e conferir')).click());
    await page.waitForFunction(() => [...document.querySelectorAll('section.docx-preview-wrapper')].some(section => section.textContent.includes('Cláusula revisada para próximas gerações.')));
    await page.waitForFunction(() => document.querySelector('[data-contract-margin-guide]'));
    assert.equal(await page.$$eval('button', buttons => buttons.find(button => button.textContent.includes('Salvar para próximas gerações')).disabled), false, 'libera salvamento depois de conferir as mudanças aplicadas');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `prévia atualizada sem overflow em ${width}px`);
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Salvar para próximas gerações')).click());
    await page.waitForFunction(() => document.body.textContent.includes('Modelo atualizado. As próximas gerações usarão esta versão.'), { timeout: 15000 }).catch(() => {});
    await page.waitForFunction(() => window.location.pathname === '/docs/modelos', { timeout: 15000 });
    assert.equal(updates.length, 1, 'modelo atualizado uma vez');
    assert.equal(updates[0].expectedUpdatedAt, updatedAt, 'salvamento usa controle otimista de versão');
    const updatedZip = new PizZip(Buffer.from(updates[0].fileData, 'base64'));
    const xml = updatedZip.file('word/document.xml').asText();
    assert.match(xml, /Cláusula revisada para próximas gerações/);
    assert.match(xml, /\{\{nome_contratada\}\}/, 'tag de mesclagem preservada');
    assert.match(xml, /w:left="1701"/, 'margem atualizada no template');
    assert.deepEqual(errors, [], 'sem erros de renderização');
    console.log(JSON.stringify({ width, noOverflow: true, tagPreserved: true, marginTwips: 1701, saved: true }));
    await page.close();
  }
} finally {
  await browser.close();
}
