'use client';
import { useMemo } from 'react';
import { LogEntry, UNITS, MONTHS } from './useDashboard';

/* ─── Types ─── */
export interface ProcRank { name:string; count:number; revenue:number; pct:number; }
export interface ClientRank { name:string; count:number; totalSpent:number; ticketMedio:number; firstDate:string; lastDate:string; procedures:string[]; }
export interface YoYData { currentRev:number; prevRev:number; diffValue:number; diffPct:number; currentSales:number; prevSales:number; currentTicket:number; prevTicket:number; currentClients:number; prevClients:number; }
export interface MonthlyPoint { month:string; monthIdx:number; year:number; rev:number; cost:number; sales:number; }

interface Props {
  logs: LogEntry[];
  selectedMonth: number;
  selectedYear: number;
  selectedUnit: string;
  periodMonths: number; // 1, 2, 3, 4, or 12
  customRange?: { startDate: string; endDate: string } | null; // ISO date strings: '2026-01-01'
}

export function useAnalytics({ logs, selectedMonth, selectedYear, selectedUnit, periodMonths, customRange }: Props) {

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

    /* ─── Helper: filter logs by custom date range ─── */
    const filterLogsByDateRange = (start: string, end: string, unit: string) => {
      const startDate = new Date(start + 'T00:00:00Z');
      const endDate = new Date(end + 'T23:59:59Z');
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return [];
      return logs.filter(item => {
        if (!item.date) return false;
        const d = new Date(item.date);
        return d >= startDate && d <= endDate && (unit === 'all' || (item.unit || '') === unit);
      });
    };

    /* ─── Helper: compute month range label ─── */
    const getMonthRangeLabel = (endMonth: number, endYear: number, months: number): string => {
      if (months === 1) return `${MONTHS[endMonth]} ${endYear}`;
      let startM = endMonth - (months - 1), startY = endYear;
      while (startM < 0) { startM += 12; startY--; }
      return `${MONTHS[startM].substring(0,3)}/${startY} – ${MONTHS[endMonth].substring(0,3)}/${endYear}`;
    };

    /* ─── Helper: custom range label ─── */
    const getCustomRangeLabel = (start: string, end: string): string => {
      const s = new Date(start + 'T12:00:00Z');
      const e = new Date(end + 'T12:00:00Z');
      return `${s.toLocaleDateString('pt-BR')} – ${e.toLocaleDateString('pt-BR')}`;
    };

    /* ─── Parse procedures from obs field ─── */
    const isZeroValueProc = (name: string): boolean => {
      const n = name.toLowerCase();
      return n.includes('retorno') || n.includes('cortesia') || n.includes('brinde') || n.includes('avaliação') || n.includes('avaliacao');
    };

    /** Smart price parser: handles both "1.250,00" (BR) and "598.00" (US) formats */
    const parseSmartPrice = (raw: string): number => {
      if (!raw) return 0;
      const s = raw.trim();
      const hasDot = s.includes('.');
      const hasComma = s.includes(',');

      if (hasDot && hasComma) {
        // Brazilian format: "1.250,00" → remove dots (thousands), replace comma with dot (decimal)
        return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
      } else if (hasComma && !hasDot) {
        // Comma-only: "598,00" → replace comma with dot
        return parseFloat(s.replace(',', '.')) || 0;
      } else {
        // Dot-only or no separator: "598.00" or "598" → standard parseFloat
        return parseFloat(s) || 0;
      }
    };

    const parseProcedures = (item: LogEntry): { name: string; qty: number; value: number }[] => {
      const obs = item.obs || '';
      const procPart = obs.split('|')[0]?.trim();
      if (!procPart) return [{ name: item.name || 'Outros', qty: 1, value: item.value }];
      const procs: { name: string; qty: number; value: number; hasPrice: boolean; unitPrice: number }[] = [];
      const parts = procPart.split(',').map(s => s.trim()).filter(Boolean);
      for (const part of parts) {
        // Try to match "10x Procedure Name: R$ 150.00" (with embedded price)
        const matchWithPrice = part.match(/^(\d+)x\s+(.+?):\s*R\$\s*([\d.,]+)$/i);
        if (matchWithPrice) {
          const qty = parseInt(matchWithPrice[1]);
          const name = matchWithPrice[2].trim();
          const unitPrice = parseSmartPrice(matchWithPrice[3]);
          procs.push({ name, qty, value: unitPrice * qty, hasPrice: true, unitPrice });
        } else {
          // "10x Procedure Name" (without price)
          const match = part.match(/^(\d+)x\s+(.+)$/i);
          if (match) procs.push({ name: match[2].trim(), qty: parseInt(match[1]), value: 0, hasPrice: false, unitPrice: 0 });
          else if (part.length > 0) procs.push({ name: part, qty: 1, value: 0, hasPrice: false, unitPrice: 0 });
        }
      }
      if (procs.length === 0) return [{ name: item.name || 'Outros', qty: 1, value: item.value }];
      if (procs.length === 1) { procs[0].value = isZeroValueProc(procs[0].name) ? 0 : item.value; return procs; }

      // Check if any procs have embedded prices
      const hasAnyPrices = procs.some(p => p.hasPrice);

      if (hasAnyPrices) {
        // Mark zero-value procs (retorno, cortesia, etc.) as R$ 0
        procs.forEach(p => {
          if (isZeroValueProc(p.name)) p.value = 0;
          // else keep the calculated value from embedded price * qty
        });
      } else {
        // No prices embedded: distribute total value only among non-retorno procedures
        const paidProcs = procs.filter(p => !isZeroValueProc(p.name));
        const zeroProcs = procs.filter(p => isZeroValueProc(p.name));
        
        // Zero-value procedures get R$ 0
        zeroProcs.forEach(p => { p.value = 0; });
        
        // Distribute item.value among paid procedures proportionally by qty
        const totalPaidQty = paidProcs.reduce((s, p) => s + p.qty, 0);
        paidProcs.forEach(p => { p.value = totalPaidQty > 0 ? (p.qty / totalPaidQty) * item.value : 0; });
      }
      return procs;
    };

    /* ─── Determine if using custom range or month-based ─── */
    const isCustomRange = customRange && customRange.startDate && customRange.endDate;

    /* ─── Current period data ─── */
    const currentLogs = isCustomRange
      ? filterLogsByDateRange(customRange!.startDate, customRange!.endDate, selectedUnit)
      : filterLogsRange(selectedMonth, selectedYear, periodMonths, selectedUnit);
    const currentSales = currentLogs.filter(l => l.type === 'sale');
    const currentCosts = currentLogs.filter(l => l.type === 'cost');
    const totalRev = currentSales.reduce((s, l) => s + l.value, 0);
    const totalCost = currentCosts.reduce((s, l) => s + l.value, 0);
    const salesCount = currentSales.length;
    const ticketMedio = salesCount > 0 ? totalRev / salesCount : 0;
    const currentClients = new Set(currentSales.map(l => l.name)).size;

    /* ─── Year-over-year comparison ─── */
    let prevYearLogs: LogEntry[];
    if (isCustomRange) {
      // Shift custom range back by 1 year
      const sDate = new Date(customRange!.startDate + 'T12:00:00Z');
      const eDate = new Date(customRange!.endDate + 'T12:00:00Z');
      sDate.setFullYear(sDate.getFullYear() - 1);
      eDate.setFullYear(eDate.getFullYear() - 1);
      const prevStart = sDate.toISOString().split('T')[0];
      const prevEnd = eDate.toISOString().split('T')[0];
      prevYearLogs = filterLogsByDateRange(prevStart, prevEnd, selectedUnit);
    } else {
      prevYearLogs = filterLogsRange(selectedMonth, selectedYear - 1, periodMonths, selectedUnit);
    }
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

    /* ─── Monthly evolution (respects periodMonths or custom range) ─── */
    const refMonth = isCustomRange
      ? new Date(customRange!.endDate + 'T12:00:00Z').getUTCMonth()
      : selectedMonth;
    const refYear = isCustomRange
      ? new Date(customRange!.endDate + 'T12:00:00Z').getUTCFullYear()
      : selectedYear;

    // Calculate how many months to show in the chart
    let chartMonths: number;
    if (isCustomRange) {
      const sDate = new Date(customRange!.startDate + 'T12:00:00Z');
      const eDate = new Date(customRange!.endDate + 'T12:00:00Z');
      chartMonths = Math.max(1, (eDate.getUTCFullYear() - sDate.getUTCFullYear()) * 12 + (eDate.getUTCMonth() - sDate.getUTCMonth()) + 1);
      chartMonths = Math.min(chartMonths, 24); // cap at 24
    } else {
      chartMonths = periodMonths;
    }

    const evolution12: MonthlyPoint[] = [];
    for (let i = chartMonths - 1; i >= 0; i--) {
      let m = refMonth - i, y = refYear;
      while (m < 0) { m += 12; y--; }
      const mLogs = filterLogsSingle(m, y, selectedUnit);
      const mRev = mLogs.filter(l => l.type === 'sale').reduce((s, l) => s + l.value, 0);
      const mCost = mLogs.filter(l => l.type === 'cost').reduce((s, l) => s + l.value, 0);
      const mSales = mLogs.filter(l => l.type === 'sale').length;
      evolution12.push({ month: MONTHS[m].substring(0, 3), monthIdx: m, year: y, rev: mRev, cost: mCost, sales: mSales });
    }

    const evolution12Prev: MonthlyPoint[] = [];
    for (let i = chartMonths - 1; i >= 0; i--) {
      let m = refMonth - i, y = refYear - 1;
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
    const clientMap: Record<string, { count: number; totalSpent: number; firstDate: string; lastDate: string; procedures: Set<string> }> = {};
    currentSales.forEach(item => {
      const name = item.name || 'Outros';
      if (!clientMap[name]) clientMap[name] = { count: 0, totalSpent: 0, firstDate: '', lastDate: '', procedures: new Set() };
      clientMap[name].count++;
      clientMap[name].totalSpent += item.value;
      if (item.date && item.date > clientMap[name].lastDate) clientMap[name].lastDate = item.date;
      if (item.date && (!clientMap[name].firstDate || item.date < clientMap[name].firstDate)) clientMap[name].firstDate = item.date;
      const procs = parseProcedures(item);
      procs.forEach(p => clientMap[name].procedures.add(p.name));
    });
    const topClients: ClientRank[] = Object.entries(clientMap)
      .map(([name, data]) => ({
        name, count: data.count, totalSpent: data.totalSpent,
        ticketMedio: data.count > 0 ? data.totalSpent / data.count : 0,
        firstDate: data.firstDate, lastDate: data.lastDate, procedures: [...data.procedures],
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent);

    /* ─── All procedure names for filter ─── */
    const allProcedureNames = [...new Set(topProcedures.map(p => p.name))].sort();

    /* ─── Revenue by unit (across full period) ─── */
    const revByUnit: Record<string, { rev: number; cost: number; sales: number; clients: number }> = {};
    UNITS.forEach(u => {
      const uLogs = isCustomRange
        ? filterLogsByDateRange(customRange!.startDate, customRange!.endDate, u)
        : filterLogsRange(selectedMonth, selectedYear, periodMonths, u);
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
    const periodLabel = isCustomRange
      ? getCustomRangeLabel(customRange!.startDate, customRange!.endDate)
      : getMonthRangeLabel(selectedMonth, selectedYear, periodMonths);
    const periodLabelPrev = isCustomRange
      ? (() => {
          const s = new Date(customRange!.startDate + 'T12:00:00Z');
          const e = new Date(customRange!.endDate + 'T12:00:00Z');
          s.setFullYear(s.getFullYear() - 1);
          e.setFullYear(e.getFullYear() - 1);
          return getCustomRangeLabel(s.toISOString().split('T')[0], e.toISOString().split('T')[0]);
        })()
      : getMonthRangeLabel(selectedMonth, selectedYear - 1, periodMonths);

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
  }, [logs, selectedMonth, selectedYear, selectedUnit, periodMonths, customRange]);
}
