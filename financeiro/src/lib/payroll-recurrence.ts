export interface PayrollEmployeeIdentity {
  unit: string;
  employeeName: string;
}

export interface PayrollExclusionIdentity {
  unit: string;
  employeeKey: string;
}

function normalizePayrollUnitKey(unit: string) {
  return unit.normalize('NFKC').trim().toLocaleLowerCase('pt-BR');
}

export function normalizePayrollEmployeeKey(employeeName: string) {
  return employeeName
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR');
}

export function payrollEmployeeScopeKey(unit: string, employeeName: string) {
  return `${normalizePayrollUnitKey(unit)}\u0000${normalizePayrollEmployeeKey(employeeName)}`;
}

function payrollExclusionScopeKey(exclusion: PayrollExclusionIdentity) {
  return `${normalizePayrollUnitKey(exclusion.unit)}\u0000${normalizePayrollEmployeeKey(exclusion.employeeKey)}`;
}

export function selectRecurringPayrollEntries<T extends PayrollEmployeeIdentity>(
  candidates: T[],
  existingEntries: PayrollEmployeeIdentity[],
  exclusions: PayrollExclusionIdentity[],
) {
  const occupiedKeys = new Set(
    existingEntries.map(entry => payrollEmployeeScopeKey(entry.unit, entry.employeeName)),
  );
  const excludedKeys = new Set(exclusions.map(payrollExclusionScopeKey));

  return candidates.filter(candidate => {
    const key = payrollEmployeeScopeKey(candidate.unit, candidate.employeeName);
    if (occupiedKeys.has(key) || excludedKeys.has(key)) return false;
    occupiedKeys.add(key);
    return true;
  });
}
