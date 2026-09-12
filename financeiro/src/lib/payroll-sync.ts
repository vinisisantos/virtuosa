import { Prisma } from '@prisma/client';

export const PAYROLL_VERSION_CONFLICT_CODE = 'PAYROLL_VERSION_CONFLICT';
export const PAYROLL_VERSION_CONFLICT_MESSAGE = 'A folha foi atualizada em outro dispositivo. Recarregue os dados antes de salvar novamente.';

export interface PayrollRevisionSource {
  id: string;
  unit: string;
  updatedAt: Date | string;
}

export interface PayrollRevision {
  revision: string;
  lastModifiedAt: string | null;
}

export class PayrollWriteConflictError extends Error {
  constructor() {
    super(PAYROLL_VERSION_CONFLICT_MESSAGE);
    this.name = 'PayrollWriteConflictError';
  }
}

export function payrollWriteConflictPayload() {
  return {
    error: PAYROLL_VERSION_CONFLICT_MESSAGE,
    code: PAYROLL_VERSION_CONFLICT_CODE,
    reloadRequired: true,
  } as const;
}

export function parseOptionalExpectedUpdatedAt(value: unknown): Date | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') return null;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function matchesExpectedUpdatedAt(
  actual: Date | string,
  expected: Date | undefined,
) {
  return expected === undefined || new Date(actual).getTime() === expected.getTime();
}

export function nextPayrollUpdatedAt(actual: Date | string, now = new Date()) {
  return new Date(Math.max(now.getTime(), new Date(actual).getTime() + 1));
}

export function buildPayrollRevision(sources: PayrollRevisionSource[]): PayrollRevision {
  if (sources.length === 0) {
    return { revision: 'empty', lastModifiedAt: null };
  }

  const ordered = [...sources].sort((left, right) => (
    left.unit.localeCompare(right.unit, 'pt-BR') || left.id.localeCompare(right.id)
  ));
  const normalized = ordered.map(source => ({
    ...source,
    updatedAt: new Date(source.updatedAt).toISOString(),
  }));
  const lastModifiedAt = normalized.reduce(
    (latest, source) => source.updatedAt > latest ? source.updatedAt : latest,
    normalized[0].updatedAt,
  );

  return {
    // A lista completa evita falso negativo na visão global quando uma unidade
    // muda, mas outra já possui um timestamp posterior.
    revision: normalized
      .map(source => `${source.unit}\u0000${source.id}\u0000${source.updatedAt}`)
      .join('\u0001'),
    lastModifiedAt,
  };
}

type PayrollRevisionWriter = Pick<Prisma.TransactionClient, '$executeRaw'>;

export async function touchPayrollImportRevisions(
  database: PayrollRevisionWriter,
  payrollImportIds: string[],
) {
  const uniqueIds = [...new Set(payrollImportIds.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  // GREATEST + incremento garante uma revisão estritamente crescente mesmo
  // para duas gravações concluídas no mesmo milissegundo.
  await database.$executeRaw(
    Prisma.sql`
      UPDATE "PayrollImport"
      SET "updatedAt" = GREATEST(CURRENT_TIMESTAMP, "updatedAt" + INTERVAL '1 millisecond')
      WHERE "id" IN (${Prisma.join(uniqueIds)})
    `,
  );
}
