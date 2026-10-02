import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { InssBracket, IrrfTable } from '@/lib/payroll-vacation-calculation';

type TaxConfig = { inssBrackets: InssBracket[]; irrfTable: IrrfTable };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function parsePayrollTaxConfig(row: { inssBrackets: Prisma.JsonValue; irrfTable: Prisma.JsonValue }): TaxConfig {
  const inss = row.inssBrackets;
  const irrf = row.irrfTable;
  if (!Array.isArray(inss) || inss.length === 0 || !inss.every(item =>
    isRecord(item) && nonnegative(item.limit) && nonnegative(item.rate) && item.rate <= 1,
  )) throw new Error('Faixas de INSS inválidas na configuração da folha.');
  if (!isRecord(irrf) || !Array.isArray(irrf.brackets) || !nonnegative(irrf.simplifiedDeduction)
    || !irrf.brackets.every(item => isRecord(item)
      && (item.limit === null || nonnegative(item.limit))
      && nonnegative(item.rate) && item.rate <= 1 && nonnegative(item.deduction))) {
    throw new Error('Tabela de IRRF inválida na configuração da folha.');
  }
  if (irrf.reduction !== undefined && (!isRecord(irrf.reduction)
    || !nonnegative(irrf.reduction.fullReliefUpTo)
    || !nonnegative(irrf.reduction.partialReliefUpTo)
    || !nonnegative(irrf.reduction.partialIntercept)
    || !nonnegative(irrf.reduction.partialRate))) {
    throw new Error('Redução de IRRF inválida na configuração da folha.');
  }
  return { inssBrackets: inss as InssBracket[], irrfTable: irrf as unknown as IrrfTable };
}

export async function getPayrollTaxConfig(year: number): Promise<TaxConfig> {
  const row = await prisma.payrollTaxTable.findUnique({
    where: { year },
    select: { inssBrackets: true, irrfTable: true },
  });
  if (!row) throw new Error(`Tabela tributária da competência ${year} não configurada.`);
  return parsePayrollTaxConfig(row);
}
