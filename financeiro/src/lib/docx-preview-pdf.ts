/** Export only DOCX styles, never the app theme (html2canvas cannot parse lab/oklch). */
export async function generateDocxPreviewPdf(preview: HTMLElement): Promise<Blob> {
  const wrapper = preview.querySelector<HTMLElement>('.docx-preview-wrapper-wrapper');
  if (!wrapper?.querySelector('section.docx-preview-wrapper')) {
    throw new Error('A prévia do documento ainda não está pronta. Gere a prévia novamente.');
  }

  const [{ default: html2canvas }, { PDFDocument }] = await Promise.all([
    import('html2canvas'), import('pdf-lib'),
  ]);
  const frame = document.createElement('iframe');
  frame.title = 'Exportação temporária do contrato';
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;left:-100000px;top:0;width:1200px;height:1600px;border:0;pointer-events:none;';
  document.body.appendChild(frame);
  // html2canvas measures fonts in the host document even when its source is inside an iframe.
  // Target only its invisible measuring div; Tailwind's block images otherwise shift every baseline.
  const metricStyle = document.createElement('style');
  metricStyle.textContent = `
    body > div[style*="visibility: hidden"][style*="white-space: nowrap"] { line-height:normal !important; }
    body > div[style*="visibility: hidden"][style*="white-space: nowrap"] img { display:inline !important; max-width:none !important; }
  `;
  document.head.appendChild(metricStyle);

  try {
    const target = frame.contentDocument;
    if (!target) throw new Error('Não foi possível preparar o PDF neste navegador.');
    // Match html2canvas's standards-mode clone; quirks mode changes line heights and crop positions.
    target.open();
    target.write('<!doctype html><html><head></head><body></body></html>');
    target.close();
    // docx-preview puts its styles beside the wrapper, not inside each page.
    for (const style of preview.querySelectorAll('style')) target.head.appendChild(style.cloneNode(true));
    const cleanStyle = target.createElement('style');
    cleanStyle.textContent = `
      html, body { margin:0; padding:0; background:#fff; color:#000; color-scheme:light; }
      .docx-preview-wrapper-wrapper { background:#fff; padding:0; display:block; }
      section.docx-preview-wrapper { margin:0 !important; box-shadow:none !important; }
    `;
    target.head.appendChild(cleanStyle);
    target.body.appendChild(wrapper.cloneNode(true));
    await withTimeout(target.fonts.ready, 15000);
    await Promise.all(Array.from(target.images, image => withTimeout(image.decode(), 15000)));

    const pages = target.querySelectorAll<HTMLElement>('section.docx-preview-wrapper');
    const pdf = await PDFDocument.create();
    for (const page of pages) {
      const { width, height } = page.getBoundingClientRect();
      if (!width || !height) throw new Error('Uma página do contrato está vazia. Gere a prévia novamente.');
      const style = target.defaultView!.getComputedStyle(page);
      // docx-preview expands sections without explicit Word breaks; min-height retains the paper size.
      const paperHeight = parseFloat(style.minHeight) || height;
      const watermarks = [];
      for (const watermark of centeredWordWatermarks(page, paperHeight)) {
        const image = watermark.href.startsWith('data:image/png')
          ? await pdf.embedPng(watermark.href) : await pdf.embedJpg(watermark.href);
        watermarks.push({ ...watermark, image });
        watermark.element.style.visibility = 'hidden';
      }
      if (watermarks.length) page.style.backgroundColor = 'transparent';
      const slices = getPageSlices(page, paperHeight, parseFloat(style.paddingTop) || 0, parseFloat(style.paddingBottom) || 0);
      for (const slice of slices) {
        const canvas = await html2canvas(page, {
          scale: 2, useCORS: true, backgroundColor: watermarks.length ? null : '#ffffff', logging: false,
          y: slice.start, height: slice.height, width,
          windowWidth: Math.max(1200, Math.ceil(width)), windowHeight: Math.max(1600, Math.ceil(paperHeight)),
          scrollX: 0, scrollY: 0,
        });
        // A bounded canvas per physical page also works on memory-constrained phones.
        const image = await pdf.embedPng(canvas.toDataURL('image/png'));
        const outputPage = pdf.addPage([width * 72 / 96, paperHeight * 72 / 96]);
        for (const watermark of watermarks) {
          outputPage.drawImage(watermark.image, {
            x: watermark.x * 72 / 96, y: (paperHeight - watermark.y - watermark.height) * 72 / 96,
            width: watermark.width * 72 / 96, height: watermark.height * 72 / 96,
          });
        }
        outputPage.drawImage(image, { x: 0, y: (paperHeight - slice.top - slice.height) * 72 / 96, width: width * 72 / 96, height: slice.height * 72 / 96 });
        canvas.width = canvas.height = 0;
      }
    }
    return new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' });
  } finally {
    metricStyle.remove();
    frame.remove();
  }
}

function centeredWordWatermarks(page: HTMLElement, paperHeight: number) {
  const style = page.ownerDocument.defaultView!.getComputedStyle(page);
  const width = page.getBoundingClientRect().width;
  const number = (value: string) => parseFloat(value) || 0;
  const watermarks = [];
  for (const element of page.querySelectorAll<SVGSVGElement>(':scope > header svg')) {
    const vml = element.getAttribute('style') || '';
    const source = element.querySelector('image')?.getAttribute('href') || '';
    const encoded = /^data:[^,]*;base64,(.+)$/.exec(source)?.[1];
    // JSZip's Blob has a generic MIME type; identify the actual image without changing its bytes.
    const format = encoded?.startsWith('iVBORw0KGgo') ? 'png' : encoded?.startsWith('/9j/') ? 'jpeg' : null;
    if (!/z-index\s*:\s*-/.test(vml) || !/mso-position-horizontal\s*:\s*center/.test(vml) || !/mso-position-vertical\s*:\s*center/.test(vml)
      || !/mso-position-horizontal-relative\s*:\s*(margin|page)(?:;|$)/.test(vml)
      || !/mso-position-vertical-relative\s*:\s*(margin|page)(?:;|$)/.test(vml)
      || element.children.length !== 1 || element.firstElementChild?.tagName !== 'image' || !format) continue;
    const href = `data:image/${format};base64,${encoded}`;
    // Browsers ignore Word's VML centering. Keep the original image/size, centered on every physical sheet.
    const rect = element.getBoundingClientRect();
    const horizontalMargins = /mso-position-horizontal-relative\s*:\s*margin/.test(vml);
    const verticalMargins = /mso-position-vertical-relative\s*:\s*margin/.test(vml);
    const x = (width + (horizontalMargins ? number(style.paddingLeft) - number(style.paddingRight) : 0) - rect.width) / 2;
    const y = (paperHeight + (verticalMargins ? number(style.paddingTop) - number(style.paddingBottom) : 0) - rect.height) / 2;
    watermarks.push({ element, href, x, y, width: rect.width, height: rect.height });
  }
  return watermarks;
}

function getPageSlices(page: HTMLElement, paperHeight: number, top: number, bottom: number) {
  const bounds = page.getBoundingClientRect();
  if (bounds.height <= paperHeight + 1) return [{ start: 0, height: Math.min(bounds.height, paperHeight), top: 0 }];
  const protectedLines: { top: number; bottom: number }[] = [];
  const walker = page.ownerDocument.createTreeWalker(page, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!node.textContent?.trim()) continue;
    const range = page.ownerDocument.createRange();
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      if (rect.height && rect.width) protectedLines.push({ top: rect.top - bounds.top, bottom: rect.bottom - bounds.top });
    }
  }
  for (const image of page.querySelectorAll('img,svg,canvas')) {
    const rect = image.getBoundingClientRect();
    // Word can render full-sheet decorations as oversized SVGs, which must be allowed to span pages.
    if (rect.height && rect.height <= paperHeight - top - bottom) {
      protectedLines.push({ top: rect.top - bounds.top, bottom: rect.bottom - bounds.top });
    }
  }
  const slices: { start: number; height: number; top: number }[] = [];
  const end = bounds.height - bottom;
  let start = 0;
  while (start < end) {
    const outputTop = slices.length ? top : 0;
    let cut = Math.min(end, start + paperHeight - outputTop - bottom);
    // Move a page break up into whitespace, never through glyphs or a signature image.
    let crossing;
    while ((crossing = protectedLines.find(line => line.top < cut && line.bottom > cut))) cut = Math.floor(crossing.top);
    if (cut <= start) throw new Error('Um elemento do contrato ultrapassa a altura da folha. Revise o modelo ou baixe o DOCX.');
    slices.push({ start, height: cut - start, top: outputTop });
    start = cut;
  }
  return slices;
}

async function withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Uma fonte ou imagem do contrato não carregou. Tente novamente.')), timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function downloadDocumentBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking synchronously can cancel the download on Safari/mobile browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
