'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { DatePicker } from '@/components/date-picker';
import { LOGO_B64 } from '@/hooks/useCancelamento';
import mammoth from 'mammoth';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/* ──────────── HTML to Plain Text (preserves paragraph structure) ──────────── */
function htmlToPlainText(html: string): string {
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
interface PdfBlock {
  text: string;
  bold: boolean;
  centered: boolean;
  isHr: boolean;
  isBlank: boolean;
  isHeading: boolean;
}

function htmlToStructuredBlocks(html: string): PdfBlock[] {
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
function detectFontFromHtml(html: string): string | null {
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
async function loadFontForPdf(doc: any, fontName: string | null): Promise<{ regular: any; bold: any }> {
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

/* ──────────── PDF Background Generation ──────────── */
async function generatePdfWithBackground(backgroundBase64: string, htmlContent: string, fontFamily?: string | null): Promise<Uint8Array> {
  // Decode background PDF
  const bgBinary = atob(backgroundBase64);
  const bgBytes = new Uint8Array(bgBinary.length);
  for (let i = 0; i < bgBinary.length; i++) bgBytes[i] = bgBinary.charCodeAt(i);
  const bgDoc = await PDFDocument.load(bgBytes);
  
  // Create output PDF
  const outDoc = await PDFDocument.create();
  const { regular: font, bold: fontBold } = await loadFontForPdf(outDoc, fontFamily || null);
  
  // Get background page dimensions
  const bgPage = bgDoc.getPages()[0];
  const { width, height } = bgPage.getSize();
  
  // Text area margins (avoid logo at top, wave at bottom)
  const marginTop = 110;
  const marginBottom = 90;
  const marginLeft = 60;
  const marginRight = 60;
  const textWidth = width - marginLeft - marginRight;
  const fontSize = 9.5;
  const lineHeight = fontSize * 1.5;
  const headingSize = 11;
  
  // Parse HTML into structured blocks
  const blocks = htmlToStructuredBlocks(htmlContent);
  
  // Helper: wrap text into lines
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrapText = (text: string, f: any, size: number): string[] => {
    if (!text.trim()) return [''];
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = f.widthOfTextAtSize(testLine, size);
      if (testWidth > textWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines.length ? lines : [''];
  };
  
  // Render
  let currentY = height - marginTop;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let page: any = null;
  
  const addNewPage = async () => {
    const [copiedPage] = await outDoc.copyPages(bgDoc, [0]);
    outDoc.addPage(copiedPage);
    page = outDoc.getPages()[outDoc.getPageCount() - 1];
    currentY = height - marginTop;
  };
  
  const ensureSpace = async (needed: number) => {
    if (currentY - needed < marginBottom) await addNewPage();
  };
  
  await addNewPage();
  
  for (const block of blocks) {
    await ensureSpace(lineHeight * 2);
    
    // Horizontal rule
    if (block.isHr) {
      currentY -= lineHeight * 0.3;
      page.drawLine({
        start: { x: marginLeft, y: currentY },
        end: { x: width - marginRight, y: currentY },
        thickness: 0.5,
        color: rgb(0.6, 0.6, 0.6),
      });
      currentY -= lineHeight * 0.5;
      continue;
    }
    
    // Blank line (paragraph spacing)
    if (block.isBlank) {
      currentY -= lineHeight * 0.4;
      continue;
    }
    
    // Determine font and size
    const isHeading = block.isHeading || block.bold;
    const size = block.isHeading ? headingSize : fontSize;
    const f = isHeading ? fontBold : font;
    
    // Extra spacing before headings
    if (block.isHeading) currentY -= lineHeight * 0.3;
    
    // Wrap text
    const lines = wrapText(block.text, f, size);
    
    for (const line of lines) {
      await ensureSpace(lineHeight);
      if (line.trim() && page) {
        let x = marginLeft;
        if (block.centered) {
          const lineW = f.widthOfTextAtSize(line, size);
          x = marginLeft + (textWidth - lineW) / 2;
        }
        page.drawText(line, {
          x,
          y: currentY,
          size,
          font: f,
          color: rgb(0.1, 0.1, 0.1),
        });
      }
      currentY -= lineHeight;
    }
    
    // Small spacing after each block
    currentY -= lineHeight * 0.15;
  }
  
  return await outDoc.save();
}

/* ──────────── Types ──────────── */
interface DocTemplate {
  id: number; name: string; type: string; content: string;
  fileName?: string;
  fileBase64?: string;
  backgroundPdf?: string;
  backgroundPdfName?: string;
  active: boolean; createdAt: string; updatedAt: string;
}
interface GeneratedDoc {
  id: number; templateId: number; templateName: string;
  clientName: string; html: string; createdAt: string;
}

/* ──────────── Constants ──────────── */
const STORAGE_TEMPLATES = 'virtuosa_doc_templates';
const STORAGE_GENERATED = 'virtuosa_doc_generated';
const DOC_TYPES = ['Contrato de prestação de serviço', 'Termo de consentimento', 'Termo de responsabilidade', 'Termo personalizado'];

const EDITOR_FONTS = [
  // System fonts
  { name: 'Arial', family: 'Arial, sans-serif' },
  { name: 'Times New Roman', family: "'Times New Roman', serif" },
  { name: 'Courier New', family: "'Courier New', monospace" },
  { name: 'Georgia', family: 'Georgia, serif' },
  // Google Fonts - Sans-Serif
  { name: 'Inter', family: "'Inter', sans-serif" },
  { name: 'Roboto', family: "'Roboto', sans-serif" },
  { name: 'Open Sans', family: "'Open Sans', sans-serif" },
  { name: 'Lato', family: "'Lato', sans-serif" },
  { name: 'Montserrat', family: "'Montserrat', sans-serif" },
  { name: 'Poppins', family: "'Poppins', sans-serif" },
  { name: 'Nunito', family: "'Nunito', sans-serif" },
  { name: 'Noto Sans', family: "'Noto Sans', sans-serif" },
  { name: 'Raleway', family: "'Raleway', sans-serif" },
  { name: 'Oswald', family: "'Oswald', sans-serif" },
  { name: 'Ubuntu', family: "'Ubuntu', sans-serif" },
  { name: 'Quicksand', family: "'Quicksand', sans-serif" },
  { name: 'Cabin', family: "'Cabin', sans-serif" },
  { name: 'Source Sans 3', family: "'Source Sans 3', sans-serif" },
  // Google Fonts - Serif
  { name: 'Merriweather', family: "'Merriweather', serif" },
  { name: 'Playfair Display', family: "'Playfair Display', serif" },
  { name: 'PT Serif', family: "'PT Serif', serif" },
  { name: 'Crimson Text', family: "'Crimson Text', serif" },
  { name: 'EB Garamond', family: "'EB Garamond', serif" },
  { name: 'Cormorant Garamond', family: "'Cormorant Garamond', serif" },
  // Google Fonts - Handwriting / Display
  { name: 'Dancing Script', family: "'Dancing Script', cursive" },
  { name: 'Great Vibes', family: "'Great Vibes', cursive" },
];

const VARIABLES: { key: string; label: string; group: string }[] = [
  { key: 'nome_completo', label: 'Nome Completo', group: 'Cliente' },
  { key: 'cpf', label: 'CPF', group: 'Cliente' },
  { key: 'rg', label: 'RG', group: 'Cliente' },
  { key: 'data_nascimento', label: 'Data de Nascimento', group: 'Cliente' },
  { key: 'telefone', label: 'Telefone', group: 'Cliente' },
  { key: 'email', label: 'E-mail', group: 'Cliente' },
  { key: 'endereco_completo', label: 'Endereço Completo', group: 'Cliente' },
  { key: 'sexo', label: 'Sexo', group: 'Cliente' },
  { key: 'estado_civil', label: 'Estado Civil', group: 'Cliente' },
  { key: 'profissao', label: 'Profissão', group: 'Cliente' },
  { key: 'data_hoje', label: 'Data de Hoje', group: 'Sistema' },
  { key: 'nome_clinica', label: 'Nome da Clínica', group: 'Clínica' },
  { key: 'endereco_clinica', label: 'Endereço da Clínica', group: 'Clínica' },
  { key: 'cidade_clinica', label: 'Cidade da Clínica', group: 'Clínica' },
  { key: 'cnpj_clinica', label: 'CNPJ da Clínica', group: 'Clínica' },
  { key: 'subtotal_venda', label: 'Subtotal da Venda', group: 'Venda' },
  { key: 'valor_desconto', label: 'Valor de Desconto', group: 'Venda' },
  { key: 'total_venda', label: 'Total da Venda', group: 'Venda' },
  { key: 'condicoes_pagamento', label: 'Condições de Pagamento', group: 'Venda' },
  { key: 'data_venda', label: 'Data da Venda', group: 'Venda' },
  { key: 'itens_da_venda', label: 'Itens da Venda', group: 'Tabelas' },
  { key: 'condicoes_pagamento_venda', label: 'Condições de Pagamento da Venda', group: 'Tabelas' },
  { key: 'conselho_profissional', label: 'Conselho do Profissional', group: 'Profissional' },
  { key: 'nome_responsavel', label: 'Nome do Responsável', group: 'Profissional' },
  { key: 'documento_responsavel', label: 'Documento do Responsável', group: 'Profissional' },
  { key: 'nome_profissional', label: 'Nome do Profissional', group: 'Profissional' },
];

const TABLE_VARIABLES: Record<string, string> = {
  itens_da_venda: `<table style="width:100%;border-collapse:collapse;margin:8px 0 16px;font-size:0.9em"><thead><tr style="background:#f3f4f6;border-bottom:2px solid #e5e7eb"><th style="text-align:left;padding:10px 12px;font-weight:700">Item</th><th style="text-align:left;padding:10px 12px;font-weight:700">Quantidade</th><th style="text-align:left;padding:10px 12px;font-weight:700">Valor unitário (R$)</th><th style="text-align:left;padding:10px 12px;font-weight:700">Valor desconto unitário (R$)</th><th style="text-align:left;padding:10px 12px;font-weight:700">Total (R$)</th></tr></thead><tbody><tr style="border-bottom:1px solid #e5e7eb"><td style="padding:10px 12px">Consulta</td><td style="padding:10px 12px">1</td><td style="padding:10px 12px">250,00</td><td style="padding:10px 12px">0,00</td><td style="padding:10px 12px">250,00</td></tr><tr style="border-bottom:1px solid #e5e7eb"><td style="padding:10px 12px">Atendimento</td><td style="padding:10px 12px">1</td><td style="padding:10px 12px">150,00</td><td style="padding:10px 12px">0,00</td><td style="padding:10px 12px">150,00</td></tr></tbody></table>`,
  condicoes_pagamento_venda: `<table style="width:100%;border-collapse:collapse;margin:8px 0 16px;font-size:0.9em"><thead><tr style="background:#f3f4f6;border-bottom:2px solid #e5e7eb"><th style="text-align:left;padding:10px 12px;font-weight:700">Parcela</th><th style="text-align:left;padding:10px 12px;font-weight:700">Método de pagamento</th><th style="text-align:left;padding:10px 12px;font-weight:700">Valor (R$)</th><th style="text-align:left;padding:10px 12px;font-weight:700">Vencimento</th></tr></thead><tbody><tr style="border-bottom:1px solid #e5e7eb"><td style="padding:10px 12px">1</td><td style="padding:10px 12px">PIX</td><td style="padding:10px 12px">100,00</td><td style="padding:10px 12px">01/07/2025</td></tr><tr style="border-bottom:1px solid #e5e7eb"><td style="padding:10px 12px">2</td><td style="padding:10px 12px">PIX</td><td style="padding:10px 12px">100,00</td><td style="padding:10px 12px">01/08/2025</td></tr><tr style="border-bottom:1px solid #e5e7eb"><td style="padding:10px 12px">3</td><td style="padding:10px 12px">PIX</td><td style="padding:10px 12px">100,00</td><td style="padding:10px 12px">01/09/2025</td></tr><tr style="border-bottom:1px solid #e5e7eb"><td style="padding:10px 12px">4</td><td style="padding:10px 12px">PIX</td><td style="padding:10px 12px">100,00</td><td style="padding:10px 12px">01/10/2025</td></tr></tbody></table>`,
};

const VAR_GROUPS = [...new Set(VARIABLES.map(v => v.group))];

/* ──────────── Unit Profiles ──────────── */
const UNIT_PROFILES: Record<string, { nome_clinica: string; endereco_clinica: string; cidade_clinica: string; cnpj_clinica: string }> = {
  Barueri: {
    nome_clinica: 'Virtuosa Barueri',
    endereco_clinica: 'Av. Vinte e Seis de Março, 701 - Térreo - Centro, Barueri - SP, 06401-050',
    cidade_clinica: 'Barueri - SP',
    cnpj_clinica: '63.676.273/0001-70',
  },
  SBC: {
    nome_clinica: 'Virtuosa São Bernardo',
    endereco_clinica: 'Av. das Nações Unidas, 30 - Jardim do Mar, São Bernardo do Campo - SP, 09726-110',
    cidade_clinica: 'São Bernardo do Campo - SP',
    cnpj_clinica: '55.176.726/0001-71',
  },
  Osasco: {
    nome_clinica: 'Virtuosa Osasco',
    endereco_clinica: 'Rua Eloy Candido Lopes, 61 - Centro, Osasco - SP, 06010-130',
    cidade_clinica: 'Osasco - SP',
    cnpj_clinica: '51.590.266/0001-72',
  },
  SCS: {
    nome_clinica: '',
    endereco_clinica: '',
    cidade_clinica: '',
    cnpj_clinica: '',
  },
};

/* ──────────── Default Contract Template ──────────── */
const V = (key: string) => `<span contenteditable="false" style="background:linear-gradient(135deg,rgba(139,92,246,0.15),rgba(139,92,246,0.06));color:#8b5cf6;padding:2px 8px;border-radius:6px;font-weight:700;font-size:0.85em;border:1px solid rgba(139,92,246,0.2);cursor:default;white-space:nowrap;display:inline-block;margin:0 2px" data-var="${key}">{{${key}}}</span>`;

const DEFAULT_CONTRACT_HTML = `
<div style="display:flex;align-items:center;border-left:4px solid #f472b6;padding-left:16px;margin-bottom:24px">
  <img src="\${LOGO_B64}" alt="Virtuosa Clínica Estética" style="height:60px" />
</div>

<h2 style="text-align:center;margin-bottom:4px;font-family:Arial,sans-serif"><strong>CONTRATO DE PRESTAÇÃO DE SERVIÇOS – CONSULTA DE AVALIAÇÃO</strong></h2>
<hr style="border:none;border-top:2px solid #e5e7eb;margin:16px 0">

<p style="font-family:Arial,sans-serif">Pelo presente instrumento particular de contrato de prestação de serviços, de um lado:</p>

<p style="font-family:Arial,sans-serif"><strong>CONTRATANTE:</strong> \${V('nome_completo')}, \${V('estado_civil')}, \${V('profissao')}, portador(a) do CPF nº \${V('cpf')} e RG nº \${V('rg')}, residente e domiciliado(a) à \${V('endereco_completo')};</p>

<p style="font-family:Arial,sans-serif">E de outro lado:</p>

<p style="font-family:Arial,sans-serif"><strong>CONTRATADA:</strong> \${V('nome_clinica')}, inscrito(a) no CPF/CNPJ sob nº \${V('cnpj_clinica')}, com endereço à \${V('endereco_clinica')}, doravante denominado(a) <strong>PRESTADOR(A)</strong>,</p>

<p style="font-family:Arial,sans-serif">Celebram entre si o presente contrato de prestação de serviços, que será regido pelas cláusulas e condições seguintes:</p>

<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">

<h3 style="font-family:Arial,sans-serif"><strong>CLÁUSULA 1 – OBJETO DO CONTRATO</strong></h3>

<p style="font-family:Arial,sans-serif">O presente contrato tem por objeto a <strong>prestação de serviços clínicos estéticos</strong> pela <strong>CONTRATADA</strong> diretamente ao <strong>CONTRATANTE</strong>, de acordo com os prazos, preços e condições ajustados neste instrumento.</p>

<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">

<h3 style="font-family:Arial,sans-serif"><strong>CLÁUSULA 2 – VALOR E FORMA DE PAGAMENTO</strong></h3>

<p style="font-family:Arial,sans-serif">Os serviços e itens deste contrato, juntamente com seus respectivos valores, estão detalhados na tabela a seguir:</p>

<p style="font-family:Arial,sans-serif;margin-top:16px">Itens da venda</p>

\${V('itens_da_venda')}
\${TABLE_VARIABLES.itens_da_venda}

<p style="font-family:Arial,sans-serif">O pagamento será efetuado da seguinte forma, conforme acordado entre as partes:</p>

\${V('condicoes_pagamento_venda')}
\${TABLE_VARIABLES.condicoes_pagamento_venda}

<h3 style="font-family:Arial,sans-serif"><strong>CLÁUSULA 3 – PRAZO PARA REALIZAÇÃO</strong></h3>

<p style="font-family:Arial,sans-serif">Os serviços contratados deverão ser realizados integralmente dentro do prazo máximo de <strong>180 (cento e oitenta) dias</strong> contados da data da assinatura deste instrumento.</p>

<p style="font-family:Arial,sans-serif"><strong>Parágrafo Primeiro:</strong> Findo o prazo previsto no caput desta cláusula, a <strong>CONTRATADA</strong> não será obrigada a manter a continuidade da prestação dos serviços, visto que o tempo assinalado é plenamente suficiente para a execução dos procedimentos estéticos, inclusive com eventuais reagendamentos por parte do <strong>CONTRATANTE</strong>.</p>

<p style="font-family:Arial,sans-serif"><strong>Parágrafo Segundo:</strong> Caso a <strong>CONTRATADA</strong> realize qualquer procedimento após o prazo assinalado e sem a assinatura de novo instrumento contratual, tal ato será considerado de livre vontade, não caracterizando a conduta uma novação contratual ou renúncia a qualquer disposição constante deste contrato.</p>

<h3 style="font-family:Arial,sans-serif"><strong>CLÁUSULA 4 – RESCISÃO</strong></h3>

<p style="font-family:Arial,sans-serif">Na hipótese de desistência por iniciativa do <strong>CONTRATANTE</strong>, este obriga-se a comunicar a <strong>CONTRATADA</strong> por escrito.</p>

<p style="font-family:Arial,sans-serif"><strong>Parágrafo Primeiro – Direito de Arrependimento (Art. 49 do CDC)</strong><br>
O direito de arrependimento no prazo de 7 (sete) dias, com devolução integral dos valores pagos, somente será aplicável às contratações realizadas fora do estabelecimento comercial da <strong>CONTRATADA</strong>, tais como por telefone, internet ou outro meio remoto.<br>
Nas contratações realizadas <strong>presencialmente na clínica</strong>, não haverá direito de arrependimento previsto no art. 49 do CDC.</p>

<p style="font-family:Arial,sans-serif"><strong>Parágrafo Segundo – Cancelamento sem início das sessões</strong><br>
Na hipótese de desistência do <strong>CONTRATANTE</strong> em contrato firmado <strong>presencialmente</strong>, desde que nenhuma sessão tenha sido iniciada, será devida multa rescisória correspondente a <strong>10% (dez por cento) sobre o valor integral do contrato (sem desconto)</strong>.</p>

<p style="font-family:Arial,sans-serif"><strong>Parágrafo Terceiro – Cancelamento após início das sessões</strong><br>
Na hipótese de desistência do <strong>CONTRATANTE</strong> durante a <strong>execução dos serviços contratados</strong>, será devido à <strong>CONTRATADA</strong>:</p>

<p style="font-family:Arial,sans-serif">I – o pagamento integral das sessões já realizadas, calculadas pelo <strong>valor unitário cheio de tabela</strong>, independentemente de desconto concedido no pacote;</p>

<p style="font-family:Arial,sans-serif">II – multa compensatória de <strong>10% (dez por cento) sobre o valor remanescente do contrato</strong> (saldo referente às sessões não utilizadas), considerando sempre o valor integral do pacote (sem desconto).</p>

<p style="font-family:Arial,sans-serif"><strong>Parágrafo Quarto – Restituições, Comprovante e Condições Recíprocas</strong><br>
Os valores eventualmente já pagos pelo <strong>CONTRATANTE</strong> serão utilizados para abatimento das quantias devidas. Se houver saldo a favor da <strong>CONTRATADA</strong>, este deverá ser quitado pelo <strong>CONTRATANTE</strong> no ato do cancelamento. Se houver saldo a favor do <strong>CONTRATANTE</strong>, será restituído em até 30 (trinta) dias, <strong>exclusivamente pelo mesmo meio de pagamento original utilizado na contratação</strong>, ficando o prazo final de crédito sujeito às políticas da instituição financeira ou operadora de cartão.</p>

<p style="font-family:Arial,sans-serif">A <strong>CONTRATADA</strong> emitirá comprovante formal de cancelamento em até <strong>7 (sete) dias</strong> após a solicitação.</p>

<p style="font-family:Arial,sans-serif">Todas as condições previstas nesta cláusula aplicam-se também aos casos em que a rescisão seja realizada por iniciativa da <strong>CONTRATADA</strong>.</p>

<h3 style="font-family:Arial,sans-serif"><strong>CLÁUSULA 5 – REAGENDAMENTO</strong></h3>

<p style="font-family:Arial,sans-serif">O <strong>CONTRATANTE</strong> deverá comparecer pontualmente nos horários previamente agendados, sob pena de prejudicar o andamento dos atendimentos subsequentes.</p>

<p style="font-family:Arial,sans-serif"><strong>Parágrafo Primeiro</strong> – O reagendamento de sessões deverá ser solicitado com antecedência mínima de 12 (doze) horas, dentro do horário comercial da <strong>CONTRATADA</strong>.</p>

<p style="font-family:Arial,sans-serif"><strong>Parágrafo Segundo</strong> – O não comparecimento injustificado a qualquer sessão agendada implicará a dedução desta do saldo de sessões contratadas, não havendo direito à reposição.</p>

<p style="font-family:Arial,sans-serif"><strong>Parágrafo Terceiro</strong> – O <strong>CONTRATANTE</strong> poderá remarcar, no máximo, 3 (três) atendimentos durante a vigência do contrato.</p>

<p style="font-family:Arial,sans-serif"><strong>Parágrafo Quarto</strong> – O atraso superior a 10 (dez) minutos poderá impossibilitar a realização do atendimento, a critério da <strong>CONTRATADA</strong>, em razão da agenda subsequente, sendo a sessão considerada como realizada.</p>

<p style="font-family:Arial,sans-serif"><strong>Parágrafo Quinto</strong> – No caso de sessões de cortesia oferecidas pela <strong>CONTRATADA</strong>, a ausência do <strong>CONTRATANTE</strong> no horário agendado implicará a perda automática da sessão, que será considerada como realizada.</p>

<hr style="border:none;border-top:2px solid #e5e7eb;margin:24px 0">

<p style="text-align:center;font-family:Arial,sans-serif">E por estarem assim justas e contratadas, as partes assinam o presente instrumento em duas vias de igual teor e forma, na presença de duas testemunhas.</p>

<p style="text-align:center;font-family:Arial,sans-serif">\${V('cidade_clinica')}, \${V('data_hoje')}</p>

<br><br>

<div style="display:flex;justify-content:space-around;margin-top:40px;font-family:Arial,sans-serif">
<div style="text-align:center;min-width:250px">
<div style="border-top:1px solid #1a1a1a;padding-top:8px;font-weight:700">CONTRATANTE</div>
<div style="font-size:0.85em;color:#666;margin-top:4px">\${V('nome_completo')}</div>
<div style="font-size:0.8em;color:#888">CPF: \${V('cpf')}</div>
</div>
<div style="text-align:center;min-width:250px">
<div style="border-top:1px solid #1a1a1a;padding-top:8px;font-weight:700">CONTRATADA</div>
<div style="font-size:0.85em;color:#666;margin-top:4px">\${V('nome_clinica')}</div>
<div style="font-size:0.8em;color:#888">CNPJ: \${V('cnpj_clinica')}</div>
</div>
</div>

<br><br>

<div style="display:flex;justify-content:space-around;margin-top:30px;font-family:Arial,sans-serif">
<div style="text-align:center;min-width:250px">
<div style="border-top:1px solid #999;padding-top:8px;font-size:0.85em;color:#666">Testemunha 1</div>
<div style="font-size:0.8em;color:#888">Nome/CPF:</div>
</div>
<div style="text-align:center;min-width:250px">
<div style="border-top:1px solid #999;padding-top:8px;font-size:0.85em;color:#666">Testemunha 2</div>
<div style="font-size:0.8em;color:#888">Nome/CPF:</div>
</div>
</div>
`;

/* ──────────── Styles ──────────── */
const cardS: React.CSSProperties = {
  background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 18,
  padding: '20px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
};
const inputS: React.CSSProperties = {
  width: '100%', padding: '12px 16px', borderRadius: 12, border: '2px solid var(--border)',
  outline: 'none', fontSize: '0.88rem', background: 'var(--bg)', color: 'var(--text-main)',
  fontFamily: 'inherit', fontWeight: 600, transition: 'border-color 0.2s, box-shadow 0.2s',
  boxSizing: 'border-box',
};
const labelS: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 700,
  color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6,
};
const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '14px 28px', borderRadius: 14, border: 'none', fontWeight: 800, fontSize: '0.9rem',
  fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.2s', color: '#fff',
  background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
  boxShadow: '0 4px 15px rgba(230,0,126,0.25)',
};
const focusIn = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
  e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 4px rgba(230,0,126,0.1)';
};
const focusOut = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
  e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none';
};

/* ──────────── Component ──────────── */
export function TermosClient() {
  // Data
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [generated, setGenerated] = useState<GeneratedDoc[]>([]);

  // Views
  type View = 'list' | 'editor' | 'generator' | 'preview' | 'history';
  const [view, setView] = useState<View>('list');
  const [editingTemplate, setEditingTemplate] = useState<DocTemplate | null>(null);

  // List state
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage] = useState(1);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const perPage = 8;

  // Editor state
  const [edName, setEdName] = useState('');
  const [edType, setEdType] = useState(DOC_TYPES[0]);
  const [edActive, setEdActive] = useState(true);
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docxPreviewRef = useRef<HTMLDivElement>(null);
  const docxPreviewPreviewRef = useRef<HTMLDivElement>(null);

  // Generator state
  const [genTemplate, setGenTemplate] = useState<DocTemplate | null>(null);
  const [genStep, setGenStep] = useState(0);
  const [genData, setGenData] = useState<Record<string, string>>({});
  const [genHtml, setGenHtml] = useState('');
  const [genUnidade, setGenUnidade] = useState('Barueri');
  const [showVars, setShowVars] = useState(false);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [tableHover, setTableHover] = useState<[number, number]>([0, 0]);

  // Formatting state tracking (reflects cursor position)
  const [curFont, setCurFont] = useState('');
  const [curSize, setCurSize] = useState('');
  const [curFmt, setCurFmt] = useState<Record<string, boolean>>({});

  const updateFormattingState = useCallback(() => {
    try {
      // Font name
      const rawFont = document.queryCommandValue('fontName') || '';
      const cleanFont = rawFont.replace(/["']/g, '').split(',')[0].trim();
      // Match to EDITOR_FONTS
      const matched = EDITOR_FONTS.find(f => 
        f.family.toLowerCase().includes(cleanFont.toLowerCase()) ||
        f.name.toLowerCase() === cleanFont.toLowerCase()
      );
      setCurFont(matched ? matched.family : '');

      // Font size (1-7 scale)
      const rawSize = document.queryCommandValue('fontSize') || '';
      setCurSize(rawSize);

      // Toggle states
      setCurFmt({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikeThrough: document.queryCommandState('strikeThrough'),
        justifyLeft: document.queryCommandState('justifyLeft'),
        justifyCenter: document.queryCommandState('justifyCenter'),
        justifyRight: document.queryCommandState('justifyRight'),
        justifyFull: document.queryCommandState('justifyFull'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        insertOrderedList: document.queryCommandState('insertOrderedList'),
      });
    } catch { /* ignore errors when editor not focused */ }
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', updateFormattingState);
    return () => document.removeEventListener('selectionchange', updateFormattingState);
  }, [updateFormattingState]);

  // History state
  const [dbHistory, setDbHistory] = useState<any[]>([]);
  const [historyUnitFilter, setHistoryUnitFilter] = useState('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const fetchHistory = useCallback((unitFilter?: string) => {
    setIsLoadingHistory(true);
    const url = unitFilter ? `/api/termos?unit=${unitFilter}` : '/api/termos';
    fetch(url)
      .then(res => res.json())
      .then(data => { setDbHistory(Array.isArray(data) ? data : []); setIsLoadingHistory(false); })
      .catch(() => { setDbHistory([]); setIsLoadingHistory(false); });
  }, []);

  // Auth state
  const [isAdmin, setIsAdmin] = useState(false);

  // Load
  useEffect(() => {
    // Check admin role
    fetch('/api/auth/me').then(r => r.json()).then(u => {
      if (u?.role === 'ADMINISTRADOR' || u?.permissions?.admin === true) setIsAdmin(true);
    }).catch(() => {});

    // Fetch procedure suggestions
    fetch('/api/procedimentos').then(r => r.json()).then(list => {
      if (Array.isArray(list)) {
        setGenData(prev => ({ ...prev, _procSuggestions: JSON.stringify(list) }));
      }
    }).catch(() => {});

    try {
      const t = localStorage.getItem(STORAGE_TEMPLATES);
      if (t) {
        setTemplates(JSON.parse(t));
      } else {
        // Seed with default contract template
        const now = new Date().toISOString();
        const defaultTemplate: DocTemplate = {
          id: 1, name: 'Contrato de Prestação de Serviços', type: 'Contrato de prestação de serviço',
          content: DEFAULT_CONTRACT_HTML, active: true, createdAt: now, updatedAt: now,
        };
        const initial = [defaultTemplate];
        setTemplates(initial);
        localStorage.setItem(STORAGE_TEMPLATES, JSON.stringify(initial));
      }
      const g = localStorage.getItem(STORAGE_GENERATED);
      if (g) setGenerated(JSON.parse(g));
    } catch (e) { console.error(e); }
  }, []);

  const saveTemplates = useCallback((ts: DocTemplate[]) => {
    setTemplates(ts);
    localStorage.setItem(STORAGE_TEMPLATES, JSON.stringify(ts));
  }, []);
  const saveGenerated = useCallback((gs: GeneratedDoc[]) => {
    setGenerated(gs);
    localStorage.setItem(STORAGE_GENERATED, JSON.stringify(gs));
  }, []);

  /* ── Filtered / Paginated ── */
  const filtered = templates.filter(t => {
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterType !== 'all' && t.type !== filterType) return false;
    if (filterStatus === 'active' && !t.active) return false;
    if (filterStatus === 'inactive' && t.active) return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);
  const activeCount = templates.filter(t => t.active).length;

  /* ── Template CRUD ── */
  const openNewEditor = () => {
    setEditingTemplate(null);
    setEdName(''); setEdType(DOC_TYPES[0]); setEdActive(true);
    setView('editor');
    setTimeout(() => { if (editorRef.current) editorRef.current.innerHTML = ''; }, 50);
  };
  const openEditTemplate = (tpl: DocTemplate) => {
    setEditingTemplate(tpl);
    setEdName(tpl.name); setEdType(tpl.type); setEdActive(tpl.active);
    setView('editor');
    if (tpl.fileBase64) {
      // Render the DOCX with docx-preview for high-fidelity view
      setTimeout(async () => {
        if (docxPreviewRef.current) {
          try {
            const { renderAsync } = await import('docx-preview');
            const binary = atob(tpl.fileBase64!);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            await renderAsync(bytes.buffer, docxPreviewRef.current, undefined, {
              className: 'docx-preview-wrapper',
              inWrapper: true,
              ignoreWidth: false,
              ignoreHeight: false,
              ignoreFonts: false,
              breakPages: true,
              ignoreLastRenderedPageBreak: true,
              experimental: true,
              useBase64URL: true,
              renderHeaders: true,
              renderFooters: true,
              renderEndnotes: true,
              renderFootnotes: true,
            });
          } catch (err) {
            console.error('docx-preview error:', err);
            docxPreviewRef.current.innerHTML = '<p style="padding:40px;color:#666;text-align:center">Não foi possível renderizar o preview do Word. O arquivo original continua intacto para geração.</p>';
          }
        }
      }, 100);
    } else {
      setTimeout(() => { if (editorRef.current) editorRef.current.innerHTML = tpl.content; }, 50);
    }
  };
  const saveTemplate = () => {
    if (!edName.trim()) return;
    const content = editingTemplate?.fileBase64 ? editingTemplate.content : (editorRef.current?.innerHTML || '');
    const now = new Date().toISOString();
    if (editingTemplate) {
      const updated = templates.map(t => t.id === editingTemplate.id ? { ...t, name: edName.trim(), type: edType, active: edActive, content, fileBase64: editingTemplate.fileBase64, fileName: editingTemplate.fileName, updatedAt: now } : t);
      saveTemplates(updated);
    } else {
      const newTpl: DocTemplate = { id: Date.now(), name: edName.trim(), type: edType, active: edActive, content, createdAt: now, updatedAt: now };
      saveTemplates([...templates, newTpl]);
    }
    setView('list');
  };
  const deleteTemplate = (id: number) => {
    if (!confirm('Excluir este modelo?')) return;
    saveTemplates(templates.filter(t => t.id !== id));
  };
  const duplicateTemplate = (tpl: DocTemplate) => {
    const now = new Date().toISOString();
    const dup: DocTemplate = { ...tpl, id: Date.now(), name: `${tpl.name} (cópia)`, createdAt: now, updatedAt: now };
    saveTemplates([...templates, dup]);
  };
  const toggleActive = (id: number) => {
    saveTemplates(templates.map(t => t.id === id ? { ...t, active: !t.active, updatedAt: new Date().toISOString() } : t));
  };

  /* ── Rich Editor ── */
  const execCmd = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    editorRef.current?.focus();
    setTimeout(updateFormattingState, 10);
  };
  const insertVariable = (varKey: string) => {
    const tag = `<span contenteditable="false" style="background:linear-gradient(135deg,rgba(230,0,126,0.12),rgba(230,0,126,0.06));color:var(--primary);padding:2px 8px;border-radius:6px;font-weight:700;font-size:0.85em;border:1px solid rgba(230,0,126,0.2);cursor:default;white-space:nowrap;display:inline-block;margin:0 2px" data-var="${varKey}">{{${varKey}}}</span>&nbsp;`;
    document.execCommand('insertHTML', false, tag);
    editorRef.current?.focus();
  };
  const insertTable = (rows: number, cols: number) => {
    if (!editorRef.current) return;
    const thCells = Array.from({ length: cols }, (_, i) => `<th style="text-align:left;padding:10px 12px;font-weight:700;border:1px solid #e5e7eb">Coluna ${i + 1}</th>`).join('');
    const tdCells = Array.from({ length: cols }, () => `<td style="padding:10px 12px;border:1px solid #e5e7eb">&nbsp;</td>`).join('');
    const bodyRows = Array.from({ length: rows - 1 }, () => `<tr>${tdCells}</tr>`).join('');
    const tableHtml = `<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:0.9em"><thead><tr style="background:#f3f4f6;border-bottom:2px solid #e5e7eb">${thCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = tableHtml;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const frag = document.createDocumentFragment();
      while (wrapper.firstChild) frag.appendChild(wrapper.firstChild);
      frag.appendChild(document.createElement('br'));
      range.insertNode(frag);
      range.collapse(false);
    } else {
      editorRef.current.innerHTML += tableHtml + '<br>';
    }
    editorRef.current.focus();
    setShowTablePicker(false);
  };
  const insertTableVariable = (varKey: string) => {
    if (!editorRef.current) return;
    const label = VARIABLES.find(v => v.key === varKey)?.label || varKey;
    const varTag = `<span contenteditable="false" style="background:linear-gradient(135deg,rgba(139,92,246,0.15),rgba(139,92,246,0.06));color:#8b5cf6;padding:2px 10px;border-radius:6px;font-weight:700;font-size:0.82em;border:1px solid rgba(139,92,246,0.2);cursor:default;white-space:nowrap;display:inline-block;margin:4px 0;font-style:italic" data-var="${varKey}">{{${label} (Exemplo)}}</span>`;
    const tableHtml = TABLE_VARIABLES[varKey] || '';
    const wrapper = document.createElement('div');
    wrapper.innerHTML = varTag + tableHtml;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const frag = document.createDocumentFragment();
      while (wrapper.firstChild) frag.appendChild(wrapper.firstChild);
      frag.appendChild(document.createElement('br'));
      range.insertNode(frag);
      range.collapse(false);
    } else {
      editorRef.current.innerHTML += varTag + tableHtml + '<br>';
    }
    editorRef.current.focus();
  };

  /* ── Generator ── */
  const applyUnitProfile = (unit: string, prevData?: Record<string, string>) => {
    const profile = UNIT_PROFILES[unit] || UNIT_PROFILES.Barueri;
    const base = prevData || {};
    return {
      ...base,
      nome_clinica: profile.nome_clinica,
      endereco_clinica: profile.endereco_clinica,
      cidade_clinica: profile.cidade_clinica,
      cnpj_clinica: profile.cnpj_clinica,
      data_hoje: base.data_hoje || new Date().toLocaleDateString('pt-BR'),
    };
  };
  const openGenerator = (tpl?: DocTemplate) => {
    setGenTemplate(tpl || null);
    setGenStep(0);
    setGenData(applyUnitProfile(genUnidade));
    setView('generator');
  };
  const generateDocument = () => {
    if (!genTemplate) return;
    let html = genTemplate.content;

    // Build procedure table data from _procs
    const procs: { name: string; sessions: number; subtotal: number; discount: number; total: number }[] = (() => {
      try { return JSON.parse(genData._procs || '[]'); } catch { return []; }
    })();
    const payments: { method: string; installments: number; value: number; date: string }[] = (() => {
      try { return JSON.parse(genData._payments || '[]'); } catch { return []; }
    })();

    // Populate sale-related variables from procedures
    const subTotal = procs.reduce((s, p) => s + (p.subtotal || 0), 0);
    const totalDisc = procs.reduce((s, p) => s + (p.discount || 0), 0);
    const totalSale = procs.reduce((s, p) => s + (p.total || 0), 0);
    const dataWithCalc: Record<string, string> = {
      ...genData,
      subtotal_venda: `R$ ${subTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      valor_desconto: `R$ ${totalDisc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      total_venda: `R$ ${totalSale.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      condicoes_pagamento: payments.map(p => `${p.method}${p.installments > 1 ? ` ${p.installments}x` : ''} R$ ${p.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`).join(', '),
    };

    // Replace all {{var}} with data values
    VARIABLES.forEach(v => {
      const regex = new RegExp(`\\{\\{${v.key}\\}\\}`, 'g');
      html = html.replace(regex, dataWithCalc[v.key] || `[${v.label}]`);
    });
    // Also handle variables inside span tags
    const spanRegex = /<span[^>]*data-var="([^"]*)"[^>]*>[^<]*<\/span>/g;
    html = html.replace(spanRegex, (_, varKey) => {
      // For table variables, build actual tables from proc/payment data
      if (varKey === 'itens_da_venda' && procs.length > 0) {
        const rows = procs.map(p => `<tr><td style="border:1px solid #000;padding:8px;color:#000">${p.name || '-'}</td><td style="border:1px solid #000;padding:8px;color:#000">${p.sessions}</td><td style="border:1px solid #000;padding:8px;color:#000">${p.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td style="border:1px solid #000;padding:8px;color:#000">${p.discount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td style="border:1px solid #000;padding:8px;color:#000">${p.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td></tr>`).join('');
        return `<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;color:#000;border:1px solid #000"><thead><tr><th style="border:1px solid #000;padding:8px;text-align:left;font-weight:bold;color:#000">Item</th><th style="border:1px solid #000;padding:8px;text-align:left;font-weight:bold;color:#000">Quantidade</th><th style="border:1px solid #000;padding:8px;text-align:left;font-weight:bold;color:#000">Valor unitário (R$)</th><th style="border:1px solid #000;padding:8px;text-align:left;font-weight:bold;color:#000">Desconto unitário (R$)</th><th style="border:1px solid #000;padding:8px;text-align:left;font-weight:bold;color:#000">Valor (R$)</th></tr></thead><tbody>${rows}</tbody></table>`;
      }
      if (varKey === 'condicoes_pagamento_venda' && payments.length > 0) {
        const flatPayments: { label: number; method: string; value: number; date: string }[] = [];
        let parcelCounter = 1;
        payments.forEach(p => {
          if (p.installments > 1) {
            const valPerInst = p.value / p.installments;
            const dates = p.date.split('/');
            let dateObj = new Date();
            if (dates.length === 3) {
              dateObj = new Date(parseInt(dates[2]), parseInt(dates[1]) - 1, parseInt(dates[0]));
            }
            for (let i = 0; i < p.installments; i++) {
              const currentD = new Date(dateObj);
              currentD.setMonth(currentD.getMonth() + i);
              const dateStr = `${String(currentD.getDate()).padStart(2, '0')}/${String(currentD.getMonth() + 1).padStart(2, '0')}/${currentD.getFullYear()}`;
              flatPayments.push({ label: parcelCounter++, method: p.method, value: valPerInst, date: dateStr });
            }
          } else {
            flatPayments.push({ label: parcelCounter++, method: p.method, value: p.value, date: p.date || '-' });
          }
        });

        const rows = flatPayments.map(p => `<tr><td style="border:1px solid #000;padding:8px;color:#000">${p.label}</td><td style="border:1px solid #000;padding:8px;color:#000">${p.method}</td><td style="border:1px solid #000;padding:8px;color:#000">${p.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td><td style="border:1px solid #000;padding:8px;color:#000">${p.date}</td></tr>`).join('');
        return `<p style="font-size:14px;color:#000;margin-top:32px;margin-bottom:12px">O pagamento será efetuado da seguinte forma, conforme acordado entre as partes:</p><table style="width:100%;border-collapse:collapse;margin:0 0 16px;font-size:14px;color:#000;border:1px solid #000"><thead><tr><th style="border:1px solid #000;padding:8px;text-align:left;font-weight:bold;color:#000">Parcela</th><th style="border:1px solid #000;padding:8px;text-align:left;font-weight:bold;color:#000">Método de Pagamento</th><th style="border:1px solid #000;padding:8px;text-align:left;font-weight:bold;color:#000">Valor (R$)</th><th style="border:1px solid #000;padding:8px;text-align:left;font-weight:bold;color:#000">Vencimento</th></tr></thead><tbody>${rows}</tbody></table>`;
      }
      const val = dataWithCalc[varKey];
      return val || `[${VARIABLES.find(v => v.key === varKey)?.label || varKey}]`;
    });
    setGenHtml(html);
    setView('preview');
  };
  const saveGeneratedDoc = async () => {
    if (!genTemplate) return;
    const doc: GeneratedDoc = {
      id: Date.now(), templateId: genTemplate.id, templateName: genTemplate.name,
      clientName: genData.nome_completo || 'Sem nome', html: genHtml, createdAt: new Date().toISOString(),
    };
    saveGenerated([...generated, doc]);

    // Save to database
    try {
      await fetch('/api/termos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateName: genTemplate.name,
          clientName: genData.nome_completo || 'Sem nome',
          unit: genUnidade,
          docType: genTemplate.type,
          html: genHtml,
        }),
      });
    } catch (err) {
      console.error('Failed to save termo history', err);
    }
    alert('Documento salvo no histórico!');
  };
  const printDocument = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>Documento</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  @page{size:A4 portrait;margin:0;}
  html,body{width:794px;margin:0 auto;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#1a1a1a;background-color:#fff;background-image:url('${LOGO_B64}');background-size:100% 1123px;background-position:top left;background-repeat:repeat-y;}
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  h1,h2,h3{margin-top:24px}
  p{margin-bottom:12px;line-height:1.6}
</style></head><body>
<table style="width:100%; border:none; table-layout:fixed; border-collapse:collapse;">
  <thead><tr><td style="height:120px; border:none;"></td></tr></thead>
  <tbody><tr><td style="border:none; padding: 0 40px; vertical-align: top; line-height:1.6; font-size:15px;">
    ${genHtml}
  </td></tr></tbody>
  <tfoot><tr><td style="height:160px; border:none;"></td></tr></tfoot>
</table>
</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 500);
  };

  /* ──────────── RENDER ──────────── */

  /* ── History View ── */
  if (view === 'history') {
    return (
      <div style={{ padding: '20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--primary)' }}>history</span>
            Histórico de Documentos
          </h1>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.85rem' }}>Unidade:</span>
              <select value={historyUnitFilter} onChange={e => { setHistoryUnitFilter(e.target.value); fetchHistory(e.target.value); }} style={{ ...inputS, width: 'auto', minWidth: 140 }}>
                <option value="">Todas</option>
                <option value="Barueri">Barueri</option>
                <option value="SCS">SCS</option>
                <option value="SBC">SBC</option>
                <option value="Osasco">Osasco</option>
              </select>
            </div>
            <button onClick={() => setView('list')} style={{ ...btnPrimary, padding: '10px 20px', background: 'var(--bg)', color: 'var(--text-main)', border: '2px solid var(--border)', boxShadow: 'none' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span> Voltar
            </button>
          </div>
        </div>
        {isLoadingHistory ? (
          <div style={{ ...cardS, textAlign: 'center', padding: 60 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 32, animation: 'spin 1s linear infinite', color: 'var(--primary)' }}>sync</span>
            <p style={{ marginTop: 12 }}>Carregando histórico...</p>
          </div>
        ) : dbHistory.length === 0 ? (
          <div style={{ ...cardS, textAlign: 'center', padding: 60 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-muted)', marginBottom: 12, display: 'block' }}>folder_open</span>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Nenhum documento encontrado.</p>
          </div>
        ) : (
          <div style={{ ...cardS, padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead style={{ background: 'rgba(99,102,241,0.04)' }}>
                <tr>
                  {['Data', 'Cliente', 'Modelo', 'Unidade', 'Tipo'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dbHistory.map((doc: any) => (
                  <tr key={doc.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>{new Date(doc.createdAt).toLocaleDateString('pt-BR')} {new Date(doc.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-main)', fontWeight: 600 }}>{doc.clientName}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-main)' }}>{doc.templateName}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{doc.unit}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{doc.docType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  /* ── Preview View ── */
  if (view === 'preview') {
    // Render DOCX using docx-preview library for high-fidelity preview
    const renderDocxPreview = async (container: HTMLDivElement, base64: string) => {
      if (container.dataset.rendered === 'true') return;
      container.dataset.rendered = 'true';
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:400px;gap:12px"><div class="material-symbols-outlined" style="font-size:32px;color:var(--primary);animation:spin 1s linear infinite">progress_activity</div><span style="color:var(--text-muted);font-size:0.9rem">Renderizando documento...</span></div>';
      try {
        const { renderAsync } = await import('docx-preview');
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        container.innerHTML = '';
        await renderAsync(bytes.buffer, container, undefined, {
          className: 'docx-preview-wrapper',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          experimental: true,
          useBase64URL: true,
          renderHeaders: true,
          renderFooters: true,
          renderEndnotes: true,
          renderFootnotes: true,
        });
      } catch (err) {
        console.error('docx-preview error:', err);
        container.innerHTML = '<p style="padding:40px;color:#666;text-align:center">Não foi possível renderizar o preview.</p>';
      }
    };

    return (
      <div style={{ padding: '20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--primary)' }}>description</span>
            Visualizar Documento
          </h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setView('generator')} style={{ ...btnPrimary, padding: '10px 20px', background: 'var(--bg)', color: 'var(--text-main)', border: '2px solid var(--border)', boxShadow: 'none' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span> Voltar
            </button>
            <button onClick={printDocument} style={{ ...btnPrimary, padding: '10px 20px', background: 'linear-gradient(135deg,#3b82f6,#60a5fa)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>print</span> Imprimir / PDF
            </button>
            <button onClick={async () => {
              try {
                const procs: { name: string; sessions: number; subtotal: number; discount: number; total: number }[] = (() => { try { return JSON.parse(genData._procs || '[]'); } catch { return []; } })();
                const payments: { method: string; installments: number; value: number; date: string }[] = (() => { try { return JSON.parse(genData._payments || '[]'); } catch { return []; } })();
                const itensText = procs.length > 0
                  ? procs.map(p => `${p.name || '-'} — Qtd: ${p.sessions} — Valor: R$ ${p.subtotal.toLocaleString('pt-BR', {minimumFractionDigits:2})} — Desc: R$ ${p.discount.toLocaleString('pt-BR', {minimumFractionDigits:2})} — Total: R$ ${p.total.toLocaleString('pt-BR', {minimumFractionDigits:2})}`).join('\n')
                  : '';
                const flatPayments: { label: number; method: string; value: number; date: string }[] = [];
                let pc = 1;
                payments.forEach(p => {
                  if (p.installments > 1) {
                    const vpi = p.value / p.installments;
                    const parts = p.date.split('/');
                    let d = new Date();
                    if (parts.length === 3) d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
                    for (let i = 0; i < p.installments; i++) {
                      const cd = new Date(d); cd.setMonth(cd.getMonth() + i);
                      flatPayments.push({ label: pc++, method: p.method, value: vpi, date: `${String(cd.getDate()).padStart(2,'0')}/${String(cd.getMonth()+1).padStart(2,'0')}/${cd.getFullYear()}` });
                    }
                  } else {
                    flatPayments.push({ label: pc++, method: p.method, value: p.value, date: p.date || '-' });
                  }
                });
                const condText = flatPayments.length > 0
                  ? flatPayments.map(p => `Parcela ${p.label}: ${p.method} — R$ ${p.value.toLocaleString('pt-BR', {minimumFractionDigits:2})} — Venc: ${p.date}`).join('\n')
                  : '';
                const res = await fetch('/api/contrato/generate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    templateFileName: genTemplate?.fileName,
                    templateBase64: genTemplate?.fileBase64,
                    nome_completo: genData.nome_completo || '',
                    estado_civil: genData.estado_civil || '',
                    profissao: genData.profissao || '',
                    cpf: genData.cpf || '',
                    rg: genData.rg || '',
                    endereco_completo: genData.endereco_completo || '',
                    nome_clinica: genData.nome_clinica || '',
                    cnpj_clinica: genData.cnpj_clinica || '',
                    endereco_clinica: genData.endereco_clinica || '',
                    data_venda: genData.data_venda || genData.data_hoje || new Date().toLocaleDateString('pt-BR'),
                    itens_da_venda: itensText,
                    condicoes_pagamento_venda: condText,
                  }),
                });
                if (!res.ok) { const err = await res.json(); alert(err.error || 'Erro ao gerar contrato'); return; }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Contrato_${(genData.nome_completo || 'Cliente').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.docx`;
                a.click();
                URL.revokeObjectURL(url);
              } catch (err) { console.error(err); alert('Erro ao gerar contrato DOCX'); }
            }} style={{ ...btnPrimary, padding: '10px 20px', background: 'linear-gradient(135deg,#10b981,#34d399)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>description</span> Baixar Contrato DOCX
            </button>
            {genTemplate?.backgroundPdf && (
              <button onClick={async () => {
                try {
                  const detectedFont = detectFontFromHtml(genHtml);
                  const pdfBytes = await generatePdfWithBackground(genTemplate.backgroundPdf!, genHtml, detectedFont);
                  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `Contrato_${(genData.nome_completo || 'Cliente').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch (err) { console.error(err); alert('Erro ao gerar contrato PDF'); }
              }} style={{ ...btnPrimary, padding: '10px 20px', background: 'linear-gradient(135deg,#f59e0b,#fbbf24)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>picture_as_pdf</span> Baixar Contrato PDF
              </button>
            )}
            <button onClick={saveGeneratedDoc} style={{ ...btnPrimary, padding: '10px 20px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span> Salvar
            </button>
          </div>
        </div>
        {genTemplate?.backgroundPdf ? (
          <div
            ref={(el) => {
              if (el && genTemplate?.backgroundPdf && el.dataset.rendered !== 'true') {
                el.dataset.rendered = 'true';
                el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:500px;gap:12px"><div class="material-symbols-outlined" style="font-size:32px;color:var(--primary);animation:spin 1s linear infinite">progress_activity</div><span style="color:var(--text-muted)">Gerando preview do PDF...</span></div>';
                // Generate PDF with background + contract text
                const detectedFont = detectFontFromHtml(genHtml);
                generatePdfWithBackground(genTemplate.backgroundPdf, genHtml, detectedFont).then(pdfBytes => {
                  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
                  const url = URL.createObjectURL(blob);
                  el.innerHTML = '';
                  const iframe = document.createElement('iframe');
                  iframe.src = url;
                  iframe.style.cssText = 'width:100%;height:900px;border:none;border-radius:14px;';
                  el.appendChild(iframe);
                }).catch(err => {
                  console.error('PDF generation error:', err);
                  el.innerHTML = '<p style="padding:40px;color:#666;text-align:center">Erro ao gerar preview do PDF.</p>';
                });
              }
            }}
            style={{ ...cardS, padding: 0, maxWidth: 900, margin: '0 auto', background: '#fff', overflow: 'hidden', minHeight: 500 }}
          />
        ) : genTemplate?.fileBase64 ? (
          <div
            ref={(el) => {
              if (el && genTemplate?.fileBase64) {
                renderDocxPreview(el, genTemplate.fileBase64);
              }
            }}
            style={{ ...cardS, padding: 0, maxWidth: 900, margin: '0 auto', background: '#fff', overflow: 'hidden', minHeight: 500 }}
          />
        ) : (
          <div style={{ ...cardS, padding: '40px 60px', maxWidth: 900, margin: '0 auto', lineHeight: 1.7, fontSize: '0.95rem' }} dangerouslySetInnerHTML={{ __html: genHtml }} />
        )}
      </div>
    );
  }

  /* ── Generator View ── */
  if (view === 'generator') {
    const activeTemplates = templates.filter(t => t.active);
    const steps = ['Modelo', 'Dados do Cliente', 'Dados da Clínica', 'Procedimento e Pagamento'];
    const updateGen = (key: string, val: string) => setGenData(prev => ({ ...prev, [key]: val }));
    const genField = (key: string, label: string, placeholder?: string, type = 'text', readOnly = false) => (
      <div key={key}>
        <label style={labelS}>{label}</label>
        <input type={type} value={genData[key] || ''} onChange={e => updateGen(key, e.target.value)} placeholder={placeholder || label} style={{ ...inputS, opacity: readOnly ? 0.6 : 1, cursor: readOnly ? 'not-allowed' : undefined }} onFocus={focusIn as any} onBlur={focusOut as any} readOnly={readOnly} />
      </div>
    );

    // Procedures state
    const procs: { name: string; sessions: number; subtotal: number; discount: number; total: number }[] = (() => {
      try { return JSON.parse(genData._procs || '[]'); } catch { return []; }
    })();
    const setProcs = (p: typeof procs) => updateGen('_procs', JSON.stringify(p));
    const addProc = () => setProcs([...procs, { name: '', sessions: 1, subtotal: 0, discount: 0, total: 0 }]);
    const updateProc = (i: number, field: string, val: any) => {
      const updated = [...procs];
      (updated[i] as any)[field] = val;
      if (field === 'subtotal' || field === 'discount') {
        updated[i].total = Math.max(0, (updated[i].subtotal || 0) - (updated[i].discount || 0));
      }
      setProcs(updated);
      // Save procedure name to DB for autocomplete
      if (field === 'name' && val.trim().length > 2) {
        fetch('/api/procedimentos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: val.trim() }) }).catch(() => {});
      }
    };
    const removeProc = (i: number) => setProcs(procs.filter((_, idx) => idx !== i));

    // Currency formatting helper
    const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const parseBRL = (v: string) => {
      const cleaned = v.replace(/[^\d,]/g, '').replace(',', '.');
      return parseFloat(cleaned) || 0;
    };

    // Procedures total
    const procTotal = procs.reduce((s, p) => s + (p.total || 0), 0);

    // Payments state
    const payments: { method: string; installments: number; value: number; date: string }[] = (() => {
      try { return JSON.parse(genData._payments || '[]'); } catch { return []; }
    })();
    const setPayments = (p: typeof payments) => updateGen('_payments', JSON.stringify(p));
    const todayStr = (() => { const t = new Date(); return `${String(t.getDate()).padStart(2,'0')}/${String(t.getMonth()+1).padStart(2,'0')}/${t.getFullYear()}`; })();
    const addPayment = () => setPayments([...payments, { method: 'Pix', installments: 1, value: procTotal, date: todayStr }]);
    const updatePayment = (i: number, field: string, val: any) => {
      const updated = [...payments];
      (updated[i] as any)[field] = val;
      if (field === 'method' && val !== 'Crédito' && val !== 'Link de Pagamento') {
        updated[i].installments = 1;
      }
      setPayments(updated);
    };
    const removePayment = (i: number) => setPayments(payments.filter((_, idx) => idx !== i));

    const PAYMENT_METHODS = ['Pix', 'Débito', 'Crédito', 'Link de Pagamento', 'Boleto', 'Dinheiro'];

    return (
      <div style={{ padding: '20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--primary)' }}>magic_button</span>
            Gerar Documento
          </h1>
          <button onClick={() => setView('list')} style={{ ...btnPrimary, padding: '10px 20px', background: 'var(--bg)', color: 'var(--text-main)', border: '2px solid var(--border)', boxShadow: 'none' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span> Cancelar
          </button>
        </div>

        {/* Steps indicator */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, overflowX: 'auto' }}>
          {steps.map((s, i) => (
            <button key={i} onClick={() => setGenStep(i)} style={{
              flex: 1, padding: '12px 16px', borderRadius: 12, border: 'none', fontFamily: 'inherit',
              background: genStep === i ? 'var(--primary)' : 'var(--bg)', color: genStep === i ? '#fff' : 'var(--text-muted)',
              fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', transition: 'all 0.2s', minWidth: 120,
            }}>
              <span style={{ opacity: 0.7, marginRight: 4 }}>{i + 1}.</span> {s}
            </button>
          ))}
        </div>

        <div style={cardS}>
          {/* Step 0: Select template */}
          {genStep === 0 && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <label style={labelS}>Unidade</label>
                <select value={genUnidade} onChange={e => { const u = e.target.value; setGenUnidade(u); setGenData(prev => applyUnitProfile(u, prev)); }} style={{ ...inputS, height: 48, WebkitAppearance: 'none' as any, MozAppearance: 'none' as any, appearance: 'none' as any, backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%23999%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3e%3cpolyline points=%276 9 12 15 18 9%27%3e%3c/polyline%3e%3c/svg%3e")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: 16 }}>
                  <option value="Barueri">Barueri</option>
                  <option value="SCS">SCS</option>
                  <option value="SBC">SBC</option>
                  <option value="Osasco">Osasco</option>
                </select>
              </div>
              <h3 style={{ margin: '0 0 16px', fontWeight: 800 }}>Escolha o modelo</h3>
              {activeTemplates.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>Nenhum modelo ativo. Crie um modelo primeiro.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {activeTemplates.map(tpl => (
                    <div key={tpl.id} onClick={() => { setGenTemplate(tpl); setGenStep(1); }} style={{
                      padding: '16px 20px', borderRadius: 14, cursor: 'pointer', transition: 'all 0.2s',
                      border: genTemplate?.id === tpl.id ? '2px solid var(--primary)' : '2px solid var(--border)',
                      background: genTemplate?.id === tpl.id ? 'rgba(230,0,126,0.04)' : 'var(--bg)',
                    }}>
                      <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{tpl.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{tpl.type}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 1: Client data */}
          {genStep === 1 && (() => {
            const maskCpf = (v: string) => {
              const d = v.replace(/\D/g, '').slice(0, 11);
              return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
            };
            const maskRg = (v: string) => {
              const d = v.replace(/\D/g, '').slice(0, 9);
              return d.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1})$/, '$1-$2');
            };
            const maskTel = (v: string) => {
              const d = v.replace(/\D/g, '').slice(0, 11);
              if (d.length <= 2) return d.length ? `(${d}` : '';
              if (d.length <= 3) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
              if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3)}`;
              return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
            };
            const reqField = (key: string, label: string, placeholder?: string, mask?: (v: string) => string) => (
              <div key={key}>
                <label style={labelS}>{label} <span style={{ color: '#ef4444' }}>*</span></label>
                <input value={genData[key] || ''} onChange={e => updateGen(key, mask ? mask(e.target.value) : e.target.value)} placeholder={placeholder || label} required style={inputS} onFocus={focusIn as any} onBlur={focusOut as any} />
              </div>
            );
            const selectField = (key: string, label: string, options: string[]) => (
              <div key={key}>
                <label style={labelS}>{label} <span style={{ color: '#ef4444' }}>*</span></label>
                <select value={genData[key] || ''} onChange={e => updateGen(key, e.target.value)} required style={{ ...inputS, height: 48 }}>
                  <option value="" disabled>Selecione</option>
                  {options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            );
            return (
              <div>
                <h3 style={{ margin: '0 0 16px', fontWeight: 800 }}>Dados do Cliente</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  {reqField('nome_completo', 'Nome Completo')}
                  {reqField('cpf', 'CPF', '000.000.000-00', maskCpf)}
                  {reqField('rg', 'RG', '00.000.000-0', maskRg)}
                  <div key="data_nascimento">
                    <label style={labelS}>Data de Nascimento <span style={{ color: '#ef4444' }}>*</span></label>
                    <DatePicker value={genData.data_nascimento || ''} onChange={v => updateGen('data_nascimento', v)} />
                  </div>
                  {reqField('telefone', 'Telefone', '(11) 9 9442-1525', maskTel)}
                  {reqField('email', 'E-mail', 'exemplo@email.com')}
                  {reqField('endereco_completo', 'Endereço Completo')}
                  {selectField('sexo', 'Sexo', ['Masculino', 'Feminino'])}
                  {selectField('estado_civil', 'Estado Civil', ['Solteiro(a)', 'Casado(a)', 'Viúvo(a)', 'Prefiro não informar'])}
                  {reqField('profissao', 'Profissão')}
                </div>
              </div>
            );
          })()}

          {/* Step 2: Clinic data only (locked for non-admin) */}
          {genStep === 2 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontWeight: 800 }}>Dados da Clínica</h3>
                {!isAdmin && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(107,114,128,0.1)', padding: '4px 10px', borderRadius: 8 }}>🔒 Somente administradores podem editar</span>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {genField('nome_clinica', 'Nome da Clínica', '', 'text', !isAdmin)}
                {genField('endereco_clinica', 'Endereço da Clínica', '', 'text', !isAdmin)}
                {genField('cidade_clinica', 'Cidade da Clínica', '', 'text', !isAdmin)}
                {genField('cnpj_clinica', 'CNPJ da Clínica', '', 'text', !isAdmin)}
              </div>
            </div>
          )}

          {/* Step 3: Procedures & Payment */}
          {genStep === 3 && (
            <div>
              <h3 style={{ margin: '0 0 16px', fontWeight: 800 }}>Procedimentos</h3>

              {/* Procedures table */}
              {procs.length > 0 && (
                <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: 'rgba(99,102,241,0.04)' }}>
                        {['Procedimento', 'Sessões', 'Subtotal (R$)', 'Desconto (R$)', 'Total (R$)', ''].map(h => (
                          <th key={h} style={{ padding: '10px 12px', borderBottom: '2px solid var(--border)', textAlign: 'left', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {procs.map((proc, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 6px' }}>
                            <input list="proc-suggestions" value={proc.name} onChange={e => updateProc(i, 'name', e.target.value)} placeholder="Nome do procedimento" style={{ ...inputS, padding: '8px 12px', fontSize: '0.85rem' }} onFocus={focusIn as any} onBlur={focusOut as any} />
                          </td>
                          <td style={{ padding: '8px 6px', width: 90 }}>
                            <input type="number" min={1} value={proc.sessions} onChange={e => updateProc(i, 'sessions', Number(e.target.value))} style={{ ...inputS, padding: '8px 12px', fontSize: '0.85rem', textAlign: 'center' }} onFocus={focusIn as any} onBlur={focusOut as any} />
                          </td>
                          <td style={{ padding: '8px 6px', width: 130 }}>
                            <input value={proc.subtotal ? fmtBRL(proc.subtotal) : ''} onChange={e => updateProc(i, 'subtotal', parseBRL(e.target.value))} placeholder="0,00" style={{ ...inputS, padding: '8px 12px', fontSize: '0.85rem' }} onFocus={focusIn as any} onBlur={focusOut as any} />
                          </td>
                          <td style={{ padding: '8px 6px', width: 130 }}>
                            <input value={proc.discount ? fmtBRL(proc.discount) : ''} onChange={e => updateProc(i, 'discount', parseBRL(e.target.value))} placeholder="0,00" style={{ ...inputS, padding: '8px 12px', fontSize: '0.85rem' }} onFocus={focusIn as any} onBlur={focusOut as any} />
                          </td>
                          <td style={{ padding: '8px 6px', width: 120 }}>
                            <div style={{ ...inputS, padding: '8px 12px', fontSize: '0.85rem', fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.06)', textAlign: 'center' }}>
                              {proc.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </div>
                          </td>
                          <td style={{ padding: '8px 6px', width: 40 }}>
                            <button onClick={() => removeProc(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Procedure suggestions datalist */}
              <datalist id="proc-suggestions">
                {(JSON.parse(genData._procSuggestions || '[]') as string[]).map((s, i) => <option key={i} value={s} />)}
              </datalist>

              <button onClick={addProc} style={{ ...btnPrimary, padding: '10px 20px', fontSize: '0.85rem', marginBottom: 32 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span> Adicionar Procedimento
              </button>

              {/* Totals summary */}
              {procs.length > 0 && (
                <div style={{ display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Subtotal', value: procs.reduce((s, p) => s + (p.subtotal || 0), 0), color: '#6366f1' },
                    { label: 'Desconto', value: procs.reduce((s, p) => s + (p.discount || 0), 0), color: '#f59e0b' },
                    { label: 'Total', value: procs.reduce((s, p) => s + (p.total || 0), 0), color: '#10b981' },
                  ].map(t => (
                    <div key={t.label} style={{ flex: 1, minWidth: 140, padding: '14px 18px', borderRadius: 14, border: '1px solid var(--border)', background: `${t.color}08` }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{t.label}</div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 900, color: t.color }}>R$ {t.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Payment section */}
              <h3 style={{ margin: '0 0 16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--primary)' }}>payments</span>
                Pagamento
              </h3>

              {payments.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                  {payments.map((pay, i) => {
                    const installmentsEnabled = pay.method === 'Crédito' || pay.method === 'Link de Pagamento';
                    return (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap', padding: 14, background: 'var(--bg)', borderRadius: 14, border: '1px solid var(--border)' }}>
                        <div style={{ flex: '1 1 180px' }}>
                          <label style={labelS}>Meio de Pagamento</label>
                          <select value={pay.method} onChange={e => updatePayment(i, 'method', e.target.value)} style={{ ...inputS, height: 44 }}>
                            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </div>
                        <div style={{ flex: '0 0 100px' }}>
                          <label style={labelS}>Parcelas</label>
                          <select value={pay.installments} onChange={e => updatePayment(i, 'installments', Number(e.target.value))} disabled={!installmentsEnabled} style={{ ...inputS, height: 44, opacity: installmentsEnabled ? 1 : 0.4, cursor: installmentsEnabled ? 'pointer' : 'not-allowed' }}>
                            {Array.from({ length: 18 }, (_, n) => <option key={n + 1} value={n + 1}>{n + 1}x</option>)}
                          </select>
                        </div>
                        <div style={{ flex: '1 1 140px' }}>
                          <label style={labelS}>Valor (R$)</label>
                          <input value={pay.value ? fmtBRL(pay.value) : ''} onChange={e => updatePayment(i, 'value', parseBRL(e.target.value))} placeholder="0,00" style={{ ...inputS, padding: '8px 12px' }} onFocus={focusIn as any} onBlur={focusOut as any} />
                        </div>
                        <div style={{ flex: '1 1 150px' }}>
                          <label style={labelS}>Data</label>
                          <DatePicker value={pay.date} onChange={v => updatePayment(i, 'date', v)} />
                        </div>
                        <button onClick={() => removePayment(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '8px 4px', marginBottom: 2 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <button onClick={addPayment} style={{ ...btnPrimary, padding: '10px 20px', fontSize: '0.85rem', background: 'linear-gradient(135deg,#3b82f6,#60a5fa)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span> Adicionar Pagamento
              </button>
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
            <button onClick={() => setGenStep(Math.max(0, genStep - 1))} disabled={genStep === 0} style={{
              ...btnPrimary, padding: '12px 24px', background: 'var(--bg)', color: 'var(--text-main)',
              border: '2px solid var(--border)', boxShadow: 'none', opacity: genStep === 0 ? 0.4 : 1,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_left</span> Anterior
            </button>
            {genStep < 3 ? (
              <button onClick={() => setGenStep(genStep + 1)} style={{ ...btnPrimary, padding: '12px 24px' }}>
                Próximo <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_right</span>
              </button>
            ) : (
              <button onClick={() => { if (!genTemplate) { alert('Selecione um modelo primeiro no Step 1'); setGenStep(0); return; } generateDocument(); }} style={{ ...btnPrimary, padding: '12px 24px', background: 'linear-gradient(135deg,#10b981,#34d399)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>auto_awesome</span> Gerar Documento
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ── Editor View ── */
  if (view === 'editor') {
    const toolBtn = (icon: string, cmd: string, val?: string, title?: string) => {
      const isActive = curFmt[cmd] || false;
      return (
      <button key={cmd + (val || '')} title={title || cmd} onClick={() => execCmd(cmd, val)} style={{
        width: 36, height: 36, borderRadius: 8,
        border: isActive ? '2px solid var(--primary)' : '1px solid var(--border)',
        background: isActive ? 'rgba(230,0,126,0.1)' : 'var(--bg)',
        color: isActive ? 'var(--primary)' : 'var(--text-main)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontFamily: 'inherit', transition: 'all 0.15s', fontWeight: isActive ? 700 : 400,
      }} onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(230,0,126,0.06)'; e.currentTarget.style.borderColor = 'var(--primary)'; } }}
         onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.borderColor = 'var(--border)'; } }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{icon}</span>
      </button>
      );
    };

    return (
      <div style={{ padding: '20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#8b5cf6' }}>edit_document</span>
            {editingTemplate ? 'Editar Modelo' : 'Novo Modelo'}
          </h1>
          <button onClick={() => setView('list')} style={{ ...btnPrimary, padding: '10px 20px', background: 'var(--bg)', color: 'var(--text-main)', border: '2px solid var(--border)', boxShadow: 'none' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span> Cancelar
          </button>
        </div>

        {/* Meta fields */}
        <div style={{ ...cardS, display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 16, alignItems: 'end', marginBottom: 16 }}>
          <div>
            <label style={labelS}>Nome do Modelo</label>
            <input value={edName} onChange={e => setEdName(e.target.value)} placeholder="Ex: Contrato de serviço" style={inputS} onFocus={focusIn as any} onBlur={focusOut as any} />
          </div>
          <div>
            <label style={labelS}>Tipo</label>
            <select value={edType} onChange={e => setEdType(e.target.value)} style={{ ...inputS, height: 48, appearance: 'auto' as any }}>
              {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 4 }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: edActive ? '#10b981' : 'var(--text-muted)' }}>{edActive ? 'Ativo' : 'Inativo'}</span>
            <div onClick={() => setEdActive(!edActive)} style={{
              width: 48, height: 26, borderRadius: 13, cursor: 'pointer', transition: 'all 0.3s',
              background: edActive ? '#10b981' : 'var(--border)', position: 'relative',
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute',
                top: 3, left: edActive ? 25 : 3, transition: 'left 0.3s', boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
              }} />
            </div>
          </div>
        </div>

        {/* Rich text editor */}
        <div style={cardS}>
          {editingTemplate?.fileBase64 && (
            <div style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid #3b82f6', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="material-symbols-outlined" style={{ color: '#3b82f6', fontSize: 24 }}>lock</span>
              <div>
                <strong style={{ color: '#3b82f6', display: 'block', fontSize: '0.9rem' }}>Modelo com Arquivo Original (Word)</strong>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>A visualização abaixo mostra o documento original com toda a formatação. O design real do Word será mantido 100% fiel na geração do DOCX.</span>
              </div>
            </div>
          )}
          {/* Toolbar - hide for native DOCX templates */}
          {!editingTemplate?.fileBase64 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '8px 0', marginBottom: 8, borderBottom: '1px solid var(--border)' }}>
            <select value={curFont} onChange={e => { if (e.target.value) { document.execCommand('fontName', false, e.target.value); setTimeout(updateFormattingState, 10); } }} style={{
              padding: '6px 10px', borderRadius: 8, border: curFont ? '2px solid var(--primary)' : '1px solid var(--border)', background: curFont ? 'rgba(230,0,126,0.05)' : 'var(--bg)',
              color: 'var(--text-main)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', maxWidth: 170, fontFamily: curFont || 'inherit',
            }}>
              <option value="">Fonte</option>
              {EDITOR_FONTS.map(f => (
                <option key={f.name} value={f.family} style={{ fontFamily: f.family }}>{f.name}</option>
              ))}
            </select>
            {toolBtn('format_bold', 'bold', undefined, 'Negrito')}
            {toolBtn('format_italic', 'italic', undefined, 'Itálico')}
            {toolBtn('format_underlined', 'underline', undefined, 'Sublinhado')}
            {toolBtn('format_strikethrough', 'strikeThrough', undefined, 'Tachado')}
            <div style={{ width: 1, height: 28, background: 'var(--border)', margin: '0 4px', alignSelf: 'center' }} />
            {toolBtn('format_align_left', 'justifyLeft', undefined, 'Alinhar esquerda')}
            {toolBtn('format_align_center', 'justifyCenter', undefined, 'Centralizar')}
            {toolBtn('format_align_right', 'justifyRight', undefined, 'Alinhar direita')}
            {toolBtn('format_align_justify', 'justifyFull', undefined, 'Justificar')}
            <div style={{ width: 1, height: 28, background: 'var(--border)', margin: '0 4px', alignSelf: 'center' }} />
            {toolBtn('format_list_bulleted', 'insertUnorderedList', undefined, 'Lista')}
            {toolBtn('format_list_numbered', 'insertOrderedList', undefined, 'Lista numerada')}
            <div style={{ width: 1, height: 28, background: 'var(--border)', margin: '0 4px', alignSelf: 'center' }} />
            {/* Table insert button */}
            <div style={{ position: 'relative' }}>
              <button title="Inserir tabela" onClick={() => setShowTablePicker(!showTablePicker)} style={{
                width: 36, height: 36, borderRadius: 8, border: showTablePicker ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: showTablePicker ? 'rgba(230,0,126,0.06)' : 'var(--bg)', color: 'var(--text-main)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', transition: 'all 0.15s',
              }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(230,0,126,0.06)'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
                 onMouseLeave={e => { if (!showTablePicker) { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.borderColor = 'var(--border)'; } }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>table</span>
              </button>
              {showTablePicker && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: 4, background: 'var(--card-bg)',
                  border: '1px solid var(--border)', borderRadius: 12, padding: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100,
                }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textAlign: 'center' }}>
                    {tableHover[0] > 0 ? `${tableHover[0]} × ${tableHover[1]}` : 'Selecione o tamanho'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 28px)', gap: 3 }}>
                    {Array.from({ length: 25 }, (_, i) => {
                      const r = Math.floor(i / 5) + 1;
                      const c = (i % 5) + 1;
                      const active = r <= tableHover[0] && c <= tableHover[1];
                      return (
                        <div key={i}
                          onMouseEnter={() => setTableHover([r, c])}
                          onMouseLeave={() => setTableHover([0, 0])}
                          onClick={() => insertTable(r, c)}
                          style={{
                            width: 28, height: 28, borderRadius: 4, cursor: 'pointer', transition: 'all 0.1s',
                            border: active ? '2px solid var(--primary)' : '1px solid var(--border)',
                            background: active ? 'rgba(230,0,126,0.1)' : 'var(--bg)',
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div style={{ width: 1, height: 28, background: 'var(--border)', margin: '0 4px', alignSelf: 'center' }} />
            <select onChange={e => { if (e.target.value) execCmd('formatBlock', e.target.value); e.target.value = ''; }} style={{
              padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--text-main)', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
            }}>
              <option value="">Título</option>
              <option value="h1">Título 1</option>
              <option value="h2">Título 2</option>
              <option value="h3">Título 3</option>
              <option value="p">Parágrafo</option>
            </select>
            <select value={curSize} onChange={e => { if (e.target.value) { execCmd('fontSize', e.target.value); } }} style={{
              padding: '6px 10px', borderRadius: 8, border: curSize ? '2px solid var(--primary)' : '1px solid var(--border)', background: curSize ? 'rgba(230,0,126,0.05)' : 'var(--bg)',
              color: 'var(--text-main)', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
            }}>
              <option value="">Tamanho</option>
              <option value="1">Pequeno</option>
              <option value="2">Médio</option>
              <option value="3">Normal</option>
              <option value="4">Médio-grande</option>
              <option value="5">Grande</option>
              <option value="6">Muito grande</option>
              <option value="7">Enorme</option>
            </select>
            <div style={{ width: 1, height: 28, background: 'var(--border)', margin: '0 4px', alignSelf: 'center' }} />
            {/* Variables button */}
            <button onClick={() => setShowVars(!showVars)} style={{
              padding: '6px 14px', borderRadius: 8, border: '2px solid var(--primary)',
              background: showVars ? 'rgba(230,0,126,0.08)' : 'var(--bg)',
              color: 'var(--primary)', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>data_object</span>
              Variáveis
            </button>
          </div>
          )}

          {/* Variables Panel */}
          {showVars && !editingTemplate?.fileBase64 && (
            <div style={{
              background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 12,
              maxHeight: 250, overflowY: 'auto',
            }}>
              {VAR_GROUPS.map(group => (
                <div key={group} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{group}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {VARIABLES.filter(v => v.group === group).map(v => (
                      <button key={v.key} onClick={() => TABLE_VARIABLES[v.key] ? insertTableVariable(v.key) : insertVariable(v.key)} style={{
                        padding: '5px 10px', borderRadius: 6,
                        border: TABLE_VARIABLES[v.key] ? '1px solid rgba(139,92,246,0.2)' : '1px solid rgba(230,0,126,0.15)',
                        background: TABLE_VARIABLES[v.key] ? 'rgba(139,92,246,0.06)' : 'rgba(230,0,126,0.04)',
                        color: TABLE_VARIABLES[v.key] ? '#8b5cf6' : 'var(--primary)', fontWeight: 700,
                        fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                      }} onMouseEnter={e => e.currentTarget.style.background = TABLE_VARIABLES[v.key] ? 'rgba(139,92,246,0.12)' : 'rgba(230,0,126,0.1)'}
                         onMouseLeave={e => e.currentTarget.style.background = TABLE_VARIABLES[v.key] ? 'rgba(139,92,246,0.06)' : 'rgba(230,0,126,0.04)'}>
                        {TABLE_VARIABLES[v.key] ? `📊 {{${v.key}}}` : `{{${v.key}}}`}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Content: DOCX Preview for native templates, ContentEditable for HTML templates */}
          {editingTemplate?.fileBase64 ? (
            <div ref={docxPreviewRef} style={{
              minHeight: 450, border: '2px solid var(--border)', borderRadius: 14,
              background: '#fff', overflow: 'auto', padding: 0,
            }} />
          ) : (
            <div ref={editorRef} contentEditable suppressContentEditableWarning
              style={{
                minHeight: 450, padding: '20px 24px', border: '2px solid var(--border)', borderRadius: 14,
                outline: 'none', lineHeight: 1.7, fontSize: '0.95rem', color: 'var(--text-main)',
                background: 'var(--bg)', overflowY: 'auto',
              }}
              onFocus={e => { (e.target as HTMLElement).style.borderColor = 'var(--primary)'; (e.target as HTMLElement).style.boxShadow = '0 0 0 4px rgba(230,0,126,0.08)'; }}
              onBlur={e => { (e.target as HTMLElement).style.borderColor = 'var(--border)'; (e.target as HTMLElement).style.boxShadow = 'none'; }}
            />
          )}

          {/* Save */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={saveTemplate} style={{ ...btnPrimary, padding: '14px 32px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>save</span> Salvar Modelo
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── List View (default) ── */
  return (
    <div style={{ padding: '20px 0' }}>
      {/* Hero */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 30, color: 'var(--primary)' }}>gavel</span>
          Termos e Contratos
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
          Gerencie modelos de documentos, gere contratos e termos com preenchimento automático
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Modelos', value: String(templates.length), icon: 'description', color: '#6366f1' },
          { label: 'Ativos', value: String(activeCount), icon: 'check_circle', color: '#10b981' },
          { label: 'Inativos', value: String(templates.length - activeCount), icon: 'cancel', color: '#ef4444' },
          { label: 'Docs Gerados', value: String(generated.length), icon: 'history', color: '#f59e0b' },
        ].map((kpi, i) => (
          <div key={i} onClick={kpi.label === 'Docs Gerados' ? () => { setView('history'); fetchHistory(''); } : undefined} style={{
            ...cardS, padding: 16, position: 'relative', overflow: 'hidden', transition: 'all 0.2s',
            cursor: kpi.label === 'Docs Gerados' ? 'pointer' : 'default',
          }} onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'}
             onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${kpi.color},${kpi.color}66)` }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{kpi.label}</span>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: `${kpi.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: kpi.color }}>{kpi.icon}</span>
              </div>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Actions bar */}
      <div style={{ ...cardS, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, flex: 1, minWidth: 200, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 350 }}>
            <span className="material-symbols-outlined" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 20, color: 'var(--text-muted)' }}>search</span>
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar modelo..." style={{ ...inputS, paddingLeft: 42 }} />
          </div>
          <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }} style={{ ...inputS, width: 'auto', minWidth: 180 }}>
            <option value="all">Todos os tipos</option>
            {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value as any); setPage(1); }} style={{ ...inputS, width: 'auto', minWidth: 130 }}>
            <option value="all">Todos</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input ref={fileInputRef} type="file" accept=".docx,.html,.htm,.pdf" style={{ display: 'none' }} onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const now = new Date().toISOString();
            const fileName = file.name.replace(/\.[^.]+$/, '');
            let htmlContent = '';
            let fileBase64: string | undefined = undefined;
            let backgroundPdf: string | undefined = undefined;
            let backgroundPdfName: string | undefined = undefined;
            try {
              if (file.name.toLowerCase().endsWith('.pdf')) {
                // PDF background template
                const arrayBuffer = await file.arrayBuffer();
                const bytes = new Uint8Array(arrayBuffer);
                let binary = '';
                for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                backgroundPdf = btoa(binary);
                backgroundPdfName = file.name;
                htmlContent = '<p style="text-align:center;color:#666;padding:40px">Este modelo usa um PDF de fundo. O texto do contrato será escrito por cima do design.</p>';
              } else if (file.name.endsWith('.docx')) {
                // Read file as base64 for serverless-compatible storage
                const arrayBuffer = await file.arrayBuffer();
                const bytes = new Uint8Array(arrayBuffer);
                let binary = '';
                for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                fileBase64 = btoa(binary);
                
                // Use mammoth for a visual preview in the editor
                try {
                  const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer.slice(0) });
                  htmlContent = result.value || '<p style="text-align:center;color:#666;padding:40px">Preview indisponível. O arquivo original será usado na geração.</p>';
                } catch {
                  htmlContent = '<p style="text-align:center;color:#666;padding:40px">Preview indisponível. O arquivo original será usado na geração do DOCX.</p>';
                }
              } else {
                htmlContent = await file.text();
              }
              const newTpl: DocTemplate = { 
                id: Date.now(), 
                name: fileName, 
                type: 'Contrato de prestação de serviço', 
                content: htmlContent, 
                fileBase64,
                fileName: fileBase64 ? file.name : undefined,
                backgroundPdf,
                backgroundPdfName,
                active: true, 
                createdAt: now, 
                updatedAt: now 
              };
              saveTemplates([...templates, newTpl]);
              alert(`✅ Modelo "${fileName}" importado com sucesso!`);
            } catch (err) {
              console.error('Erro ao importar arquivo:', err);
              alert('❌ Erro ao importar o arquivo. Verifique se o formato é válido (.docx ou .html).');
            }
            if (fileInputRef.current) fileInputRef.current.value = '';
          }} />
          <button onClick={() => fileInputRef.current?.click()} style={{ ...btnPrimary, padding: '12px 20px', background: 'linear-gradient(135deg,#3b82f6,#60a5fa)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>upload_file</span> Importar do Computador
          </button>
          <button onClick={() => {
            const now = new Date().toISOString();
            const newTpl: DocTemplate = { id: Date.now(), name: 'Contrato de Prestação de Serviços', type: 'Contrato de prestação de serviço', content: DEFAULT_CONTRACT_HTML, active: true, createdAt: now, updatedAt: now };
            saveTemplates([...templates, newTpl]);
          }} style={{ ...btnPrimary, padding: '12px 20px', background: 'linear-gradient(135deg,#8b5cf6,#a78bfa)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span> Importar Modelo Pronto
          </button>
          <button onClick={() => openGenerator()} style={{ ...btnPrimary, padding: '12px 20px', background: 'linear-gradient(135deg,#10b981,#34d399)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>auto_awesome</span> Gerar Doc
          </button>
          <button onClick={openNewEditor} style={{ ...btnPrimary, padding: '12px 20px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span> Novo Modelo
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ ...cardS, padding: 0, overflow: 'visible' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-muted)', marginBottom: 12, display: 'block' }}>article</span>
            <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-muted)' }}>Nenhum modelo encontrado</p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Clique em &quot;Novo Modelo&quot; para criar seu primeiro</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 80px 1fr 1fr 100px', padding: '14px 24px', borderBottom: '2px solid var(--border)', fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <div>Nome</div>
              <div>Tipo</div>
              <div style={{ textAlign: 'center' }}>Status</div>
              <div>Criado</div>
              <div>Atualizado</div>
              <div style={{ textAlign: 'center' }}>Ações</div>
            </div>
            {/* Rows */}
            {paginated.map(tpl => (
              <div key={tpl.id} style={{
                display: 'grid', gridTemplateColumns: '2fr 1.5fr 80px 1fr 1fr 100px', padding: '16px 24px',
                borderBottom: '1px solid var(--border)', alignItems: 'center', transition: 'background 0.15s',
              }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(230,0,126,0.015)'}
                 onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{tpl.name}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{tpl.type}</div>
                <div style={{ textAlign: 'center' }}>
                  <div onClick={() => toggleActive(tpl.id)} style={{
                    width: 44, height: 24, borderRadius: 12, cursor: 'pointer', transition: 'all 0.3s',
                    background: tpl.active ? '#10b981' : 'var(--border)', position: 'relative', margin: '0 auto',
                  }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute',
                      top: 3, left: tpl.active ? 23 : 3, transition: 'left 0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                    }} />
                  </div>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{new Date(tpl.createdAt).toLocaleDateString('pt-BR')}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{new Date(tpl.updatedAt).toLocaleDateString('pt-BR')}</div>
                <div style={{ textAlign: 'center', position: 'relative' }}>
                  <button onClick={() => setMenuOpen(menuOpen === tpl.id ? null : tpl.id)} style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 8, color: 'var(--text-muted)',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>more_vert</span>
                  </button>
                  {menuOpen === tpl.id && (
                    <div style={{
                      position: 'absolute', right: 0, bottom: '100%', background: 'var(--card-bg)', border: '1px solid var(--border)',
                      borderRadius: 14, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', padding: 6, zIndex: 9999, minWidth: 170,
                    }}>
                      {[
                        { icon: 'edit', label: 'Editar', action: () => { openEditTemplate(tpl); setMenuOpen(null); } },
                        { icon: 'content_copy', label: 'Duplicar', action: () => { duplicateTemplate(tpl); setMenuOpen(null); } },
                        { icon: 'auto_awesome', label: 'Gerar Doc', action: () => { openGenerator(tpl); setMenuOpen(null); } },
                        { icon: 'delete', label: 'Excluir', action: () => { deleteTemplate(tpl.id); setMenuOpen(null); }, danger: true },
                      ].map((act, i) => (
                        <button key={i} onClick={act.action} style={{
                          display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', borderRadius: 10,
                          border: 'none', background: 'transparent', color: (act as any).danger ? '#ef4444' : 'var(--text-main)',
                          fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                        }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                           onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{act.icon}</span> {act.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {/* Pagination */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>{filtered.length} modelo(s)</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {Array.from({ length: totalPages }, (_, i) => (
                  <button key={i} onClick={() => setPage(i + 1)} style={{
                    width: 36, height: 36, borderRadius: 10, border: page === i + 1 ? '2px solid var(--primary)' : '1px solid var(--border)',
                    background: page === i + 1 ? 'rgba(230,0,126,0.08)' : 'var(--bg)', color: page === i + 1 ? 'var(--primary)' : 'var(--text-muted)',
                    fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'inherit',
                  }}>{i + 1}</button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Click outside to close menus */}
      {menuOpen !== null && <div onClick={() => setMenuOpen(null)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />}
    </div>
  );
}
