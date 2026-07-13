import type { Bill, FixedExpense, LogEntry } from '@/hooks/useDashboard';
import { recurringCostOccurrencesInMonth, resolveRecurringCostsInMonth } from '@/lib/cost-recurrence';
import { isManualRevenue, isOperationalSale, isRevenuePending, isRevenueReceived } from '@/lib/revenue';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

interface MonthlyFinancialReportInput {
  selectedMonth: number;
  selectedYear: number;
  selectedUnit: string;
  logs: LogEntry[];
  fixedExpenses: FixedExpense[];
  bills: Bill[];
}

interface ReportExpense {
  name: string;
  category: string;
  type: string;
  dueDate: string;
  value: number;
  status: 'Pago' | 'Pendente';
}

interface ReportRevenue {
  name: string;
  category: string;
  date: string;
  value: number;
  status: 'Recebida' | 'A receber';
  payment: string;
}

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function matchesUnit(itemUnit: string | undefined, selectedUnit: string) {
  return selectedUnit === 'all' || !itemUnit || itemUnit === selectedUnit;
}

function isInMonth(dateValue: string | undefined, year: number, month: number) {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  return !Number.isNaN(date.getTime()) && date.getUTCFullYear() === year && date.getUTCMonth() === month;
}

function billPaymentKey(bill: Bill, year: number, month: number) {
  return bill.type === 'fixo'
    ? `${year}-${String(month + 1).padStart(2, '0')}`
    : bill.dueDateManual || '';
}

function isSalaryCategory(category: string) {
  return category
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR') === 'salarios';
}

function consolidateSalaryExpenses(expenses: ReportExpense[]) {
  const salaryExpenses = expenses.filter(expense => isSalaryCategory(expense.category));
  if (salaryExpenses.length < 2) return expenses;

  const earliestDueDate = salaryExpenses
    .map(expense => expense.dueDate)
    .sort((a, b) => {
      const [dayA, monthA, yearA] = a.split('/').map(Number);
      const [dayB, monthB, yearB] = b.split('/').map(Number);
      return new Date(yearA, monthA - 1, dayA).getTime() - new Date(yearB, monthB - 1, dayB).getTime();
    })[0];

  return [
    ...expenses.filter(expense => !isSalaryCategory(expense.category)),
    {
      name: 'Salários (consolidado)',
      category: 'Salários',
      type: 'Consolidado mensal',
      dueDate: earliestDueDate,
      value: salaryExpenses.reduce((total, expense) => total + expense.value, 0),
      status: salaryExpenses.every(expense => expense.status === 'Pago') ? 'Pago' : 'Pendente',
    } satisfies ReportExpense,
  ];
}

function collectReportData(input: MonthlyFinancialReportInput) {
  const { selectedMonth, selectedYear, selectedUnit } = input;
  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const periodLogs = input.logs.filter(log =>
    matchesUnit(log.unit, selectedUnit) && isInMonth(log.date, selectedYear, selectedMonth)
  );
  const operationalSales = periodLogs.filter(isOperationalSale);
  const manualRevenues = periodLogs.filter(isManualRevenue);
  const revenues: ReportRevenue[] = manualRevenues
    .sort((a, b) => a.date.localeCompare(b.date) || b.value - a.value)
    .map(revenue => ({
      name: revenue.name,
      category: revenue.category || 'Outras receitas',
      date: new Date(revenue.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
      value: revenue.value,
      status: isRevenuePending(revenue) ? 'A receber' as const : 'Recebida' as const,
      payment: revenue.payment || 'Não informado',
    }));
  const expenses: ReportExpense[] = [];

  resolveRecurringCostsInMonth(
    input.fixedExpenses.filter(expense => expense.value > 0 && matchesUnit(expense.unit, selectedUnit)),
    selectedYear,
    selectedMonth,
  )
    .forEach(expense => {
      const occurrences = recurringCostOccurrencesInMonth(expense, selectedYear, selectedMonth);
      occurrences.forEach(dateKey => expenses.push({
        name: expense.name,
        category: expense.category || 'Outros',
        type: expense.recurrence === 'weekly' ? 'Fixo semanal' : 'Fixo mensal',
        dueDate: dateKey.split('-').reverse().join('/'),
        value: expense.value,
        status: 'Pendente',
      }));
    });

  input.bills
    .filter(bill => matchesUnit(bill.unit, selectedUnit))
    .forEach(bill => {
      if (bill.type === 'variavel') {
        const belongsToMonth = bill.refMonth
          ? bill.refMonth === monthKey
          : isInMonth(bill.dueDateManual || undefined, selectedYear, selectedMonth);
        if (!belongsToMonth) return;
      }
      const day = Math.min(bill.dueDay || 1, new Date(selectedYear, selectedMonth + 1, 0).getDate());
      const dueDate = bill.type === 'fixo'
        ? `${String(day).padStart(2, '0')}/${String(selectedMonth + 1).padStart(2, '0')}/${selectedYear}`
        : (bill.dueDateManual || '').split('-').reverse().join('/');
      expenses.push({
        name: bill.name,
        category: bill.category || 'Outros',
        type: bill.type === 'fixo' ? 'Fixo mensal' : 'Unico',
        dueDate,
        value: bill.value,
        status: bill.payments?.[billPaymentKey(bill, selectedYear, selectedMonth)] ? 'Pago' : 'Pendente',
      });
    });

  const sortedExpenses = consolidateSalaryExpenses(expenses).sort((a, b) => {
    const [dayA, monthA, yearA] = a.dueDate.split('/').map(Number);
    const [dayB, monthB, yearB] = b.dueDate.split('/').map(Number);
    const dateA = new Date(yearA, monthA - 1, dayA).getTime();
    const dateB = new Date(yearB, monthB - 1, dayB).getTime();
    return dateA - dateB || b.value - a.value || a.name.localeCompare(b.name, 'pt-BR');
  });
  const revenue = periodLogs.filter(isRevenueReceived).reduce((sum, sale) => sum + sale.value, 0);
  const pendingRevenue = manualRevenues.filter(isRevenuePending).reduce((sum, sale) => sum + sale.value, 0);
  const fixedTotal = expenses.filter(expense => expense.type !== 'Unico').reduce((sum, expense) => sum + expense.value, 0);
  const variableTotal = expenses.filter(expense => expense.type === 'Unico').reduce((sum, expense) => sum + expense.value, 0);
  const paidTotal = expenses.filter(expense => expense.status === 'Pago').reduce((sum, expense) => sum + expense.value, 0);
  const pendingTotal = expenses.filter(expense => expense.status === 'Pendente').reduce((sum, expense) => sum + expense.value, 0);
  const totalCosts = fixedTotal + variableTotal;
  const result = revenue - totalCosts;
  const margin = revenue > 0 ? (result / revenue) * 100 : 0;
  const categories = Array.from(expenses.reduce((map, expense) => {
    map.set(expense.category, (map.get(expense.category) || 0) + expense.value);
    return map;
  }, new Map<string, number>())).sort((a, b) => b[1] - a[1]);
  const procedures = Array.from(operationalSales.reduce((map, sale) => {
    map.set(sale.name || 'Outros', (map.get(sale.name || 'Outros') || 0) + sale.value);
    return map;
  }, new Map<string, number>())).sort((a, b) => b[1] - a[1]);

  return { expenses: sortedExpenses, revenues, revenue, pendingRevenue, fixedTotal, variableTotal, paidTotal, pendingTotal, totalCosts, result, margin, categories, procedures };
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function generateReportPdf(input: MonthlyFinancialReportInput, generatedBy: string, letterheadBase64: string) {
  const data = collectReportData(input);
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const { PDFDocument, rgb } = await import('pdf-lib');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const unitLabel = input.selectedUnit === 'all' ? 'Todas as unidades' : input.selectedUnit;
  const periodLabel = `${MONTHS[input.selectedMonth]} de ${input.selectedYear}`;
  const generatedAt = new Date().toLocaleString('pt-BR');

  doc.setTextColor(27, 27, 39);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('RELATÓRIO FINANCEIRO MENSAL', 20, 51);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(95, 95, 110);
  doc.text(`${unitLabel} | ${periodLabel}`, 20, 57);
  doc.text(`Gerado por ${generatedBy} em ${generatedAt}`, 190, 57, { align: 'right' });
  doc.setDrawColor(230, 0, 126);
  doc.setLineWidth(0.8);
  doc.line(20, 61, 190, 61);

  autoTable(doc, {
    startY: 66,
    head: [['Receita realizada', 'A receber', 'Custos', 'Resultado', 'Margem']],
    body: [[money(data.revenue), money(data.pendingRevenue), money(data.totalCosts), money(data.result), `${data.margin.toFixed(1)}%`]],
    theme: 'grid',
    headStyles: { fillColor: [27, 27, 39], textColor: [255, 255, 255], fontStyle: 'bold' },
    bodyStyles: { textColor: [45, 45, 55], fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 3 },
    margin: { left: 20, right: 20, top: 50, bottom: 43 },
  });

  const summaryDoc = doc as typeof doc & { lastAutoTable?: { finalY: number } };
  autoTable(doc, {
    startY: (summaryDoc.lastAutoTable?.finalY || 84) + 6,
    head: [['DRE resumida', 'Valor']],
    body: [
      ['(+) Receitas realizadas', money(data.revenue)],
      ['(i) Receitas a receber (fora do resultado)', money(data.pendingRevenue)],
      ['(-) Custos fixos', money(data.fixedTotal)],
      ['(-) Custos variaveis', money(data.variableTotal)],
      ['(=) Resultado operacional', money(data.result)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [27, 27, 39] },
    styles: { fontSize: 7.5, cellPadding: 2.5 },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 20, right: 20, top: 50, bottom: 43 },
  });

  const dreDoc = doc as typeof doc & { lastAutoTable?: { finalY: number } };
  if (data.revenues.length > 0) {
    autoTable(doc, {
      startY: (dreDoc.lastAutoTable?.finalY || 112) + 7,
      head: [['Receita manual', 'Categoria', 'Data', 'Valor', 'Status', 'Forma']],
      body: data.revenues.map(revenue => [revenue.name, revenue.category, revenue.date, money(revenue.value), revenue.status, revenue.payment]),
      theme: 'striped',
      headStyles: { fillColor: [34, 197, 94], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [248, 250, 248] },
      styles: { fontSize: 6.8, cellPadding: 2.4, overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 29 },
        2: { cellWidth: 23 },
        3: { cellWidth: 29, halign: 'right', fontStyle: 'bold' },
        4: { cellWidth: 24, halign: 'center' },
        5: { cellWidth: 25 },
      },
      margin: { left: 20, right: 20, top: 50, bottom: 43 },
    });
  }

  const revenueDoc = doc as typeof doc & { lastAutoTable?: { finalY: number } };
  autoTable(doc, {
    startY: (revenueDoc.lastAutoTable?.finalY || 112) + 7,
    head: [['Despesa', 'Categoria', 'Tipo', 'Vencimento', 'Valor', 'Status']],
    body: data.expenses.map(expense => [expense.name, expense.category, expense.type, expense.dueDate, money(expense.value), expense.status]),
    theme: 'striped',
    headStyles: { fillColor: [230, 0, 126], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 248, 250] },
    styles: { fontSize: 6.8, cellPadding: 2.4, overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 27 },
      2: { cellWidth: 25 },
      3: { cellWidth: 25 },
      4: { cellWidth: 29, halign: 'right', fontStyle: 'bold' },
      5: { cellWidth: 24, halign: 'center' },
    },
    margin: { left: 20, right: 20, top: 50, bottom: 43 },
  });

  const expenseDoc = doc as typeof doc & { lastAutoTable?: { finalY: number } };
  if (data.procedures.length > 0) {
    autoTable(doc, {
      startY: (expenseDoc.lastAutoTable?.finalY || 150) + 7,
      head: [['Receitas por procedimento', 'Valor']],
      body: data.procedures.map(([name, value]) => [name, money(value)]),
      theme: 'striped',
      headStyles: { fillColor: [27, 27, 39] },
      styles: { fontSize: 7, cellPadding: 2.5 },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: 20, right: 20, top: 50, bottom: 43 },
    });
  }

  const contentBytes = new Uint8Array(doc.output('arraybuffer'));
  const contentDoc = await PDFDocument.load(contentBytes);
  const backgroundBytes = Uint8Array.from(atob(letterheadBase64), character => character.charCodeAt(0));
  const backgroundDoc = await PDFDocument.load(backgroundBytes);
  const outputDoc = await PDFDocument.create();
  const backgroundPageIndex = 0;

  for (let pageIndex = 0; pageIndex < contentDoc.getPageCount(); pageIndex += 1) {
    const [backgroundPage] = await outputDoc.copyPages(backgroundDoc, [backgroundPageIndex]);
    outputDoc.addPage(backgroundPage);
    const page = outputDoc.getPages()[outputDoc.getPageCount() - 1];
    const embeddedContent = await outputDoc.embedPage(contentDoc.getPage(pageIndex));
    page.drawPage(embeddedContent, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
    page.drawText(`Página ${pageIndex + 1} de ${contentDoc.getPageCount()}`, {
      x: page.getWidth() - 105,
      y: 48,
      size: 7,
      color: rgb(0.42, 0.42, 0.48),
    });
  }

  return outputDoc.save();
}

export async function downloadMonthlyFinancialReport(input: MonthlyFinancialReportInput) {
  const user = (() => {
    try { return JSON.parse(localStorage.getItem('virtuosa_user') || '{}'); } catch { return {}; }
  })();
  const generatedBy = user.name || user.nome || user.email || 'Usuario Virtuosa';
  const unitName = input.selectedUnit === 'all' ? 'todas-unidades' : input.selectedUnit.toLocaleLowerCase('pt-BR');
  const fileName = `relatorio-financeiro-${unitName}-${input.selectedYear}-${String(input.selectedMonth + 1).padStart(2, '0')}.pdf`;

  const response = await fetch('/api/contract-templates');
  if (!response.ok) {
    throw new Error(`Não foi possível carregar o papel timbrado (${response.status}).`);
  }

  const templates = await response.json();
  const availableTemplates = Array.isArray(templates) ? templates : [];
  const officialTemplate = availableTemplates.find(item =>
    item.active !== false
    && item.backgroundPdf
    && (item.backgroundPdfName === 'Modelo-Pagina-PDF.pdf' || item.name === 'Modelo-Pagina-PDF')
  );

  if (!officialTemplate?.backgroundPdf) {
    throw new Error('O papel timbrado oficial Modelo-Pagina-PDF.pdf não está disponível.');
  }

  const bytes = await generateReportPdf(input, generatedBy, officialTemplate.backgroundPdf);
  downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), fileName);
}
