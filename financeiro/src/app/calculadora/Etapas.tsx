'use client';

import React, { useId, useState } from 'react';
import { CalcState, Insumo, fmt, calc } from './useCalc';
import { FieldHelp } from './FieldHelp';

interface Props { s: CalcState; set: (update: Partial<CalcState>) => void }
type Pricing = NonNullable<CalcState['pricing']>;

export const inp: React.CSSProperties = { width: '100%', minWidth: 0, minHeight: 44, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', font: 'inherit', boxSizing: 'border-box' };

interface InputProps {
  id?: string;
  'aria-describedby'?: string;
  value: number;
  onChange: (value: number) => void;
  width?: number;
}

const decimalDisplay = (value: number) => value ? value.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) : '';
const moneyDisplay = (value: number) => value ? value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';

export function CurrencyInput({ value, onChange, width, ...props }: InputProps) {
  return <input {...props} type="text" inputMode="numeric" className="calc-input calc-input-number" value={moneyDisplay(value)}
    onChange={event => { const next = Number(event.target.value.replace(/\D/g, '')) / 100; if (Number.isFinite(next)) onChange(next); }}
    placeholder="0,00" style={width ? { width, maxWidth: '100%' } : undefined} />;
}

function DecimalInput({ value, onChange, integer = false, ...props }: InputProps & { integer?: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  return <input {...props} type="text" inputMode={integer ? 'numeric' : 'decimal'} className="calc-input calc-input-number" value={editing ?? decimalDisplay(value)}
    onFocus={() => setEditing(value ? String(value).replace('.', ',') : '')}
    onChange={event => {
      const raw = event.target.value;
      if (integer ? !/^\d*$/.test(raw) : !/^\d*([.,]\d*)?$/.test(raw)) return;
      setEditing(raw);
      const next = Number(raw.replace(',', '.'));
      if (Number.isFinite(next)) onChange(next);
    }}
    onBlur={() => setEditing(null)} placeholder="0" />;
}

function Field({ label, help, children }: { label: string; help: string; children: (id: string, descriptionId: string) => React.ReactNode }) {
  const id = useId();
  const descriptionId = `${id}-help`;
  return <div className="calc-field"><div className="calc-field-label-row"><label htmlFor={id} className="calc-field-label">{label}</label><FieldHelp label={label} help={help} descriptionId={descriptionId} /></div>{children(id, descriptionId)}</div>;
}

function NumberField({ label, help, value, onChange, kind = 'money', suffix }: { label: string; help: string; value: number; onChange: (value: number) => void; kind?: 'money' | 'decimal' | 'integer'; suffix?: string }) {
  return <Field label={label} help={help}>{(id, descriptionId) => <div className="calc-input-wrap">
    {kind === 'money' && <span className="calc-input-affix" aria-hidden="true">R$</span>}
    {kind === 'money' ? <CurrencyInput id={id} aria-describedby={descriptionId} value={value} onChange={onChange} /> : <DecimalInput id={id} aria-describedby={descriptionId} value={value} onChange={onChange} integer={kind === 'integer'} />}
    {suffix && <span className="calc-input-affix" aria-hidden="true">{suffix}</span>}
  </div>}</Field>;
}

function TextField({ label, help, value, onChange, placeholder, type = 'text' }: { label: string; help: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: 'text' | 'month' }) {
  return <Field label={label} help={help}>{(id, descriptionId) => <input id={id} aria-describedby={descriptionId} type={type} className="calc-input" value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} />}</Field>;
}

function Step({ number, title, description, children }: { number: number; title: string; description: string; children: React.ReactNode }) {
  return <section className="calc-step"><header className="calc-step-heading"><span className="calc-step-number" aria-hidden="true">{number}</span><div><h2>{title}</h2><p>{description}</p></div></header>{children}</section>;
}

function Subheading({ children }: { children: React.ReactNode }) { return <h3 className="calc-step-subheading">{children}</h3>; }

function Result({ label, value, help }: { label: string; value: string; help: string }) {
  return <div className="calc-step-result"><div className="calc-field-label-row"><span>{label}</span><FieldHelp label={label} help={help} /></div><strong>{value}</strong></div>;
}

function updatePricing(s: CalcState, set: Props['set'], update: Partial<Pricing>) {
  if (s.pricing) set({ pricing: { ...s.pricing, ...update } });
}

export function Etapa1({ s, set }: Props) {
  const r = calc(s);
  const fixedFields: Array<[keyof Pick<CalcState, 'aluguel' | 'energiaEletrica' | 'aguaInternet' | 'contador' | 'salarios' | 'proLabore'>, string, string]> = [
    ['aluguel', 'Aluguel / espaço', 'Custo mensal do imóvel usado pela unidade. Inclua condomínio e IPTU se fizerem parte desta despesa; não repita esses valores em Outros.'],
    ['energiaEletrica', 'Energia elétrica', 'Média mensal de energia da unidade no período de referência. Use uma média representativa quando houver oscilação.'],
    ['aguaInternet', 'Água / internet', 'Despesas mensais de água, internet e telefonia da unidade. Some apenas o que não aparece em outro campo.'],
    ['contador', 'Contabilidade', 'Honorários mensais da contabilidade. Impostos sobre faturamento entram na etapa 2, não aqui.'],
    ['salarios', 'Equipe: salários e encargos', 'Custo mensal completo da equipe: salários, encargos, benefícios e provisões de férias e 13º, quando aplicáveis. Não repita remuneração já atribuída por atendimento ou como percentual. A folha paga pode não incluir todos esses custos.'],
    ['proLabore', 'Pró-labore', 'Remuneração mensal dos sócios pelo trabalho, com os encargos aplicáveis. Não é a margem de lucro da empresa.'],
  ];
  const otherFields: Array<[keyof Pick<CalcState, 'materiaisGerais' | 'marketingTrafego' | 'comissoes' | 'taxasPlataformas' | 'outros'>, string, string]> = [
    ['materiaisGerais', 'Materiais de uso geral', 'Somente materiais de estrutura, como limpeza e escritório. Produtos consumidos no procedimento entram na etapa 3. Compra de estoque não é o mesmo que consumo mensal: evite duplicidade.'],
    ['marketingTrafego', 'Marketing / tráfego', 'Investimento mensal atribuído à unidade. Não inclua novamente esse valor como custo direto de aquisição do mesmo atendimento.'],
    ['comissoes', 'Comissões fixas mensais', 'Somente comissões ou remunerações fixas que não dependem do preço desta venda. Percentuais pagos por venda ou ao profissional entram na etapa 2.'],
    ['taxasPlataformas', 'Sistemas e plataformas', 'Assinaturas mensais de software e plataformas. Taxas cobradas por transação ou parcela entram nas condições de pagamento, na etapa 2.'],
    ['outros', 'Outras despesas da estrutura', 'Despesas mensais ainda não consideradas: manutenção, seguros, depreciação econômica e provisões, conforme sua base de custos. Não repita aluguel, equipe, produtos ou taxas já informados.'],
  ];
  return <Step number={1} title="Estrutura e capacidade" description="Distribua os custos mensais pelas horas que podem realmente ser ocupadas.">
    <Subheading>Custos fixos mensais</Subheading>
    <div className="calc-fields-grid">{fixedFields.map(([key, label, help]) => <NumberField key={key} label={label} help={help} value={s[key]} onChange={value => set({ [key]: value })} />)}</div>
    <Subheading>Demais despesas mensais</Subheading>
    <div className="calc-fields-grid">{otherFields.map(([key, label, help]) => <NumberField key={key} label={label} help={help} value={s[key]} onChange={value => set({ [key]: value })} />)}</div>
    <Subheading>Capacidade de atendimento</Subheading>
    <div className="calc-fields-grid">
      <NumberField label="Dias trabalhados no mês" help="Quantidade de dias com atendimento no período. Desconte feriados, fechamentos e dias sem operação. Deve ser maior que zero." kind="integer" suffix="dias" value={s.diasTrabalhados} onChange={value => set({ diasTrabalhados: value })} />
      <NumberField label="Horas disponíveis por dia" help="Horas inteiras de funcionamento por dia, sem intervalos em que não há atendimento. Complete os minutos no próximo campo. Não é a duração deste procedimento." kind="integer" suffix="h" value={s.horasDia} onChange={value => set({ horasDia: value })} />
      <NumberField label="Minutos adicionais por dia" help="Minutos adicionais às horas diárias, entre 0 e 59. Exemplo: para 8h30, informe 8 horas e 30 minutos." kind="integer" suffix="min" value={s.minutosDia} onChange={value => set({ minutosDia: value })} />
      <NumberField label="Salas atendidas simultaneamente" help="Quantidade de salas que a equipe consegue operar ao mesmo tempo. Se há 3 salas, mas equipe para apenas 2 atendimentos simultâneos, use 2. Não some salas sem profissional disponível." kind="integer" suffix="salas" value={s.qtdSalas} onChange={value => set({ qtdSalas: value })} />
      {s.pricing && <NumberField label="Ocupação prevista" help="Percentual da capacidade que será efetivamente ocupado, incluindo preparo. Exemplo: 100 horas disponíveis e 60 ocupadas = 60%. Use a agenda como base. Zero deixa a simulação incompleta; 100% significa nenhuma ociosidade." kind="decimal" suffix="%" value={s.pricing.occupancy} onChange={occupancy => updatePricing(s, set, { occupancy })} />}
    </div>
    {!s.pricing && <p className="calc-field-note">Modelo legado: o rateio considera 100% da capacidade disponível.</p>}
    <Result label="Custo da hora produtiva" value={s.pricing && s.pricing.occupancy <= 0 ? 'Informe a ocupação' : r.valid ? fmt(r.horaMaca) : '—'} help="Custos mensais divididos pelas horas disponíveis × salas simultâneas × ocupação prevista. É um rateio estimado: uma ocupação real menor pode reduzir a rentabilidade." />
  </Step>;
}

export function Etapa2({ s, set }: Props) {
  const r = calc(s);
  return <Step number={2} title="Taxas, comissões e margem" description="Separe o que sai de cada venda do lucro que deve permanecer na clínica.">
    <div className="calc-fields-grid">
      <NumberField label="Impostos sobre a venda" help="Alíquota efetiva sobre o valor realmente cobrado do paciente. Confirme a alíquota aplicável com a contabilidade. Não use o total de impostos mensais dividido apenas por este procedimento." kind="decimal" suffix="%" value={s.impostos} onChange={impostos => set({ impostos })} />
      <NumberField label="Taxa do pagamento" help="Percentual cobrado pelo meio de pagamento, considerando operadora, bandeira, parcelamento e antecipação, quando houver. Incide sobre o valor cobrado. Uma taxa cadastrada pode preencher este campo; revise se mudar as parcelas." kind="decimal" suffix="%" value={s.taxaCartao} onChange={taxaCartao => set({ taxaCartao })} />
      <NumberField label="Desconto planejado" help={s.pricing ? 'Desconto aplicado sobre o preço de tabela. A tabela sugerida é ajustada para que o valor após desconto preserve a margem-alvo. Ao definir um preço comercial manual, o mesmo desconto será aplicado a ele. Deve ser menor que 100%.' : 'Regra legada: este percentual é somado às taxas no denominador. O comportamento foi preservado para não alterar simulações antigas.'} kind="decimal" suffix="%" value={s.descontoPaciente} onChange={descontoPaciente => set({ descontoPaciente })} />
      {s.pricing ? <>
        <NumberField label="Tarifa fixa por venda" help="Valor fixo cobrado pela transação, além da taxa percentual. Se for cobrado em cada parcela, informe a soma das tarifas de todas as parcelas. Não repita taxas mensais de plataforma." value={s.pricing.paymentFixed} onChange={paymentFixed => updatePricing(s, set, { paymentFixed })} />
        <NumberField label="Comissão comercial" help="Percentual do valor efetivamente cobrado pago a quem realizou a venda. Não repita comissões já incluídas nas despesas mensais ou na remuneração profissional." kind="decimal" suffix="%" value={s.pricing.salesCommission} onChange={salesCommission => updatePricing(s, set, { salesCommission })} />
        <NumberField label="Profissional: percentual" help="Percentual do valor efetivamente cobrado destinado ao profissional. Preencha somente quando o contrato usar essa base. Se também existir valor fixo por sessão, informe-o na etapa 3; não duplique o mesmo pagamento." kind="decimal" suffix="%" value={s.pricing.professionalPercent} onChange={professionalPercent => updatePricing(s, set, { professionalPercent })} />
        <NumberField label="Margem-alvo da clínica" help="Percentual da receita cobrada que deve sobrar depois de todos os custos e taxas considerados. Não é acréscimo sobre custo. Venda de R$700 com sobra de R$140 tem margem de 20%. Defina sua meta; não há percentual ideal universal." kind="decimal" suffix="%" value={s.pricing.targetMargin} onChange={targetMargin => updatePricing(s, set, { targetMargin })} />
        <NumberField label="Margem mínima para negociar" help="Menor margem a preservar nas negociações, usada no limite de desconto. Zero cobre apenas os custos atribuídos, sem lucro. Uma margem positiva protege uma sobra. Não deve superar a margem-alvo." kind="decimal" suffix="%" value={s.pricing.minMargin} onChange={minMargin => updatePricing(s, set, { minMargin })} />
      </> : <>
        <NumberField label="Acréscimo da clínica sobre custo" help="Markup legado: percentual acrescentado ao custo, não margem sobre a venda. Custo de R$100 com acréscimo de 70% resulta em R$170 antes das deduções. O histórico foi preservado sem reinterpretar o percentual." kind="decimal" suffix="%" value={s.lucroClinica} onChange={lucroClinica => set({ lucroClinica })} />
        <NumberField label="Acréscimo do parceiro sobre custo" help="Markup legado aplicado sobre o custo-base. Não equivale a comissão sobre o preço vendido. Este campo conserva a regra das simulações antigas." kind="decimal" suffix="%" value={s.lucroParceiro} onChange={lucroParceiro => set({ lucroParceiro })} />
      </>}
    </div>
    <Result label="Custo-base atribuído" value={r.valid ? fmt(r.baseCusto) : '—'} help="Insumos, equipamentos e estrutura alocada ao tempo deste procedimento. No modelo por margem, inclui o profissional fixo por atendimento; a tarifa do pagamento será coberta na formação do preço." />
  </Step>;
}

export function Etapa3({ s, set }: Props) {
  const r = calc(s);
  const updateInsumo = (index: number, update: Partial<Insumo>) => set({ insumos: s.insumos.map((item, i) => i === index ? { ...item, ...update } : item) });
  return <Step number={3} title="Ficha de custos do procedimento" description="Registre o consumo de uma sessão. Use a mesma unidade na quantidade e no custo unitário.">
    <div className="calc-supplies">
      {s.insumos.map((item, index) => <div className="calc-supply-card" key={index}>
        <div className="calc-supply-heading"><h3>Insumo {index + 1}</h3><button type="button" className="calc-button-subtle" onClick={() => set({ insumos: s.insumos.filter((_, i) => i !== index) })} aria-label={`Remover insumo ${index + 1}${item.nome ? `: ${item.nome}` : ''}`}>Remover</button></div>
        <div className="calc-fields-grid">
          <TextField label={`Nome do insumo ${index + 1}`} help="Material ou produto consumido nesta sessão. Não inclua produtos apenas comprados para estoque. Informe equipamentos no campo separado abaixo para evitar duplicidade." value={item.nome} onChange={nome => updateInsumo(index, { nome })} placeholder="Ex.: produto, seringa, luva" />
          {s.pricing && <TextField label={`Unidade do insumo ${index + 1}`} help="Unidade usada no consumo e no custo: ml, unidade, par, g etc. Frasco de 10 ml a R$200 corresponde a R$20 por ml. O texto não converte unidades automaticamente." value={item.unidade ?? ''} onChange={unidade => updateInsumo(index, { unidade })} placeholder="Ex.: ml, un, par" />}
          <NumberField label={s.pricing ? `Custo unitário do insumo ${index + 1}` : `Custo do insumo ${index + 1}`} help={s.pricing ? 'Custo de uma unidade na medida informada. Divida a compra pelo conteúdo: frasco de 10 ml a R$200 = R$20/ml. Frete e custos de aquisição podem compor esse valor; não repita custos mensais rateados.' : 'Custo direto deste insumo por procedimento no modelo legado. A quantidade não é multiplicada neste modo.'} value={item.valor} onChange={valor => updateInsumo(index, { valor })} />
          {s.pricing && <>
            <NumberField label={`Quantidade do insumo ${index + 1}`} help="Quantidade útil necessária para uma sessão, na unidade informada. Para consumo de 2,5 ml com custo por ml, informe 2,5. Quantidade zero exclui o custo do item." kind="decimal" value={item.quantidade ?? 1} onChange={quantidade => updateInsumo(index, { quantidade })} />
            <NumberField label={`Perda do insumo ${index + 1}`} help="Percentual do produto comprado que não pode ser aproveitado. Consumo = quantidade útil ÷ (1 − perda). Exemplo: 10 unidades úteis com 20% de perda exigem 12,5 unidades compradas. Use zero se não houver perda; deve ser menor que 100%." kind="decimal" suffix="%" value={item.perdaPercentual ?? 0} onChange={perdaPercentual => updateInsumo(index, { perdaPercentual })} />
          </>}
        </div>
      </div>)}
      {s.insumos.length === 0 && <p className="calc-field-note">Nenhum insumo informado. Adicione os materiais utilizados nesta sessão.</p>}
    </div>
    <button type="button" className="calc-button-outline" disabled={s.insumos.length >= 100} onClick={() => set({ insumos: [...s.insumos, { nome: '', valor: 0, ...(s.pricing ? { quantidade: 1, unidade: 'un', perdaPercentual: 0 } : {}) }] })}>+ Adicionar insumo</button>
    {s.insumos.length >= 100 && <p className="calc-field-note">Limite de 100 insumos por simulação.</p>}
    <Subheading>Outros custos por atendimento</Subheading>
    <div className="calc-fields-grid">
      <NumberField label="Equipamento / locação por sessão" help="Custo do aparelho atribuído a uma sessão. Se a locação cobrir várias sessões, divida pelo número previsto. Preencha aqui ou como insumo, nunca nos dois. Não repita manutenção ou depreciação já rateada na estrutura." value={s.locacaoAparelho} onChange={locacaoAparelho => set({ locacaoAparelho })} />
      {s.pricing && <NumberField label="Profissional: valor fixo por sessão" help="Remuneração fixa por atendimento. Não repita salário já considerado na estrutura. Se o contrato for percentual sobre a venda, use a etapa 2. Só combine fixo e percentual se ambos forem realmente pagos." value={s.pricing.professionalFixed} onChange={professionalFixed => updatePricing(s, set, { professionalFixed })} />}
    </div>
    <Result label="Insumos e equipamento" value={r.valid ? fmt(r.totalInsumos) : '—'} help="Consumo dos insumos com perdas, mais equipamento por sessão. A remuneração fixa do profissional é acrescentada separadamente ao custo-base." />
  </Step>;
}

export function Etapa4({ s, set }: Props) {
  const r = calc(s);
  return <Step number={4} title="Procedimento e preço comercial" description="Defina o tempo ocupado e compare um preço escolhido com a recomendação.">
    <div className="calc-fields-grid">
      <TextField label="Nome do procedimento / protocolo" help="Identifique o procedimento e o tamanho da sessão: nome, volume de produto, região ou número de sessões. Todos os custos e tempos devem representar o mesmo serviço que será vendido." value={s.nome} onChange={nome => set({ nome })} placeholder="Ex.: procedimento — uma sessão" />
      {s.pricing && <TextField label="Mês de referência dos custos" help="Mês usado como base para despesas e capacidade. Serve para rastrear a origem dos valores. Mudar o mês não busca dados financeiros nem atualiza custos automaticamente." type="month" value={s.pricing.referenceMonth} onChange={referenceMonth => updatePricing(s, set, { referenceMonth })} />}
      <NumberField label="Duração: horas" help="Horas inteiras em que o atendimento ocupa sala/equipe. Complete os minutos no próximo campo. Para pacotes, informe tempo e insumos totais do mesmo pacote, ou calcule uma sessão separadamente." kind="integer" suffix="h" value={s.duracaoHoras} onChange={duracaoHoras => set({ duracaoHoras })} />
      <NumberField label="Duração: minutos adicionais" help="Minutos adicionais da sessão, entre 0 e 59. Exemplo: para 1h30, informe 1 hora e 30 minutos. A duração total precisa ser maior que zero." kind="integer" suffix="min" value={s.duracaoMinutos} onChange={duracaoMinutos => set({ duracaoMinutos })} />
      {s.pricing && <>
        <NumberField label="Preparo / limpeza / apoio" help="Minutos adicionais em que sala/equipe fica ocupada antes e depois do procedimento: preparo, higienização e apoio desta sessão. Não repita tempo já incluído na duração." kind="integer" suffix="min" value={s.pricing.preparationMinutes} onChange={preparationMinutes => updatePricing(s, set, { preparationMinutes })} />
        <NumberField label="Preço comercial de tabela" help="Preço de tabela que deseja praticar, antes do desconto planejado. Zero usa a tabela sugerida. A calculadora mostra o valor cobrado após desconto e a margem efetiva. A simulação não altera catálogo, contratos ou vendas existentes." value={s.pricing.finalPrice} onChange={finalPrice => updatePricing(s, set, { finalPrice })} />
        <NumberField label="Número de parcelas" help="Quantidade de parcelas do valor cobrado, com eventual ajuste de centavos. Escolha a taxa correspondente nas condições de pagamento: aumentar parcelas não cria juros nem altera uma taxa manual automaticamente." kind="integer" suffix="vezes" value={s.pricing.installments} onChange={installments => updatePricing(s, set, { installments })} />
      </>}
    </div>
    <Result label="Estrutura neste procedimento" value={r.valid ? fmt(r.custoHoraProcedimento) : '—'} help="Custo da hora produtiva multiplicado pela duração e, no modelo por margem, pelo tempo adicional de preparo e limpeza. Não é o custo total: insumos e remunerações são somados depois." />
  </Step>;
}
