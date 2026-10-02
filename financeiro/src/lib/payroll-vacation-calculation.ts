export type InssBracket = { limit: number; rate: number };
export type IrrfBracket = { limit: number | null; rate: number; deduction: number };

export type IrrfTable = {
  brackets: readonly IrrfBracket[];
  simplifiedDeduction: number;
  reduction?: {
    fullReliefUpTo: number;
    partialReliefUpTo: number;
    partialIntercept: number;
    partialRate: number;
  };
};

export type VacationReceipt = {
  startDate: string;
  endDate: string;
  paymentDueDate: string;
  totalDays: number;
  baseSalary: number;
  vacation: number;
  third: number;
  inss: number;
  net: number;
};

export type VacationPayroll = {
  competence: { month: number; year: number };
  vacationDays: number;
  workedDays: number;
  earnings: { salary: number; vacation: number; third: number; bonus: number; total: number };
  deductions: {
    transport: number;
    inssSalary: number;
    inssVacationRetained: number;
    inssComplement: number;
    vacationAdvance: number;
    irrf: number;
    total: number;
  };
  inssBase: number;
  inssTotal: number;
  irrfBase: number;
  irrfDeduction: 'simplified' | 'legal';
  fgts: number;
  net: number;
};

const DAY_MS = 86_400_000;

function cents(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} deve ser não negativo e finito.`);
  return Math.round((value + Number.EPSILON) * 100);
}

function money(value: number): number {
  return value / 100;
}

function fraction(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(`${name} deve estar entre 0 e 1.`);
  return Math.round(value * 1_000_000);
}

function day(value: string | Date): number {
  const iso = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new RangeError('Informe a data no formato AAAA-MM-DD.');
  const [year, month, date] = iso.split('-').map(Number);
  const utc = Date.UTC(year, month - 1, date);
  if (new Date(utc).toISOString().slice(0, 10) !== iso) throw new RangeError('Data inválida.');
  return utc / DAY_MS;
}

function isoDate(dayNumber: number): string {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
}

function vacationMonths(receipt: VacationReceipt): Array<{ month: number; year: number; days: number }> {
  const result: Array<{ month: number; year: number; days: number }> = [];
  const start = day(receipt.startDate);
  const end = day(receipt.endDate);
  if (end - start + 1 !== receipt.totalDays || receipt.totalDays < 1 || receipt.totalDays > 30
    || cents(receipt.vacation, 'férias') + cents(receipt.third, 'terço de férias')
      - cents(receipt.inss, 'INSS das férias') !== cents(receipt.net, 'líquido das férias')) {
    throw new RangeError('Recibo de férias inconsistente.');
  }
  for (let current = start; current <= end; current += 1) {
    const date = new Date(current * DAY_MS);
    const month = date.getUTCMonth() + 1;
    const year = date.getUTCFullYear();
    const last = result.at(-1);
    if (last?.month === month && last.year === year) last.days += 1;
    else result.push({ month, year, days: 1 });
  }
  return result;
}

function allocate(receipt: VacationReceipt, month: number, year: number, total: number, salary = false): number {
  const months = vacationMonths(receipt);
  let allocated = 0;
  for (const [index, period] of months.entries()) {
    const amount = index === months.length - 1
      ? total - allocated
      : salary
        ? Math.round(cents(receipt.baseSalary, 'salário-base') * period.days / 30)
        : Math.round(total * period.days / receipt.totalDays);
    if (period.month === month && period.year === year) return amount;
    allocated += amount;
  }
  throw new RangeError('A competência não possui dias deste período de férias.');
}

export function calculateInss(base: number, brackets: readonly InssBracket[]): number {
  const taxable = cents(base, 'base INSS');
  if (brackets.length === 0) throw new RangeError('Informe as faixas do INSS.');
  let previous = 0;
  let totalMillionths = 0;
  for (const bracket of brackets) {
    const limit = cents(bracket.limit, 'limite INSS');
    if (limit <= previous) throw new RangeError('As faixas do INSS devem ser crescentes.');
    const portion = Math.max(0, Math.min(taxable, limit) - previous);
    totalMillionths += portion * fraction(bracket.rate, 'alíquota INSS');
    previous = limit;
    if (taxable <= limit) break;
  }
  return money(Math.round(totalMillionths / 1_000_000));
}

export function calculateVacationReceipt(input: {
  startDate: string | Date;
  endDate: string | Date;
  baseSalary: number;
  inssBrackets: readonly InssBracket[];
}): VacationReceipt {
  const start = day(input.startDate);
  const end = day(input.endDate);
  const totalDays = end - start + 1;
  if (totalDays < 1 || totalDays > 30) throw new RangeError('As férias devem ter entre 1 e 30 dias corridos.');
  const baseSalary = cents(input.baseSalary, 'salário-base');
  const vacation = Math.round(baseSalary * totalDays / 30);
  const third = Math.round(vacation / 3);
  const inss = cents(calculateInss(money(vacation + third), input.inssBrackets), 'INSS das férias');
  return {
    startDate: isoDate(start), endDate: isoDate(end), paymentDueDate: isoDate(start - 2),
    totalDays, baseSalary: money(baseSalary), vacation: money(vacation),
    third: money(third), inss: money(inss), net: money(vacation + third - inss),
  };
}

function calculateIrrf(
  salary: number,
  bonus: number,
  inssSalary: number,
  otherLegalDeductions: number,
  table: IrrfTable,
): { base: number; value: number; deduction: 'simplified' | 'legal' } {
  const income = salary + bonus;
  const legal = inssSalary + otherLegalDeductions;
  const simplified = cents(table.simplifiedDeduction, 'desconto simplificado IRRF');
  // O desconto simplificado substitui as deduções legais; não se soma ao INSS.
  const deduction = simplified > legal ? 'simplified' : 'legal';
  const base = Math.max(0, income - Math.max(simplified, legal));
  const bracket = table.brackets.find(item => item.limit === null || base <= cents(item.limit, 'limite IRRF'));
  if (!bracket) throw new RangeError('A tabela IRRF não cobre esta base.');
  let tax = Math.max(0, Math.round(base * fraction(bracket.rate, 'alíquota IRRF') / 1_000_000)
    - cents(bracket.deduction, 'parcela dedutível IRRF'));
  if (table.reduction) {
    const rule = table.reduction;
    if (income <= cents(rule.fullReliefUpTo, 'limite de redução IRRF')) tax = 0;
    else if (income <= cents(rule.partialReliefUpTo, 'limite de redução IRRF')) {
      const reduction = Math.max(0, cents(rule.partialIntercept, 'intercepto IRRF')
        - Math.round(income * fraction(rule.partialRate, 'taxa de redução IRRF') / 1_000_000));
      tax = Math.max(0, tax - reduction);
    }
  }
  return { base, value: tax, deduction };
}

type PayrollCompetenceInput = {
  competenceMonth: number;
  competenceYear: number;
  baseSalary: number;
  bonus?: number;
  transportEnabled: boolean;
  actualTransportCost: number | null;
  advancePaid: boolean;
  inssBrackets: readonly InssBracket[];
  irrfTable: IrrfTable;
  otherLegalDeductions?: number;
};

type VacationComponents = {
  days: number;
  vacation: number;
  third: number;
  retainedInss: number;
  advance: number;
};

function calculatePayrollFromComponents(input: PayrollCompetenceInput, components: VacationComponents): VacationPayroll {
  const { competenceMonth: month, competenceYear: year } = input;
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
    throw new RangeError('Competência inválida.');
  }
  if (components.days < 1 || components.days > 30) throw new RangeError('Dias de férias inválidos na competência.');
  const workedDays = 30 - components.days;
  const salary = Math.round(cents(input.baseSalary, 'salário-base') * workedDays / 30);
  const vacation = components.vacation;
  const third = components.third;
  const bonus = cents(input.bonus ?? 0, 'prêmio');
  const earningsTotal = salary + vacation + third + bonus;
  const inssBase = salary + vacation + third;
  const inssTotal = cents(calculateInss(money(inssBase), input.inssBrackets), 'INSS mensal');
  const inssSalary = inssBase === 0 ? 0 : Math.round(inssTotal * salary / inssBase);
  const inssVacationRetained = components.retainedInss;
  // O complemento pode ser negativo: nesse caso a rubrica devolve retenção excessiva.
  const inssComplement = inssTotal - inssSalary - inssVacationRetained;
  const transportLimit = input.actualTransportCost == null
    ? Number.POSITIVE_INFINITY : cents(input.actualTransportCost, 'custo real de VT');
  const transport = input.transportEnabled ? Math.min(Math.round(salary * 0.06), transportLimit) : 0;
  const vacationAdvance = components.advance;
  const irrf = calculateIrrf(
    salary, bonus, inssSalary, cents(input.otherLegalDeductions ?? 0, 'deduções legais IRRF'), input.irrfTable,
  );
  const deductionsTotal = transport + inssSalary + inssVacationRetained
    + inssComplement + vacationAdvance + irrf.value;
  return {
    competence: { month, year }, vacationDays: components.days, workedDays,
    earnings: {
      salary: money(salary), vacation: money(vacation), third: money(third),
      bonus: money(bonus), total: money(earningsTotal),
    },
    deductions: {
      transport: money(transport), inssSalary: money(inssSalary),
      inssVacationRetained: money(inssVacationRetained), inssComplement: money(inssComplement),
      vacationAdvance: money(vacationAdvance), irrf: money(irrf.value), total: money(deductionsTotal),
    },
    inssBase: money(inssBase), inssTotal: money(inssTotal), irrfBase: money(irrf.base),
    irrfDeduction: irrf.deduction, fgts: money(Math.round(inssBase * 0.08)),
    net: money(earningsTotal - deductionsTotal),
  };
}

export function calculateVacationPayroll(input: PayrollCompetenceInput & {
  receipt: VacationReceipt;
}): VacationPayroll {
  const { receipt, competenceMonth: month, competenceYear: year } = input;
  const period = vacationMonths(receipt).find(item => item.month === month && item.year === year);
  if (!period) throw new RangeError('A competência não possui dias deste período de férias.');
  return calculatePayrollFromComponents(input, {
    days: period.days,
    vacation: allocate(receipt, month, year, cents(receipt.vacation, 'férias'), true),
    third: allocate(receipt, month, year, cents(receipt.third, 'terço de férias')),
    retainedInss: input.advancePaid ? allocate(receipt, month, year, cents(receipt.inss, 'INSS das férias')) : 0,
    advance: input.advancePaid ? allocate(receipt, month, year, cents(receipt.net, 'líquido das férias')) : 0,
  });
}

export function calculateCombinedVacationPayroll(input: Omit<PayrollCompetenceInput, 'advancePaid'> & {
  periods: readonly { receipt: VacationReceipt; advancePaid: boolean }[];
}): VacationPayroll {
  const components = input.periods.reduce<VacationComponents>((sum, period) => {
    const month = vacationMonths(period.receipt).find(item =>
      item.month === input.competenceMonth && item.year === input.competenceYear,
    );
    if (!month) return sum;
    return {
      days: sum.days + month.days,
      vacation: sum.vacation + allocate(period.receipt, month.month, month.year, cents(period.receipt.vacation, 'férias'), true),
      third: sum.third + allocate(period.receipt, month.month, month.year, cents(period.receipt.third, 'terço de férias')),
      retainedInss: sum.retainedInss + (period.advancePaid
        ? allocate(period.receipt, month.month, month.year, cents(period.receipt.inss, 'INSS das férias')) : 0),
      advance: sum.advance + (period.advancePaid
        ? allocate(period.receipt, month.month, month.year, cents(period.receipt.net, 'líquido das férias')) : 0),
    };
  }, { days: 0, vacation: 0, third: 0, retainedInss: 0, advance: 0 });
  return calculatePayrollFromComponents({ ...input, advancePaid: false }, components);
}
