// Navegador local: todas as APIs são interceptadas, sem leitura ou escrita no banco real.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import PizZip from 'pizzip';
import { validarLayoutContrato } from '../src/lib/contratos/validarLayoutContrato.ts';

const origin = process.env.DOCS_UI_ORIGIN || 'http://127.0.0.1:3097';
assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const templateId = '3873f67b-1d99-4876-a5ec-7057cbff1e24';
const zip = new PizZip();
zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>');
zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
zip.file('word/_rels/document.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>');
zip.file('word/header1.xml', '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Virtuosa</w:t></w:r></w:p></w:hdr>');
zip.file('word/footer1.xml', '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>SBC</w:t></w:r></w:p></w:ftr>');
zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:r><w:t>Contrato para {{nome_contratada}}</w:t></w:r></w:p><w:p><w:r><w:t>Texto editável.</w:t></w:r></w:p><w:sectPr><w:headerReference w:type="default" r:id="rId1"/><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:bottom="1134" w:left="720" w:right="720" w:header="708" w:footer="708"/></w:sectPr></w:body></w:document>');
const template = { id: templateId, name: 'Contrato esteticista SBC', category: 'contrato_trabalho', fileType: 'docx', fields: [{ tag: 'nome_contratada', label: 'Nome Contratada', type: 'text', required: true }], fileData: zip.generate({ type: 'base64' }) };

const browser = await puppeteer.launch({ headless: true });
try {
  for (const width of [390, 430, 1440]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 900, isMobile: width < 600, hasTouch: width < 600 });
    await page.evaluateOnNewDocument(() => {
      const originalAnchorClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.href.startsWith('blob:')) return;
        return originalAnchorClick.call(this);
      };
      const originalCreateObjectURL = URL.createObjectURL.bind(URL);
      URL.createObjectURL = blob => {
        if (blob?.type === 'application/pdf') window.__contractPdf = blob;
        return originalCreateObjectURL(blob);
      };
      localStorage.setItem('virtuosa_user', JSON.stringify({ id: 'test', name: 'Teste', role: 'ADMINISTRADOR', unit: 'SBC', permissions: { admin: true } }));
      localStorage.setItem('virtuosa_global_unit', 'SBC');
    });
    const writes = [];
    const pdfRequests = [];
    await page.setRequestInterception(true);
    page.on('request', async request => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) return request.continue();
      let body = {}, status = 200;
      if (url.pathname === '/api/auth/me') body = { authenticated: true, user: { id: 'test', name: 'Teste', role: 'ADMINISTRADOR', unit: 'SBC', permissions: { admin: true } } };
      if (url.pathname === '/api/docs/templates') body = [template];
      if (url.pathname === `/api/docs/templates/${templateId}`) body = template;
      if (url.pathname === '/api/docs/generated' && request.method() === 'POST') {
        writes.push(JSON.parse(request.postData()));
        body = { id: 'synthetic-saved' };
        status = 201;
      }
      if (url.pathname === '/api/docs/convert-pdf') pdfRequests.push(request.url());
      await request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(`${origin}/docs/gerar`, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Contrato esteticista SBC')));
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Contrato esteticista SBC')).click());
    const input = 'input[placeholder="Insira nome contratada"]';
    await page.waitForSelector(input);
    await page.type(input, 'A'.repeat(101));
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Gerar Preview')).click());
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent?.includes('máximo 100'));
    assert.equal(writes.length, 0);
    await page.$eval(input, node => { node.value = ''; node.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.click(input, { clickCount: 3 });
    await page.type(input, 'Pessoa Teste');
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Gerar Preview')).click());
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Editar texto')));
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Editar texto')).click());
    await page.waitForSelector('textarea.doc-editor-textarea');
    await page.$eval('textarea.doc-editor-textarea', node => { node.value = 'Contrato para Pessoa Teste revisado.'; node.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Aplicar e conferir')).click());
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Salvar contrato')));
    assert.equal(await page.$eval('[role="alert"]', node => node.textContent).catch(() => ''), '');
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Salvar contrato')).click());
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Salvo no histórico')));
    assert.equal(writes.length, 1);
    await validarLayoutContrato(Buffer.from(writes[0].fileData, 'base64'));
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Baixar PDF') && !button.disabled));
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Baixar PDF')).click());
    await page.waitForFunction(() => window.__contractPdf?.size > 0);
    assert.ok(await page.evaluate(async () => {
      const bytes = new Uint8Array(await window.__contractPdf.arrayBuffer());
      return new TextDecoder().decode(bytes.slice(0, 4)) === '%PDF';
    }), 'PDF produzido no navegador a partir do DOCX validado');
    assert.deepEqual(pdfRequests, [], 'nenhum conversor remoto ou fila é chamado');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, `sem overflow em ${width}px`);
    console.log(JSON.stringify({ width, validated: true, saved: true, pdfLocal: true, overflow }));
    await page.close();
  }
} finally {
  await browser.close();
}
