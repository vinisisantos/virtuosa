import { reportCurrency, reportDate, safeReportUrl, type ClientClosing, type ClientReport } from '@/lib/whatsapp/client-report';

function requireExportable(closing: ClientClosing) {
  if (!closing.exportable) throw new Error('Revise a divergência do fechamento antes de emitir o relatório.');
}

// Built-in PDF fonts support Portuguese accents, but not decorative emoji.
const pdfText = (value: string) => value.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').replace(/[\r\n\t]+/g, ' ');

export async function createClientReportPdf(report: ClientReport, closing: ClientClosing) {
  requireExportable(closing);
  const { jsPDF } = await import('jspdf');
  const { autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title: `Relatório do cliente - ${pdfText(closing.clientName)}`, author: 'Virtuosa CRM' });
  const width = 178;
  const info = [
    ['Cliente', closing.clientName], ['Unidade', report.unit], ['Data do fechamento', reportDate(closing.closedAt)],
    ['Anúncio / campanha registrada', closing.origin.name], ['Origem', closing.origin.description],
  ];
  doc.setFillColor(107, 52, 201); doc.rect(0, 0, 210, 29, 'F');
  doc.setTextColor(255); doc.setFontSize(17); doc.text('Virtuosa', 16, 12);
  doc.setFontSize(10); doc.text('RELATÓRIO DO CLIENTE', 16, 21);
  autoTable(doc, {
    startY: 35, margin: { left: 16, right: 16, top: 16, bottom: 22 }, tableWidth: width,
    body: info.map(([label, value]) => [label, pdfText(value)]), theme: 'plain',
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 3, overflow: 'linebreak', textColor: [35, 35, 45] },
    columnStyles: { 0: { cellWidth: 47, fontStyle: 'bold' }, 1: { cellWidth: 131 } },
  });
  let y = (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  const adUrl = safeReportUrl(closing.origin.url);
  if (adUrl) {
    doc.setTextColor(107, 52, 201); doc.setFontSize(10);
    doc.textWithLink('Abrir anúncio registrado', 19, y, { url: adUrl }); y += 10;
  }
  autoTable(doc, {
    startY: y, margin: { left: 16, right: 16, top: 16, bottom: 22 }, tableWidth: width,
    head: [['Procedimentos fechados', 'Sessões', 'Valor contratado']],
    body: closing.procedures.length ? closing.procedures.map(item => [
      pdfText(item.name), item.sessions ?? 'Não informado', item.courtesy ? 'Cortesia' : reportCurrency(item.value),
    ]) : [['Procedimentos não informados', '-', '-']],
    foot: [['Valor final contratado', '', reportCurrency(closing.total)]],
    theme: 'grid', styles: { fontSize: 10, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [107, 52, 201] }, footStyles: { fillColor: [242, 236, 252], textColor: [55, 30, 85] },
    columnStyles: { 0: { cellWidth: 101 }, 1: { cellWidth: 28 }, 2: { cellWidth: 49, halign: 'right' } },
    rowPageBreak: 'avoid', showFoot: 'lastPage',
  });
  y = (doc as typeof doc & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  const notes = ['Valor contratado após descontos. Este relatório não comprova pagamento.', ...closing.warnings];
  autoTable(doc, {
    startY: y, margin: { left: 16, right: 16, top: 16, bottom: 22 }, theme: 'plain',
    body: notes.map(note => [pdfText(note)]), styles: { fontSize: 9, textColor: [85, 85, 95], cellPadding: 2 },
  });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setFontSize(8); doc.setTextColor(100);
    doc.text(`Gerado no CRM em ${reportDate(report.generatedAt)}`, 16, 287);
    doc.text(`Página ${page} de ${pages}`, 194, 287, { align: 'right' });
  }
  return doc;
}

const escapeHtml = (value: unknown) => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!);

export function clientReportPrintHtml(report: ClientReport, closing: ClientClosing): string {
  requireExportable(closing);
  const e = escapeHtml;
  const adUrl = safeReportUrl(closing.origin.url);
  const rows = closing.procedures.length ? closing.procedures.map(item => `<tr><td>${e(item.name)}</td><td>${e(item.sessions ?? 'Não informado')}</td><td>${e(item.courtesy ? 'Cortesia' : reportCurrency(item.value))}</td></tr>`).join('')
    : '<tr><td colspan="3">Procedimentos não informados</td></tr>';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório do cliente</title>
  <style>@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font:12px/1.6 Arial,sans-serif;color:#222;margin:0}h1{font-size:21px;color:#6b34c9}h2{font-size:17px}p,td{overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{padding:9px;border:1px solid #ddd;text-align:left;vertical-align:top}th{background:#f2ecfc}th:first-child{width:56%}td:last-child{text-align:right}thead{display:table-header-group}tr{break-inside:avoid}tfoot{display:table-row-group}.note{font-size:11px;color:#555}.total{font-size:17px;font-weight:bold}footer{margin-top:25px;border-top:1px solid #ddd;padding-top:8px}@media screen{body{max-width:800px;margin:30px auto;padding:16px}}@media print{a{color:inherit}}</style></head>
  <body><h1>Virtuosa</h1><h2>Relatório do cliente</h2><p><strong>Cliente:</strong> ${e(closing.clientName)}<br><strong>Unidade:</strong> ${e(report.unit)}<br><strong>Fechamento:</strong> ${e(reportDate(closing.closedAt))}</p>
  <p><strong>Anúncio / campanha registrada:</strong> ${e(closing.origin.name)}<br>${e(closing.origin.description)}${adUrl ? `<br><a href="${e(adUrl)}" rel="noreferrer">Abrir anúncio registrado</a>` : ''}</p>
  <table><thead><tr><th>Procedimentos fechados</th><th>Sessões</th><th>Valor contratado</th></tr></thead><tbody>${rows}</tbody></table>
  <p class="total">Valor final contratado: ${e(reportCurrency(closing.total))}</p><p class="note">Valor contratado após descontos. Este relatório não comprova pagamento.</p>${closing.warnings.map(warning => `<p class="note">${e(warning)}</p>`).join('')}
  <footer class="note">Gerado no CRM em ${e(reportDate(report.generatedAt))}</footer></body></html>`;
}

export function printClientReport(report: ClientReport, closing: ClientClosing) {
  const html = clientReportPrintHtml(report, closing);
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('O navegador bloqueou a impressão. Permita pop-ups ou use Baixar PDF.');
  popup.opener = null;
  // document.open clears window listeners; register only after opening it.
  popup.document.open(); popup.document.write(html);
  popup.addEventListener('load', () => { popup.focus(); popup.print(); }, { once: true });
  popup.document.close();
}
