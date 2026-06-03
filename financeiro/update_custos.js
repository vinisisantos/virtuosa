const fs = require('fs');
const file = '/Users/viniciussantos/Downloads/virtuosa-main/financeiro/src/components/dashboard/custos-unificado.tsx';
let content = fs.readFileSync(file, 'utf8');

// Update state vars for Add Modal
content = content.replace(
`  const [showAddForm, setShowAddForm] = useState(false);
  const [addType, setAddType] = useState<'fixo' | 'variavel'>('fixo');
  const [addName, setAddName] = useState('');
  const [addValue, setAddValue] = useState('');
  const [addCategory, setAddCategory] = useState('Outros');
  const [addDueDay, setAddDueDay] = useState('');
  const [addDueDate, setAddDueDate] = useState('');`,
`  const [showAddForm, setShowAddForm] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [addName, setAddName] = useState('');
  const [addValue, setAddValue] = useState('');
  const [addCategory, setAddCategory] = useState('Outros');
  const [addDueDate, setAddDueDate] = useState('');
  const [addObs, setAddObs] = useState('');`
);

// Update handleAdd
content = content.replace(
`  const handleAdd = () => {
    const digits = addValue.replace(/[^\\d]/g, '');
    const val = parseInt(digits, 10) / 100;
    if (!addName.trim() || val <= 0) return;

    if (addType === 'fixo') {
      // Add as fixed expense (recurs every month)
      d.setFixedName(addName.trim());
      d.setFixedValue(addValue);
      d.setFixedCategory(addCategory);
      d.setFixedDate(addDueDate || '');
      setTimeout(() => d.addFixed(), 50);
    } else {
      // Add as variable bill
      d.setBillName(addName.trim());
      d.setBillValue(addValue);
      d.setBillCategory(addCategory);
      d.setBillType('variavel');
      d.setBillDueDate(addDueDate);
      setTimeout(() => d.addBill(), 50);
    }

    setAddName(''); setAddValue(''); setAddCategory('Outros');
    setAddDueDay(''); setAddDueDate(''); setShowAddForm(false);
  };`,
`  const handleAdd = () => {
    const digits = addValue.replace(/[^\\d]/g, '');
    const val = parseInt(digits, 10) / 100;
    if (!addName.trim() || val <= 0) return alert('Informe nome e valor da despesa.');
    if (!addDueDate) return alert('Informe a data.');

    if (isRecurring) {
      d.setFixedName(addName.trim());
      d.setFixedValue(addValue);
      d.setFixedCategory(addCategory);
      d.setFixedDate(addDueDate);
      d.setFixedObs(addObs.trim());
      setTimeout(() => d.addFixed(), 50);
    } else {
      d.setBillName(addName.trim());
      d.setBillValue(addValue);
      d.setBillCategory(addCategory);
      d.setBillType('variavel');
      d.setBillDueDate(addDueDate);
      d.setBillObs(addObs.trim());
      setTimeout(() => d.addBill(), 50);
    }

    setAddName(''); setAddValue(''); setAddCategory('Outros');
    setAddDueDate(''); setAddObs(''); setIsRecurring(false); setShowAddForm(false);
  };`
);

// We'll replace the main return with a completely new layout
const returnStart = content.indexOf('  return (\n    <div>');
const returnEnd = content.indexOf('      <style>{`\n        @keyframes fadeSlide {');

if (returnStart !== -1 && returnEnd !== -1) {
  const newReturn = `  const upcomingExpenses = d.dueBills.slice(0, 6); // next bills
  const totalPendente = costRows.filter(r => !r.isPaid).reduce((s, r) => s + r.value, 0);
  const totalPago = costRows.filter(r => r.isPaid).reduce((s, r) => s + r.value, 0);
  const totalDespesas = totalPendente + totalPago;
  const pgtoProgress = totalDespesas > 0 ? (totalPago / totalDespesas) * 100 : 0;

  return (
    <div>
      {/* HEADER & PERIOD */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <PeriodSelector
          selectedMonth={d.selectedMonth} setSelectedMonth={d.setSelectedMonth}
          selectedYear={d.selectedYear} setSelectedYear={d.setSelectedYear}
        />
        <button onClick={() => setShowAddForm(true)} style={{
          padding: '10px 20px', borderRadius: 12, border: 'none',
          background: 'linear-gradient(135deg, var(--primary), #ff4db1)',
          color: '#fff', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer',
          fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
          boxShadow: '0 4px 15px rgba(230,0,126,0.3)', transition: 'all 0.2s',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add_circle</span>
          Adicionar Despesa
        </button>
      </div>

      {/* UPCOMING EXPENSES */}
      <div style={{ marginBottom: 30 }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-symbols-outlined" style={{ color: '#f59e0b' }}>event_upcoming</span>
          Gastos Projetados (Próximos Dias)
        </h2>
        {upcomingExpenses.length === 0 ? (
          <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: '24px', border: '1px solid var(--border)', textAlign: 'center', color: 'var(--text-muted)' }}>
            Nenhum gasto projetado para os próximos dias.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {upcomingExpenses.map(b => (
              <div key={b.id} style={{ background: 'var(--card-bg)', borderRadius: 16, padding: '16px', border: '1px solid var(--border)', borderLeft: '4px solid #f59e0b', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b', marginBottom: 4 }}>{b.isOverdue ? 'Vencida!' : 'Vence em breve'}</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 10 }}>{b.dueDate.toLocaleDateString('pt-BR')}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#ef4444' }}>{fmt(b.value)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* KPIS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
        <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: '20px 22px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Total do Mês</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-main)' }}>{fmt(totalDespesas)}</div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden', marginTop: 12 }}>
            <div style={{ height: '100%', borderRadius: 3, background: '#10b981', width: \`\${pgtoProgress}%\` }} />
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: 6, textAlign: 'right' }}>{pgtoProgress.toFixed(0)}% pago</div>
        </div>
        <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: '20px 22px', border: '1px solid var(--border)', borderBottom: '3px solid #10b981' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Despesas Pagas</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#10b981' }}>{fmt(totalPago)}</div>
        </div>
        <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: '20px 22px', border: '1px solid var(--border)', borderBottom: '3px solid #f59e0b' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Despesas Pendentes</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#f59e0b' }}>{fmt(totalPendente)}</div>
        </div>
      </div>

      {/* TABLE FILTERS */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {(['all', 'pendente', 'pago'] as const).map(s => (
          <button key={s} onClick={() => setFilterStatus(s)} style={{
            padding: '6px 14px', borderRadius: 20, border: '1px solid',
            borderColor: filterStatus === s ? '#10b981' : 'var(--border)',
            background: filterStatus === s ? '#10b98115' : 'var(--card-bg)',
            color: filterStatus === s ? '#10b981' : 'var(--text-muted)',
            fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
          }}>
            {s === 'all' ? 'Todos' : s === 'pago' ? '✅ Pago' : '🕐 Pendente'}
          </button>
        ))}
        <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }} />
        {(['all', 'fixo', 'variavel'] as const).map(t => (
          <button key={t} onClick={() => setFilterType(t)} style={{
            padding: '6px 14px', borderRadius: 20, border: '1px solid',
            borderColor: filterType === t ? '#8b5cf6' : 'var(--border)',
            background: filterType === t ? '#8b5cf615' : 'var(--card-bg)',
            color: filterType === t ? '#8b5cf6' : 'var(--text-muted)',
            fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
          }}>
            {t === 'all' ? 'Todos' : t === 'fixo' ? '🔄 Fixo' : '📅 Variável'}
          </button>
        ))}
      </div>

      {/* COST TABLE */}
      <div style={{ background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)', marginBottom: 20, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 22px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: '#14b8a610', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#14b8a6' }}>receipt_long</span>
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>Despesas Cadastradas</h2>
            <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>{costRows.length} itens • {fmt(costRows.reduce((s, r) => s + r.value, 0))}</p>
          </div>
        </div>

        {costRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--border)', display: 'block', marginBottom: 8 }}>receipt</span>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>Nenhuma despesa cadastrada</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Despesa', 'Tipo', 'Vencimento', 'Status', 'Valor', 'Ações'].map((h, i) => (
                    <th key={i} style={{
                      padding: '10px 14px', textAlign: i === 4 ? 'right' : 'left',
                      fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {costRows.map((row) => (
                  <tr key={\`\${row.source}-\${row.id}\`} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(20,184,166,0.02)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: row.type === 'fixo' ? '#8b5cf610' : '#f59e0b10', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 15, color: row.type === 'fixo' ? '#8b5cf6' : '#f59e0b' }}>{row.type === 'fixo' ? 'repeat' : 'event'}</span>
                        </div>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{row.name}</span>
                          {row.category && (
                            <div style={{ marginTop: 2, display: 'flex', gap: 4 }}>
                              <span style={{ background: 'rgba(100,116,139,0.06)', color: '#64748b', padding: '1px 8px', borderRadius: 5, fontSize: '0.65rem', fontWeight: 600 }}>{row.category}</span>
                              {row.raw.obs && <span style={{ background: '#f59e0b10', color: '#f59e0b', padding: '1px 8px', borderRadius: 5, fontSize: '0.65rem', fontWeight: 600 }}>{row.raw.obs}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ background: row.type === 'fixo' ? '#10b98112' : '#9333ea12', color: row.type === 'fixo' ? '#10b981' : '#9333ea', padding: '4px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {row.type === 'fixo' ? '🔄 Recorrente' : '📅 Variável'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{row.dueInfo}</td>
                    <td style={{ padding: '12px 14px' }}>
                      {row.source === 'bill' ? (
                        <span style={{ background: row.isPaid ? '#10b98112' : '#f59e0b12', color: row.isPaid ? '#10b981' : '#f59e0b', padding: '4px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{row.isPaid ? '✅ Pago' : '🕐 Pendente'}</span>
                      ) : (
                        <span style={{ background: '#6366f110', color: '#6366f1', padding: '4px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700 }}>Ativo</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#ef4444', fontSize: '0.95rem', whiteSpace: 'nowrap' }}>{fmt(row.value)}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end' }}>
                        {row.source === 'fixed' && <IconBtn icon="edit" color="#f59e0b" title="Editar" onClick={() => startEdit(row)} />}
                        {row.source === 'bill' && !row.isPaid && <IconBtn icon="check_circle" color="#10b981" title="Marcar Pago" onClick={() => d.markPaid(row.id)} />}
                        <IconBtn icon="delete" color="#ef4444" title="Excluir" onClick={() => handleDelete(row)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ PAYROLL ACCORDION (Rest of code remains but adapted to Despesas name) ═══ */}
      <div style={{ background: 'var(--card-bg)', borderRadius: 16, border: '1px solid var(--border)', marginBottom: 20, overflow: 'hidden' }}>
        <button onClick={() => setPayrollOpen(!payrollOpen)} style={{ width: '100%', padding: '18px 22px', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'inherit', transition: 'background 0.15s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: '#6366f110', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#6366f1' }}>payments</span>
            </div>
            <div style={{ textAlign: 'left' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-main)' }}>Folha de Pagamento</h3>
              <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>{selectedEmployees.size} de {payrollEntries.length} colaboradores selecionados • {fmt(folhaTotal)}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ padding: '4px 12px', borderRadius: 8, background: '#6366f110', color: '#6366f1', fontWeight: 800, fontSize: '0.85rem' }}>{fmt(folhaTotal)}</span>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-muted)', transition: 'transform 0.3s', transform: payrollOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
          </div>
        </button>
        {payrollOpen && (
          <div style={{ borderTop: '1px solid var(--border)', animation: 'fadeSlide 0.2s ease-out' }}>
            {payrollLoading ? (
              <div style={{ textAlign: 'center', padding: '30px 20px' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>Carregando folha...</p>
              </div>
            ) : payrollEntries.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 20px' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>Nenhum colaborador encontrado para este período</p>
              </div>
            ) : (
              <>
                <div style={{ padding: '12px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>
                    <input type="checkbox" checked={selectedEmployees.size === payrollEntries.length} onChange={toggleAllEmployees} style={{ width: 18, height: 18, accentColor: '#6366f1', cursor: 'pointer' }} />
                    Selecionar todos
                  </label>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>{selectedEmployees.size} selecionados</span>
                </div>
                <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                  {payrollEntries.map((emp) => {
                    const isSelected = selectedEmployees.has(emp.id);
                    const salary = getEffectiveSalary(emp);
                    return (
                      <div key={emp.id} onClick={() => toggleEmployee(emp.id)} style={{ padding: '14px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s', background: isSelected ? '#6366f104' : 'transparent' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <input type="checkbox" checked={isSelected} readOnly style={{ width: 18, height: 18, accentColor: '#6366f1', cursor: 'pointer', pointerEvents: 'none' }} />
                          <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-main)' }}>{emp.employeeName}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: isSelected ? '#6366f1' : 'var(--text-muted)' }}>{fmt(salary)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ═══ ADD EXPENSE MODAL ═══ */}
      {showAddForm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }} onClick={() => setShowAddForm(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', borderRadius: 18, border: '1px solid var(--border)', maxWidth: 460, width: '100%', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', animation: 'fadeSlide 0.2s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--primary)' }}>add_circle</span>Nova Despesa
              </h2>
              <button onClick={() => setShowAddForm(false)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>Nome da Despesa</label>
                <input value={addName} onChange={e => setAddName(e.target.value)} placeholder="Ex: Conta de Luz, Fornecedor..." style={inputS} autoFocus />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>Valor (R$)</label>
                  <input value={addValue} onChange={e => setAddValue(formatCurrency(e.target.value))} placeholder="0,00" inputMode="numeric" style={inputS} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>Data</label>
                  <DatePicker value={addDueDate} onChange={setAddDueDate} variant="input" />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>Categoria</label>
                <CategorySelector value={addCategory} onChange={setAddCategory} categories={BILL_CATEGORIES} accentColor="var(--primary)" />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>Descrição / Observações (Opcional)</label>
                <textarea value={addObs} onChange={e => setAddObs(e.target.value)} rows={2} style={{ ...inputS, height: 'auto', resize: 'vertical' }} placeholder="Detalhes adicionais..." />
              </div>

              <div style={{ background: 'var(--bg)', padding: '12px', borderRadius: 12, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Despesa Recorrente?</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Repete automaticamente todo mês</div>
                </div>
                <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24 }}>
                  <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                  <span style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: isRecurring ? 'var(--primary)' : 'var(--border)', transition: '.4s', borderRadius: 24 }}>
                    <span style={{ position: 'absolute', content: '""', height: 18, width: 18, left: isRecurring ? 22 : 3, bottom: 3, backgroundColor: 'white', transition: '.4s', borderRadius: '50%' }} />
                  </span>
                </label>
              </div>
            </div>

            <button onClick={handleAdd} style={{ marginTop: 24, width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, var(--primary), #ff4db1)', color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 15px rgba(230,0,126,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>check_circle</span>Salvar Despesa
            </button>
          </div>
        </div>
      )}
`;

  content = content.substring(0, returnStart) + newReturn + '\n' + content.substring(returnEnd);
  fs.writeFileSync(file, content, 'utf8');
  console.log('Update applied');
} else {
  console.log('Could not find return start/end');
}
