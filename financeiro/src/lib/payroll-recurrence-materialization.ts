import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  selectRecurringPayrollEntries,
} from '@/lib/payroll-recurrence';
import { touchPayrollImportRevisions } from '@/lib/payroll-sync';

interface PayrollCompetenceScope {
  month: number;
  year: number;
  unit?: string;
}

function previousCompetence(month: number, year: number) {
  return month === 1
    ? { month: 12, year: year - 1 }
    : { month: month - 1, year };
}

function recurrenceLockKey(scope: PayrollCompetenceScope, unit: string) {
  return `payroll-recurrence:${scope.year}-${String(scope.month).padStart(2, '0')}:${unit}`;
}

export async function materializeRecurringPayrollEntries(scope: PayrollCompetenceScope) {
  const previous = previousCompetence(scope.month, scope.year);
  const previousWhere: Prisma.PayrollImportWhereInput = {
    competenceMonth: previous.month,
    competenceYear: previous.year,
    ...(scope.unit ? { unit: scope.unit } : {}),
  };

  const sourceUnits = scope.unit
    ? [scope.unit]
    : (await prisma.payrollImport.findMany({
        where: previousWhere,
        distinct: ['unit'],
        select: { unit: true },
      })).map(source => source.unit);
  const lockedUnits = [...new Set(sourceUnits)].sort((left, right) => left.localeCompare(right, 'pt-BR'));
  if (lockedUnits.length === 0) return;

  await prisma.$transaction(async transaction => {
    // Não existe identidade única de colaborador no schema atual. O lock por
    // unidade/competência serializa a seleção e a criação sem exigir migração.
    for (const unit of lockedUnits) {
      await transaction.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${recurrenceLockKey(scope, unit)}))`,
      );
    }

    const currentWhere: Prisma.PayrollImportWhereInput = {
      competenceMonth: scope.month,
      competenceYear: scope.year,
      unit: { in: lockedUnits },
    };
    const exclusionWhere: Prisma.PayrollEntryExclusionWhereInput = {
      competenceMonth: scope.month,
      competenceYear: scope.year,
      unit: { in: lockedUnits },
    };

    const [previousImports, existingImports, exclusions] = await Promise.all([
      transaction.payrollImport.findMany({
        where: { ...previousWhere, unit: { in: lockedUnits } },
        select: {
          unit: true,
          entries: {
            where: { isRecurring: true },
            select: {
              employeeName: true,
              netSalary: true,
              baseSalary: true,
              cargo: true,
              hasAdiantamento: true,
              hasFgts: true,
              employmentType: true,
              hazardPayRate: true,
              hazardPayBase: true,
            },
          },
        },
      }),
      transaction.payrollImport.findMany({
        where: currentWhere,
        select: {
          id: true,
          unit: true,
          entries: { select: { employeeName: true } },
        },
      }),
      transaction.payrollEntryExclusion.findMany({
        where: exclusionWhere,
        select: { unit: true, employeeKey: true },
      }),
    ]);

    const recurringCandidates = previousImports.flatMap(payrollImport => (
      payrollImport.entries.map(entry => ({ ...entry, unit: payrollImport.unit }))
    ));
    const existingEmployees = existingImports.flatMap(payrollImport => (
      payrollImport.entries.map(entry => ({
        unit: payrollImport.unit,
        employeeName: entry.employeeName,
      }))
    ));
    const entriesToCreate = selectRecurringPayrollEntries(
      recurringCandidates,
      existingEmployees,
      exclusions,
    );
    const entriesByUnit = new Map<string, typeof entriesToCreate>();

    for (const entry of entriesToCreate) {
      const entries = entriesByUnit.get(entry.unit) || [];
      entries.push(entry);
      entriesByUnit.set(entry.unit, entries);
    }

    const touchedImportIds: string[] = [];
    for (const [unit, entries] of entriesByUnit) {
      const existingImport = existingImports.find(payrollImport => payrollImport.unit === unit);
      const payrollImport = existingImport || await transaction.payrollImport.upsert({
        where: {
          competenceMonth_competenceYear_unit: {
            competenceMonth: scope.month,
            competenceYear: scope.year,
            unit,
          },
        },
        update: {},
        create: {
          fileName: `Recorrente - ${unit} - ${scope.month}/${scope.year}`,
          competenceMonth: scope.month,
          competenceYear: scope.year,
          unit,
          processingStatus: 'completed',
        },
        select: { id: true, unit: true },
      });

      await transaction.payrollEntry.createMany({
        data: entries.map(entry => ({
          payrollImportId: payrollImport.id,
          employeeName: entry.employeeName,
          netSalary: entry.netSalary,
          baseSalary: entry.baseSalary,
          cargo: entry.cargo,
          bonus: 0,
          paymentStatus: 'unpaid',
          confidenceScore: 1,
          extractionSource: 'recurring',
          hasPenalty: false,
          hasAdiantamento: entry.hasAdiantamento,
          hasFgts: entry.hasFgts,
          employmentType: entry.employmentType,
          hazardPayRate: entry.hazardPayRate,
          hazardPayBase: entry.hazardPayBase,
          isRecurring: true,
          notes: null,
        })),
      });
      touchedImportIds.push(payrollImport.id);
    }

    await touchPayrollImportRevisions(transaction, touchedImportIds);
  }, { timeout: 20_000 });
}
