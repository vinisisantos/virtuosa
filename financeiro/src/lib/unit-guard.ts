import { NextRequest, NextResponse } from 'next/server';
import { getUserFromHeaders } from './auth';

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║            UNIT GUARD — Blindagem por Unidade               ║
 * ║                                                              ║
 * ║  Helper centralizado para garantir isolamento total de       ║
 * ║  dados por unidade em todas as rotas da API.                 ║
 * ║                                                              ║
 * ║  REGRAS:                                                     ║
 * ║  1. Toda leitura DEVE filtrar por unit do JWT                ║
 * ║  2. Toda criação DEVE usar unit do JWT                       ║
 * ║  3. Toda edição/exclusão DEVE validar unit do registro       ║
 * ║  4. Admin global pode acessar qualquer unidade               ║
 * ║  5. Nunca confiar no unit vindo do frontend                  ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

export interface UnitGuardResult {
  /** User's unit from JWT — always authoritative */
  userUnit: string;
  /** User ID from JWT */
  userId: string;
  /** User name from JWT */
  userName: string;
  /** User role from JWT */
  userRole: string;
  /** Whether user is global admin */
  isAdmin: boolean;
  /** User permissions object */
  permissions: Record<string, boolean> | null;
  /**
   * Unit filter to use in Prisma WHERE clauses.
   * - For regular users: always their own unit
   * - For admins: the requested unit if specified, otherwise their own
   * Returns undefined only if admin wants to see all (rare)
   */
  unitFilter: string | undefined;
  /**
   * Validates that a record belongs to the user's unit.
   * Throws a JSON 403 response if cross-unit access is attempted.
   */
  enforceUnit: (recordUnit: string | null | undefined) => void;
  /**
   * Returns the unit to assign when creating new records.
   * Always uses JWT unit for non-admins.
   * Admins can specify a target unit.
   */
  createUnit: (requestedUnit?: string | null) => string;
}

/**
 * Extract and validate unit context from request headers.
 * Returns null if user is not authenticated — caller should return 401.
 *
 * @param req - The Next.js request object
 * @param opts - Options:
 *   - allowAdminOverride: if true, admins can specify a different unit via query/body (default: true)
 *   - requestedUnit: optional unit from query params (for admin override)
 */
export function getUnitGuard(
  req: NextRequest,
  opts?: { allowAdminOverride?: boolean; requestedUnit?: string | null }
): UnitGuardResult | null {
  const user = getUserFromHeaders(req);
  if (!user) return null;

  const { userId, name: userName, role: userRole, unit: userUnit, isAdmin, permissions } = user;

  // Determine effective unit filter
  const allowOverride = opts?.allowAdminOverride !== false;
  const requestedUnit = opts?.requestedUnit;

  let unitFilter: string | undefined;
  if (isAdmin && allowOverride) {
    // Admin can view specific unit or all
    if (requestedUnit && requestedUnit !== 'all' && requestedUnit !== 'Todas') {
      unitFilter = requestedUnit;
    } else if (!requestedUnit || requestedUnit === 'all' || requestedUnit === 'Todas') {
      unitFilter = undefined; // admin sees all
    } else {
      unitFilter = userUnit || undefined;
    }
  } else {
    // Non-admin: ALWAYS filter by their JWT unit
    unitFilter = userUnit || undefined;
  }

  const enforceUnit = (recordUnit: string | null | undefined) => {
    if (isAdmin) return; // Admin can access any unit
    if (!recordUnit) return; // Record has no unit (legacy/global)
    if (recordUnit !== userUnit) {
      throw new UnitAccessDeniedError(userUnit, recordUnit, userId);
    }
  };

  const createUnit = (requestedUnit?: string | null): string => {
    if (isAdmin && requestedUnit) {
      return requestedUnit;
    }
    return userUnit || 'Barueri';
  };

  return {
    userUnit: userUnit || '',
    userId,
    userName,
    userRole,
    isAdmin,
    permissions,
    unitFilter,
    enforceUnit,
    createUnit,
  };
}

/**
 * Quick helper for routes that just need 401 check + unit.
 * Returns the guard or a 401 NextResponse.
 */
export function requireUnitGuard(
  req: NextRequest,
  opts?: { allowAdminOverride?: boolean; requestedUnit?: string | null }
): UnitGuardResult | NextResponse {
  const guard = getUnitGuard(req, opts);
  if (!guard) {
    return NextResponse.json(
      { error: 'Não autorizado. Faça login novamente.' },
      { status: 401 }
    );
  }
  return guard;
}

/**
 * Custom error for unit access violations.
 * Caught by route handlers to return proper 403.
 */
export class UnitAccessDeniedError extends Error {
  public readonly userUnit: string;
  public readonly recordUnit: string;
  public readonly userId: string;

  constructor(userUnit: string, recordUnit: string, userId: string) {
    super(`Acesso negado: usuário da unidade "${userUnit}" tentou acessar registro da unidade "${recordUnit}"`);
    this.name = 'UnitAccessDeniedError';
    this.userUnit = userUnit;
    this.recordUnit = recordUnit;
    this.userId = userId;
  }
}

/**
 * Standard 403 response for unit access violations.
 */
export function unitAccessDeniedResponse(err?: UnitAccessDeniedError): NextResponse {
  return NextResponse.json(
    { error: 'Acesso negado. Você não tem permissão para acessar dados de outra unidade.' },
    { status: 403 }
  );
}

/**
 * Helper to build Prisma WHERE with unit filter.
 * Merges existing where conditions with unit filter.
 */
export function withUnitFilter(
  guard: UnitGuardResult,
  existingWhere: Record<string, unknown> = {}
): Record<string, unknown> {
  if (guard.unitFilter) {
    return { ...existingWhere, unit: guard.unitFilter };
  }
  return existingWhere;
}
