'use client';
import { useState, useRef, useEffect, useMemo } from 'react';
import { FixedExpense, Bill, fmt, FIXED_CATEGORIES, BILL_CATEGORIES, MONTHS, formatCurrency, cardS, labelS, inputS } from '@/hooks/useDashboard';
import { DatePicker } from '@/components/ui/date-picker';
import { CategorySelector } from '@/components/category-selector';
import { calcularFolha, DEFAULT_SETTINGS, formatBRL } from '@/lib/payroll-calc';
import type { SmartEmployee, PayrollSettings } from '@/lib/payroll-calc';

/* ─── Category meta ─── */
const CAT_META: Record<string,{icon:string;color:string}> = {
  'Aluguel':{icon:'home',color:'#8b5cf6'},'Salários':{icon:'badge',color:'#3b82f6'},
  'Internet':{icon:'wifi',color:'#f59e0b'},'Luz':{icon:'bolt',color:'#eab308'},
  'Impostos':{icon:'account_balance',color:'#ef4444'},'Fornecedores':{icon:'local_shipping',color:'#14b8a6'},
  'Marketing':{icon:'campaign',color:'#ec4899'},'Segurança':{icon:'security',color:'#0ea5e9'},
  'Sistema':{icon:'computer',color:'#6366f1'},'Contabilidade':{icon:'calculate',color:'#84cc16'},
  'Royalties':{icon:'license',color:'#d946ef'},'Água':{icon:'water_drop',color:'#06b6d4'},
  'Parcela':{icon:'credit_card',color:'#e11d48'},'Folha de Pagamento':{icon:'payments',color:'#6366f1'},
  'Outros':{icon:'more_horiz',color:'#6b7280'},
};
const getCat = (c?:string) => CAT_META[c||'']||{icon:'receipt',color:'var(--text-muted)'};

const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

/* ─── Inline Add Row ─── */
function InlineAddRow({ onAdd, fields, accent }: {
  onAdd: (data: Record<string,string>) => void;
  fields: { key: string; label: string; type: 'text'|'currency'|'category'|'date'|'select'; options?: string[]; categories?: string[] }[];
  accent: string;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Record<string,string>>({});

  const set = (k: string, v: string) => setData(prev => ({ ...prev, [k]: v }));

  const handleAdd = () => {
    onAdd(data);
    setData({});
    setOpen(false);
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        width: '100%', padding: '12px 16px', borderRadius: 12,
        border: `1.5px dashed ${accent}40`, background: `${accent}05`,
        cursor: 'pointer', display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: 8, fontFamily: 'inherit',
        fontSize: '0.85rem', fontWeight: 700, color: accent,
        transition: 'all 0.2s', marginTop: 8,
      }}
        onMouseEnter={e => { e.currentTarget.style.background = `${accent}10`; e.currentTarget.style.borderColor = `${accent}60`; }}
        onMouseLeave={e => { e.currentTarget.style.background = `${accent}05`; e.currentTarget.style.borderColor = `${accent}40`; }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
        Adicionar
      </button>
    );
  }

  return (
    <div style={{
      padding: 16, borderRadius: 14, marginTop: 8,
      background: 'var(--bg)', border: '1px solid var(--border)',
      animation: 'fadeSlide 0.2s ease-out',
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {fields.map(f => (
          <div key={f.key}>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>{f.label}</label>
            {f.type === 'text' && (
              <input value={data[f.key] || ''} onChange={e => set(f.key, e.target.value)}
                placeholder={f.label} style={{ ...inputS, padding: '8px 12px', fontSize: '0.85rem' }} />
            )}
            {f.type === 'currency' && (
              <input value={data[f.key] || ''} onChange={e => set(f.key, formatCurrency(e.target.value))}
                placeholder="0,00" inputMode="numeric" style={{ ...inputS, padding: '8px 12px', fontSize: '0.85rem' }} />
            )}
            {f.type === 'category' && f.categories && (
              <CategorySelector value={data[f.key] || ''} onChange={v => set(f.key, v)} categories={f.categories} accentColor={accent} />
            )}
            {f.type === 'date' && (
              <DatePicker value={data[f.key] || ''} onChange={v => set(f.key, v)} variant="input" />
            )}
            {f.type === 'select' && f.options && (
              <select value={data[f.key] || f.options[0]} onChange={e => set(f.key, e.target.value)}
                style={{ ...inputS, padding: '8px 12px', fontSize: '0.85rem', cursor: 'pointer' }}>
                {f.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
        <button onClick={() => { setOpen(false); setData({}); }} style={{
          padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)',
          background: 'var(--card-bg)', cursor: 'pointer', fontFamily: 'inherit',
          fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', transition: 'all 0.15s',
        }}>Cancelar</button>
        <button onClick={handleAdd} style={{
          padding: '8px 20px', borderRadius: 8, border: 'none',
          background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
          cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem',
          fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center',
          gap: 6, boxShadow: `0 3px 12px ${accent}30`, transition: 'all 0.15s',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check</span>
          Salvar
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════ */
/* ─── MAIN COMPONENT ─── */
/* ═══════════════════════════════════════════ */
export function CustosUnificado({ d }: { d: any }) {
  const now = new Date();
  const selectedUnit = d.selectedUnit || 'all';

  // Payroll total
  const folhaTotal = useMemo(() => {
    try {
      const empRaw = typeof window !== 'undefined' ? localStorage.getItem('virtuosa_smart_employees') : null;
      const setRaw = typeof window !== 'undefined' ? localStorage.getItem('virtuosa_payroll_settings') : null;
      const employees: SmartEmployee[] = empRaw ? JSON.parse(empRaw) : [];
      const settings: PayrollSettings = setRaw ? JSON.parse(setRaw) : DEFAULT_SETTINGS;
      return employees.filter(e => e.status === 'ativo' && (selectedUnit === 'all' || e.unidade === selectedUnit))
        .reduce((sum, emp) => sum + calcularFolha(emp, settings).custoTotal, 0);
    } catch { return 0; }
  }, [selectedUnit]);

  // Filtered data
  const filteredFixed = selectedUnit === 'all' ? d.fixedExpenses : d.fixedExpenses.filter((e: FixedExpense) => (e.unit || '') === selectedUnit);
  const filteredBills = d.bills || [];

  const totalFixed = filteredFixed.reduce((s: number, e: FixedExpense) => s + e.value, 0);
  const totalBills = filteredBills.reduce((s: number, b: Bill) => s + b.value, 0);
  const totalGeral = totalFixed + totalBills + folhaTotal;

  // Edit modal state
  const [editingFixed, setEditingFixed] = useState<FixedExpense | null>(null);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [editName, setEditName] = useState('');
  const [editValue, setEditValue] = useState('');
  const [editCategory, setEditCategory] = useState('');

  const startEditFixed = (item: FixedExpense) => {
    setEditingFixed(item);
    setEditName(item.name);
    setEditValue(item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
    setEditCategory(item.category);
  };

  const saveEditFixed = () => {
    if (!editingFixed) return;
    const digits = editValue.replace(/[^\d]/g, '');
    const val = parseInt(digits, 10) / 100 || 0;
    d.editFixed(editingFixed.id, { name: editName.trim(), value: val, category: editCategory });
    setEditingFixed(null);
  };

  return (
    <div>
      {/* ─── Period Selector ─── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <PeriodSelector
          selectedMonth={d.selectedMonth} setSelectedMonth={d.setSelectedMonth}
          selectedYear={d.selectedYear} setSelectedYear={d.setSelectedYear}
        />
      </div>

      {/* ═══ KPI CARDS ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Custos Fixos', value: totalFixed, count: filteredFixed.length, icon: 'repeat', color: '#8b5cf6', sub: 'itens' },
          { label: 'Contas a Pagar', value: totalBills, count: filteredBills.length, icon: 'event_upcoming', color: '#3b82f6', sub: 'contas' },
          { label: 'Total Mensal', value: totalGeral, count: filteredFixed.length + filteredBills.length, icon: 'account_balance_wallet', color: '#ef4444', sub: folhaTotal > 0 ? `+ Folha ${fmt(folhaTotal)}` : 'Fixos + Contas' },
        ].map((kpi, i) => (
          <div key={i} style={{
            background: 'var(--card-bg)', borderRadius: 14, padding: '18px 20px',
            border: '1px solid var(--border)', position: 'relative', overflow: 'hidden',
          }}>
            {/* Accent bar */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${kpi.color}, ${kpi.color}60)` }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, marginTop: 4 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{kpi.label}</span>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: `${kpi.color}10`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: kpi.color }}>{kpi.icon}</span>
              </div>
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-main)', lineHeight: 1, marginBottom: 4 }}>{fmt(kpi.value)}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              {kpi.count} {kpi.sub}
            </div>
          </div>
        ))}
      </div>

      {/* ═══ CUSTOS FIXOS ═══ */}
      <Section
        title="Custos Fixos" subtitle={`${filteredFixed.length} itens • ${fmt(totalFixed)}/mês`}
        icon="repeat" accentColor="#8b5cf6"
      >
        {/* Table */}
        {filteredFixed.length === 0 ? (
          <EmptyState icon="repeat" text="Nenhum custo fixo cadastrado" />
        ) : (
          <div style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Descrição', 'Categoria', 'Valor', ''].map((h, i) => (
                    <th key={i} style={{
                      padding: '10px 14px', textAlign: i === 2 ? 'right' : 'left',
                      fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.5px',
                      borderBottom: '1px solid var(--border)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredFixed.map((item: FixedExpense, i: number) => {
                  const cat = getCat(item.category);
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(139,92,246,0.02)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 30, height: 30, borderRadius: 8, background: `${cat.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 15, color: cat.color }}>{cat.icon}</span>
                          </div>
                          <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{item.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ background: `${cat.color}10`, color: cat.color, padding: '3px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600 }}>{item.category}</span>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#ef4444', fontSize: '0.95rem' }}>
                        {fmt(item.value)}
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', width: 80 }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <IconBtn icon="edit" color="#f59e0b" onClick={() => startEditFixed(item)} />
                          <IconBtn icon="delete" color="#ef4444" onClick={() => d.deleteFixed(item.id)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {/* Folha row */}
                {folhaTotal > 0 && (
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(99,102,241,0.02)' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 30, height: 30, borderRadius: 8, background: '#6366f112', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#6366f1' }}>payments</span>
                        </div>
                        <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#6366f1' }}>Folha de Pagamento</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ background: '#6366f110', color: '#6366f1', padding: '3px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600 }}>Automático</span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#6366f1', fontSize: '0.95rem' }}>{fmt(folhaTotal)}</td>
                    <td style={{ padding: '12px 14px', width: 80 }} />
                  </tr>
                )}
                {/* Total footer */}
                <tr style={{ background: 'var(--bg)' }}>
                  <td colSpan={2} style={{ padding: '12px 14px', fontWeight: 800, fontSize: '0.82rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Custos Fixos</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, color: '#8b5cf6', fontSize: '1.05rem' }}>{fmt(totalFixed + folhaTotal)}</td>
                  <td style={{ width: 80 }} />
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Inline Add */}
        <InlineAddRow
          accent="#8b5cf6"
          fields={[
            { key: 'name', label: 'Descrição', type: 'text' },
            { key: 'value', label: 'Valor (R$)', type: 'currency' },
            { key: 'category', label: 'Categoria', type: 'category', categories: FIXED_CATEGORIES },
            { key: 'date', label: 'Data', type: 'date' },
          ]}
          onAdd={(data) => {
            d.setFixedName(data.name || '');
            d.setFixedValue(data.value || '');
            d.setFixedCategory(data.category || 'Outros');
            d.setFixedDate(data.date || '');
            setTimeout(() => d.addFixed(), 50);
          }}
        />
      </Section>

      {/* ═══ CONTAS A PAGAR ═══ */}
      <Section
        title="Contas a Pagar" subtitle={`${filteredBills.length} contas • ${fmt(totalBills)}`}
        icon="event_upcoming" accentColor="#3b82f6"
      >
        {filteredBills.length === 0 ? (
          <EmptyState icon="event_note" text="Nenhuma conta cadastrada" />
        ) : (
          <div style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Conta', 'Tipo', 'Vencimento', 'Valor', ''].map((h, i) => (
                    <th key={i} style={{
                      padding: '10px 14px', textAlign: i === 3 ? 'right' : 'left',
                      fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.5px',
                      borderBottom: '1px solid var(--border)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredBills.map((bill: Bill) => {
                  const isFixo = bill.type === 'fixo';
                  return (
                    <tr key={bill.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.02)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 30, height: 30, borderRadius: 8,
                            background: isFixo ? 'rgba(16,185,129,0.08)' : 'rgba(156,39,176,0.08)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 15, color: isFixo ? '#10b981' : '#9c27b0' }}>{isFixo ? 'repeat' : 'event'}</span>
                          </div>
                          <div>
                            <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{bill.name}</span>
                            {bill.category && (
                              <div style={{ marginTop: 2 }}>
                                <span style={{ background: 'rgba(59,130,246,0.06)', color: '#3b82f6', padding: '1px 8px', borderRadius: 5, fontSize: '0.65rem', fontWeight: 600 }}>{bill.category}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          background: isFixo ? 'rgba(16,185,129,0.08)' : 'rgba(156,39,176,0.08)',
                          color: isFixo ? '#10b981' : '#9c27b0',
                          padding: '3px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700,
                        }}>{isFixo ? 'Fixo' : 'Variável'}</span>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                        {isFixo ? `Dia ${bill.dueDay}` : (bill.dueDateManual ? new Date(bill.dueDateManual + 'T12:00:00').toLocaleDateString('pt-BR') : '—')}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#ef4444', fontSize: '0.95rem' }}>
                        {fmt(bill.value)}
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', width: 50 }}>
                        <IconBtn icon="delete" color="#ef4444" onClick={() => d.deleteBill(bill.id)} />
                      </td>
                    </tr>
                  );
                })}
                {/* Total footer */}
                <tr style={{ background: 'var(--bg)' }}>
                  <td colSpan={3} style={{ padding: '12px 14px', fontWeight: 800, fontSize: '0.82rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Contas a Pagar</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, color: '#3b82f6', fontSize: '1.05rem' }}>{fmt(totalBills)}</td>
                  <td style={{ width: 50 }} />
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Inline Add */}
        <InlineAddRow
          accent="#3b82f6"
          fields={[
            { key: 'name', label: 'Nome da Conta', type: 'text' },
            { key: 'value', label: 'Valor (R$)', type: 'currency' },
            { key: 'category', label: 'Categoria', type: 'category', categories: BILL_CATEGORIES },
            { key: 'type', label: 'Tipo', type: 'select', options: ['fixo', 'variavel'] },
            { key: 'dueDay', label: 'Dia Vencimento', type: 'text' },
          ]}
          onAdd={(data) => {
            d.setBillName(data.name || '');
            d.setBillValue(data.value || '');
            d.setBillCategory(data.category || 'Outros');
            d.setBillType(data.type === 'variavel' ? 'variavel' : 'fixo');
            d.setBillDueDay(data.dueDay || '');
            d.setBillDueDate(data.dueDate || '');
            setTimeout(() => d.addBill(), 50);
          }}
        />
      </Section>

      {/* ═══ DETALHAMENTO VISUAL ═══ */}
      <Section title="Detalhamento" subtitle="Distribuição dos custos" icon="bar_chart" accentColor="#14b8a6">
        {(() => {
          const chartItems: { label: string; value: number; color: string; icon: string }[] = [];
          filteredFixed.forEach((e: FixedExpense) => {
            const cat = getCat(e.category);
            chartItems.push({ label: e.name, value: e.value, color: cat.color, icon: cat.icon });
          });
          if (folhaTotal > 0) chartItems.push({ label: 'Folha de Pagamento', value: folhaTotal, color: '#6366f1', icon: 'payments' });
          filteredBills.forEach((b: Bill) => {
            chartItems.push({ label: b.name, value: b.value, color: '#3b82f6', icon: 'event_upcoming' });
          });
          chartItems.sort((a, b) => b.value - a.value);

          if (chartItems.length === 0) return <EmptyState icon="bar_chart" text="Sem dados para exibir" />;

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {chartItems.map((item, i) => {
                const pct = totalGeral > 0 ? (item.value / totalGeral) * 100 : 0;
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 26, height: 26, borderRadius: 7, background: `${item.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 13, color: item.color }}>{item.icon}</span>
                        </div>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{item.label}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: item.color }}>{fmt(item.value)}</span>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: `${item.color}10`, color: item.color }}>{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 3,
                        background: `linear-gradient(90deg, ${item.color}, ${item.color}80)`,
                        width: `${pct}%`, transition: 'width 0.6s ease', minWidth: pct > 0 ? 4 : 0,
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </Section>

      {/* ─── Edit Fixed Modal ─── */}
      {editingFixed && (
        <div onClick={() => setEditingFixed(null)} style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--card-bg)', borderRadius: 18,
            border: '1px solid var(--border)', maxWidth: 460, width: '100%',
            padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ color: '#f59e0b' }}>edit</span>Editar Custo Fixo
              </h2>
              <button onClick={() => setEditingFixed(null)} style={{
                width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--bg)', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>Descrição</label>
                <input value={editName} onChange={e => setEditName(e.target.value)} style={{ ...inputS }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>Valor (R$)</label>
                <input value={editValue} onChange={e => setEditValue(formatCurrency(e.target.value))} inputMode="numeric" style={{ ...inputS }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>Categoria</label>
                <CategorySelector value={editCategory} onChange={setEditCategory} categories={FIXED_CATEGORIES} accentColor="#f59e0b" />
              </div>
            </div>
            <button onClick={saveEditFixed} style={{
              marginTop: 18, width: '100%', padding: '12px',
              borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
              color: '#fff', fontWeight: 800, fontSize: '0.9rem',
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 4px 12px rgba(245,158,11,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span>Salvar Alterações
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pickerDrop {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

/* ═══ REUSABLE SUB-COMPONENTS ═══ */

function Section({ title, subtitle, icon, accentColor, children }: {
  title: string; subtitle: string; icon: string; accentColor: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: 'var(--card-bg)', borderRadius: 16, padding: '20px 22px',
      border: '1px solid var(--border)', marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: `${accentColor}10`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: accentColor }}>{icon}</span>
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>{title}</h2>
            <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>{subtitle}</p>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '30px 20px' }}>
      <span className="material-symbols-outlined" style={{ fontSize: 36, color: 'var(--border)', display: 'block', marginBottom: 8 }}>{icon}</span>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>{text}</p>
    </div>
  );
}

function IconBtn({ icon, color, onClick }: { icon: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: 30, height: 30, borderRadius: 8, border: `1px solid ${color}25`,
      background: `${color}08`, cursor: 'pointer', display: 'flex',
      alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${color}18`; (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${color}08`; (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 15, color }}>{icon}</span>
    </button>
  );
}

/* ─── Period Selector ─── */
function PeriodSelector({ selectedMonth, setSelectedMonth, selectedYear, setSelectedYear }: {
  selectedMonth: number; setSelectedMonth: (m: number) => void;
  selectedYear: number; setSelectedYear: (y: number) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(selectedYear);
  const pickerRef = useRef<HTMLDivElement>(null);
  const now = new Date();
  const isCurrentMonth = selectedMonth === now.getMonth() && selectedYear === now.getFullYear();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const goToPrev = () => { if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(selectedYear - 1); } else setSelectedMonth(selectedMonth - 1); };
  const goToNext = () => { if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(selectedYear + 1); } else setSelectedMonth(selectedMonth + 1); };
  const selectMonth = (m: number) => { setSelectedMonth(m); setSelectedYear(pickerYear); setShowPicker(false); };

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }} ref={pickerRef}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)', padding: '4px 6px' }}>
        <button onClick={goToPrev} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', transition: 'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.color = 'var(--text-main)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
        ><span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_left</span></button>

        <button onClick={() => { setPickerYear(selectedYear); setShowPicker(!showPicker); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: 'none', background: showPicker ? 'var(--bg)' : 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-main)', fontWeight: 700, fontSize: '0.88rem', transition: 'all 0.15s' }}>
          {MONTHS[selectedMonth]} {selectedYear}
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-muted)', transition: 'transform 0.2s', transform: showPicker ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
        </button>

        <button onClick={goToNext} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', transition: 'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.color = 'var(--text-main)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
        ><span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_right</span></button>

        {!isCurrentMonth && (
          <button onClick={() => { setSelectedMonth(now.getMonth()); setSelectedYear(now.getFullYear()); }} style={{ height: 30, borderRadius: 8, border: 'none', background: 'var(--primary)', cursor: 'pointer', padding: '0 10px', display: 'flex', alignItems: 'center', gap: 4, color: '#fff', fontWeight: 700, fontSize: '0.72rem', fontFamily: 'inherit', marginLeft: 2 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>today</span>Hoje
          </button>
        )}
      </div>

      {showPicker && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, width: 300, padding: 16, background: 'var(--card-bg)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 12px 40px rgba(0,0,0,0.15)', zIndex: 200, animation: 'pickerDrop 0.15s ease-out' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button onClick={() => setPickerYear(pickerYear - 1)} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_left</span>
            </button>
            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)' }}>{pickerYear}</span>
            <button onClick={() => setPickerYear(pickerYear + 1)} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_right</span>
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {MONTHS_SHORT.map((label, m) => {
              const isSelected = m === selectedMonth && pickerYear === selectedYear;
              const isCurrent = m === now.getMonth() && pickerYear === now.getFullYear();
              return (
                <button key={m} onClick={() => selectMonth(m)} style={{
                  padding: '8px 4px', borderRadius: 8, border: 'none',
                  background: isSelected ? 'var(--primary)' : 'transparent',
                  color: isSelected ? '#fff' : isCurrent ? 'var(--primary)' : 'var(--text-main)',
                  fontWeight: isSelected || isCurrent ? 700 : 500,
                  fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s',
                }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg)'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >{label}</button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
