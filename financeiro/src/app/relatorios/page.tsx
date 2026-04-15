'use client';

import { useState, useCallback } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { useGlobalUnit } from '@/contexts/UnitContext';
import { toast } from '@/components/toast';

/* ─── Report definitions ─── */
interface ReportItem {
  id: number;
  label: string;
  description: string;
  fields: FieldConfig[];
}

type FieldConfig =
  | { type: 'date-range' }
  | { type: 'select'; name: string; label: string; options: string[] }
  | { type: 'unit' };

const REPORTS: ReportItem[] = [
  { id: 1, label: 'Atendimentos', description: 'Relatório com todos os atendimentos realizados no período selecionado.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 2, label: 'Extrato do Paciente', description: 'Extrato financeiro completo de cada paciente no período.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 3, label: 'Comissão do Profissional por Intervalo', description: 'Relatório que apresenta a comissão que cada profissional deve receber em um período.', fields: [{ type: 'date-range' }, { type: 'select', name: 'profissional', label: 'Profissional', options: ['Todos'] }, { type: 'unit' }] },
  { id: 4, label: 'Valor por Profissional', description: 'Valores faturados por cada profissional no período.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 5, label: 'Quantidade de Sessões', description: 'Quantidade total de sessões realizadas por período e unidade.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 6, label: 'Agenda por Status', description: 'Agendamentos filtrados por status (confirmado, cancelado, reagendado, etc).', fields: [{ type: 'date-range' }, { type: 'select', name: 'status', label: 'Status', options: ['Todos', 'Confirmado', 'Cancelado', 'Reagendado', 'Faltou'] }, { type: 'unit' }] },
  { id: 7, label: 'Pacientes Cadastrados', description: 'Lista de todos os pacientes cadastrados no período selecionado.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 8, label: 'Pacientes Ativos', description: 'Pacientes com tratamento ativo ou sessões pendentes.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 9, label: 'Sessões Vendidas x Realizadas', description: 'Comparativo entre sessões vendidas e sessões efetivamente realizadas.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 10, label: 'Tratamento Parado', description: 'Pacientes com tratamento em andamento que não realizam sessões há mais de 30 dias.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 11, label: 'Evoluções', description: 'Relatório de evoluções registradas por profissional e paciente.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 12, label: 'Evoluções Fora do Prazo', description: 'Evoluções que foram preenchidas fora do prazo estipulado.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 13, label: 'Pacientes Atendidos', description: 'Lista de pacientes atendidos no período com detalhamento.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 14, label: 'Aniversariantes', description: 'Pacientes que fazem aniversário no período selecionado.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 15, label: 'Primeira Consulta', description: 'Pacientes que realizaram sua primeira consulta no período.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 16, label: 'Lista de Presença', description: 'Relatório de presença dos pacientes nos agendamentos.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 17, label: 'Indicações', description: 'Relatório de indicações recebidas e realizadas por paciente.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 18, label: 'Histórico de Movimentação da Agenda', description: 'Todas as alterações realizadas na agenda (criações, cancelamentos, reagendamentos).', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 19, label: 'Histórico de Movimentação de Status', description: 'Alterações de status de tratamentos e sessões.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 20, label: 'Histórico de Lembretes', description: 'Lembretes enviados por WhatsApp, e-mail ou SMS no período.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 21, label: 'Controle de Presença', description: 'Controle de presença por profissional e colaborador.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 22, label: 'Andamento de Tratamentos', description: 'Tratamentos em andamento com porcentagem de conclusão.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 23, label: 'Tratamentos Finalizados', description: 'Tratamentos concluídos no período selecionado.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 24, label: 'Pacientes Incompletos', description: 'Pacientes com cadastro incompleto ou dados pendentes.', fields: [{ type: 'unit' }] },
  { id: 25, label: 'Agendamentos por Período', description: 'Todos os agendamentos realizados dentro do período.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 26, label: 'Comissão de Vendedor', description: 'Relatório que apresenta a comissão que cada vendedor deve receber em um período.', fields: [{ type: 'date-range' }, { type: 'select', name: 'vendedor', label: 'Vendedor', options: ['Todos', 'Administrador'] }, { type: 'unit' }] },
  { id: 27, label: 'Pacientes em Tratamento', description: 'Pacientes atualmente em tratamento ativo na clínica.', fields: [{ type: 'unit' }] },
  { id: 28, label: 'Ranking de Vendas', description: 'Ranking dos itens mais vendidos por valor e quantidade.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 29, label: 'Ranking de Execução', description: 'Ranking de procedimentos mais executados no período.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 30, label: 'Procedimentos Contratados', description: 'Procedimentos contratados pelos pacientes no período.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 31, label: 'Ranking de Vendas por Cliente', description: 'Ranking dos clientes que mais compraram no período.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 32, label: 'Vendas Detalhadas', description: 'Relatório completo de vendas com todos os detalhes de cada transação.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 33, label: 'Clientes por Ticket Médio', description: 'Clientes ordenados pelo ticket médio de compra.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 34, label: 'Produtos Disponíveis no Estoque', description: 'Lista de produtos atualmente disponíveis no estoque.', fields: [{ type: 'unit' }] },
  { id: 35, label: 'Produtos Vendidos', description: 'Relatório de produtos vendidos no período selecionado.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 36, label: 'Lucros e Vendas do Estoque', description: 'Análise de lucro e vendas por produto do estoque.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 37, label: 'Indicação de Tratamentos', description: 'Relatório de tratamentos indicados vs realizados.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 38, label: 'Ranking de Combos', description: 'Ranking dos combos/pacotes mais vendidos.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 39, label: 'Relatório de Vendas x Custos', description: 'Comparativo entre faturamento de vendas e custos operacionais.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 40, label: 'Movimentação de Estoque', description: 'Movimentação de entrada e saída do estoque no período.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 41, label: 'Relatório de Orçamentos', description: 'Orçamentos gerados com status de aprovação e valores.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 42, label: 'Sessões Restantes dos Pacientes', description: 'Quantidade de sessões restantes por paciente e tratamento.', fields: [{ type: 'unit' }] },
  { id: 43, label: 'Relatório de Consumo de Procedimento', description: 'Consumo de insumos por procedimento realizado.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 44, label: 'Cancelamentos', description: 'Relatório de cancelamentos de tratamentos e sessões no período.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 45, label: 'Financeiro Geral', description: 'Visão geral financeira com receitas, custos e lucro líquido.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 46, label: 'Folha de Pagamento', description: 'Detalhamento da folha de pagamento por colaborador e competência.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 47, label: 'Reembolsos', description: 'Relatório de solicitações de reembolso com status e valores.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 48, label: 'Premiação por Colaborador', description: 'Premiações e bonificações distribuídas por colaborador no período.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 49, label: 'Custos Fixos', description: 'Detalhamento dos custos fixos mensais por categoria e unidade.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
  { id: 50, label: 'Despesas Variáveis', description: 'Relatório de despesas variáveis e gastos operacionais.', fields: [{ type: 'date-range' }, { type: 'unit' }] },
];

/* ─── Helpers ─── */
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function RelatoriosPage() {
  const { globalUnit } = useGlobalUnit();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);

  const toggle = useCallback((id: number) => {
    setExpandedId(prev => {
      if (prev === id) return null;
      // Initialize dates for new expansion
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
      await new Promise(resolve => setTimeout(resolve, 1800));
      toast(`Relatório "${report.label}" gerado com sucesso!`, 'success');
    } catch {
      toast('Erro ao gerar relatório.', 'error');
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
            {/* Search */}
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
                  color: 'var(--text-main)', outline: 'none',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
            </div>
          </div>

          {/* Report List */}
          <div style={{
            background: 'var(--card-bg)', borderRadius: 16,
            border: '1px solid var(--border)',
            overflow: 'hidden',
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
                        transition: 'background 0.15s',
                        color: 'var(--text-main)',
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
                        <div style={{
                          display: 'flex', alignItems: 'flex-end', gap: 14,
                          flexWrap: 'wrap',
                        }}>
                          {report.fields.map((field, fIdx) => {
                            if (field.type === 'date-range') {
                              return (
                                <div key={`dr-${fIdx}`} style={{ display: 'contents' }}>
                                  {/* Date From */}
                                  <div style={{ minWidth: 150 }}>
                                    <label style={{
                                      display: 'block', fontSize: '0.72rem', fontWeight: 700,
                                      color: 'var(--text-muted)', marginBottom: 5,
                                    }}>
                                      Data de <span style={{ color: '#ef4444' }}>*</span>
                                    </label>
                                    <input
                                      type="date"
                                      value={formData.dateFrom || ''}
                                      onChange={e => updateField('dateFrom', e.target.value)}
                                      style={{
                                        width: '100%', height: 40, padding: '6px 12px',
                                        borderRadius: 8, border: '1px solid var(--border)',
                                        background: 'var(--bg)', fontSize: '0.85rem',
                                        fontWeight: 600, fontFamily: 'inherit',
                                        color: 'var(--text-main)', outline: 'none',
                                      }}
                                    />
                                  </div>
                                  {/* Date To */}
                                  <div style={{ minWidth: 150 }}>
                                    <label style={{
                                      display: 'block', fontSize: '0.72rem', fontWeight: 700,
                                      color: 'var(--text-muted)', marginBottom: 5,
                                    }}>
                                      Data até <span style={{ color: '#ef4444' }}>*</span>
                                    </label>
                                    <input
                                      type="date"
                                      value={formData.dateTo || ''}
                                      onChange={e => updateField('dateTo', e.target.value)}
                                      style={{
                                        width: '100%', height: 40, padding: '6px 12px',
                                        borderRadius: 8, border: '1px solid var(--border)',
                                        background: 'var(--bg)', fontSize: '0.85rem',
                                        fontWeight: 600, fontFamily: 'inherit',
                                        color: 'var(--text-main)', outline: 'none',
                                      }}
                                    />
                                  </div>
                                </div>
                              );
                            }
                            if (field.type === 'select') {
                              return (
                                <div key={`sel-${fIdx}`} style={{ minWidth: 160 }}>
                                  <label style={{
                                    display: 'block', fontSize: '0.72rem', fontWeight: 700,
                                    color: 'var(--text-muted)', marginBottom: 5,
                                  }}>
                                    {field.label} <span style={{ color: '#ef4444' }}>*</span>
                                  </label>
                                  <select
                                    value={formData[field.name] || field.options[0]}
                                    onChange={e => updateField(field.name, e.target.value)}
                                    style={{
                                      width: '100%', height: 40, padding: '6px 12px',
                                      borderRadius: 8, border: '1px solid var(--border)',
                                      background: 'var(--bg)', fontSize: '0.85rem',
                                      fontWeight: 600, fontFamily: 'inherit',
                                      color: 'var(--text-main)', outline: 'none',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    {field.options.map(opt => (
                                      <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                  </select>
                                </div>
                              );
                            }
                            if (field.type === 'unit') {
                              return (
                                <div key={`unit-${fIdx}`} style={{ minWidth: 140 }}>
                                  <label style={{
                                    display: 'block', fontSize: '0.72rem', fontWeight: 700,
                                    color: 'var(--text-muted)', marginBottom: 5,
                                  }}>
                                    Unidade:
                                  </label>
                                  <select
                                    value={formData.unit || globalUnit || 'Todas'}
                                    onChange={e => updateField('unit', e.target.value)}
                                    style={{
                                      width: '100%', height: 40, padding: '6px 12px',
                                      borderRadius: 8, border: '1px solid var(--border)',
                                      background: 'var(--bg)', fontSize: '0.85rem',
                                      fontWeight: 600, fontFamily: 'inherit',
                                      color: 'var(--text-main)', outline: 'none',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <option value="Todas">Todas</option>
                                    <option value="Barueri">Barueri</option>
                                    <option value="Osasco">Osasco</option>
                                    <option value="SBC">SBC</option>
                                    <option value="SCS">SCS</option>
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
                            onMouseEnter={e => {
                              if (!generating) (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={e => {
                              (e.currentTarget as HTMLElement).style.transform = 'none';
                            }}
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
          <div style={{
            textAlign: 'center', padding: '16px 0', fontSize: '0.78rem',
            color: 'var(--text-muted)', fontWeight: 600,
          }}>
            {filteredReports.length} relatório{filteredReports.length !== 1 ? 's' : ''} disponíve{filteredReports.length !== 1 ? 'is' : 'l'}
          </div>
        </main>

        <footer style={{ padding: '20px 24px', borderTop: '1px solid var(--border)', textAlign: 'center', marginTop: 40 }}>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>© 2024 Virtuosa Estética - Gestão Financeira Inteligente</p>
        </footer>
      </div>

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; max-height: 0; padding-top: 0; padding-bottom: 0; }
          to { opacity: 1; max-height: 300px; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @media (max-width: 600px) {
          main > div:nth-child(2) > div button {
            padding: 12px 16px !important;
          }
        }
      `}</style>
    </AuthGuard>
  );
}
