'use client';
import { useMemo } from 'react';
import { LogEntry, UNITS, MONTHS } from './useDashboard';

/* ─── Types ─── */
export interface ProcRank { name:string; count:number; revenue:number; pct:number; }
export interface ClientRank { name:string; count:number; totalSpent:number; ticketMedio:number; lastDate:string; procedures:string[]; }
export interface YoYData { currentRev:number; prevRev:number; diffValue:number; diffPct:number; currentSales:number; prevSales:number; currentTicket:number; prevTicket:number; currentClients:number; prevClients:number; }
export interface MonthlyPoint { month:string; monthIdx:number; year:number; rev:number; cost:number; sales:number; }

interface Props {
  logs: LogEntry[];
  selectedMonth: number;
  selectedYear: number;
  selectedUnit: string;
  periodMonths: number; // 1, 2, 3, 4, or 12
}

export function useAnalytics({ logs, selectedMonth, selectedYear, selectedUnit, periodMonths }: Props) {

  return useMemo(() => {
    /* ─── Helper: filter logs by single month/year/unit ─── */
    const filterLogsSingle = (m: number, y: number, unit: string) =>
      logs.filter(item => {
        if (!item.date) return false;
        const d = new Date(item.date);
        return d.getUTCMonth() === m && d.getUTCFullYear() === y && (unit === 'all' || (item.unit || '') === unit);
      });

    /* ─── Helper: filter logs across a range of months ─── */
    const filterLogsRange = (endMonth: number, endYear: number, months: number, unit: string) => {
      const result: LogEntry[] = [];
      for (let i = 0; i < months; i++) {
        let m = endMonth - i, y = endYear;
        while (m < 0) { m += 12; y--; }
        result.push(...filterLogsSingle(m, y, unit));
      }
      return result;
    };

    /* ─── Helper: compute month range label ─── */
    const getMonthRangeLabel = (endMonth: number, endYear: number, months: number): string => {
      if (months === 1) return `${MONTHS[endMonth]} ${endYear}`;
      let startM = endMonth - (months - 1), startY = endYear;
      while (startM < 0) { startM += 12; startY--; }
      return `${MONTHS[startM].substring(0,3)}/${startY} – ${MONTHS[endMonth].substring(0,3)}/${endYear}`;
    };

    /* ─── Parse procedures from obs field ─── */
    const parseProcedures = (item: LogEntry): { name: string; qty: number; value: number }[] => {
      const obs = item.obs || '';
      const procPart = obs.split('|')[0]?.trim();
      if (!procPart) return [{ name: item.name || 'Outros', qty: 1, value: item.value }];
      const procs: { name: string; qty: number; value: number }[] = [];
      const parts = procPart.split(',').map(s => s.trim()).filter(Boolean);
      for (const part of parts) {
        const match = part.match(/^(\d+)x\s+(.+)$/i);
        if (match) procs.push({ name: match[2].trim(), qty: parseInt(match[1]), value: 0 });
        else if (part.length > 0) procs.push({ name: part, qty: 1, value: 0 });
      }
      if (procs.length === 0) return [{ name: item.name || 'Outros', qty: 1, value: item.value }];
      if (procs.length === 1) { procs[0].value = item.value; return procs; }
      const totalQty = procs.reduce((s, p) => s + p.qty, 0);
      procs.forEach(p => { p.value = totalQty > 0 ? (p.qty / totalQty) * item.value : 0; });
      return procs;
    };

    /* ─── Current period data (spanning periodMonths) ─── */
    const currentLogs = filterLogsRange(selectedMonth, selectedYear, periodMonths, selectedUnit);
    const currentSales = currentLogs.filter(l => l.type === 'sale');
    const currentCosts = currentLogs.filter(l => l.type === 'cost');
    const totalRev = currentSales.reduce((s, l) => s + l.value, 0);
    const totalCost = currentCosts.reduce((s, l) => s + l.value, 0);
    const salesCount = currentSales.length;
    const ticketMedio = salesCount > 0 ? totalRev / salesCount : 0;
    const currentClients = new Set(currentSales.map(l => l.name)).size;

    /* ─── Year-over-year comparison (same period range, previous year) ─── */
    const prevYearLogs = filterLogsRange(selectedMonth, selectedYear - 1, periodMonths, selectedUnit);
    const prevYearSales = prevYearLogs.filter(l => l.type === 'sale');
    const prevRev = prevYearSales.reduce((s, l) => s + l.value, 0);
    const prevSalesCount = prevYearSales.length;
    const prevTicket = prevSalesCount > 0 ? prevRev / prevSalesCount : 0;
    const prevClients = new Set(prevYearSales.map(l => l.name)).size;

    const yoy: YoYData = {
      currentRev: totalRev,
      prevRev,
      diffValue: totalRev - prevRev,
      diffPct: prevRev > 0 ? ((totalRev - prevRev) / prevRev) * 100 : (totalRev > 0 ? 100 : 0),
      currentSales: salesCount,
      prevSales: prevSalesCount,
      currentTicket: ticketMedio,
      prevTicket,
      currentClients,
      prevClients,
    };

    /* ─── Monthly evolution (12 months for YoY chart) ─── */
    const evolution12: MonthlyPoint[] = [];
    for (let i = 11; i >= 0; i--) {
      let m = selectedMonth - i, y = selectedYear;
      while (m < 0) { m += 12; y--; }
      const mLogs = filterLogsSingle(m, y, selectedUnit);
      const mRev = mLogs.filter(l => l.type === 'sale').reduce((s, l) => s + l.value, 0);
      const mCost = mLogs.filter(l => l.type === 'cost').reduce((s, l) => s + l.value, 0);
      const mSales = mLogs.filter(l => l.type === 'sale').length;
      evolution12.push({ month: MONTHS[m].substring(0, 3), monthIdx: m, year: y, rev: mRev, cost: mCost, sales: mSales });
    }

    const evolution12Prev: MonthlyPoint[] = [];
    for (let i = 11; i >= 0; i--) {
      let m = selectedMonth - i, y = selectedYear - 1;
      while (m < 0) { m += 12; y--; }
      const mLogs = filterLogsSingle(m, y, selectedUnit);
      const mRev = mLogs.filter(l => l.type === 'sale').reduce((s, l) => s + l.value, 0);
      const mCost = mLogs.filter(l => l.type === 'cost').reduce((s, l) => s + l.value, 0);
      const mSales = mLogs.filter(l => l.type === 'sale').length;
      evolution12Prev.push({ month: MONTHS[m].substring(0, 3), monthIdx: m, year: y, rev: mRev, cost: mCost, sales: mSales });
    }

    /* ─── Top procedures (across full period) ─── */
    const procMap: Record<string, { count: number; revenue: number }> = {};
    currentSales.forEach(item => {
      const procs = parseProcedures(item);
      for (const proc of procs) {
        if (!procMap[proc.name]) procMap[proc.name] = { count: 0, revenue: 0 };
        procMap[proc.name].count += proc.qty;
        procMap[proc.name].revenue += proc.value;
      }
    });
    const topProcedures: ProcRank[] = Object.entries(procMap)
      .map(([name, data]) => ({ name, count: data.count, revenue: data.revenue, pct: totalRev > 0 ? (data.revenue / totalRev) * 100 : 0 }))
      .sort((a, b) => b.revenue - a.revenue);

    /* ─── Top clients (across full period) ─── */
    const clientMap: Record<string, { count: number; totalSpent: number; lastDate: string; procedures: Set<string> }> = {};
    currentSales.forEach(item => {
      const name = item.name || 'Outros';
      if (!clientMap[name]) clientMap[name] = { count: 0, totalSpent: 0, lastDate: '', procedures: new Set() };
      clientMap[name].count++;
      clientMap[name].totalSpent += item.value;
      if (item.date && item.date > clientMap[name].lastDate) clientMap[name].lastDate = item.date;
      const procs = parseProcedures(item);
      procs.forEach(p => clientMap[name].procedures.add(p.name));
    });
    const topClients: ClientRank[] = Object.entries(clientMap)
      .map(([name, data]) => ({
        name, count: data.count, totalSpent: data.totalSpent,
        ticketMedio: data.count > 0 ? data.totalSpent / data.count : 0,
        lastDate: data.lastDate, procedures: [...data.procedures],
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent);

    /* ─── All procedure names for filter ─── */
    const allProcedureNames = [...new Set(topProcedures.map(p => p.name))].sort();

    /* ─── Revenue by unit (across full period) ─── */
    const revByUnit: Record<string, { rev: number; cost: number; sales: number; clients: number }> = {};
    UNITS.forEach(u => {
      const uLogs = filterLogsRange(selectedMonth, selectedYear, periodMonths, u);
      const uSales = uLogs.filter(l => l.type === 'sale');
      revByUnit[u] = {
        rev: uSales.reduce((s, l) => s + l.value, 0),
        cost: uLogs.filter(l => l.type === 'cost').reduce((s, l) => s + l.value, 0),
        sales: uSales.length,
        clients: new Set(uSales.map(l => l.name)).size,
      };
    });

    /* ─── Drill-down helpers ─── */
    const getSalesForProcedure = (procName: string) =>
      currentSales.filter(item => {
        const procs = parseProcedures(item);
        return procs.some(p => p.name === procName);
      });

    const getSalesForClient = (clientName: string) =>
      currentSales.filter(item => item.name === clientName);

    /* ─── Period label ─── */
    const periodLabel = getMonthRangeLabel(selectedMonth, selectedYear, periodMonths);
    const periodLabelPrev = getMonthRangeLabel(selectedMonth, selectedYear - 1, periodMonths);

    return {
      // KPIs
      totalRev, totalCost, salesCount, ticketMedio, currentClients,
      // YoY
      yoy,
      // Evolution
      evolution12, evolution12Prev,
      // Rankings
      topProcedures, topClients,
      // Filters
      allProcedureNames,
      // Unit breakdown
      revByUnit,
      // Drill-down helpers
      getSalesForProcedure, getSalesForClient,
      // Raw
      currentSales,
      // Period labels
      periodLabel, periodLabelPrev,
    };
  }, [logs, selectedMonth, selectedYear, selectedUnit, periodMonths]);
}
