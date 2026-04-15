'use client';

import { useState, useMemo } from 'react';
import { AppHeader } from '@/components/app-header';
import AuthGuard from '@/components/auth-guard';
import { useGlobalUnit } from '@/contexts/UnitContext';
import { toast } from '@/components/toast';

/* ─── Report Topics ─── */
interface ReportTopic {
  key: string;
  label: string;
  icon: string;
  color: string;
  description: string;
}

const REPORT_TOPICS: ReportTopic[] = [
  { key: 'financeiro', label: 'Financeiro', icon: 'account_balance', color: '#10b981', description: 'Resumo financeiro geral com receitas, custos e lucro' },
  { key: 'pedidos', label: 'Pedidos', icon: 'shopping_bag', color: '#6366f1', description: 'Histórico completo de pedidos por período' },
  { key: 'reembolso', label: 'Reembolso', icon: 'receipt_long', color: '#f59e0b', description: 'Solicitações de reembolso e status de aprovação' },
  { key: 'folha', label: 'Folha de Pagamento', icon: 'payments', color: '#e600a0', description: 'Detalhamento da folha por colaborador e competência' },
  { key: 'premiacao', label: 'Premiação por Colaborador', icon: 'emoji_events', color: '#f97316', description: 'Premiações e bonificações distribuídas' },
  { key: 'custos-fixos', label: 'Custos Fixos', icon: 'account_balance_wallet', color: '#ef4444', description: 'Despesas fixas mensais por unidade e categoria' },
  { key: 'despesas', label: 'Despesas', icon: 'trending_down', color: '#dc2626', description: 'Despesas variáveis e gastos operacionais' },
  { key: 'agenda', label: 'Agenda', icon: 'calendar_month', color: '#8b5cf6', description: 'Agendamentos realizados e taxa de ocupação' },
  { key: 'clientes', label: 'Clientes', icon: 'group', color: '#0ea5e9', description: 'Base de clientes, novos vs recorrentes' },
  { key: 'tratamentos', label: 'Tratamentos', icon: 'spa', color: '#14b8a6', description: 'Procedimentos realizados e popularidade' },
  { key: 'sessoes', label: 'Sessões', icon: 'event_available', color: '#a855f7', description: 'Sessões concluídas, pendentes e canceladas' },
  { key: 'cancelamentos', label: 'Cancelamentos', icon: 'cancel', color: '#be123c', description: 'Cancelamentos registrados e motivos' },
  { key: 'vendas', label: 'Vendas', icon: 'point_of_sale', color: '#059669', description: 'Vendas detalhadas por período, unidade e forma de pagamento' },
];

/* ─── Period presets ─── */
type PeriodPreset = 'today' | '7d' | '30d' | 'this-month' | 'last-month' | 'custom';

interface PeriodOption {
  key: PeriodPreset;
  label: string;
  icon: string;
}

const PERIOD_OPTIONS: PeriodOption[] = [
  { key: 'today', label: 'Hoje', icon: 'today' },
  { key: '7d', label: 'Últimos 7 dias', icon: 'date_range' },
  { key: '30d', label: 'Últimos 30 dias', icon: 'calendar_month' },
  { key: 'this-month', label: 'Este mês', icon: 'event' },
  { key: 'last-month', label: 'Mês passado', icon: 'event_repeat' },
  { key: 'custom', label: 'Personalizado', icon: 'edit_calendar' },
];

/* ─── Date helpers ─── */
function getPresetDates(preset: PeriodPreset): { start: string; end: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().split('T')[0];

  switch (preset) {
    case 'today':
      return { start: fmt(now), end: fmt(now) };
    case '7d': {
      const s = new Date(now);
      s.setDate(s.getDate() - 7);
      return { start: fmt(s), end: fmt(now) };
    }
    case '30d': {
      const s = new Date(now);
      s.setDate(s.getDate() - 30);
      return { start: fmt(s), end: fmt(now) };
    }
    case 'this-month':
      return { start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, end: fmt(now) };
    case 'last-month': {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: fmt(lastMonth), end: fmt(lastDay) };
    }
    default:
      return { start: '', end: '' };
  }
}

export default function RelatoriosPage() {
  const { globalUnit } = useGlobalUnit();
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset | null>(null);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [generating, setGenerating] = useState(false);
  const [searchTopic, setSearchTopic] = useState('');

  const filteredTopics = useMemo(() => {
    if (!searchTopic.trim()) return REPORT_TOPICS;
    return REPORT_TOPICS.filter(t =>
      t.label.toLowerCase().includes(searchTopic.toLowerCase()) ||
      t.description.toLowerCase().includes(searchTopic.toLowerCase())
    );
  }, [searchTopic]);

  const selectedTopicData = REPORT_TOPICS.find(t => t.key === selectedTopic);

  const effectiveDates = useMemo(() => {
    if (periodPreset === 'custom') return { start: customStart, end: customEnd };
    if (periodPreset) return getPresetDates(periodPreset);
    return { start: '', end: '' };
  }, [periodPreset, customStart, customEnd]);

  const canGenerate = selectedTopic && periodPreset && effectiveDates.start && effectiveDates.end;

  const handleGenerate = async () => {
    if (!canGenerate) {
      if (!selectedTopic) return toast('Selecione um tipo de relatório.', 'warning');
      if (!periodPreset) return toast('Selecione o período do relatório.', 'warning');
      if (!effectiveDates.start || !effectiveDates.end) return toast('Preencha as datas do período.', 'warning');
      return;
    }

    setGenerating(true);
    try {
      // Simulate report generation — can be connected to actual API
      await new Promise(resolve => setTimeout(resolve, 2000));
      toast(`Relatório de ${selectedTopicData?.label} gerado com sucesso!`, 'success');
    } catch {
      toast('Erro ao gerar relatório. Tente novamente.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <AuthGuard requiredPermission="dashboard">
      <div style={{ width: '100%', maxWidth: 1400, margin: '0 auto', minHeight: '100vh', paddingBottom: 60 }}>
        <AppHeader activePage="dashboard" />
        <main style={{ padding: '0 20px' }}>
          {/* Page Header */}
          <section style={{ margin: '32px 0 8px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 16,
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(99, 102, 241, 0.15))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#8b5cf6' }}>summarize</span>
            </div>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0, color: 'var(--text-main)' }}>Relatórios</h1>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                Gere relatórios detalhados do sistema por tipo e período
              </p>
            </div>
          </section>

          {/* Unit indicator */}
          {globalUnit && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 12px', borderRadius: 8, marginBottom: 20,
              background: 'rgba(230, 0, 126, 0.06)', fontSize: '0.75rem',
              fontWeight: 700, color: 'var(--primary)',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>location_on</span>
              Unidade: {globalUnit}
            </div>
          )}

          {/* ─── Progress Steps ─── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 0, marginBottom: 28, padding: '0 4px',
          }}>
            {[
              { step: 1, label: 'Tipo', done: !!selectedTopic },
              { step: 2, label: 'Período', done: !!periodPreset && !!effectiveDates.start },
              { step: 3, label: 'Gerar', done: false },
            ].map((s, i) => (
              <div key={s.step} style={{ display: 'flex', alignItems: 'center', flex: i < 2 ? 1 : 0 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.8rem',
                    background: s.done ? 'linear-gradient(135deg, #10b981, #059669)' : 'var(--border)',
                    color: s.done ? '#fff' : 'var(--text-muted)',
                    transition: 'all 0.3s ease',
                    boxShadow: s.done ? '0 2px 8px rgba(16, 185, 129, 0.3)' : 'none',
                  }}>
                    {s.done ? <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check</span> : s.step}
                  </div>
                  <span style={{
                    fontSize: '0.78rem', fontWeight: 700,
                    color: s.done ? '#10b981' : 'var(--text-muted)',
                  }}>{s.label}</span>
                </div>
                {i < 2 && (
                  <div style={{
                    flex: 1, height: 2, margin: '0 12px',
                    background: s.done ? '#10b981' : 'var(--border)',
                    borderRadius: 1, transition: 'background 0.3s',
                  }} />
                )}
              </div>
            ))}
          </div>

          {/* ─── Step 1: Topic Selection ─── */}
          <section style={{ marginBottom: 28 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 14, flexWrap: 'wrap', gap: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: selectedTopic ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(139, 92, 246, 0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span className="material-symbols-outlined" style={{
                    fontSize: 16, color: selectedTopic ? '#fff' : '#8b5cf6',
                  }}>{selectedTopic ? 'check' : 'category'}</span>
                </div>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  Selecione o tipo de relatório
                </h2>
              </div>
              {/* Search */}
              <div style={{ position: 'relative', minWidth: 200 }}>
                <span className="material-symbols-outlined" style={{
                  position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 16, color: 'var(--text-muted)',
                }}>search</span>
                <input
                  value={searchTopic} onChange={e => setSearchTopic(e.target.value)}
                  placeholder="Buscar tipo..."
                  style={{
                    width: '100%', padding: '8px 12px 8px 32px', borderRadius: 10,
                    border: '1px solid var(--border)', background: 'var(--bg)',
                    fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit',
                    color: 'var(--text-main)', outline: 'none',
                  }}
                />
              </div>
            </div>

            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 10,
            }} className="report-topics-grid">
              {filteredTopics.map(topic => {
                const isSelected = selectedTopic === topic.key;
                return (
                  <button
                    key={topic.key}
                    onClick={() => setSelectedTopic(isSelected ? null : topic.key)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 12,
                      padding: '14px 16px', borderRadius: 14, cursor: 'pointer',
                      background: isSelected
                        ? `linear-gradient(135deg, ${topic.color}12, ${topic.color}08)`
                        : 'var(--card-bg)',
                      border: isSelected
                        ? `2px solid ${topic.color}`
                        : '1px solid var(--border)',
                      transition: 'all 0.2s ease',
                      textAlign: 'left', fontFamily: 'inherit',
                      boxShadow: isSelected ? `0 4px 16px ${topic.color}20` : 'none',
                      transform: isSelected ? 'scale(1.01)' : 'scale(1)',
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) {
                        (e.currentTarget as HTMLElement).style.borderColor = topic.color;
                        (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                        (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 14px ${topic.color}15`;
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) {
                        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                        (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
                        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                      }
                    }}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                      background: `${topic.color}15`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 22, color: topic.color }}>
                        {topic.icon}
                      </span>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-main)',
                        marginBottom: 2,
                      }}>
                        {topic.label}
                        {isSelected && (
                          <span className="material-symbols-outlined" style={{
                            fontSize: 16, color: topic.color, marginLeft: 6, verticalAlign: 'middle',
                          }}>check_circle</span>
                        )}
                      </div>
                      <div style={{
                        fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500,
                        lineHeight: 1.4,
                      }}>
                        {topic.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {filteredTopics.length === 0 && (
              <div style={{
                textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 32, opacity: 0.3 }}>search_off</span>
                <p style={{ marginTop: 8, fontSize: '0.85rem' }}>Nenhum tipo de relatório encontrado.</p>
              </div>
            )}
          </section>

          {/* ─── Step 2: Period Selection ─── */}
          <section style={{
            marginBottom: 28,
            opacity: selectedTopic ? 1 : 0.5,
            pointerEvents: selectedTopic ? 'auto' : 'none',
            transition: 'opacity 0.3s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: periodPreset && effectiveDates.start ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(99, 102, 241, 0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span className="material-symbols-outlined" style={{
                  fontSize: 16, color: periodPreset && effectiveDates.start ? '#fff' : '#6366f1',
                }}>{periodPreset && effectiveDates.start ? 'check' : 'date_range'}</span>
              </div>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                Selecione o período
              </h2>
            </div>

            {/* Period Preset Buttons */}
            <div style={{
              display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14,
            }}>
              {PERIOD_OPTIONS.map(opt => {
                const isActive = periodPreset === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => {
                      setPeriodPreset(isActive ? null : opt.key);
                      if (opt.key !== 'custom') {
                        setCustomStart('');
                        setCustomEnd('');
                      }
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
                      border: isActive ? '2px solid #6366f1' : '1px solid var(--border)',
                      background: isActive ? 'rgba(99, 102, 241, 0.08)' : 'var(--card-bg)',
                      color: isActive ? '#6366f1' : 'var(--text-main)',
                      fontWeight: 700, fontSize: '0.82rem', fontFamily: 'inherit',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.borderColor = '#6366f1';
                    }}
                    onMouseLeave={e => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{opt.icon}</span>
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* Custom Date Inputs */}
            {periodPreset === 'custom' && (
              <div style={{
                display: 'flex', gap: 12, flexWrap: 'wrap',
                background: 'var(--card-bg)', borderRadius: 14,
                border: '1px solid var(--border)', padding: '16px 18px',
                animation: 'fadeIn 0.2s ease',
              }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)',
                    marginBottom: 6, letterSpacing: '0.5px', textTransform: 'uppercase',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>event</span>
                    Data Inicial
                  </label>
                  <input
                    type="date" value={customStart}
                    onChange={e => setCustomStart(e.target.value)}
                    style={{
                      width: '100%', height: 44, padding: '8px 14px', borderRadius: 10,
                      border: '2px solid var(--border)', background: 'var(--bg)',
                      fontSize: '0.88rem', fontWeight: 600, fontFamily: 'inherit',
                      color: 'var(--text-main)', outline: 'none',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = '#6366f1')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)',
                    marginBottom: 6, letterSpacing: '0.5px', textTransform: 'uppercase',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>event</span>
                    Data Final
                  </label>
                  <input
                    type="date" value={customEnd}
                    onChange={e => setCustomEnd(e.target.value)}
                    style={{
                      width: '100%', height: 44, padding: '8px 14px', borderRadius: 10,
                      border: '2px solid var(--border)', background: 'var(--bg)',
                      fontSize: '0.88rem', fontWeight: 600, fontFamily: 'inherit',
                      color: 'var(--text-main)', outline: 'none',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = '#6366f1')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                  />
                </div>
              </div>
            )}

            {/* Period Summary */}
            {periodPreset && periodPreset !== 'custom' && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', borderRadius: 10,
                background: 'rgba(99, 102, 241, 0.06)',
                fontSize: '0.8rem', fontWeight: 600, color: '#6366f1',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>info</span>
                Período: {new Date(effectiveDates.start + 'T12:00:00').toLocaleDateString('pt-BR')} até {new Date(effectiveDates.end + 'T12:00:00').toLocaleDateString('pt-BR')}
              </div>
            )}
          </section>

          {/* ─── Summary + Generate ─── */}
          <section style={{
            background: 'var(--card-bg)', borderRadius: 20,
            border: '1px solid var(--border)', padding: '24px',
            boxShadow: 'var(--shadow-md)', marginBottom: 32,
          }}>
            {/* Summary */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: 16, marginBottom: 20,
            }}>
              <div>
                <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  Resumo do Relatório
                </h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: '0.82rem' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px', borderRadius: 8,
                    background: selectedTopic ? `${selectedTopicData?.color}10` : 'var(--border)',
                    color: selectedTopic ? selectedTopicData?.color : 'var(--text-muted)',
                    fontWeight: 700,
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                      {selectedTopicData?.icon || 'help'}
                    </span>
                    {selectedTopicData?.label || 'Nenhum tipo selecionado'}
                  </span>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px', borderRadius: 8,
                    background: periodPreset && effectiveDates.start ? 'rgba(99, 102, 241, 0.08)' : 'var(--border)',
                    color: periodPreset && effectiveDates.start ? '#6366f1' : 'var(--text-muted)',
                    fontWeight: 700,
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>calendar_month</span>
                    {periodPreset && effectiveDates.start
                      ? `${new Date(effectiveDates.start + 'T12:00:00').toLocaleDateString('pt-BR')} — ${new Date(effectiveDates.end + 'T12:00:00').toLocaleDateString('pt-BR')}`
                      : 'Nenhum período selecionado'}
                  </span>
                </div>
              </div>
            </div>

            {/* Validation Feedback */}
            {(!selectedTopic || !periodPreset) && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', borderRadius: 10, marginBottom: 16,
                background: 'rgba(245, 158, 11, 0.08)', fontSize: '0.8rem',
                fontWeight: 600, color: '#d97706',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>warning</span>
                {!selectedTopic
                  ? 'Selecione um tipo de relatório acima para continuar.'
                  : 'Selecione o período desejado para gerar o relatório.'}
              </div>
            )}

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={!canGenerate || generating}
              style={{
                width: '100%', padding: '16px 24px', borderRadius: 14,
                border: 'none', cursor: canGenerate && !generating ? 'pointer' : 'not-allowed',
                background: canGenerate
                  ? 'linear-gradient(135deg, var(--primary), #ff4db1)'
                  : 'var(--border)',
                color: canGenerate ? '#fff' : 'var(--text-muted)',
                fontWeight: 800, fontSize: '1rem', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                boxShadow: canGenerate ? '0 6px 20px rgba(230, 0, 126, 0.3)' : 'none',
                transition: 'all 0.3s ease',
                opacity: generating ? 0.7 : 1,
                transform: canGenerate && !generating ? 'scale(1)' : 'scale(1)',
              }}
              onMouseEnter={e => {
                if (canGenerate && !generating) {
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 28px rgba(230, 0, 126, 0.4)';
                }
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
                if (canGenerate) (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 20px rgba(230, 0, 126, 0.3)';
              }}
            >
              {generating ? (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: 22, animation: 'spin 1s linear infinite' }}>progress_activity</span>
                  Gerando Relatório...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: 22 }}>description</span>
                  CRIAR RELATÓRIO
                </>
              )}
            </button>
          </section>
        </main>

        <footer style={{ padding: '20px 24px', borderTop: '1px solid var(--border)', textAlign: 'center', marginTop: 40 }}>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>© 2024 Virtuosa Estética - Gestão Financeira Inteligente</p>
        </footer>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @media (max-width: 600px) {
          .report-topics-grid {
            grid-template-columns: 1fr !important;
          }
        }
        @media (min-width: 601px) and (max-width: 900px) {
          .report-topics-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </AuthGuard>
  );
}
