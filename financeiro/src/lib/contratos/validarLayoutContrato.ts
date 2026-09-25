import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
// Primeiro modelo homologado; os modelos antigos ainda têm margens incompatíveis.
export const MODELO_CONTRATO_SBC_VALIDADO = '3873f67b-1d99-4876-a5ec-7057cbff1e24';
const MAX_CONTENT_WIDTH = 10_466;
const MAX_IMAGE_WIDTH_EMU = MAX_CONTENT_WIDTH * 635;
const EXPECTED_PAGE = { w: 11_906, h: 16_838 };
const EXPECTED_MARGINS = {
  top: 1_418,
  bottom: 1_134,
  left: 720,
  right: 720,
  header: 708,
  footer: 708,
};

type DocxInput = ArrayBuffer | Uint8Array;

export class ContratoLayoutError extends Error {
  readonly violations: string[];

  constructor(violations: string[]) {
    super(`Contrato bloqueado por problemas de layout:\n${violations.map((item) => `- ${item}`).join('\n')}`);
    this.name = 'ContratoLayoutError';
    this.violations = violations;
  }
}

function elements(parent: Document | Element, name: string, namespace = WORD_NS): Element[] {
  return Array.from(parent.getElementsByTagNameNS(namespace, name)) as Element[];
}

function isWordElement(node: Node, name: string): node is Element {
  return node.nodeType === 1 && (node as Element).localName === name && (node as Element).namespaceURI === WORD_NS;
}

function child(parent: Element, name: string): Element | undefined {
  return Array.from(parent.childNodes).find((node) => isWordElement(node, name)) as Element | undefined;
}

function wordAttribute(element: Element, name: string): string | null {
  return element.getAttributeNS(WORD_NS, name) ?? element.getAttribute(`w:${name}`);
}

function numericAttribute(element: Element, name: string): number | null {
  const value = wordAttribute(element, name);
  if (value === null || !/^-?\d+$/.test(value)) return null;
  return Number(value);
}

function checkExpectedAttributes(
  element: Element | undefined,
  expected: Record<string, number>,
  label: string,
  part: string,
  violations: string[],
) {
  if (!element) {
    violations.push(`${part}: ${label} ausente.`);
    return;
  }
  for (const [name, value] of Object.entries(expected)) {
    const actual = numericAttribute(element, name);
    if (actual !== value) {
      violations.push(`${part}: ${label} ${name}=${actual ?? 'ausente/inválido'}; esperado ${value}.`);
    }
  }
}

function checkSections(xml: Document, part: string, violations: string[]) {
  const sections = elements(xml, 'sectPr');
  if (part === 'word/document.xml' && !sections.length) {
    violations.push(`${part}: nenhuma seção w:sectPr encontrada.`);
  }
  sections.forEach((section, index) => {
    const label = `seção ${index + 1}`;
    checkExpectedAttributes(child(section, 'pgSz'), EXPECTED_PAGE, `${label} pgSz`, part, violations);
    checkExpectedAttributes(child(section, 'pgMar'), EXPECTED_MARGINS, `${label} pgMar`, part, violations);
  });
}

function checkIndents(xml: Document, part: string, violations: string[]) {
  elements(xml, 'ind').forEach((indent, index) => {
    for (const name of ['left', 'right', 'start', 'end']) {
      const value = numericAttribute(indent, name);
      if (value !== null && value < 0) {
        violations.push(`${part}: recuo ${index + 1} ${name}=${value} é negativo.`);
      }
    }
    const hanging = numericAttribute(indent, 'hanging');
    const left = numericAttribute(indent, 'left') ?? numericAttribute(indent, 'start') ?? 0;
    if (hanging !== null && hanging > left) {
      violations.push(`${part}: recuo ${index + 1} hanging=${hanging} excede left=${left}.`);
    }
  });
}

function checkTables(xml: Document, part: string, violations: string[]) {
  elements(xml, 'tbl').forEach((table, index) => {
    const tableProperties = child(table, 'tblPr');
    const tableWidth = tableProperties && child(tableProperties, 'tblW');
    if (tableWidth && wordAttribute(tableWidth, 'type') === 'dxa') {
      const width = numericAttribute(tableWidth, 'w');
      if (width === null || width > MAX_CONTENT_WIDTH) {
        violations.push(`${part}: tabela ${index + 1} tblW=${width ?? 'inválido'} excede ${MAX_CONTENT_WIDTH}.`);
      }
    }
    const tableIndent = tableProperties && child(tableProperties, 'tblInd');
    if (tableIndent) {
      const value = numericAttribute(tableIndent, 'w');
      if (value !== null && value < 0) {
        violations.push(`${part}: tabela ${index + 1} tblInd=${value} é negativo.`);
      }
    }
    const grid = child(table, 'tblGrid');
    if (grid) {
      const sum = Array.from(grid.childNodes)
        .filter((node) => isWordElement(node, 'gridCol'))
        .reduce((total, node) => total + (numericAttribute(node as Element, 'w') ?? 0), 0);
      if (sum > MAX_CONTENT_WIDTH) {
        violations.push(`${part}: tabela ${index + 1} soma de gridCol=${sum} excede ${MAX_CONTENT_WIDTH}.`);
      }
    }
  });
}

function checkBodyImages(xml: Document, violations: string[]) {
  elements(xml, 'extent', DRAWING_NS).forEach((extent, index) => {
    const width = Number(extent.getAttribute('cx'));
    if (!Number.isFinite(width) || width > MAX_IMAGE_WIDTH_EMU) {
      violations.push(`word/document.xml: imagem ${index + 1} cx=${width || 'inválido'} excede ${MAX_IMAGE_WIDTH_EMU} EMU.`);
    }
  });
}

function parseXml(source: string, part: string, violations: string[]): Document | null {
  const errors: string[] = [];
  const xml = new DOMParser({
    errorHandler: {
      warning: () => undefined,
      error: (message: string) => { errors.push(message); },
      fatalError: (message: string) => { errors.push(message); },
    },
  }).parseFromString(source, 'application/xml');
  if (!xml || errors.length || elements(xml, 'parsererror', 'http://www.mozilla.org/newlayout/xml/parsererror.xml').length) {
    violations.push(`${part}: XML inválido${errors.length ? ` (${errors[0]})` : ''}.`);
    return null;
  }
  return xml;
}

export async function validarLayoutContrato(input: DocxInput): Promise<void> {
  const zip = await JSZip.loadAsync(input);
  const violations: string[] = [];
  const parts = Object.keys(zip.files).filter((name) =>
    /^word\/(?:document|styles|numbering|header\d+|footer\d+)\.xml$/.test(name),
  );
  if (!parts.includes('word/document.xml')) {
    throw new ContratoLayoutError(['word/document.xml ausente.']);
  }
  for (const part of parts) {
    const xml = parseXml(await zip.file(part)!.async('string'), part, violations);
    if (!xml) continue;
    checkSections(xml, part, violations);
    checkIndents(xml, part, violations);
    checkTables(xml, part, violations);
    if (part === 'word/document.xml') checkBodyImages(xml, violations);
  }
  if (violations.length) throw new ContratoLayoutError(violations);
}

function protectedNames(zip: JSZip): string[] {
  return Object.keys(zip.files).filter((name) =>
    /^word\/(?:header[^/]*\.xml|footer[^/]*\.xml|media\/[^/]+)$/.test(name),
  );
}

function sectionMarkup(documentXml: string): string[] {
  return [...documentXml.matchAll(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)].map((match) => match[0]);
}

export async function validarPartesProtegidasContrato(template: DocxInput, generated: DocxInput): Promise<void> {
  const [original, output] = await Promise.all([JSZip.loadAsync(template), JSZip.loadAsync(generated)]);
  const violations: string[] = [];
  const originalParts = protectedNames(original);
  const outputParts = protectedNames(output);
  for (const name of new Set([...originalParts, ...outputParts])) {
    const before = original.file(name);
    const after = output.file(name);
    if (!before || !after) {
      violations.push(`${name}: parte protegida removida ou adicionada.`);
      continue;
    }
    const [left, right] = await Promise.all([before.async('uint8array'), after.async('uint8array')]);
    if (left.length !== right.length || left.some((byte, index) => byte !== right[index])) {
      violations.push(`${name}: cabeçalho, rodapé ou mídia foi alterado.`);
    }
  }
  const [beforeDocument, afterDocument] = await Promise.all([
    original.file('word/document.xml')?.async('string'),
    output.file('word/document.xml')?.async('string'),
  ]);
  if (!beforeDocument || !afterDocument ||
    JSON.stringify(sectionMarkup(beforeDocument)) !== JSON.stringify(sectionMarkup(afterDocument))) {
    violations.push('word/document.xml: w:sectPr foi alterado.');
  }
  if (violations.length) throw new ContratoLayoutError(violations);
}
