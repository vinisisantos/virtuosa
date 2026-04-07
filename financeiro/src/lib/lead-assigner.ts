import { prisma } from '@/lib/db';

/**
 * Round-robin lead assignment by unit.
 * Picks the active operator who was last assigned the longest ago (or never).
 * Supports weighted distribution via the `weight` field.
 */
export async function assignLeadToOperator(unit: string = 'Barueri'): Promise<{
  userId: string;
  userName: string;
} | null> {
  try {
    // Get active operators for the unit
    const operators = await prisma.leadAssignment.findMany({
      where: { isActive: true, unit },
      orderBy: [
        { lastAssignedAt: 'asc' }, // oldest first (never assigned = null = first)
      ],
    });

    if (operators.length === 0) return null;

    // Simple round-robin: pick the one with oldest lastAssignedAt
    // For weighted: repeat operator entries by weight, then pick first
    const weighted: typeof operators = [];
    for (const op of operators) {
      for (let i = 0; i < op.weight; i++) {
        weighted.push(op);
      }
    }

    // Sort weighted by lastAssignedAt ascending (null = never assigned = top priority)
    weighted.sort((a, b) => {
      if (!a.lastAssignedAt) return -1;
      if (!b.lastAssignedAt) return 1;
      return a.lastAssignedAt.getTime() - b.lastAssignedAt.getTime();
    });

    const selected = weighted[0];

    // Update lastAssignedAt
    await prisma.leadAssignment.update({
      where: { id: selected.id },
      data: { lastAssignedAt: new Date() },
    });

    return { userId: selected.userId, userName: selected.userName };
  } catch (error) {
    console.error('[LeadAssigner] Error:', error);
    return null;
  }
}
