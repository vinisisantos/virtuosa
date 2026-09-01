const FINANCIAL_COST_PERMISSIONS = ['financeiro', 'finCustos', 'finAnalise'] as const;
const FINANCIAL_COST_MANAGE_PERMISSIONS = ['financeiro', 'finCustos'] as const;

type PermissionUser = {
  isAdmin: boolean;
  permissions?: Record<string, boolean> | null;
};

export type Competence = {
  month: number;
  year: number;
};

export type ParsedCostRecognitionDate =
  | { valid: true; value: Date | null }
  | { valid: false; value: null };

export function automaticPayrollPaymentTotals(params: {
  salary: number;
  fgts: number;
  paymentStatus: string;
}): {
  paidTotal: number;
  pendingTotal: number;
  paidSalaryTotal: number;
  pendingSalaryTotal: number;
  paidFgtsTotal: number;
  pendingFgtsTotal: number;
} {
  const total = params.salary + params.fgts;
  return params.paymentStatus === 'paid'
    ? {
        paidTotal: total,
        pendingTotal: 0,
        paidSalaryTotal: params.salary,
        pendingSalaryTotal: 0,
        paidFgtsTotal: params.fgts,
        pendingFgtsTotal: 0,
      }
    : {
        paidTotal: 0,
        pendingTotal: total,
        paidSalaryTotal: 0,
        pendingSalaryTotal: params.salary,
        paidFgtsTotal: 0,
        pendingFgtsTotal: params.fgts,
      };
}

function hasAdminAccess(user: PermissionUser): boolean {
  return user.isAdmin || user.permissions?.admin === true;
}

export function canAccessOrders(user: PermissionUser): boolean {
  return hasAdminAccess(user) || user.permissions?.pedidos === true;
}

export function canApproveOrderChanges(user: PermissionUser): boolean {
  return hasAdminAccess(user) || user.permissions?.pedidosAprovar === true;
}

export function canViewOrderHistory(user: PermissionUser): boolean {
  return hasAdminAccess(user) || user.permissions?.pedidosHistorico === true;
}

export function canDeleteOrderHistory(user: PermissionUser): boolean {
  return hasAdminAccess(user) || user.permissions?.pedidosExcluirHistorico === true;
}

export function canAccessAutomaticCosts(user: PermissionUser): boolean {
  return hasAdminAccess(user) || FINANCIAL_COST_PERMISSIONS.some(
    (permission) => user.permissions?.[permission] === true,
  );
}

export function canManageAutomaticCosts(user: PermissionUser): boolean {
  return hasAdminAccess(user) || FINANCIAL_COST_MANAGE_PERMISSIONS.some(
    (permission) => user.permissions?.[permission] === true,
  );
}

export function canManageOrderCostRecognition(user: PermissionUser): boolean {
  return hasAdminAccess(user) || (
    user.permissions?.pedidos === true
    && FINANCIAL_COST_MANAGE_PERMISSIONS.some(permission => user.permissions?.[permission] === true)
  );
}

export function validateCostRecognitionTarget(params: {
  recognizing: boolean;
  totalPrice: number | null;
  status: string;
}): string | null {
  if (!params.recognizing) return null;
  if (!params.totalPrice || params.totalPrice <= 0) {
    return 'Informe um valor total maior que zero antes de lançar o pedido em custos';
  }
  if (params.status === 'Cancelado') {
    return 'Pedidos cancelados não podem ser lançados em custos';
  }
  return null;
}

export function validateRecognizedOrderMutation(params: {
  isRecognized: boolean;
  nextStatus: string;
  nextTotalPrice: number | null;
  deleting?: boolean;
}): string | null {
  if (!params.isRecognized) return null;
  if (params.deleting) return 'Remova o pedido de Custos antes de excluí-lo';
  if (params.nextStatus === 'Cancelado') return 'Remova o pedido de Custos antes de cancelá-lo';
  if (!params.nextTotalPrice || params.nextTotalPrice <= 0) {
    return 'Remova o pedido de Custos antes de zerar o valor total';
  }
  return null;
}

export function parseCostsPeriod(monthValue: string | null, yearValue: string | null): Competence | null {
  const month = Number(monthValue);
  const year = Number(yearValue);

  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(year) || year < 2000 || year > 9999) return null;

  return { month, year };
}

export function previousCompetence({ month, year }: Competence): Competence {
  return month === 1
    ? { month: 12, year: year - 1 }
    : { month: month - 1, year };
}

export function utcMonthRange({ month, year }: Competence): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1)),
  };
}

export function costRecognitionDateKey(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) || null;
}

export function parseCostRecognitionDate(value: unknown): ParsedCostRecognitionDate {
  if (value === null) return { valid: true, value: null };
  if (typeof value !== 'string' || value.trim() === '') return { valid: false, value: null };

  const trimmedValue = value.trim();
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmedValue);

  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    const isSameDate = date.getUTCFullYear() === year
      && date.getUTCMonth() === month - 1
      && date.getUTCDate() === day;

    return isSameDate
      ? { valid: true, value: date }
      : { valid: false, value: null };
  }

  return { valid: false, value: null };
}
