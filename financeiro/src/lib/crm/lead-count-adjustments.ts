import { prisma } from "@/lib/db";

const SP_TZ = "America/Sao_Paulo";

const SP_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: SP_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type CrmLeadCountAdjustmentEntry = {
  date: string;
  unit: string;
  count: number;
  assignedTo: string | null;
};

function spDateKey(date: Date) {
  return SP_DATE.format(date);
}

function databaseDate(date: Date) {
  return new Date(`${spDateKey(date)}T00:00:00.000Z`);
}

export async function getCrmLeadCountAdjustments(params: {
  start?: Date;
  end?: Date;
  unit?: string;
  assignedTo?: string;
}) {
  const adjustments = await prisma.crmLeadCountAdjustment.findMany({
    where: {
      ...(params.start || params.end
        ? {
            date: {
              ...(params.start ? { gte: databaseDate(params.start) } : {}),
              ...(params.end ? { lte: databaseDate(params.end) } : {}),
            },
          }
        : {}),
      ...(params.unit ? { unit: params.unit } : {}),
      ...(params.assignedTo ? { assignedTo: params.assignedTo } : {}),
    },
    select: {
      date: true,
      unit: true,
      count: true,
      assignedTo: true,
    },
    orderBy: [{ date: "asc" }, { unit: "asc" }],
  });

  return adjustments.map<CrmLeadCountAdjustmentEntry>((adjustment) => ({
    date: adjustment.date.toISOString().slice(0, 10),
    unit: adjustment.unit,
    count: adjustment.count,
    assignedTo: adjustment.assignedTo,
  }));
}

export function sumCrmLeadCountAdjustments(entries: CrmLeadCountAdjustmentEntry[]) {
  return entries.reduce((sum, entry) => sum + entry.count, 0);
}
