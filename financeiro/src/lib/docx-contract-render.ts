import { MODELO_CONTRATO_SBC_VALIDADO, validarLayoutContrato, validarPartesProtegidasContrato } from '@/lib/contratos/validarLayoutContrato';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface HistoricalContractSource {
  templateId: string;
  createdAt: string;
  filledData: Record<string, string>;
}

export interface ContractTemplateSource {
  id: string;
  fileData: string;
  fileType: string;
  updatedAt: string;
  fields: { tag: string }[];
}

export async function loadHistoricalTemplate(source: HistoricalContractSource): Promise<ContractTemplateSource> {
  const response = await fetch(`/api/docs/templates/${encodeURIComponent(source.templateId)}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('O modelo deste contrato antigo não está mais disponível para reconstrução.');
  const template = await response.json() as ContractTemplateSource;
  if (template.id !== source.templateId || typeof template.fileData !== 'string' || !Array.isArray(template.fields)) {
    throw new Error('O modelo deste contrato antigo está incompleto ou incompatível.');
  }
  checkHistoricalTemplate(source, template);
  return template;
}

export function historicalTemplateChanged(source: HistoricalContractSource, template: ContractTemplateSource): boolean {
  const generatedAt = Date.parse(source.createdAt);
  const updatedAt = Date.parse(template.updatedAt);
  if (!Number.isFinite(generatedAt) || !Number.isFinite(updatedAt)) {
    throw new Error('Não foi possível conferir as datas do contrato antigo e de seu modelo.');
  }
  return updatedAt > generatedAt;
}

export function checkHistoricalTemplate(source: HistoricalContractSource, template: ContractTemplateSource): void {
  if (template.fileType !== 'docx') throw new Error('O modelo original não é um arquivo DOCX recuperável.');
  if (!source.filledData || typeof source.filledData !== 'object' || Array.isArray(source.filledData)) {
    throw new Error('Os dados preenchidos do contrato antigo estão indisponíveis.');
  }
  const missing = template.fields.filter(field => typeof source.filledData[field.tag] !== 'string');
  if (missing.length) {
    throw new Error(`O contrato antigo não contém os campos necessários: ${missing.map(field => field.tag).join(', ')}.`);
  }
}

export async function renderContractDocx(templateBase64: string, values: Record<string, string>, templateId: string): Promise<Blob> {
  const [{ default: PizZip }, { default: Docxtemplater }] = await Promise.all([
    import('pizzip'), import('docxtemplater'),
  ]);
  const binary = atob(templateBase64);
  const templateBytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const protectedModel = templateId === MODELO_CONTRATO_SBC_VALIDADO;
  const doc = new Docxtemplater(new PizZip(templateBytes), {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: !protectedModel,
  });
  doc.render(values);
  const output = doc.getZip().generate({ type: 'arraybuffer' });
  if (protectedModel) {
    await validarLayoutContrato(output);
    await validarPartesProtegidasContrato(templateBytes, output);
  }
  return new Blob([output], { type: DOCX_MIME });
}
