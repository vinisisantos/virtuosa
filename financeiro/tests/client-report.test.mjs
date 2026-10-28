import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClientClosing, reportOrigin, reportMoney, reportCurrency, reportDate, safeReportUrl } from '../src/lib/whatsapp/client-report.ts';
import { clientReportPrintHtml, createClientReportPdf } from '../src/lib/whatsapp/client-report-pdf.ts';

const client = { id: 'client', name: 'Cliente Exemplo', campaignName: 'LIPO LASER', fbclid: 'https://example.com/anuncio', campaignAttribution: 'automatic_meta' };
const deal = (patch = {}) => ({
  id: 'sale', clientId: 'client', clientName: 'Nome antigo', value: 699, closedAt: new Date('2026-10-28T02:30:00Z'),
  campaignNameSnapshot: 'LIPO LASER', campaignAttributionSnapshot: 'automatic_meta',
  saleItems: [ { procedureName: 'Lipo Laser', sessions: 1, paidAmount: 699, itemType: 'paid' }, { procedureName: 'Drenagem', sessions: 1, paidAmount: 0, itemType: 'courtesy' } ], ...patch,
});
const report = closing => ({ conversationId: 'chat', unit: 'SBC', contactName: client.name, generatedAt: '2026-10-28T12:00:00Z', multipleClients: false, closings: [closing] });

test('relatório usa somente o fechamento escolhido, valor contratado e cortesia sem dupla soma', () => {
  const result = buildClientClosing(deal(), client);
  assert.equal(result.clientName, 'Cliente Exemplo');
  assert.equal(result.total, 699); assert.equal(result.exportable, true);
  assert.deepEqual(result.procedures.map(i => [i.name, i.sessions, i.value, i.courtesy]), [['Lipo Laser', 1, 699, false], ['Drenagem', 1, 0, true]]);
  assert.deepEqual(result.warnings, []);
  assert.equal(reportDate(result.closedAt), '27/10/2026', 'data é de São Paulo');
});

test('valores negativos, inválidos e composição divergente não podem ser emitidos', async () => {
  for (const value of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.equal(reportMoney(value), null);
    const result = buildClientClosing(deal({ value }), client);
    assert.equal(result.exportable, false);
    assert.throws(() => clientReportPrintHtml(report(result), result), /Revise/);
    await assert.rejects(createClientReportPdf(report(result), result), /Revise/);
  }
  const mismatch = buildClientClosing(deal({ value: 700 }), client);
  assert.equal(mismatch.exportable, false); assert.match(mismatch.warnings.join(' '), /diverge/);
  assert.equal(buildClientClosing(deal({ saleItems: [{ procedureName: 'Teste', sessions: 0, paidAmount: 699, itemType: 'paid' }] }), client).exportable, false);
  assert.equal(reportCurrency(0), 'R$ 0,00'); assert.equal(reportCurrency(null), 'Não informado');
});

test('fechamento legado mantém total e nomes conhecidos, sem inventar quantidade ou preço', () => {
  const result = buildClientClosing(deal({ saleItems: [] }), client, ['Botox', 'Laser']);
  assert.equal(result.total, 699); assert.equal(result.exportable, true);
  assert.deepEqual(result.procedures.map(i => [i.sessions, i.value]), [[null, null], [null, null]]);
  assert.match(result.warnings.join(' '), /legado/);
  assert.equal(buildClientClosing(deal({ saleItems: [] }), client).procedures.length, 0);
});

test('origem diferencia campanha manual, ausência de anúncio e fotografia diferente do cadastro', () => {
  assert.equal(reportOrigin(deal(), client).url, client.fbclid);
  const manual = reportOrigin(deal({ campaignAttributionSnapshot: 'manual' }), client);
  assert.match(manual.description, /manualmente/);
  const changed = reportOrigin(deal(), { ...client, campaignName: 'Botox' });
  assert.equal(changed.name, 'LIPO LASER'); assert.equal(changed.url, null);
  assert.equal(reportOrigin(deal({ campaignNameSnapshot: 'Via Link' }), client).name, 'Anúncio não identificado');
  assert.equal(reportOrigin(deal({ campaignNameSnapshot: null }), undefined).name, 'Anúncio não identificado');
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'https://login:secret@example.com', '/local']) assert.equal(safeReportUrl(url), null);
});

test('HTML de impressão escapa conteúdo não confiável, não possui scripts e preserva os quatro campos', () => {
  const closing = buildClientClosing(deal({ saleItems: [{ procedureName: '<img src=x onerror=alert(1)>', sessions: 1, paidAmount: 699, itemType: 'paid' }] }), { ...client, name: '</h2><script>bad()</script>' });
  const html = clientReportPrintHtml(report(closing), closing);
  assert.doesNotMatch(html, /<script>|<img src=x/);
  assert.match(html, /&lt;script&gt;/); assert.match(html, /LIPO LASER/); assert.match(html, /699,00/);
  assert.match(html, /não comprova pagamento/); assert.match(html, /@page/);
});

test('dinheiro é comparado em centavos e venda somente de cortesia vale zero', () => {
  const result = buildClientClosing(deal({ value: 0.3, saleItems: [ { procedureName: 'A', sessions: 1, paidAmount: 0.1, itemType: 'paid' }, { procedureName: 'B', sessions: 1, paidAmount: 0.2, itemType: 'paid' } ] }), client);
  assert.equal(result.exportable, true);
  assert.equal(buildClientClosing(deal({ value: 0, saleItems: [{ procedureName: 'Cortesia', sessions: 1, paidAmount: 0, itemType: 'courtesy' }] }), client).exportable, true);
  assert.equal(buildClientClosing(deal({ value: 0, saleItems: [{ procedureName: 'Cortesia inconsistente', sessions: 1, paidAmount: 10, itemType: 'courtesy' }] }), client).exportable, false);
});

test('gerador produz PDF paginado com a composição inteira e não só a área visível do modal', async () => {
  const closing = buildClientClosing(deal({ value: 600, saleItems: Array.from({ length: 60 }, (_, index) => ({ procedureName: `Procedimento ${index + 1} com descrição extensa para validar a paginação integral`, sessions: 1, paidAmount: 10, itemType: 'paid' })) }), client);
  const pdf = await createClientReportPdf(report(closing), closing);
  assert.ok(pdf.getNumberOfPages() > 1);
  assert.ok(pdf.output().startsWith('%PDF-'));
  assert.match(pdf.output(), /Procedimento 60/);
});
