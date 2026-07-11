import { PDFDocument, StandardFonts } from 'pdf-lib';

/* ──────────── HTML to Plain Text (preserves paragraph structure) ──────────── */
export function htmlToPlainText(html: string): string {
  let text = html;
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<hr\s*\/?[^>]*>/gi, '\n---\n');
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article)>/gi, '\n');
  text = text.replace(/<(p|div|h[1-6]|li|tr|blockquote|section|article|table|thead|tbody)[^>]*>/gi, '\n');
  text = text.replace(/<[^>]*>/g, '');
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&mdash;/g, '—');
  text = text.replace(/&ndash;/g, '–');
  text = text.split('\n').map(l => l.trim()).join('\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

/* ──────────── Structured HTML Parser for PDF ──────────── */
export interface PdfBlock {
  text: string;
  bold: boolean;
  centered: boolean;
  isHr: boolean;
  isBlank: boolean;
  isHeading: boolean;
}

export function htmlToStructuredBlocks(html: string): PdfBlock[] {
  const blocks: PdfBlock[] = [];
  
  // Split by block-level elements
  // First, normalize <br> to placeholder
  let h = html.replace(/<br\s*\/?>/gi, '\n');
  
  // Extract blocks from HTML by matching block-level elements
  const blockRegex = /<(h[1-6]|p|div|hr|li|tr)([^>]*)>([\s\S]*?)<\/\1>|<hr[^>]*\/?>/gi;
  let match;
  let lastIndex = 0;
  
  while ((match = blockRegex.exec(h)) !== null) {
    // Check for text between matches
    if (match.index > lastIndex) {
      const between = h.slice(lastIndex, match.index).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
      if (between) {
        blocks.push({ text: between, bold: false, centered: false, isHr: false, isBlank: false, isHeading: false });
      }
    }
    lastIndex = match.index + match[0].length;
    
    // HR tag
    if (match[0].match(/^<hr/i)) {
      blocks.push({ text: '', bold: false, centered: false, isHr: true, isBlank: false, isHeading: false });
      continue;
    }
    
    const tag = (match[1] || '').toLowerCase();
    const attrs = match[2] || '';
    let content = match[3] || '';
    
    // Detect centering
    const centered = /text-align:\s*center/i.test(attrs);
    
    // Detect if heading
    const isHeading = tag.startsWith('h');
    
    // Detect bold: heading tags, or content is entirely wrapped in <strong>/<b>
    const contentStripped = content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    const isBoldContent = isHeading || 
      /^<(strong|b)>[\s\S]*<\/(strong|b)>$/i.test(content.trim()) ||
      /^<(strong|b)\s[^>]*>[\s\S]*<\/(strong|b)>$/i.test(content.trim());
    
    // Strip inline tags
    content = content.replace(/<[^>]*>/g, '');
    // Decode entities
    content = content.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&mdash;/g, '—').replace(/&ndash;/g, '–');
    content = content.trim();
    
    if (!content && !isHeading) {
      blocks.push({ text: '', bold: false, centered: false, isHr: false, isBlank: true, isHeading: false });
      continue;
    }
    
    blocks.push({
      text: content || contentStripped,
      bold: isBoldContent,
      centered,
      isHr: false,
      isBlank: false,
      isHeading,
    });
  }
  
  // Remaining text after last match
  if (lastIndex < h.length) {
    const remaining = h.slice(lastIndex).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (remaining) {
      // Split by newlines for remaining text
      for (const line of remaining.split('\n')) {
        const t = line.trim();
        if (t === '---') {
          blocks.push({ text: '', bold: false, centered: false, isHr: true, isBlank: false, isHeading: false });
        } else if (t) {
          blocks.push({ text: t, bold: false, centered: false, isHr: false, isBlank: false, isHeading: false });
        }
      }
    }
  }
  
  // Also detect --- in existing blocks
  return blocks.map(b => {
    if (b.text === '---' && !b.isHr) return { ...b, text: '', isHr: true };
    return b;
  });
}

/* ──────────── Font Detection from HTML ──────────── */
export function detectFontFromHtml(html: string): string | null {
  // Detect <font face="..."> tags (created by document.execCommand('fontName'))
  const fontFaceMatch = html.match(/<font[^>]+face=["']([^"']+)["']/i);
  if (fontFaceMatch) return fontFaceMatch[1].split(',')[0].replace(/'/g, '').trim();
  // Detect font-family in inline styles
  const fontFamilyMatch = html.match(/font-family:\s*["']?([^"';,]+)/i);
  if (fontFamilyMatch) return fontFamilyMatch[1].replace(/'/g, '').trim();
  return null;
}

/* ──────────── Font Loading for PDF ──────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadFontForPdf(doc: any, fontName: string | null): Promise<{ regular: any; bold: any }> {
  const key = (fontName || 'arial').toLowerCase().trim();
  
  // Map standard system fonts to pdf-lib StandardFonts
  try {
    if (key.includes('courier')) {
      return {
        regular: await doc.embedFont(StandardFonts.Courier),
        bold: await doc.embedFont(StandardFonts.CourierBold),
      };
    }
    if (key.includes('times') || key.includes('georgia')) {
      return {
        regular: await doc.embedFont(StandardFonts.TimesRoman),
        bold: await doc.embedFont(StandardFonts.TimesRomanBold),
      };
    }
    if (key.includes('arial') || key.includes('helvetica')) {
      return {
        regular: await doc.embedFont(StandardFonts.Helvetica),
        bold: await doc.embedFont(StandardFonts.HelveticaBold),
      };
    }
  } catch (err) {
    console.warn('Failed to load standard font:', key, err);
  }
  
  // Try to fetch Google Font
  if (fontName) {
    try {
      const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;700&display=swap`;
      const cssRes = await fetch(cssUrl);
      if (cssRes.ok) {
        const css = await cssRes.text();
        // Extract font file URLs
        const urlMatches = [...css.matchAll(/url\(([^)]+)\)\s+format\(['"]?(woff2|truetype|opentype)['"]?\)/g)];
        if (urlMatches.length > 0) {
          // For woff2: pdf-lib doesn't support woff2 directly, so fall back to Helvetica
          // Check if there are truetype/opentype URLs
          const ttfUrls = urlMatches.filter(m => m[2] === 'truetype' || m[2] === 'opentype');
          if (ttfUrls.length > 0) {
            const regularBytes = await fetch(ttfUrls[0][1]).then(r => r.arrayBuffer());
            const regular = await doc.embedFont(new Uint8Array(regularBytes));
            let bold = regular;
            if (ttfUrls.length > 1) {
              try {
                const boldBytes = await fetch(ttfUrls[1][1]).then(r => r.arrayBuffer());
                bold = await doc.embedFont(new Uint8Array(boldBytes));
              } catch { /* use regular */ }
            }
            return { regular, bold };
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load Google Font for PDF:', fontName, err);
    }
  }
  
  // Fallback to Helvetica
  return {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
}

/* ──────────── PDF Background Generation (html2canvas approach) ──────────── */
export async function generatePdfWithBackground(backgroundBase64: string, htmlContent: string, _fontFamily?: string | null): Promise<Uint8Array> {
  const html2canvas = (await import('html2canvas')).default;

  // Decode background PDF
  const bgBinary = atob(backgroundBase64);
  const bgBytes = new Uint8Array(bgBinary.length);
  for (let i = 0; i < bgBinary.length; i++) bgBytes[i] = bgBinary.charCodeAt(i);
  const bgDoc = await PDFDocument.load(bgBytes);
  
  // Get background page dimensions (in PDF points, 72 dpi)
  const bgPage = bgDoc.getPages()[0];
  const { width: pdfW, height: pdfH } = bgPage.getSize();
  
  // Text area margins — avoid logo at top and wave at bottom
  const marginTop = 135;
  const marginBottom = 120;
  const marginLeft = 60;
  const marginRight = 60;
  const contentW = pdfW - marginLeft - marginRight;
  const contentH = pdfH - marginTop - marginBottom;
  
  // Scale factor: render at 2x for crisp text
  const scale = 2;
  const renderWidthPx = Math.round(contentW * scale);
  const maxPageHeightPx = Math.round(contentH * scale);
  // Safety buffer: keep text clear of the bottom edge (wave area)
  const safetyBuffer = 25;
  
  // ── Step 1: Render full HTML offscreen ONCE ──
  const renderDiv = document.createElement('div');
  renderDiv.style.cssText = `
    position: fixed; left: -9999px; top: 0;
    width: ${renderWidthPx}px;
    font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
    font-size: ${9.5 * scale}px;
    line-height: 1.5;
    color: #1a1a1a;
    padding: 0;
    z-index: -1;
  `;
  renderDiv.innerHTML = htmlContent;
  document.body.appendChild(renderDiv);
  await new Promise(r => setTimeout(r, 200));
  
  const totalHeight = renderDiv.scrollHeight;

  // ── Step 1.5: Find explicit forced page breaks ──
  const forcedBreaks: number[] = [];
  const parentTop = renderDiv.getBoundingClientRect().top;
  
  // Custom tokens might insert this marker to force a new page
  renderDiv.querySelectorAll('[data-page-break="true"]').forEach(el => {
    const y = Math.round(el.getBoundingClientRect().top - parentTop);
    if (y > 0) forcedBreaks.push(y);
  });
  forcedBreaks.sort((a, b) => a - b);
  
  // ── Step 2: Capture FULL content OFFSCREEN ONCE ──
  // We do this FIRST so we can physically analyze the pixels to find 100% safe break points (whitespace).
  const fullCanvas = await html2canvas(renderDiv, {
    backgroundColor: null, // forces transparent background
    scale: 1, // Already scaled up via CSS
    useCORS: true,
    logging: false,
    width: renderWidthPx,
    height: totalHeight,
    windowWidth: renderWidthPx,
    windowHeight: totalHeight,
  });

  // ── Step 3: Find safe cut points via Pixel Analysis ──
  // Analyze the rendered canvas pixels. A safe cut point is any horizontal row
  // that is transparent or white (no dark ink from text or borders).
  const fullCtx = fullCanvas.getContext('2d');
  const imgData = fullCtx ? fullCtx.getImageData(0, 0, renderWidthPx, totalHeight).data : null;
  
  const isRowBlank = new Uint8Array(totalHeight);
  if (imgData) {
    for (let y = 0; y < totalHeight; y++) {
      let empty = true;
      const offset = y * renderWidthPx * 4;
      for (let x = 0; x < renderWidthPx; x++) {
        const r = imgData[offset + x * 4];
        const g = imgData[offset + x * 4 + 1];
        const b = imgData[offset + x * 4 + 2];
        const a = imgData[offset + x * 4 + 3];
        
        // Pixel has ink if it's not mostly transparent AND not very light/white
        if (a > 5 && (r < 245 || g < 245 || b < 245)) {
          empty = false;
          break;
        }
      }
      isRowBlank[y] = empty ? 1 : 0;
    }
  }

  // Calculate smart page break points
  const pageSlices: { start: number; end: number }[] = [];
  let currentStart = 0;
  
  while (currentStart < totalHeight) {
    const idealEnd = currentStart + maxPageHeightPx;
    
    if (idealEnd >= totalHeight) {
      pageSlices.push({ start: currentStart, end: totalHeight });
      break;
    }
    
    const safeEnd = idealEnd - safetyBuffer;
    let bestEnd = -1;
    
    // Check if there is an explicit forced break on this page
    const forcedBreak = forcedBreaks.find(y => y > currentStart + 10 && y <= idealEnd + 100);
    
    if (forcedBreak && forcedBreak <= idealEnd) {
      bestEnd = forcedBreak; // Cut exactly at the forced page break marker
    } else if (imgData) {
      // 1. Prefer a robust gap (at least 6 contiguous blank rows) to avoid chopping very close to descenders
      for (let y = safeEnd; y > currentStart + 40; y--) {
        let isRobustGap = true;
        for (let i = 0; i < 6; i++) {
          if (!isRowBlank[y - i]) {
            isRobustGap = false;
            break;
          }
        }
        if (isRobustGap) {
          bestEnd = y - 3; // Cut right in the middle of the gap
          break;
        }
      }
      
      // 2. If no robust gap, try any single blank row (better than cutting ink)
      if (bestEnd === -1) {
        for (let y = safeEnd; y > currentStart + 40; y--) {
          if (isRowBlank[y]) {
            bestEnd = y;
            break;
          }
        }
      }
    }
    
    // 3. Fallback if pixel scanner fails or no image data (hard cut)
    if (bestEnd === -1) {
      bestEnd = safeEnd;
    }
    
    pageSlices.push({ start: currentStart, end: bestEnd });
    currentStart = bestEnd;
  }

  const outDoc = await PDFDocument.create();
  
  for (const { start, end } of pageSlices) {
    const sliceHeight = end - start;
    
    // Create an offscreen canvas to hold just this slice
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = renderWidthPx;
    sliceCanvas.height = sliceHeight;
    const ctx = sliceCanvas.getContext('2d');
    
    // Check if context is available
    if (ctx) {
      // Draw the cropped portion from the master fullCanvas
      ctx.drawImage(
        fullCanvas,
        0, start, renderWidthPx, sliceHeight, // Source x, y, w, h
        0, 0, renderWidthPx, sliceHeight      // Destination x, y, w, h
      );
    }
    
    // Convert to PNG and embed into PDF
    const pngDataUrl = sliceCanvas.toDataURL('image/png', 1.0);
    const pngBase64 = pngDataUrl.split(',')[1];
    const pngImage = await outDoc.embedPng(pngBase64);
    
    // Copy background page and add content on top
    const [copiedPage] = await outDoc.copyPages(bgDoc, [0]);
    outDoc.addPage(copiedPage);
    const page = outDoc.getPages()[outDoc.getPageCount() - 1];
    
    // Calculate proportional height on PDF
    const pdfSliceHeight = contentH * (sliceHeight / maxPageHeightPx);
    
    // Draw at top of content area
    page.drawImage(pngImage, {
      x: marginLeft,
      y: marginBottom + contentH - pdfSliceHeight,
      width: contentW,
      height: pdfSliceHeight,
    });
  }
  
  document.body.removeChild(renderDiv);
  
  return await outDoc.save();
}
