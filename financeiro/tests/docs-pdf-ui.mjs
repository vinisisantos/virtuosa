// Local regression only: every API call is intercepted and the contracts are synthetic.
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import puppeteer from 'puppeteer';
import PizZip from 'pizzip';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

const origin = process.env.DOCS_UI_ORIGIN || 'http://127.0.0.1:3097';
assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const output = await mkdtemp(join(tmpdir(), 'docs-pdf-qa-'));
const formats = {
  A4: { width: 11906, height: 16838 },
  Letter: { width: 12240, height: 15840 },
};

function solidPinkPng() {
  const chunk = (type, data) => {
    const payload = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of payload) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, payload, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 128]))), chunk('IEND', Buffer.alloc(0))]);
}

async function assertPinkOnEveryPage(file, pageCount, directory) {
  const prefix = join(directory, 'watermark-render');
  await promisify(execFile)('pdftoppm', ['-scale-to', '600', '-png', file, prefix]);
  for (let page = 1; page <= pageCount; page++) {
    const rgb = await sharp(`${prefix}-${page}.png`).removeAlpha().raw().toBuffer();
    let pixels = 0;
    for (let offset = 0; offset + 2 < rgb.length; offset += 3) {
      if (rgb[offset] > 230 && rgb[offset + 1] < 30 && rgb[offset + 2] > 100 && rgb[offset + 2] < 160) pixels++;
    }
    assert.ok(pixels > 500, `folha ${page} contém a marca VML rosa visível, não ícone quebrado ou imagem coberta`);
  }
}

function syntheticTemplate(format, flowing = false, withImage = false) {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${withImage ? '<Default Extension="png" ContentType="image/png"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : ''}</Types>`);
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const para = text => `<w:p><w:r><w:rPr><w:rFonts w:ascii="Courier New"/><w:sz w:val="23"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  const size = formats[format];
  if (withImage) {
    zip.file('word/media/mark.png', solidPinkPng());
    zip.file('word/_rels/document.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>');
    zip.file('word/_rels/header1.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdMark" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/mark.png"/></Relationships>');
    zip.file('word/header1.xml', '<?xml version="1.0"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:p><w:r><w:pict><v:shape id="SyntheticPinkMark" style="position:absolute;width:90pt;height:30pt;z-index:-1;mso-position-horizontal:center;mso-position-horizontal-relative:margin;mso-position-vertical:center;mso-position-vertical-relative:margin"><v:imagedata r:id="rIdMark"/></v:shape></w:pict></w:r></w:p></w:hdr>');
  }
  const contractBody = flowing
    ? Array.from({ length: 55 }, (_, i) => para(`Cláusula contínua ${String(i + 1).padStart(2, '0')}: não há quebra manual no arquivo. Todas as linhas, acentos e condições devem aparecer integralmente no PDF.`)).join('')
    : `${Array.from({ length: 8 }, (_, i) => para(`Cláusula de teste ${i + 1}: o conteúdo desta primeira página deve permanecer legível e completo.`)).join('')}<w:p><w:r><w:br w:type="page"/></w:r></w:p>${para('PÁGINA 2 - CONTEÚDO FINAL DO TESTE')}${Array.from({ length: 8 }, (_, i) => para(`Condição de teste ${i + 1}: verificar a segunda página, os acentos e a preservação da formatação.`)).join('')}`;
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${para('CONTRATO ESTETICISTA - TESTE SEM VALIDADE')}${para('{{razao_social_contratante}}')}${para('CNPJ {{cnpj_contratante}}')}${para('Texto de demonstração para conferir o download. Nenhuma contratação real.')}${contractBody}${para('FIM DO CONTRATO DE TESTE')}<w:sectPr>${withImage ? '<w:headerReference w:type="default" r:id="rIdHeader"/>' : ''}<w:pgSz w:w="${size.width}" w:h="${size.height}"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="360"/></w:sectPr></w:body></w:document>`);
  return {
    id: 'synthetic-contract', name: 'CONTRATO ESTETICISTA TESTE', category: 'contrato_trabalho',
    fields: [
      { tag: 'razao_social_contratante', label: 'Razão social contratante', type: 'text', required: true },
      { tag: 'cnpj_contratante', label: 'CNPJ contratante', type: 'cnpj', required: true },
    ],
    fileData: zip.generate({ type: 'base64' }),
  };
}

const browser = await puppeteer.launch({ headless: true });
const click = (page, text) => page.evaluate(text => {
  const button = [...document.querySelectorAll('button')].find(b => b.textContent.includes(text));
  if (!button || button.disabled) throw new Error(`Botão indisponível: ${text}`);
  button.click();
}, text);
const pdfFiles = async directory => (await readdir(directory)).filter(file => file.endsWith('.pdf'));
async function downloadedPdf(directory) {
  let files = [];
  for (let attempt = 0; attempt < 100; attempt++) {
    files = await pdfFiles(directory);
    if (files.length) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(files.length, 1, 'um único arquivo PDF por ação, mesmo com cliques repetidos');
  const file = join(directory, files[0]);
  return { file, pdf: await PDFDocument.load(await readFile(file)) };
}

function setupBrowserStorage(user, theme, trace = false, verifyCanvas = false) {
  localStorage.setItem('virtuosa_user', JSON.stringify(user));
  localStorage.setItem('virtuosa_global_unit', 'SCS');
  localStorage.setItem('virtuosa_theme', theme);
  window.__docsUiEvents = [];
  window.__docsPdfMarkers = [];
  if (trace || verifyCanvas) {
    const textCalls = [];
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...rest) {
      const matrix = this.getTransform();
      textCalls.push({ text, x, y, physicalY: y * matrix.d + matrix.f, canvasHeight: this.canvas.height });
      if (textCalls.length > 100) textCalls.shift();
      if (verifyCanvas && (text === 'FIM' || /^\d{2}:?$/.test(text))) {
        window.__docsPdfMarkers.push({ text: text.replace(':', ''), physicalY: y * matrix.d + matrix.f, canvasHeight: this.canvas.height });
      }
      return fillText.call(this, text, x, y, ...rest);
    };
    const toDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      if (trace && args[0] === 'image/png') {
        const document = window.document.querySelector('iframe[title="Exportação temporária do contrato"]')?.contentDocument;
        const page = document?.querySelector('section.docx-preview-wrapper');
        const last = [...(page?.querySelectorAll('p') || [])].at(-1);
        window.__docsUiEvents.push({ type: 'canvas-trace', width: this.width, height: this.height, lastText: textCalls.slice(-20), sectionHeight: page?.getBoundingClientRect().height, lastParagraphTop: last?.getBoundingClientRect().top, lastParagraphBottom: last?.getBoundingClientRect().bottom });
      }
      return toDataURL.apply(this, args);
    };
  }
  const createObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = blob => {
    if (blob?.type === 'application/pdf') window.__docsUiEvents.push({ type: 'pdf-ready', size: blob.size });
    return createObjectURL(blob);
  };
}

async function triggerRepeatedDownload(page) {
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Baixar PDF'));
    if (!button || button.disabled) throw new Error('PDF ainda indisponível');
    button.click();
    button.click();
    button.click();
  });
}

async function injectConversionFailure(page) {
  await page.evaluate(() => {
    window.__docsFailConversion = true;
    const restores = [];
    const patched = new WeakSet();
    function patch(win) {
      const prototype = win?.HTMLCanvasElement?.prototype;
      if (!prototype || patched.has(prototype)) return;
      patched.add(prototype);
      const original = prototype.toDataURL;
      prototype.toDataURL = function (...args) {
        if (window.__docsFailConversion && args[0] === 'image/png') {
          window.__docsUiEvents.push({ type: 'conversion-failed' });
          throw new Error('Falha de conversão simulada no teste local');
        }
        return original.apply(this, args);
      };
      restores.push(() => { prototype.toDataURL = original; });
    }
    patch(window);
    const observer = new MutationObserver(() => {
      for (const iframe of document.querySelectorAll('iframe')) {
        try { patch(iframe.contentWindow); } catch { /* External frames are not test targets. */ }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.__docsRestoreConversion = () => {
      window.__docsFailConversion = false;
      observer.disconnect();
      restores.forEach(restore => restore());
    };
  });
}

try {
  const scenarios = process.env.DOCS_UI_REPRO
    ? [{ width: 1440, theme: 'dark', format: 'A4' }]
    : [...[390, 430, 1440].flatMap(width => ['light', 'dark'].map(theme => ({
      width, theme,
      format: width === 1440 ? 'Letter' : 'A4',
      failHistory: width === 430 && theme === 'light',
      failConversion: width === 390 && theme === 'dark',
      withImage: width === 430,
    }))),
    { width: 390, theme: 'dark', format: 'A4', flowing: true },
    { width: 1440, theme: 'light', format: 'A4', flowing: true },
    ];

  for (const scenario of scenarios.filter(scenario => !process.env.DOCS_UI_FLOW_ONLY || scenario.flowing)) {
    const { width, theme, format, failHistory, failConversion, flowing, withImage } = scenario;
    const key = `${width}-${theme}-${format}${flowing ? '-flowing' : ''}`;
    const downloadDir = await mkdtemp(join(output, `${key}-`));
    const template = syntheticTemplate(format, flowing, withImage);
    const page = await browser.newPage();
    await page.setViewport({ width, height: 1000, isMobile: width < 600, hasTouch: width < 600 });
    const client = await page.createCDPSession();
    await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
    const errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', async message => {
      if (message.type() === 'error') errors.push((await Promise.all(message.args().map(async arg => {
        try { return await arg.evaluate(value => value?.message || String(value)); } catch { return message.text(); }
      }))).join(' ') || message.text());
    });
    await page.setRequestInterception(true);
    const user = { id: 'docs-test', name: 'Teste local', role: 'ADMINISTRADOR', unit: 'SCS', permissions: { admin: true } };
    page.on('request', async request => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) {
        let data = {}, status = 200;
        if (url.pathname === '/api/auth/me') data = { authenticated: true, user };
        if (url.pathname === '/api/docs/templates') data = [template];
        if (url.pathname === `/api/docs/templates/${template.id}`) data = template;
        if (request.method() === 'POST') {
          const pdfReady = await page.evaluate(() => window.__docsUiEvents.some(event => event.type === 'pdf-ready'));
          writes.push({ path: url.pathname, body: JSON.parse(request.postData()), pdfReady });
          status = failHistory ? 500 : 201;
          data = failHistory ? { error: 'Falha simulada do histórico' } : { id: 'synthetic-record' };
        }
        await request.respond({ status, contentType: 'application/json', body: JSON.stringify(data) });
      } else if (url.origin === origin) await request.continue();
      else await request.abort();
    });
    await page.evaluateOnNewDocument(setupBrowserStorage, user, theme, Boolean(process.env.DOCS_UI_TRACE), Boolean(flowing));
    await page.goto(`${origin}/docs/gerar`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.evaluate(theme => {
      document.documentElement.dataset.theme = theme;
      document.documentElement.dataset.mode = theme;
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }, theme);
    await click(page, template.name);
    await page.waitForFunction(() => [...document.querySelectorAll('input')].some(input => input.value === '63.246.385/0001-91'));
    await click(page, 'Gerar Preview');
    await page.waitForFunction(count => document.querySelectorAll('section.docx-preview-wrapper').length === count, {}, flowing ? 1 : 2);
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Baixar PDF') && !button.disabled));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `sem overflow horizontal em ${key}`);
    await page.screenshot({ path: join(output, `${key}-preview.png`) });
    const previewBefore = await page.$$eval('section.docx-preview-wrapper', pages => pages.map(section => section.textContent));
    assert.ok(previewBefore[0].includes('CLINICA DE ESTETICA ALMEIDA RIBEIRO LTDA'));
    assert.ok(previewBefore.at(-1).includes('FIM DO CONTRATO DE TESTE'));
    if (withImage) assert.ok(await page.$$eval('section.docx-preview-wrapper svg image', images => images.length > 0 && images.every(image => /^data:[^,]*;base64,iVBORw0KGgo/.test(image.getAttribute('href') || ''))), 'imagem VML PNG deve ficar incorporada no SVG, mesmo com MIME genérico do JSZip');
    if (flowing) {
      assert.ok(previewBefore[0].includes('Cláusula contínua 55'), 'fixture longa completa, sem quebra explícita');
      assert.ok(await page.$eval('section.docx-preview-wrapper', section => section.getBoundingClientRect().height > 2 * parseFloat(getComputedStyle(section).minHeight)), 'fixture excede pelo menos duas folhas físicas');
    }

    if (process.env.DOCS_UI_REPRO) {
      await click(page, 'Baixar PDF');
      await page.waitForFunction(() => document.body.textContent.includes('PDF baixado com sucesso') || document.body.textContent.includes('Erro ao gerar PDF'), { timeout: 60000 });
      console.log(JSON.stringify({ key, errors, writes: writes.length }));
      await page.close();
      continue;
    }

    if (failConversion) {
      await injectConversionFailure(page);
      await triggerRepeatedDownload(page);
      await page.waitForFunction(() => window.__docsUiEvents.some(event => event.type === 'conversion-failed'), { timeout: 60000 });
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Baixar PDF') && !button.disabled));
      assert.equal(writes.length, 0, 'conversão falhada não cria histórico');
      assert.equal((await pdfFiles(downloadDir)).length, 0, 'conversão falhada não baixa arquivo incompleto');
      assert.deepEqual(await page.$$eval('section.docx-preview-wrapper', pages => pages.map(section => section.textContent)), previewBefore, 'falha preserva todas as páginas do preview');
      await page.screenshot({ path: join(output, `${key}-conversion-error.png`) });
      await page.evaluate(() => window.__docsRestoreConversion());
    }

    await triggerRepeatedDownload(page);
    await page.waitForFunction(() => window.__docsUiEvents.some(event => event.type === 'pdf-ready'), { timeout: 60000 });
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Baixar PDF') && !button.disabled), { timeout: 60000 });
    const { file, pdf } = await downloadedPdf(downloadDir);
    if (flowing) assert.ok(pdf.getPageCount() >= 3 && pdf.getPageCount() <= 6, 'DOCX contínuo é dividido em folhas físicas, sem página gigante ou páginas vazias extras');
    else assert.equal(pdf.getPageCount(), 2, 'exporta todas as páginas sem corte ou página em branco');
    for (const pdfPage of pdf.getPages()) {
      assert.ok(Math.abs(pdfPage.getWidth() - formats[format].width / 20) < 2, `largura original ${format}`);
      assert.ok(Math.abs(pdfPage.getHeight() - formats[format].height / 20) < 2, `altura original ${format}`);
    }
    if (flowing) {
      if (process.env.DOCS_UI_TRACE) console.log(JSON.stringify(await page.evaluate(() => ({ traces: window.__docsUiEvents.filter(event => event.type === 'canvas-trace'), markers: window.__docsPdfMarkers.filter(marker => marker.text === 'FIM') }))));
      const visibleMarkers = await page.evaluate(() => window.__docsPdfMarkers
        .filter(marker => marker.physicalY > 0 && marker.physicalY < marker.canvasHeight)
        .map(marker => marker.text));
      assert.ok(visibleMarkers.includes('FIM'), 'marcador final foi desenhado dentro de uma faixa, não fora do canvas');
      for (let clause = 1; clause <= 55; clause++) {
        assert.ok(visibleMarkers.includes(String(clause).padStart(2, '0')), `cláusula ${clause} foi desenhada dentro de alguma folha`);
      }
    }
    if (withImage) await assertPinkOnEveryPage(file, pdf.getPageCount(), downloadDir);
    assert.equal(writes.length, 1, 'cliques repetidos não duplicam registros');
    assert.equal(writes[0].path, '/api/docs/generated');
    assert.ok(writes[0].pdfReady, 'histórico só é registrado depois de disponibilizar o PDF');
    assert.equal(writes[0].body.filledData.cnpj_contratante, '63.246.385/0001-91');
    assert.equal(writes[0].body.unit, 'SCS');
    assert.deepEqual(await page.$$eval('section.docx-preview-wrapper', pages => pages.map(section => section.textContent)), previewBefore, 'download preserva preview para nova conferência');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `sem overflow após exportação ${key}`);
    if (failHistory) {
      assert.ok(await page.evaluate(() => /histórico/i.test(document.body.textContent)), 'falha do histórico é informada sem impedir o arquivo');
    }
    await page.screenshot({ path: join(output, `${key}-download.png`) });
    // Third-party assets (fonts/analytics) are deliberately blocked by request interception.
    const unexpectedErrors = errors.filter(error => !/Falha de conversão simulada|Falha simulada do histórico|histórico|500 \(Internal Server Error\)|net::ERR_FAILED/i.test(error));
    assert.deepEqual(unexpectedErrors, [], 'sem erros inesperados de renderização/conversão');
    console.log(JSON.stringify({ key, file, pages: pdf.getPageCount(), writes: writes.length, failHistory: Boolean(failHistory), retryAfterConversionError: Boolean(failConversion) }));
    if (process.env.DOCS_UI_TRACE) console.log(JSON.stringify(await page.evaluate(() => window.__docsUiEvents.filter(event => event.type === 'canvas-trace'))));
    await page.close();
  }
  console.log(output);
} finally {
  await browser.close();
}
