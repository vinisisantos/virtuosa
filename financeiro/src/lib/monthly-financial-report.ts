import type { Bill, FixedExpense, LogEntry } from '@/hooks/useDashboard';
import { recurringCostOccurrencesInMonth } from '@/lib/cost-recurrence';

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

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

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

function collectReportData(input: MonthlyFinancialReportInput) {
  const { selectedMonth, selectedYear, selectedUnit } = input;
  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const sales = input.logs.filter(log =>
    log.type === 'sale' && matchesUnit(log.unit, selectedUnit) && isInMonth(log.date, selectedYear, selectedMonth)
  );
  const expenses: ReportExpense[] = [];

  input.fixedExpenses
    .filter(expense => expense.value > 0 && matchesUnit(expense.unit, selectedUnit))
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

  const salaryRows = expenses.filter(expense =>
    expense.category.toLocaleLowerCase('pt-BR').includes('sal') || expense.name.toLocaleLowerCase('pt-BR').includes('salário')
  );
  const nonSalaryRows = expenses.filter(expense => !salaryRows.includes(expense));
  if (salaryRows.length > 0) {
    nonSalaryRows.push({
      name: 'Salarios (consolidado)',
      category: 'Salarios',
      type: 'Consolidado mensal',
      dueDate: salaryRows.map(row => row.dueDate).sort()[0],
      value: salaryRows.reduce((sum, row) => sum + row.value, 0),
      status: salaryRows.every(row => row.status === 'Pago') ? 'Pago' : 'Pendente',
    });
  }

  const sortedExpenses = nonSalaryRows.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.value - a.value);
  const revenue = sales.reduce((sum, sale) => sum + sale.value, 0);
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
  const procedures = Array.from(sales.reduce((map, sale) => {
    map.set(sale.name || 'Outros', (map.get(sale.name || 'Outros') || 0) + sale.value);
    return map;
  }, new Map<string, number>())).sort((a, b) => b[1] - a[1]);

  return { expenses: sortedExpenses, revenue, fixedTotal, variableTotal, paidTotal, pendingTotal, totalCosts, result, margin, categories, procedures };
}

function buildReportHtml(input: MonthlyFinancialReportInput, generatedBy: string) {
  const data = collectReportData(input);
  const unitLabel = input.selectedUnit === 'all' ? 'Todas as unidades' : input.selectedUnit;
  const periodLabel = `${MONTHS[input.selectedMonth]} de ${input.selectedYear}`;
  const unitComparison = input.selectedUnit === 'all'
    ? ['Osasco', 'SBC', 'SCS'].map(unit => ({ unit, data: collectReportData({ ...input, selectedUnit: unit }) }))
    : [];
  const summary = [
    ['Receita bruta', data.revenue, '#2563eb'],
    ['Custos totais', data.totalCosts, '#dc2626'],
    ['Resultado', data.result, data.result >= 0 ? '#16a34a' : '#dc2626'],
    ['Margem', `${data.margin.toFixed(1)}%`, '#7c3aed'],
  ];

  return `
    <div style="font-family:Inter,Arial,sans-serif;color:#171727">
      <header style="border-bottom:3px solid #e6007e;padding-bottom:14px;margin-bottom:18px;display:flex;justify-content:space-between;gap:20px">
        <div><h1 style="margin:0;color:#e6007e;font-size:20px">Relatorio Financeiro Mensal</h1><p style="margin:5px 0 0;color:#666;font-size:10px">Virtuosa Estetica</p></div>
        <div style="text-align:right;color:#666;font-size:9px;line-height:1.5"><strong style="color:#171727">${escapeHtml(unitLabel)}</strong><br>${escapeHtml(periodLabel)}<br>Gerado por ${escapeHtml(generatedBy)} em ${new Date().toLocaleString('pt-BR')}</div>
      </header>
      <table style="width:100%;border-collapse:separate;border-spacing:7px;margin:0 -7px 18px"><tr>${summary.map(([label, value, color]) => `<td style="width:25%;padding:11px;border:1px solid #e5e7eb;border-radius:7px;background:#fafafa"><div style="font-size:8px;text-transform:uppercase;color:#6b7280;font-weight:700">${label}</div><div style="font-size:13px;color:${color};font-weight:800;margin-top:5px">${typeof value === 'number' ? money(value) : value}</div></td>`).join('')}</tr></table>
      ${unitComparison.length > 0 ? `<h2 style="font-size:12px;margin:0 0 7px">Comparativo por unidade</h2><table style="width:100%;border-collapse:collapse;margin-bottom:18px;font-size:8px"><thead><tr style="background:#e6007e;color:#fff"><th style="padding:6px;text-align:left">Unidade</th><th style="padding:6px;text-align:right">Receita</th><th style="padding:6px;text-align:right">Custos</th><th style="padding:6px;text-align:right">Resultado</th><th style="padding:6px;text-align:right">Margem</th></tr></thead><tbody>${unitComparison.map(({ unit, data: unitData }) => `<tr><td style="padding:5px;border-bottom:1px solid #e5e7eb;font-weight:700">${unit}</td><td style="padding:5px;border-bottom:1px solid #e5e7eb;text-align:right">${money(unitData.revenue)}</td><td style="padding:5px;border-bottom:1px solid #e5e7eb;text-align:right">${money(unitData.totalCosts)}</td><td style="padding:5px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700">${money(unitData.result)}</td><td style="padding:5px;border-bottom:1px solid #e5e7eb;text-align:right">${unitData.margin.toFixed(1)}%</td></tr>`).join('')}</tbody></table>` : ''}
      <h2 style="font-size:12px;margin:0 0 7px">DRE resumida</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:18px;font-size:9px">
        <tr><td style="padding:6px;border-bottom:1px solid #e5e7eb">(+) Receita de servicos</td><td style="padding:6px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700">${money(data.revenue)}</td></tr>
        <tr><td style="padding:6px;border-bottom:1px solid #e5e7eb">(-) Custos fixos</td><td style="padding:6px;border-bottom:1px solid #e5e7eb;text-align:right">${money(data.fixedTotal)}</td></tr>
        <tr><td style="padding:6px;border-bottom:1px solid #e5e7eb">(-) Custos variaveis</td><td style="padding:6px;border-bottom:1px solid #e5e7eb;text-align:right">${money(data.variableTotal)}</td></tr>
        <tr style="background:#171727;color:#fff"><td style="padding:7px;font-weight:800">(=) Resultado operacional</td><td style="padding:7px;text-align:right;font-weight:800">${money(data.result)}</td></tr>
      </table>
      <div style="display:flex;gap:16px;margin-bottom:18px">
        <div style="width:50%"><h2 style="font-size:12px;margin:0 0 7px">Situacao dos pagamentos</h2><table style="width:100%;border-collapse:collapse;font-size:9px"><tr><td style="padding:6px;border-bottom:1px solid #e5e7eb">Pago</td><td style="text-align:right;color:#16a34a;font-weight:700">${money(data.paidTotal)}</td></tr><tr><td style="padding:6px">Pendente</td><td style="text-align:right;color:#dc2626;font-weight:700">${money(data.pendingTotal)}</td></tr></table></div>
        <div style="width:50%"><h2 style="font-size:12px;margin:0 0 7px">Custos por categoria</h2><table style="width:100%;border-collapse:collapse;font-size:9px">${data.categories.slice(0, 7).map(([category, value]) => `<tr><td style="padding:4px 6px;border-bottom:1px solid #eee">${escapeHtml(category)}</td><td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:right;font-weight:700">${money(value)}</td></tr>`).join('') || '<tr><td style="padding:6px;color:#777">Nenhum custo registrado</td></tr>'}</table></div>
      </div>
      <h2 style="font-size:12px;margin:0 0 7px">Despesas do mes</h2>
      <table style="width:100%;border-collapse:collapse;font-size:8px;margin-bottom:18px"><thead><tr style="background:#171727;color:#fff"><th style="padding:6px;text-align:left">Despesa</th><th style="padding:6px;text-align:left">Categoria</th><th style="padding:6px;text-align:left">Tipo</th><th style="padding:6px;text-align:left">Vencimento</th><th style="padding:6px;text-align:right">Valor</th><th style="padding:6px;text-align:center">Status</th></tr></thead><tbody>${data.expenses.map((expense, index) => `<tr style="background:${index % 2 ? '#f8f8fa' : '#fff'}"><td style="padding:5px;border-bottom:1px solid #e5e7eb">${escapeHtml(expense.name)}</td><td style="padding:5px;border-bottom:1px solid #e5e7eb">${escapeHtml(expense.category)}</td><td style="padding:5px;border-bottom:1px solid #e5e7eb">${escapeHtml(expense.type)}</td><td style="padding:5px;border-bottom:1px solid #e5e7eb">${escapeHtml(expense.dueDate)}</td><td style="padding:5px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700">${money(expense.value)}</td><td style="padding:5px;border-bottom:1px solid #e5e7eb;text-align:center;color:${expense.status === 'Pago' ? '#16a34a' : '#dc2626'};font-weight:700">${expense.status}</td></tr>`).join('') || '<tr><td colspan="6" style="padding:10px;text-align:center;color:#777">Nenhuma despesa registrada</td></tr>'}</tbody></table>
      <h2 style="font-size:12px;margin:0 0 7px">Receitas por procedimento</h2>
      <table style="width:100%;border-collapse:collapse;font-size:8px"><thead><tr style="background:#e6007e;color:#fff"><th style="padding:6px;text-align:left">Procedimento</th><th style="padding:6px;text-align:right">Receita</th></tr></thead><tbody>${data.procedures.map(([name, value], index) => `<tr style="background:${index % 2 ? '#f8f8fa' : '#fff'}"><td style="padding:5px;border-bottom:1px solid #e5e7eb">${escapeHtml(name)}</td><td style="padding:5px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700">${money(value)}</td></tr>`).join('') || '<tr><td colspan="2" style="padding:10px;text-align:center;color:#777">Nenhuma receita registrada</td></tr>'}</tbody></table>
    </div>`;
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

async function downloadFallbackPdf(input: MonthlyFinancialReportInput, generatedBy: string, fileName: string) {
  const data = collectReportData(input);
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF();
  doc.setFillColor(230, 0, 126);
  doc.rect(0, 0, 210, 34, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('VIRTUOSA ESTETICA', 14, 14);
  doc.setFontSize(10);
  doc.text(`Relatorio Financeiro - ${MONTHS[input.selectedMonth]} de ${input.selectedYear}`, 14, 23);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`${input.selectedUnit === 'all' ? 'Todas as unidades' : input.selectedUnit} | Gerado por ${generatedBy}`, 14, 29);
  doc.setTextColor(25, 25, 40);
  autoTable(doc, {
    startY: 42,
    head: [['Receita', 'Custos', 'Resultado', 'Margem']],
    body: [[money(data.revenue), money(data.totalCosts), money(data.result), `${data.margin.toFixed(1)}%`]],
    theme: 'grid', headStyles: { fillColor: [25, 25, 40] }, styles: { fontSize: 9, cellPadding: 4 },
  });
  autoTable(doc, {
    startY: 68,
    head: [['DRE resumida', 'Valor']],
    body: [
      ['(+) Receita de servicos', money(data.revenue)],
      ['(-) Custos fixos', money(data.fixedTotal)],
      ['(-) Custos variaveis', money(data.variableTotal)],
      ['(=) Resultado operacional', money(data.result)],
    ],
    theme: 'grid', headStyles: { fillColor: [25, 25, 40] }, styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
  });
  const summaryDoc = doc as typeof doc & { lastAutoTable?: { finalY: number } };
  autoTable(doc, {
    startY: (summaryDoc.lastAutoTable?.finalY || 94) + 8,
    head: [['Despesa', 'Categoria', 'Tipo', 'Vencimento', 'Valor', 'Status']],
    body: data.expenses.map(expense => [expense.name, expense.category, expense.type, expense.dueDate, money(expense.value), expense.status]),
    theme: 'striped', headStyles: { fillColor: [230, 0, 126] }, styles: { fontSize: 7, cellPadding: 3 },
  });
  const expenseDoc = doc as typeof doc & { lastAutoTable?: { finalY: number } };
  autoTable(doc, {
    startY: (expenseDoc.lastAutoTable?.finalY || 130) + 8,
    head: [['Receitas por procedimento', 'Valor']],
    body: data.procedures.map(([name, value]) => [name, money(value)]),
    theme: 'striped', headStyles: { fillColor: [230, 0, 126] }, styles: { fontSize: 7, cellPadding: 3 },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
  });
  doc.save(fileName);
}

export async function downloadMonthlyFinancialReport(input: MonthlyFinancialReportInput) {
  const user = (() => {
    try { return JSON.parse(localStorage.getItem('virtuosa_user') || '{}'); } catch { return {}; }
  })();
  const generatedBy = user.name || user.nome || user.email || 'Usuario Virtuosa';
  const unitName = input.selectedUnit === 'all' ? 'todas-unidades' : input.selectedUnit.toLocaleLowerCase('pt-BR');
  const fileName = `relatorio-financeiro-${unitName}-${input.selectedYear}-${String(input.selectedMonth + 1).padStart(2, '0')}.pdf`;
  const html = buildReportHtml(input, generatedBy);

  try {
    const response = await fetch('/api/contract-templates');
    if (response.ok) {
      const templates = await response.json();
      const template = Array.isArray(templates) ? templates.find(item => item.backgroundPdf) : null;
      if (template?.backgroundPdf) {
        const { generatePdfWithBackground } = await import('@/app/termos/terms-document-engine');
        const bytes = await generatePdfWithBackground(template.backgroundPdf, html);
        downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), fileName);
        return;
      }
    }
  } catch (error) {
    console.warn('[Financial Report] Papel timbrado indisponivel, usando modelo padrao.', error);
  }

  await downloadFallbackPdf(input, generatedBy, fileName);
}
