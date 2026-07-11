// Pricing calculation logic
export { formatCurrency as fmt } from '@/lib/currency';

export interface Insumo { nome: string; valor: number }

export interface CalcState {
  // Fixed costs
  aluguel: number; energiaEletrica: number; aguaInternet: number;
  contador: number; salarios: number; proLabore: number;
  // Variable costs
  materiaisGerais: number; marketingTrafego: number; comissoes: number;
  taxasPlataformas: number; outros: number;
  // Operation
  diasTrabalhados: number; horasDia: number; minutosDia: number; qtdSalas: number;
  // Taxes
  impostos: number; taxaCartao: number; descontoPaciente: number;
  lucroClinica: number; lucroParceiro: number;
  // Protocol
  nome: string; duracaoHoras: number; duracaoMinutos: number;
  insumos: Insumo[]; locacaoAparelho: number;
}

export const defaultState: CalcState = {
  aluguel: 0, energiaEletrica: 0, aguaInternet: 0, contador: 0, salarios: 0, proLabore: 0,
  materiaisGerais: 0, marketingTrafego: 0, comissoes: 0, taxasPlataformas: 0, outros: 0,
  diasTrabalhados: 26, horasDia: 8, minutosDia: 0, qtdSalas: 1,
  impostos: 8, taxaCartao: 12, descontoPaciente: 10, lucroClinica: 70, lucroParceiro: 0,
  nome: '', duracaoHoras: 1, duracaoMinutos: 0, locacaoAparelho: 0,
  insumos: [
    { nome: 'Insumo 1', valor: 0 }, { nome: 'Insumo 2', valor: 0 },
    { nome: 'Insumo 3', valor: 0 }, { nome: 'Insumo 4', valor: 0 },
    { nome: 'Insumo 5', valor: 0 }, { nome: 'Insumo 6', valor: 0 },
    { nome: 'Insumo 7', valor: 0 }, { nome: 'Insumo 8', valor: 0 },
    { nome: 'Locação de Aparelho', valor: 0 },
  ],
};

export function calc(s: CalcState) {
  const fixos = s.aluguel + s.energiaEletrica + s.aguaInternet + s.contador + s.salarios + s.proLabore;
  const variaveis = s.materiaisGerais + s.marketingTrafego + s.comissoes + s.taxasPlataformas + s.outros;
  const custosMensais = fixos + variaveis;
  const horasMes = s.diasTrabalhados * (s.horasDia + s.minutosDia / 60);
  const horaMaca = horasMes > 0 && s.qtdSalas > 0 ? custosMensais / horasMes / s.qtdSalas : 0;
  const totalInsumos = s.insumos.reduce((a, i) => a + i.valor, 0) + s.locacaoAparelho;
  const duracaoDecimal = s.duracaoHoras + s.duracaoMinutos / 60;
  const custoHoraProcedimento = horaMaca * duracaoDecimal;
  const baseCusto = custoHoraProcedimento + totalInsumos;
  const lucroClinicaVal = baseCusto * (s.lucroClinica / 100);
  const lucroParceiroVal = baseCusto * (s.lucroParceiro / 100);
  const subtotal = baseCusto + lucroClinicaVal + lucroParceiroVal;
  const totalDeducoes = (s.impostos + s.taxaCartao + s.descontoPaciente) / 100;
  const preco = totalDeducoes < 1 ? subtotal / (1 - totalDeducoes) : subtotal;
  const impostosVal = preco - subtotal;
  return { fixos, variaveis, custosMensais, horaMaca, totalInsumos, baseCusto, lucroClinicaVal, lucroParceiroVal, preco, impostosVal, custoHoraProcedimento };
}
