import PizZip from 'pizzip';

const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface EditableContractParagraph {
  index: number;
  text: string;
}

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
