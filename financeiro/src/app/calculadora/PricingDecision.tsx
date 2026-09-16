'use client';

import { calc, fmt, type CalcState } from './useCalc';
import { pricingInsights, PRICING_SOURCES } from '@/lib/pricing-insights';
import { NumberField, TextField } from './Etapas';
import { FieldHelp } from './FieldHelp';

const percent = (value: number) => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

export function PricingDecision({ s, set }: { s: CalcState; set: (update: Partial<CalcState>) => void }) {
  const r = calc(s);
  const insight = pricingInsights(s, r);
  const p = s.pricing;
  if (!p) return null;
  const update = (value: Partial<typeof p>) => set({ pricing: { ...p, ...value } });
  const price = (value: number) => r.valid ? fmt(value) : '—';
  return <section className="pricing-decision pricing-panel" id="pricing-decision" aria-labelledby="pricing-decision-title">
    <div className="pricing-section-heading"><div><p className="pricing-eyebrow">DECISÃO DE VENDA</p><h2 id="pricing-decision-title">Qual preço oferecer ao cliente?</h2></div><span className={`pricing-status pricing-status-${insight?.status ?? 'empty'}`} role="status">{insight?.label ?? 'Preencha as premissas'}</span></div>
    <div className="pricing-decision-grid">
      <div className="pricing-selling-price"><span>Cliente paga após desconto</span><strong>{price(r.precoCobrado)}</strong><p>{insight?.guidance ?? 'Comece pelos custos, informe a ocupação e defina a margem para obter uma recomendação.'}</p>
        <p className="pricing-caption">Tabela: {price(r.precoComercial)} · desconto: {percent(s.descontoPaciente)}</p>
        <button type="button" className="pricing-button" disabled={!r.valid} onClick={() => update({ finalPrice: r.precoTabela })}>Usar preço de tabela sugerido</button>
      </div>
      <div className="pricing-thresholds">{[
        ['01', 'Piso de cobertura', r.piso, 'Cobre os custos atribuídos, sem lucro.'],
        ['02', 'Mínimo para negociar', r.precoMinimoMargem, `Preserva sua margem mínima de ${percent(p.minMargin)}.`],
        ['03', 'Preço-alvo de venda', r.preco, `Busca sua margem-alvo de ${percent(p.targetMargin)}.`],
      ].map(([number, label, amount, detail]) => <div key={String(number)}><span className="pricing-threshold-number">{number}</span><div><span>{label}</span><strong>{price(Number(amount))}</strong><small>{detail}</small></div></div>)}<p className="pricing-caption">Todos são valores finais após desconto. O mínimo é uma escolha da gestão; a meta não é uma média do mercado.</p></div>
    </div>
    <div className="pricing-decision-metrics">
      <Metric label="Resultado por atendimento" value={price(r.lucroEfetivo)} help="Valor cobrado menos custos diretos, impostos, taxas, comissões e estrutura atribuída ao atendimento. É uma estimativa gerencial, não o lucro líquido contábil apurado do mês." />
      <Metric label="Margem sobre a venda" value={r.valid ? percent(r.margemEfetiva) : '—'} help="Resultado estimado dividido pelo valor cobrado. Margem de 20% significa R$20 de resultado em R$100 vendidos. É diferente de acrescentar 20% ao custo." />
      <Metric label="Margem de contribuição" value={insight ? fmt(insight.contribution) : '—'} detail={insight ? `${percent(insight.contributionPercent)} da venda` : undefined} help="Valor cobrado menos os custos e despesas variáveis do atendimento: consumo, profissional por sessão ou percentual, equipamento por sessão, impostos, comissões e taxas. Essa sobra ainda precisa cobrir a estrutura mensal; não é lucro." />
      <Metric label="Limite de desconto" value={r.valid ? percent(r.descontoMaximo) : '—'} help="Desconto máximo sobre o preço comercial para preservar a margem mínima. Se o próprio preço de tabela já for insuficiente, o limite é zero e o diagnóstico indicará que é necessário aumentar o preço." />
    </div>
    <div className="pricing-market">
      <div><p className="pricing-eyebrow">POSICIONAMENTO</p><h3>Compare com serviços equivalentes</h3><p>Registre uma pesquisa real da região: mesmo procedimento, quantidade, número de sessões e condição de pagamento. A faixa é sua referência, não uma cotação automática.</p></div>
      <div className="calc-fields-grid">
        <NumberField label="Menor preço pesquisado" help="Menor preço final encontrado para um serviço equivalente, já considerando desconto e a mesma condição de pagamento. Preencha os dois limites; zero nos dois significa que ainda não houve pesquisa." value={p.marketLow ?? 0} onChange={marketLow => update({ marketLow })} />
        <NumberField label="Maior preço pesquisado" help="Maior preço final comparável da sua pesquisa. Um valor acima dessa faixa precisa ser sustentado pelos diferenciais e pelo valor percebido pelo cliente, não apenas pelo desejo de margem." value={p.marketHigh ?? 0} onChange={marketHigh => update({ marketHigh })} />
      </div>
      <TextField label="Fonte, data e diferenciais" help="Registre onde e quando pesquisou, o que está incluído nos serviços comparados e quais diferenciais justificam seu posicionamento. Até 500 caracteres. Essa informação acompanha o protocolo e o relatório." value={p.marketReference ?? ''} onChange={marketReference => update({ marketReference })} placeholder="Ex.: pesquisa de setembro, mesma dose e sessões; acompanhamento incluído" />
      <div className="pricing-market-reading"><strong>{insight?.marketLabel ?? 'Comparação disponível após preencher um cenário válido'}</strong>
        {insight?.marketStatus === 'missing' ? <p>Informe a faixa para avaliar o posicionamento. O preço calculado continua sendo uma referência baseada em custos.</p> : insight && <p>Seu preço final: {fmt(r.precoCobrado)} · faixa informada: {fmt(p.marketLow ?? 0)} a {fmt(p.marketHigh ?? 0)}. {insight.marketStatus === 'above' ? 'Valide se o cliente percebe valor nos diferenciais que sustentam esse preço.' : insight.marketStatus === 'below' ? 'Confira se o serviço é equivalente e se a diferença é uma escolha de posicionamento.' : 'Estar dentro da faixa não garante demanda; avalie a aceitação dos clientes.'}</p>}
        {insight?.minimumAboveMarket ? <p className="pricing-danger">Até a margem mínima exige um preço acima do maior pesquisado. Reveja custos, ocupação ou proposta de valor antes de acompanhar a concorrência.</p> : insight?.targetAboveMarket && <p>A meta de margem exige um preço acima da faixa. Considere os diferenciais ou simule outra margem, preservando o limite mínimo.</p>}
      </div>
    </div>
    <details className="pricing-advanced"><summary>Volume, capacidade e diferença entre margem e markup</summary><div className="pricing-decision-metrics">
      <Metric label="Atendimentos para cobrir a estrutura" value={insight ? insight.breakEvenSessions === null ? 'Sem equilíbrio' : String(insight.breakEvenSessions) : '—'} help="Estrutura mensal dividida pela contribuição de um atendimento, arredondada para cima. Simulação hipotética de vender somente este procedimento, com custos mensais mantidos constantes. Para o mix real da clínica, use a contribuição de todos os serviços no DRE." />
      <Metric label="Capacidade mensal deste cenário" value={insight ? `${insight.capacity} atendimentos` : '—'} help="Horas produtivas planejadas divididas pelo tempo total de um atendimento, incluindo preparação, arredondadas para baixo. Pressupõe que toda a capacidade seja dedicada a este serviço." />
      <Metric label="Multiplicador sobre o custo" value={insight ? `${insight.markup.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}×` : '—'} help="Markup multiplicador = preço final cobrado ÷ (custo direto + estrutura atribuída + tarifa fixa). Inclui cobertura das despesas percentuais e resultado. Não deve ser interpretado como percentual de lucro." />
    </div>{insight?.exceedsCapacity && <p className="pricing-danger">Neste cenário de um único serviço, a contribuição e a capacidade planejadas não cobrem a estrutura mensal. Revise as premissas.</p>}
    <p className="pricing-caption">Classificação orientada por custos, margem de contribuição e posicionamento. Fontes: {PRICING_SOURCES.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}</a>)}</p></details>
  </section>;
}

function Metric({ label, value, detail, help }: { label: string; value: string; detail?: string; help: string }) {
  return <div className="pricing-metric"><div><span>{label}</span><FieldHelp label={label} help={help} /></div><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}
