import { calc, fmt, type CalcState } from '@/app/calculadora/useCalc';
import { LOGO_BASE64 } from '@/app/calculadora/logoBase64';

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

function number(value: number, digits = 2): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: digits });
}

function percent(value: number): string {
  return `${number(value)}%`;
}

function row(label: string, value: string, total = false): string {
  return `<tr${total ? ' class="total"' : ''}><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
}

function section(title: string, rows: string): string {
  return `<section><h2>${escapeHtml(title)}</h2><table><tbody>${rows}</tbody></table></section>`;
}

function chip(label: string, value: string): string {
  return `<div class="chip"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

/** Pure HTML builder: an invalid simulation must not become a printable price quote. */
export function buildPricingReportHtml(s: CalcState, generatedAt?: Date): string {
  const result = calc(s);
  if (!result.valid) return '';

  const pricing = s.pricing?.version === 2 ? s.pricing : undefined;
  const title = s.nome.trim() || 'Procedimento';
  const monthlyRows = [
    row('Aluguel / espaço', fmt(s.aluguel)),
    row('Energia elétrica', fmt(s.energiaEletrica)),
    row('Água / internet', fmt(s.aguaInternet)),
    row('Contador', fmt(s.contador)),
    row('Salários', fmt(s.salarios)),
    row('Pró-labore', fmt(s.proLabore)),
    row('Subtotal de custos fixos', fmt(result.fixos), true),
    row('Materiais / insumos gerais', fmt(s.materiaisGerais)),
    row('Marketing / tráfego', fmt(s.marketingTrafego)),
    row('Comissões mensais', fmt(s.comissoes)),
    row('Taxas / plataformas', fmt(s.taxasPlataformas)),
    row('Outros', fmt(s.outros)),
    row('Subtotal de outros custos mensais', fmt(result.variaveis), true),
    row('Total mensal para rateio', fmt(result.custosMensais), true),
  ].join('');

  const operationRows = [
    row('Dias trabalhados por mês', number(s.diasTrabalhados)),
    row('Jornada diária', `${number(s.horasDia)}h ${number(s.minutosDia)}min`),
    row('Salas / postos simultâneos', number(s.qtdSalas)),
    ...(pricing ? [
      row('Ocupação produtiva planejada', percent(pricing.occupancy)),
      row('Horas produtivas mensais', `${number(result.horasProdutivas)}h`),
    ] : []),
    row('Duração do procedimento', `${number(s.duracaoHoras)}h ${number(s.duracaoMinutos)}min`),
    ...(pricing ? [row('Preparo / intervalo por atendimento', `${number(pricing.preparationMinutes)}min`)] : []),
    row('Custo da hora-maca', fmt(result.horaMaca), true),
    row('Estrutura alocada ao atendimento', fmt(result.custoHoraProcedimento), true),
  ].join('');

  const supplyRows = s.insumos.map(item => {
    const quantity = pricing ? item.quantidade ?? 1 : 1;
    const loss = pricing ? item.perdaPercentual ?? 0 : 0;
    const cost = item.valor * quantity / (1 - loss / 100);
    if (!item.valor && !cost) return '';
    const values = pricing
      ? [item.nome, number(quantity), item.unidade || '-', fmt(item.valor), percent(loss), fmt(cost)]
      : [item.nome, fmt(item.valor)];
    return `<tr>${values.map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`;
  }).join('');

  const supplyHeader = pricing
    ? ['Insumo', 'Quantidade', 'Unidade', 'Custo unitário', 'Perda', 'Custo utilizado']
    : ['Insumo', 'Custo informado'];
  const supplies = `<section class="supplies"><h2>Ficha de insumos do procedimento</h2>
    <table><thead><tr>${supplyHeader.map(label => `<th scope="col">${escapeHtml(label)}</th>`).join('')}</tr></thead>
    <tbody>${supplyRows || `<tr><td colspan="${supplyHeader.length}">Nenhum insumo com custo informado.</td></tr>`}</tbody></table>
    ${pricing ? '<p class="note">Custo utilizado = custo unitário × quantidade ÷ (1 − perda%). A perda representa a fração da compra que não pode ser aproveitada.</p>' : ''}
    <table><tbody>${row('Locação adicional de aparelho', fmt(s.locacaoAparelho))}${row('Materiais + locação', fmt(result.totalInsumos), true)}</tbody></table>
  </section>`;

  let summary: string;
  let pricingSections: string;
  if (pricing) {
    const charged = result.precoCobrado;
    const taxes = charged * s.impostos / 100;
    const cardFee = charged * s.taxaCartao / 100 + pricing.paymentFixed;
    const salesCommission = charged * pricing.salesCommission / 100;
    const professionalPercent = charged * pricing.professionalPercent / 100;

    summary = [
      chip('Preço efetivamente cobrado', fmt(charged)),
      chip('Lucro estimado por atendimento', fmt(result.lucroEfetivo)),
      chip('Margem sobre o valor cobrado', percent(result.margemEfetiva)),
    ].join('');

    const directRows = [
      row('Materiais + locação', fmt(result.totalInsumos)),
      row('Profissional: valor fixo por atendimento', fmt(pricing.professionalFixed)),
      row('Custo direto total', fmt(result.custoDireto), true),
      row('Estrutura por atendimento', fmt(result.custoHoraProcedimento)),
      row('Base total de custo por atendimento', fmt(result.baseCusto), true),
    ].join('');

    const feeRows = [
      row('Forma de pagamento / configuração', pricing.paymentLabel || 'Taxa informada manualmente'),
      row('Impostos sobre o cobrado', percent(s.impostos)),
      row('Taxa percentual do pagamento', percent(s.taxaCartao)),
      row('Taxa fixa do pagamento', fmt(pricing.paymentFixed)),
      row('Comissão de venda sobre o cobrado', percent(pricing.salesCommission)),
      row('Profissional: percentual sobre o cobrado', percent(pricing.professionalPercent)),
      row('Margem-alvo sobre o cobrado', percent(pricing.targetMargin)),
      row('Margem mínima sobre o cobrado', percent(pricing.minMargin)),
      row('Desconto planejado sobre o preço comercial', percent(s.descontoPaciente)),
    ].join('');

    const priceRows = [
      row('Piso econômico (lucro zero)', fmt(result.piso)),
      row('Preço cobrado mínimo para a margem mínima', fmt(result.precoMinimoMargem)),
      row('Preço-alvo cobrado (após desconto)', fmt(result.preco)),
      row('Preço de tabela sugerido (antes do desconto)', fmt(result.precoTabela)),
      row('Preço comercial escolhido (antes do desconto)', fmt(result.precoComercial)),
      row('Desconto aplicado', `${percent(s.descontoPaciente)} · ${fmt(result.precoComercial - charged)}`),
      row('Preço efetivamente cobrado', fmt(charged), true),
      row('Desconto máximo sobre o preço comercial para manter a margem mínima', percent(result.descontoMaximo)),
      row('Cenário Pix: alvo sem custo de pagamento', fmt(result.precoPix)),
    ].join('');

    const resultRows = [
      row('Valor cobrado do paciente', fmt(charged)),
      row('(-) Custo direto', fmt(result.custoDireto)),
      row('(-) Estrutura alocada', fmt(result.custoHoraProcedimento)),
      row('(-) Impostos', fmt(taxes)),
      row('(-) Custo do pagamento (fixo + percentual)', fmt(cardFee)),
      row('(-) Comissão de venda', fmt(salesCommission)),
      row('(-) Profissional: remuneração percentual', fmt(professionalPercent)),
      row('Lucro estimado após todos os custos informados', fmt(result.lucroEfetivo), true),
      row('Margem efetiva sobre o cobrado', percent(result.margemEfetiva), true),
    ].join('');

    const installments = result.parcelas.map((amount, index) => row(`${index + 1}ª parcela`, fmt(amount))).join('');
    pricingSections = `
      <div class="columns">${section('Custo do atendimento', directRows)}${section('Encargos e metas de margem', feeRows)}</div>
      <div class="columns">${section('Do custo ao preço final', priceRows)}${section('Resultado no preço escolhido', resultRows)}</div>
      ${section(`Pagamento em ${pricing.installments} parcela(s)`, installments + row('Total das parcelas', fmt(charged), true))}
      <section class="assumptions"><h2>Como interpretar a simulação</h2>
        <p><strong>Preço-alvo cobrado</strong> = (base de custo + taxa fixa de pagamento) ÷ [1 − impostos% − taxa de pagamento% − comissão de venda% − profissional% − margem-alvo%]. Os percentuais usam a mesma base: o valor efetivamente cobrado.</p>
        <p><strong>Preço de tabela</strong> = preço-alvo cobrado ÷ (1 − desconto%). O preço comercial é o valor escolhido antes do desconto. O lucro e a margem efetiva são recalculados sobre o valor que o paciente paga.</p>
        <p><strong>Piso econômico</strong> cobre os custos informados e os encargos, sem lucro. O limite de desconto protege a margem mínima, não necessariamente a margem-alvo. A ocupação e os custos são premissas de planejamento, não garantia de receita ou lucro.</p>
        <p><strong>Sem dupla contagem:</strong> não inclua no rateio mensal materiais, comissões ou remuneração profissional já lançados diretamente ou como percentual da venda. A taxa fixa de pagamento é cobrada uma vez por venda. O cenário Pix pressupõe taxa de pagamento zero; confirme se isso se aplica à operação.</p>
        <p>Tributos, perdas, capacidade produtiva e remuneração profissional precisam refletir a operação real e ser conferidos pelos responsáveis. Salvar esta simulação não altera automaticamente os preços do catálogo.</p>
      </section>`;
  } else {
    summary = [
      chip('Preço sugerido legado', fmt(result.preco)),
      chip('Acréscimo da clínica sobre o custo', fmt(result.lucroClinicaVal)),
      chip('Markup da clínica', percent(s.lucroClinica)),
    ].join('');
    pricingSections = section('Composição do preço - fórmula legada', [
      row('Estrutura por atendimento', fmt(result.custoHoraProcedimento)),
      row('Insumos + locação', fmt(result.totalInsumos)),
      row('Base total de custo', fmt(result.baseCusto), true),
      row(`Markup da clínica sobre o custo (${percent(s.lucroClinica)})`, fmt(result.lucroClinicaVal)),
      row(`Acréscimo do parceiro sobre o custo (${percent(s.lucroParceiro)})`, fmt(result.lucroParceiroVal)),
      row('Impostos considerados', percent(s.impostos)),
      row('Taxa de cartão considerada', percent(s.taxaCartao)),
      row('Desconto considerado', percent(s.descontoPaciente)),
      row('Residual legado de impostos, taxas e desconto', fmt(result.impostosVal)),
      row('Preço sugerido legado', fmt(result.preco), true),
    ].join('')) + `<section class="assumptions"><h2>Modelo legado preservado</h2>
      <p>Preço = base de custo × (1 + markup da clínica% + acréscimo do parceiro%) ÷ (1 − impostos% − cartão% − desconto%).</p>
      <p><strong>Markup não é margem.</strong> Os percentuais da clínica e do parceiro são acréscimos sobre a base de custo, não percentuais de lucro sobre o preço de venda. Este relatório mantém os parâmetros e a fórmula do protocolo original; não o converte automaticamente ao modelo de margem.</p>
      <p>O rateio legado considera toda a capacidade informada. O desconto permanece agrupado com os encargos apenas para reproduzir a simulação histórica. Esses valores não devem ser interpretados como lucro efetivamente apurado.</p>
    </section>`;
  }

  const warnings = result.warnings.length
    ? `<aside class="warnings"><h2>Pontos de atenção</h2><ul>${result.warnings.map(warning => `<li>${escapeHtml(warning)}</li>`).join('')}</ul></aside>`
    : '';
  const metadata = [
    pricing ? `Modelo de margem v2 · Unidade: ${pricing.unit || 'Não informada'}` : 'Modelo legado · fórmula original',
    pricing?.referenceMonth ? `Mês de referência dos custos: ${pricing.referenceMonth}` : '',
    generatedAt && Number.isFinite(generatedAt.getTime())
      ? `Gerado em ${generatedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
      : '',
  ].filter(Boolean).map(value => `<div>${escapeHtml(value)}</div>`).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Precificação - ${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 28px; font: 13px/1.45 Arial, Helvetica, sans-serif; color: #1f2937; background: white; }
  .report { max-width: 1040px; margin: 0 auto; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 20px; border-bottom: 2px solid #db2777; padding-bottom: 14px; margin-bottom: 18px; }
  header img { height: 58px; width: 68px; object-fit: contain; }
  h1 { font-size: 22px; line-height: 1.2; margin: 0 0 6px; overflow-wrap: anywhere; }
  .brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .metadata { font-size: 11px; color: #6b7280; text-align: right; overflow-wrap: anywhere; }
  .subtitle { color: #6b7280; font-size: 11px; }
  .summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; padding: 16px; border: 1px solid #f9a8d4; background: #fdf2f8; border-radius: 12px; margin-bottom: 18px; }
  .chip { min-width: 0; }
  .chip span { display: block; font-size: 11px; color: #9d174d; }
  .chip strong { display: block; font-size: 22px; color: #9d174d; overflow-wrap: anywhere; }
  .columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 20px; }
  section { margin: 0 0 20px; min-width: 0; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #be185d; margin: 0 0 8px; padding-bottom: 6px; border-bottom: 1px solid #fbcfe8; break-after: avoid; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; table-layout: fixed; }
  th, td { padding: 6px 7px; vertical-align: top; border-bottom: 1px solid #e5e7eb; overflow-wrap: anywhere; }
  tbody th { font-weight: 400; text-align: left; width: 67%; }
  td { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
  thead th { font-weight: 700; text-align: right; color: #6b7280; }
  thead th:first-child { text-align: left; }
  .total th, .total td { font-weight: 700; background: #f9fafb; border-top: 1px solid #9ca3af; }
  .supplies td:first-child { text-align: left; font-weight: 400; }
  .supplies thead th:first-child { width: 28%; }
  .note, .assumptions p { font-size: 11px; color: #4b5563; margin: 8px 0; }
  .warnings { padding: 12px 16px; border: 1px solid #fcd34d; background: #fffbeb; border-radius: 8px; margin-bottom: 18px; }
  .warnings h2 { color: #92400e; border: 0; padding: 0; }
  .warnings ul { padding-left: 18px; margin: 0; font-size: 11px; }
  footer { border-top: 1px solid #e5e7eb; padding-top: 12px; font-size: 10px; color: #6b7280; margin-top: 8px; }
  @media (max-width: 640px) { body { padding: 16px; } header { flex-wrap: wrap; } .metadata { text-align: left; } .columns, .summary { grid-template-columns: 1fr; } .summary { gap: 14px; } .supplies { overflow-x: auto; } .supplies > table:first-of-type { min-width: 490px; } }
  @media print { @page { size: A4; margin: 14mm; } body { padding: 0; font-size: 11px; } header { margin-bottom: 12px; } .columns { grid-template-columns: repeat(2, minmax(0, 1fr)); } .summary { grid-template-columns: repeat(3, minmax(0, 1fr)); break-inside: avoid; padding: 12px; } .chip strong { font-size: 19px; } th, td { padding: 4px 6px; } section { break-inside: avoid; margin-bottom: 14px; } .supplies { break-inside: auto; overflow: visible; } .supplies > table:first-of-type { min-width: 0; } tr { break-inside: avoid; } thead { display: table-header-group; } h2 { break-after: avoid; } .warnings { break-inside: avoid; } * { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
</style></head><body><main class="report">
<header><div class="brand"><img src="${LOGO_BASE64}" alt="Virtuosa"><div><h1>${escapeHtml(title)}</h1><div class="subtitle">Memória de cálculo e formação do preço</div></div></div><div class="metadata">${metadata}</div></header>
<div class="summary">${summary}</div>${warnings}
<div class="columns">${section('Custos mensais da estrutura', monthlyRows)}${section('Capacidade e tempo de atendimento', operationRows)}</div>
${supplies}${pricingSections}
<footer>Virtuosa · Simulação gerencial baseada nos dados informados. Não constitui proposta comercial nem substitui a validação contábil. Preços de catálogo e vendas existentes não são alterados por este relatório.</footer>
</main></body></html>`;
}

/** Returns whether a valid report was opened; saving as PDF stays in the browser print dialog. */
export function generatePDF(s: CalcState): boolean {
  const html = buildPricingReportHtml(s, new Date());
  if (!html || typeof window === 'undefined') return false;
  const printWindow = window.open('', '_blank', 'width=1000,height=760');
  if (!printWindow) return false;
  try {
    printWindow.opener = null;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.setTimeout(() => {
      if (printWindow.closed) return;
      printWindow.focus();
      printWindow.print();
    }, 400);
    return true;
  } catch {
    printWindow.close();
    return false;
  }
}
