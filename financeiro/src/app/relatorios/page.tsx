'use client';

import { useState, useCallback, useEffect } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { useGlobalUnit } from '@/contexts/UnitContext';
import { toast } from '@/components/toast';
import { formatCurrency as fmt } from '@/lib/currency';

/* ─── Types ─── */
interface Profissional { id: string; name: string; unit: string; }
interface UserOption { id: string; name: string; }

type ReportRow = Record<string, unknown>;

interface ReportResponse {
  data?: unknown;
  summary?: unknown;
  count?: number;
  error?: string;
}

interface ReportItem {
  id: number;
  label: string;
  apiType: string;
  description: string;
  fields: FieldConfig[];
}

type FieldConfig =
  | { type: 'date-range' }
  | { type: 'profissional' }
  | { type: 'vendedor' }
  | { type: 'status-agenda'; }

/* ─── Report definitions (NO unit selector — uses global unit from header) ─── */
const REPORTS: ReportItem[] = [
  { id: 1, label: 'Atendimentos', apiType: 'atendimentos', description: 'Relatório com todos os atendimentos realizados no período selecionado.', fields: [{ type: 'date-range' }] },
  { id: 2, label: 'Extrato do Paciente', apiType: 'vendas-detalhadas', description: 'Extrato financeiro completo de cada paciente no período.', fields: [{ type: 'date-range' }] },
  { id: 3, label: 'Comissão do Profissional por Intervalo', apiType: 'comissao-profissional', description: 'Relatório que apresenta a comissão que cada profissional deve receber em um período.', fields: [{ type: 'date-range' }, { type: 'profissional' }] },
  { id: 4, label: 'Valor por Profissional', apiType: 'valor-profissional', description: 'Valores faturados por cada profissional no período.', fields: [{ type: 'date-range' }, { type: 'profissional' }] },
  { id: 5, label: 'Quantidade de Sessões', apiType: 'quantidade-sessoes', description: 'Quantidade total de sessões realizadas por período e unidade.', fields: [{ type: 'date-range' }] },
  { id: 6, label: 'Agenda por Status', apiType: 'agenda-status', description: 'Agendamentos filtrados por status (confirmado, cancelado, reagendado, etc).', fields: [{ type: 'date-range' }, { type: 'status-agenda' }] },
  { id: 7, label: 'Pacientes Cadastrados', apiType: 'pacientes-cadastrados', description: 'Lista de todos os pacientes cadastrados no período selecionado.', fields: [{ type: 'date-range' }] },
  { id: 8, label: 'Pacientes Ativos', apiType: 'pacientes-ativos', description: 'Pacientes com tratamento ativo ou sessões pendentes.', fields: [] },
  { id: 9, label: 'Sessões Vendidas x Realizadas', apiType: 'sessoes-vendidas-realizadas', description: 'Comparativo entre sessões vendidas e sessões efetivamente realizadas.', fields: [] },
  { id: 10, label: 'Tratamento Parado', apiType: 'tratamento-parado', description: 'Pacientes com tratamento em andamento que não realizam sessões há mais de 30 dias.', fields: [] },
  { id: 11, label: 'Evoluções', apiType: 'atendimentos', description: 'Relatório de evoluções registradas por profissional e paciente.', fields: [{ type: 'date-range' }] },
  { id: 12, label: 'Pacientes Atendidos', apiType: 'atendimentos', description: 'Lista de pacientes atendidos no período com detalhamento.', fields: [{ type: 'date-range' }] },
  { id: 13, label: 'Aniversariantes', apiType: 'aniversariantes', description: 'Pacientes que fazem aniversário no período selecionado.', fields: [{ type: 'date-range' }] },
  { id: 14, label: 'Primeira Consulta', apiType: 'pacientes-cadastrados', description: 'Pacientes que realizaram sua primeira consulta no período.', fields: [{ type: 'date-range' }] },
  { id: 15, label: 'Agendamentos por Período', apiType: 'agendamentos-periodo', description: 'Todos os agendamentos realizados dentro do período.', fields: [{ type: 'date-range' }] },
  { id: 16, label: 'Comissão de Vendedor', apiType: 'comissao-vendedor', description: 'Relatório que apresenta a comissão que cada vendedor deve receber em um período.', fields: [{ type: 'date-range' }, { type: 'vendedor' }] },
  { id: 17, label: 'Pacientes em Tratamento', apiType: 'andamento-tratamentos', description: 'Pacientes atualmente em tratamento ativo na clínica.', fields: [] },
  { id: 18, label: 'Ranking de Vendas', apiType: 'ranking-vendas', description: 'Ranking dos itens mais vendidos por valor e quantidade.', fields: [{ type: 'date-range' }] },
  { id: 19, label: 'Ranking de Execução', apiType: 'ranking-execucao', description: 'Ranking de procedimentos mais executados no período.', fields: [{ type: 'date-range' }] },
  { id: 20, label: 'Procedimentos Contratados', apiType: 'procedimentos-contratados', description: 'Procedimentos contratados pelos pacientes no período.', fields: [{ type: 'date-range' }] },
  { id: 21, label: 'Ranking de Vendas por Cliente', apiType: 'ranking-vendas-cliente', description: 'Ranking dos clientes que mais compraram no período.', fields: [{ type: 'date-range' }] },
  { id: 22, label: 'Vendas Detalhadas', apiType: 'vendas-detalhadas', description: 'Relatório completo de vendas com todos os detalhes de cada transação.', fields: [{ type: 'date-range' }] },
  { id: 23, label: 'Clientes por Ticket Médio', apiType: 'clientes-ticket-medio', description: 'Clientes ordenados pelo ticket médio de compra.', fields: [{ type: 'date-range' }] },
  { id: 24, label: 'Produtos Disponíveis no Estoque', apiType: 'estoque-disponivel', description: 'Lista de produtos atualmente disponíveis no estoque.', fields: [] },
  { id: 25, label: 'Produtos Vendidos', apiType: 'vendas-detalhadas', description: 'Relatório de produtos vendidos no período selecionado.', fields: [{ type: 'date-range' }] },
  { id: 26, label: 'Movimentação de Estoque', apiType: 'movimentacao-estoque', description: 'Movimentação de entrada e saída do estoque no período.', fields: [{ type: 'date-range' }] },
  { id: 27, label: 'Ranking de Combos', apiType: 'procedimentos-contratados', description: 'Ranking dos combos/pacotes mais vendidos.', fields: [{ type: 'date-range' }] },
  { id: 28, label: 'Relatório de Vendas x Custos', apiType: 'financeiro-geral', description: 'Comparativo entre faturamento de vendas e custos operacionais.', fields: [{ type: 'date-range' }] },
  { id: 29, label: 'Relatório de Orçamentos', apiType: 'orcamentos', description: 'Orçamentos gerados com status de aprovação e valores.', fields: [{ type: 'date-range' }] },
  { id: 30, label: 'Sessões Restantes dos Pacientes', apiType: 'sessoes-restantes', description: 'Quantidade de sessões restantes por paciente e tratamento.', fields: [] },
  { id: 31, label: 'Cancelamentos', apiType: 'cancelamentos', description: 'Relatório de cancelamentos de tratamentos e sessões no período.', fields: [{ type: 'date-range' }] },
  { id: 32, label: 'Financeiro Geral', apiType: 'financeiro-geral', description: 'Visão geral financeira com receitas, custos e lucro líquido.', fields: [{ type: 'date-range' }] },
  { id: 33, label: 'Folha de Pagamento', apiType: 'folha-pagamento', description: 'Detalhamento da folha de pagamento por colaborador e competência.', fields: [{ type: 'date-range' }] },
  { id: 34, label: 'Reembolsos', apiType: 'reembolsos', description: 'Relatório de solicitações de reembolso com status e valores.', fields: [{ type: 'date-range' }] },
  { id: 35, label: 'Premiação por Colaborador', apiType: 'premiacao-colaborador', description: 'Premiações e bonificações distribuídas por colaborador no período.', fields: [{ type: 'date-range' }] },
  { id: 36, label: 'Custos Fixos', apiType: 'custos-fixos', description: 'Detalhamento dos custos fixos mensais por categoria e unidade.', fields: [] },
  { id: 37, label: 'Despesas Variáveis', apiType: 'despesas-variaveis', description: 'Relatório de despesas variáveis e gastos operacionais.', fields: [{ type: 'date-range' }] },
  { id: 38, label: 'Andamento de Tratamentos', apiType: 'andamento-tratamentos', description: 'Tratamentos em andamento com porcentagem de conclusão.', fields: [] },
  { id: 39, label: 'Tratamentos Finalizados', apiType: 'tratamentos-finalizados', description: 'Tratamentos concluídos no período selecionado.', fields: [{ type: 'date-range' }] },
  { id: 40, label: 'Pacientes Incompletos', apiType: 'pacientes-incompletos', description: 'Pacientes com cadastro incompleto ou dados pendentes.', fields: [] },
];

/* ─── Helpers ─── */
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUserOption(value: unknown): value is UserOption {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

function formatReportValue(key: string, value: unknown) {
  if (value === null || value === undefined) return '';

  if (key.includes('Time') || key === 'birthDate' || key === 'date') {
    const dateValue = value instanceof Date || typeof value === 'string' || typeof value === 'number'
      ? value
      : String(value);
    const parsedDate = new Date(dateValue);
    return Number.isNaN(parsedDate.getTime()) ? String(value) : parsedDate.toLocaleDateString('pt-BR');
  }

  const currencyFields = ['Value', 'Salary', 'salary', 'valor', 'multa', 'Pago', 'Devolver'];
  const exactCurrencyFields = ['value', 'totalValue', 'netSalary', 'unitCost', 'revenue', 'totalSpent', 'ticketMedio'];
  if (
    typeof value === 'number'
    && (currencyFields.some(field => key.includes(field)) || exactCurrencyFields.includes(key))
  ) {
    return fmt(value);
  }

  return String(value);
}

/* ─── PDF Generator ─── */
async function generatePDF(report: ReportItem, data: ReportRow[], summary: unknown, unit: string | null) {
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF();
  const pink: [number, number, number] = [230, 0, 126];

  // Header
  doc.setFillColor(...pink);
  doc.rect(0, 0, 210, 38, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('VIRTUOSA ESTÉTICA', 14, 16);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`${report.label}`, 14, 24);
  doc.setFontSize(9);
  doc.text(`${unit ? `Unidade: ${unit} — ` : ''}Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, 32);

  let y = 46;
  doc.setTextColor(0, 0, 0);

  // Summary if available
  if (isRecord(summary)) {
    const summaryRows = Object.entries(summary).map(([k, v]) => {
      const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
      const val = typeof v === 'number' ? (v > 100 ? fmt(v) : String(v)) : String(v);
      return [label, val];
    });
    if (summaryRows.length > 0) {
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Resumo', 14, y);
      y += 6;
      autoTable(doc, {
        startY: y, head: [['Indicador', 'Valor']], body: summaryRows,
        theme: 'grid', headStyles: { fillColor: pink, textColor: [255, 255, 255] },
        styles: { fontSize: 9, cellPadding: 4 },
        columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' } },
      });
      const tableDoc = doc as typeof doc & { lastAutoTable?: { finalY: number } };
      y = (tableDoc.lastAutoTable?.finalY ?? y) + 12;
    }
  }

  // Data table
  if (data.length > 0) {
    // Auto-detect columns from first 3 items
    const sample = data.slice(0, 3);
    const allKeys = new Set<string>();
    sample.forEach(item => Object.keys(item).forEach(k => allKeys.add(k)));

    // Filter out internal fields and keep human-readable ones
    const skipFields = ['id', 'createdAt', 'updatedAt', 'profissionalId', 'payrollImportId', 'clientId', 'services', 'payments', 'movements', 'profissional', 'notes', 'sala', 'isActive', 'absenceSchedule', 'color', 'confidenceScore', 'extractionSource', 'hasPenalty', 'installments', 'paymentMethod', 'paidValue'];
    const displayKeys = [...allKeys].filter(k => !skipFields.includes(k)).slice(0, 7);

    const headerMap: Record<string, string> = {
      clientName: 'Cliente', name: 'Nome', employeeName: 'Colaborador',
      startTime: 'Data/Hora', endTime: 'Término', procedimento: 'Procedimento',
      status: 'Status', unit: 'Unidade', totalValue: 'Valor Total',
      value: 'Valor', category: 'Categoria', quantity: 'Qtd',
      netSalary: 'Salário Líq.', paymentStatus: 'Pgto', count: 'Qtd',
      revenue: 'Receita', totalSpent: 'Total Gasto', ticketMedio: 'Ticket Médio',
      totalSessions: 'Sessões Total', completedSessions: 'Realizadas', remaining: 'Restantes',
      totalSold: 'Vendidas', totalDone: 'Realizadas', scenario: 'Cenário',
      totalPago: 'Total Pago', totalDevolver: 'Total Devolver', multa: 'Multa',
      phone: 'Telefone', email: 'E-mail', cpf: 'CPF', birthDate: 'Nascimento',
      type: 'Tipo', reason: 'Motivo', userName: 'Usuário', supplier: 'Fornecedor',
      minQuantity: 'Qtd Mínima', unitCost: 'Custo Unit.',
    };

    const headers = displayKeys.map(k => headerMap[k] || k);
    const rows = data.slice(0, 300).map(item =>
      displayKeys.map(k => {
        return formatReportValue(k, item[k]);
      })
    );

    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(`Dados (${data.length} registro${data.length > 1 ? 's' : ''})`, 14, y);
    y += 6;

    autoTable(doc, {
      startY: y, head: [headers], body: rows,
      theme: 'striped', headStyles: { fillColor: pink, textColor: [255, 255, 255] },
      styles: { fontSize: 7, cellPadding: 3 },
    });
  }

  // Footer
  const pageCount = doc.internal.pages.length - 1;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Virtuosa Estética — ${report.label} — Página ${i}/${pageCount}`, 105, 290, { align: 'center' });
  }

  doc.save(`virtuosa_${report.apiType}_${new Date().toISOString().split('T')[0]}.pdf`);
}

/* ─── Page Component ─── */
export default function RelatoriosPage() {
  const { globalUnit } = useGlobalUnit();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);

  // Dynamic data from backend
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [vendedores, setVendedores] = useState<UserOption[]>([]);

  // Fetch profissionais & vendedores on mount
  useEffect(() => {
    fetch('/api/profissionais').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setProfissionais(data);
    }).catch(() => {});

    fetch('/api/users').then(r => r.json()).then(data => {
      if (Array.isArray(data)) {
        setVendedores(data.filter(isUserOption).map(({ id, name }) => ({ id, name })));
      }
    }).catch(() => {});
  }, []);

  const toggle = useCallback((id: number) => {
    setExpandedId(prev => {
      if (prev === id) return null;
      setFormData({ dateFrom: todayStr(), dateTo: todayStr() });
      return id;
    });
  }, []);

  const updateField = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleGenerate = async (report: ReportItem) => {
    const hasDateRange = report.fields.some(f => f.type === 'date-range');
    if (hasDateRange && (!formData.dateFrom || !formData.dateTo)) {
      return toast('Preencha as datas de início e fim.', 'warning');
    }

    setGenerating(true);
    try {
      // Build query string
      const params = new URLSearchParams({ type: report.apiType });
      if (formData.dateFrom) params.set('dateFrom', formData.dateFrom);
      if (formData.dateTo) params.set('dateTo', formData.dateTo);
      if (formData.profissionalId) params.set('profissionalId', formData.profissionalId);
      if (formData.vendedor) params.set('vendedor', formData.vendedor);
      if (formData.statusFilter) params.set('statusFilter', formData.statusFilter);

      const res = await fetch(`/api/relatorios?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao gerar relatório');
      }

      const result = await res.json() as ReportResponse;
      const reportData = Array.isArray(result.data) ? result.data.filter(isRecord) : [];

      if (reportData.length === 0) {
        toast('Nenhum dado encontrado para o período/filtro selecionado.', 'warning');
        return;
      }

      // Generate PDF
      await generatePDF(report, reportData, result.summary, globalUnit);
      toast(`Relatório "${report.label}" gerado com sucesso! (${result.count ?? reportData.length} registros)`, 'success');
    } catch (error: unknown) {
      console.error('Report error:', error);
      toast(error instanceof Error ? error.message : 'Erro ao gerar relatório.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const filteredReports = searchQuery.trim()
    ? REPORTS.filter(r =>
        r.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : REPORTS;

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 40, padding: '6px 12px',
    borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--bg)', fontSize: '0.85rem',
    fontWeight: 600, fontFamily: 'inherit',
    color: 'var(--text-main)', outline: 'none',
    colorScheme: 'dark',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.72rem', fontWeight: 700,
    color: 'var(--text-muted)', marginBottom: 5,
  };

  return (
    <AuthGuard requiredPermission="dashboard">
      <div style={{ width: '100%', maxWidth: 1400, margin: '0 auto', minHeight: '100vh', paddingBottom: 60 }}>
        <AppHeader activePage="relatorios" />

        <main style={{ padding: '0 20px' }}>
          {/* Page Title */}
          <div style={{ margin: '28px 0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 900, margin: 0, color: 'var(--text-main)' }}>
              Relatórios
            </h1>
            <div style={{ position: 'relative', width: 280, maxWidth: '100%' }}>
              <span className="material-symbols-outlined" style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                fontSize: 18, color: 'var(--text-muted)', pointerEvents: 'none',
              }}>search</span>
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar relatório..."
                style={{
                  width: '100%', padding: '10px 14px 10px 38px', borderRadius: 10,
                  border: '1px solid var(--border)', background: 'var(--card-bg)',
                  fontSize: '0.88rem', fontWeight: 600, fontFamily: 'inherit',
                  color: 'var(--text-main)', outline: 'none', transition: 'border-color 0.2s',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
            </div>
          </div>

          {/* Report List */}
          <div style={{
            background: 'var(--card-bg)', borderRadius: 16,
            border: '1px solid var(--border)', overflow: 'hidden',
            boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
          }}>
            {filteredReports.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 36, opacity: 0.3, display: 'block', marginBottom: 8 }}>search_off</span>
                <p style={{ margin: 0, fontSize: '0.9rem' }}>Nenhum relatório encontrado para &quot;{searchQuery}&quot;</p>
              </div>
            ) : (
              filteredReports.map((report, idx) => {
                const isExpanded = expandedId === report.id;
                const isEven = idx % 2 === 0;

                return (
                  <div key={report.id}>
                    {/* Row */}
                    <button
                      onClick={() => toggle(report.id)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center',
                        gap: 10, padding: '14px 20px',
                        background: isExpanded
                          ? 'rgba(230, 0, 126, 0.04)'
                          : isEven ? 'transparent' : 'rgba(0,0,0,0.015)',
                        border: 'none', borderBottom: '1px solid var(--border)',
                        cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                        transition: 'background 0.15s', color: 'var(--text-main)',
                      }}
                      onMouseEnter={e => {
                        if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'rgba(230,0,126,0.03)';
                      }}
                      onMouseLeave={e => {
                        if (!isExpanded) (e.currentTarget as HTMLElement).style.background = isEven ? 'transparent' : 'rgba(0,0,0,0.015)';
                      }}
                    >
                      <span style={{
                        fontSize: '0.92rem', fontWeight: 600, flex: 1,
                        color: isExpanded ? 'var(--primary)' : 'var(--text-main)',
                      }}>
                        {report.id} - {report.label}
                      </span>
                      <span className="material-symbols-outlined" style={{
                        fontSize: 20, color: isExpanded ? 'var(--primary)' : 'var(--text-muted)',
                        transition: 'transform 0.25s ease',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        flexShrink: 0,
                      }}>expand_more</span>
                    </button>

                    {/* Expanded Panel */}
                    {isExpanded && (
                      <div style={{
                        padding: '0 20px 20px', borderBottom: '1px solid var(--border)',
                        background: 'rgba(230, 0, 126, 0.02)',
                        animation: 'slideDown 0.2s ease-out',
                      }}>
                        {/* Description */}
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '12px 16px', margin: '14px 0',
                          borderRadius: 10, background: 'rgba(99, 102, 241, 0.06)',
                          border: '1px solid rgba(99, 102, 241, 0.12)',
                        }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#6366f1', flexShrink: 0 }}>info</span>
                          <span style={{ fontSize: '0.82rem', color: 'var(--text-main)', fontWeight: 500 }}>
                            {report.description}
                          </span>
                        </div>

                        {/* Form Fields */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
                          {report.fields.map((field, fIdx) => {
                            if (field.type === 'date-range') {
                              return (
                                <div key={`dr-${fIdx}`} style={{ display: 'contents' }}>
                                  <div style={{ minWidth: 150 }}>
                                    <label style={labelStyle}>Data de <span style={{ color: '#ef4444' }}>*</span></label>
                                    <input type="date" value={formData.dateFrom || ''} onChange={e => updateField('dateFrom', e.target.value)} style={inputStyle} />
                                  </div>
                                  <div style={{ minWidth: 150 }}>
                                    <label style={labelStyle}>Data até <span style={{ color: '#ef4444' }}>*</span></label>
                                    <input type="date" value={formData.dateTo || ''} onChange={e => updateField('dateTo', e.target.value)} style={inputStyle} />
                                  </div>
                                </div>
                              );
                            }

                            if (field.type === 'profissional') {
                              return (
                                <div key={`prof-${fIdx}`} style={{ minWidth: 180 }}>
                                  <label style={labelStyle}>Profissional <span style={{ color: '#ef4444' }}>*</span></label>
                                  <select value={formData.profissionalId || 'todos'} onChange={e => updateField('profissionalId', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                                    <option value="todos">Todos</option>
                                    {profissionais.map(p => (
                                      <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                  </select>
                                </div>
                              );
                            }

                            if (field.type === 'vendedor') {
                              return (
                                <div key={`vend-${fIdx}`} style={{ minWidth: 180 }}>
                                  <label style={labelStyle}>Vendedor <span style={{ color: '#ef4444' }}>*</span></label>
                                  <select value={formData.vendedor || 'todos'} onChange={e => updateField('vendedor', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                                    <option value="todos">Todos</option>
                                    {vendedores.map(v => (
                                      <option key={v.id} value={v.name}>{v.name}</option>
                                    ))}
                                  </select>
                                </div>
                              );
                            }

                            if (field.type === 'status-agenda') {
                              return (
                                <div key={`st-${fIdx}`} style={{ minWidth: 160 }}>
                                  <label style={labelStyle}>Status</label>
                                  <select value={formData.statusFilter || 'todos'} onChange={e => updateField('statusFilter', e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                                    <option value="todos">Todos</option>
                                    <option value="pendente">Pendente</option>
                                    <option value="confirmado">Confirmado</option>
                                    <option value="finalizado">Finalizado</option>
                                    <option value="cancelado">Cancelado</option>
                                    <option value="faltou">Faltou</option>
                                    <option value="reagendado">Reagendado</option>
                                  </select>
                                </div>
                              );
                            }

                            return null;
                          })}

                          {/* Generate Button */}
                          <button
                            onClick={() => handleGenerate(report)}
                            disabled={generating}
                            style={{
                              height: 40, padding: '0 24px', borderRadius: 8,
                              border: 'none', cursor: generating ? 'not-allowed' : 'pointer',
                              background: 'linear-gradient(135deg, var(--primary), #c2185b)',
                              color: '#fff', fontWeight: 700, fontSize: '0.85rem',
                              fontFamily: 'inherit', display: 'flex', alignItems: 'center',
                              gap: 7, transition: 'all 0.2s', flexShrink: 0,
                              boxShadow: '0 3px 10px rgba(230, 0, 126, 0.25)',
                              opacity: generating ? 0.7 : 1,
                            }}
                            onMouseEnter={e => { if (!generating) (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; }}
                          >
                            {generating ? (
                              <>
                                <span className="material-symbols-outlined" style={{ fontSize: 18, animation: 'spin 1s linear infinite' }}>progress_activity</span>
                                Gerando...
                              </>
                            ) : (
                              <>
                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>picture_as_pdf</span>
                                Gerar PDF
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Count */}
          <div style={{ textAlign: 'center', padding: '16px 0', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            {filteredReports.length} relatório{filteredReports.length !== 1 ? 's' : ''} disponíve{filteredReports.length !== 1 ? 'is' : 'l'}
          </div>
        </main>

        <footer style={{ padding: '20px 24px', borderTop: '1px solid var(--border)', textAlign: 'center', marginTop: 40 }}>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>© 2024 Virtuosa Estética - Gestão Financeira Inteligente</p>
        </footer>
      </div>

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; max-height: 0; }
          to { opacity: 1; max-height: 300px; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Date input dark theme styling */
        input[type="date"] {
          color-scheme: dark;
        }
        input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(0.7) sepia(1) saturate(5) hue-rotate(290deg);
          cursor: pointer;
          padding: 2px;
          border-radius: 4px;
          transition: background 0.2s;
        }
        input[type="date"]::-webkit-calendar-picker-indicator:hover {
          background: rgba(230, 0, 126, 0.15);
        }
        input[type="date"]:focus,
        select:focus {
          border-color: var(--primary) !important;
          box-shadow: 0 0 0 2px rgba(230, 0, 126, 0.12);
        }
        select {
          color-scheme: dark;
          appearance: none;
          -webkit-appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23888' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 12px center;
          padding-right: 32px !important;
        }
      `}</style>
    </AuthGuard>
  );
}
