/* eslint-disable @typescript-eslint/no-explicit-any */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

interface ReportData {
  totalRev: number;
  totalCost: number;
  balance: number;
  margin: number;
  selectedMonth: number;
  selectedYear: number;
  sortedProcs: { name: string; count: number; total: number }[];
  filteredLogs: { name: string; value: number; date: string; type: string; unit?: string; seller?: string }[];
}

export function exportFinancialPDF(data: ReportData) {
  const doc = new jsPDF();
  const monthLabel = `${MONTHS[data.selectedMonth]} ${data.selectedYear}`;

  // Header
  doc.setFillColor(99, 102, 241);
  doc.rect(0, 0, 210, 35, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Virtuosa Estética', 14, 16);
  doc.setFontSize(11);
  doc.text(`Relatório Financeiro — ${monthLabel}`, 14, 26);

  // KPIs
  doc.setTextColor(0, 0, 0);
  const y = 45;
  const kpis = [
    { label: 'Receita Total', value: fmt(data.totalRev), color: [16, 185, 129] },
    { label: 'Custos Totais', value: fmt(data.totalCost), color: [239, 68, 68] },
    { label: 'Lucro Líquido', value: fmt(data.balance), color: data.balance >= 0 ? [16, 185, 129] : [239, 68, 68] },
    { label: 'Margem', value: `${data.margin.toFixed(1)}%`, color: [99, 102, 241] },
  ];

  kpis.forEach((kpi, i) => {
    const x = 14 + i * 47;
    doc.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.roundedRect(x, y, 44, 24, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.text(kpi.label.toUpperCase(), x + 4, y + 8);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(kpi.value, x + 4, y + 18);
  });

  // Top Procedures Table
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Ranking de Procedimentos', 14, 82);

  autoTable(doc, {
    startY: 86,
    head: [['#', 'Procedimento', 'Qtd', 'Receita']],
    body: data.sortedProcs.slice(0, 15).map((p, i) => [
      String(i + 1), p.name, String(p.count), fmt(p.total),
    ]),
    theme: 'striped',
    headStyles: { fillColor: [99, 102, 241], fontStyle: 'bold' },
    styles: { fontSize: 8 },
    margin: { left: 14, right: 14 },
  });

  // Sales Table
  const finalY = (doc as any).lastAutoTable?.finalY || 140;
  if (finalY < 240) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Últimas Vendas', 14, finalY + 12);

    const sales = data.filteredLogs.filter(l => l.type === 'sale').slice(0, 20);
    autoTable(doc, {
      startY: finalY + 16,
      head: [['Data', 'Procedimento', 'Vendedor', 'Unidade', 'Valor']],
      body: sales.map(s => [
        s.date ? new Date(s.date).toLocaleDateString('pt-BR') : '-',
        s.name, s.seller || '-', s.unit || '-', fmt(s.value),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129], fontStyle: 'bold' },
      styles: { fontSize: 7 },
      margin: { left: 14, right: 14 },
    });
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} • Virtuosa Estética • Página ${i}/${pageCount}`, 14, 290);
  }

  doc.save(`relatorio-financeiro-${monthLabel.replace(' ', '-')}.pdf`);
}

export function exportCommissionsPDF(sellers: { name: string; total: number; count: number; commission: number }[], month: string) {
  const doc = new jsPDF();

  doc.setFillColor(16, 185, 129);
  doc.rect(0, 0, 210, 35, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Virtuosa Estética', 14, 16);
  doc.setFontSize(11);
  doc.text(`Relatório de Comissões — ${month}`, 14, 26);

  doc.setTextColor(0, 0, 0);
  autoTable(doc, {
    startY: 45,
    head: [['#', 'Vendedor(a)', 'Vendas', 'Total Vendido', 'Comissão (5%)']],
    body: sellers.map((s, i) => [
      String(i + 1), s.name, String(s.count), fmt(s.total), fmt(s.commission),
    ]),
    theme: 'striped',
    headStyles: { fillColor: [16, 185, 129], fontStyle: 'bold' },
    styles: { fontSize: 9 },
    margin: { left: 14, right: 14 },
  });

  const total = sellers.reduce((s, x) => s + x.commission, 0);
  const fy = (doc as any).lastAutoTable?.finalY || 100;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total em Comissões: ${fmt(total)}`, 14, fy + 12);

  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} • Virtuosa Estética`, 14, 290);

  doc.save(`comissoes-${month.replace(' ', '-')}.pdf`);
}
