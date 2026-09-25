import PizZip from 'pizzip';

const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface EditableContractParagraph {
  index: number;
  text: string;
}

export interface ContractMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const TWIPS_PER_MM = 1440 / 25.4;
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

function documentXml(zip: PizZip) {
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('O arquivo não contém o texto do contrato.');
  const xml = new DOMParser().parseFromString(file.asText(), 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('Não foi possível ler o texto do contrato.');
  return xml;
}

function paragraphTextNodes(paragraph: Element) {
  return Array.from(paragraph.getElementsByTagNameNS(WORD_NAMESPACE, 't'));
}

export async function editableContractParagraphs(blob: Blob): Promise<EditableContractParagraph[]> {
  const zip = new PizZip(await blob.arrayBuffer());
  const xml = documentXml(zip);
  return Array.from(xml.getElementsByTagNameNS(WORD_NAMESPACE, 'p'))
    .map((paragraph, index) => ({
      index,
      text: paragraphTextNodes(paragraph).map((node) => node.textContent || '').join(''),
    }))
    .filter((paragraph) => paragraph.text.trim().length > 0);
}

export async function updateContractParagraphs(
  blob: Blob,
  changes: Record<number, string>,
): Promise<Blob> {
  if (!Object.keys(changes).length) return blob;
  const zip = new PizZip(await blob.arrayBuffer());
  const xml = documentXml(zip);
  const paragraphs = Array.from(xml.getElementsByTagNameNS(WORD_NAMESPACE, 'p'));

  for (const [rawIndex, value] of Object.entries(changes)) {
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0 || index >= paragraphs.length || !value.trim()) {
      throw new Error('Um trecho editado do contrato é inválido ou está vazio.');
    }
    const nodes = paragraphTextNodes(paragraphs[index]);
    if (!nodes.length) throw new Error('O trecho editado não contém texto substituível.');
    // Mantém a estrutura, margens, cabeçalhos, imagens e estilo do primeiro trecho.
    nodes[0].textContent = value.replace(/[\r\n]+/g, ' ');
    nodes[0].setAttribute('xml:space', 'preserve');
    for (const node of nodes.slice(1)) node.textContent = '';
  }

  zip.file('word/document.xml', new XMLSerializer().serializeToString(xml));
  return new Blob([zip.generate({ type: 'arraybuffer' })], { type: DOCX_MIME });
}

export async function readContractMargins(blob: Blob): Promise<ContractMargins> {
  const zip = new PizZip(await blob.arrayBuffer());
  const xml = documentXml(zip);
  const section = Array.from(xml.getElementsByTagNameNS(WORD_NAMESPACE, 'sectPr'))[0];
  const margins = section?.getElementsByTagNameNS(WORD_NAMESPACE, 'pgMar')[0];
  if (!margins) throw new Error('O documento não contém margens de página editáveis.');

  const read = (name: keyof ContractMargins) => {
    const raw = margins.getAttributeNS(WORD_NAMESPACE, name) || margins.getAttribute(`w:${name}`);
    const twips = Number(raw);
    if (!Number.isFinite(twips) || twips <= 0) throw new Error('O documento contém uma margem inválida.');
    return Math.round((twips / TWIPS_PER_MM) * 10) / 10;
  };

  return { top: read('top'), bottom: read('bottom'), left: read('left'), right: read('right') };
}

export function validateContractMargins(margins: ContractMargins): void {
  const ranges: Record<keyof ContractMargins, [number, number]> = {
    top: [15, 80],
    bottom: [15, 80],
    left: [10, 55],
    right: [10, 55],
  };
  for (const key of Object.keys(ranges) as (keyof ContractMargins)[]) {
    const value = margins[key];
    const [min, max] = ranges[key];
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error(`A margem ${key} deve ficar entre ${min} e ${max} mm.`);
    }
  }
  if (A4_WIDTH_MM - margins.left - margins.right < 100) {
    throw new Error('As margens laterais precisam deixar pelo menos 100 mm para o texto.');
  }
  if (A4_HEIGHT_MM - margins.top - margins.bottom < 120) {
    throw new Error('As margens superior e inferior precisam deixar pelo menos 120 mm para o texto.');
  }
}

export async function updateContractMargins(blob: Blob, margins: ContractMargins): Promise<Blob> {
  validateContractMargins(margins);
  const zip = new PizZip(await blob.arrayBuffer());
  const xml = documentXml(zip);
  const sections = Array.from(xml.getElementsByTagNameNS(WORD_NAMESPACE, 'sectPr'));
  if (!sections.length) throw new Error('O documento não contém seções com margens editáveis.');

  for (const section of sections) {
    const pageMargins = section.getElementsByTagNameNS(WORD_NAMESPACE, 'pgMar')[0];
    if (!pageMargins) throw new Error('Uma seção do documento não contém margens editáveis.');
    for (const key of Object.keys(margins) as (keyof ContractMargins)[]) {
      pageMargins.setAttributeNS(WORD_NAMESPACE, `w:${key}`, String(Math.round(margins[key] * TWIPS_PER_MM)));
    }
  }

  zip.file('word/document.xml', new XMLSerializer().serializeToString(xml));
  return new Blob([zip.generate({ type: 'arraybuffer' })], { type: DOCX_MIME });
}

export function extractContractTags(paragraphs: EditableContractParagraph[]): string[] {
  return paragraphs.flatMap(({ text }) =>
    Array.from(text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g), match => match[1].trim()),
  ).sort();
}

export function updateContractMarginGuides(
  container: HTMLElement | null,
  margins: ContractMargins | null,
): void {
  if (!container) return;
  container.querySelectorAll('[data-contract-margin-guide]').forEach(element => element.remove());
  if (!margins) return;

  const pxPerMm = 96 / 25.4;
  for (const page of container.querySelectorAll<HTMLElement>('section.docx-preview-wrapper')) {
    page.style.position = 'relative';
    const guide = page.ownerDocument.createElement('div');
    guide.dataset.contractMarginGuide = 'true';
    guide.setAttribute('aria-hidden', 'true');
    guide.title = `Margens: superior ${margins.top} mm, inferior ${margins.bottom} mm, esquerda ${margins.left} mm, direita ${margins.right} mm`;
    guide.style.cssText = [
      'position:absolute',
      `top:${margins.top * pxPerMm}px`,
      `right:${margins.right * pxPerMm}px`,
      `bottom:${margins.bottom * pxPerMm}px`,
      `left:${margins.left * pxPerMm}px`,
      'border:1px dashed #d946ef',
      'box-sizing:border-box',
      'z-index:10000',
      'pointer-events:none',
    ].join(';');
    page.appendChild(guide);
  }
}

export async function documentBlobBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Não foi possível preparar o arquivo para salvar.'));
    reader.readAsDataURL(blob);
  });
}

export function base64DocumentBlob(fileData: string): Blob {
  const binary = atob(fileData);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes.buffer], { type: DOCX_MIME });
}
