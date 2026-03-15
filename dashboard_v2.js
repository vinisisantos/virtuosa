// Global clear function — shows custom modal
window.clearAllDashboardData = function () {
    var modal = document.getElementById('clear-confirm-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
};

// Setup modal buttons when DOM is ready
document.addEventListener('DOMContentLoaded', function () {
    var modal = document.getElementById('clear-confirm-modal');
    var confirmBtn = document.getElementById('clear-confirm-btn');
    var cancelBtn = document.getElementById('clear-cancel-btn');

    if (confirmBtn) {
        confirmBtn.addEventListener('click', function () {
            localStorage.clear();
            location.reload();
        });
    }
    if (cancelBtn) {
        cancelBtn.addEventListener('click', function () {
            if (modal) modal.style.display = 'none';
        });
    }
    if (modal) {
        modal.addEventListener('click', function (e) {
            if (e.target === modal) modal.style.display = 'none';
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const STORAGE_KEY_LOGS = 'virtuosa_finance_logs_v2';
    const STORAGE_KEY_GOALS = 'virtuosa_goals_v2';
    const STORAGE_KEY_FIXED = 'virtuosa_fixed_expenses_v2';
    const STORAGE_KEY_BILLS = 'virtuosa_bills_v2';

    console.log('>>> VIRTUESA DASHBOARD V4.2 (STABLE) INITIALIZED <<<');

    let logs = [];
    let goals = {}; // { 'YYYY-MM': value }
    let fixedExpenses = [];
    let bills = []; // { id, name, value, dueDay, dueDateManual, type, category, payments: {} }
    let procChart = null;
    let revCostChart = null;
    let evolutionChart = null;
    let categoryChart = null;

    // --- Time State ---
    const now = new Date();
    let selectedMonth = now.getMonth(); // 0-11
    let selectedYear = now.getFullYear();

    const monthsNames = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    let chartRange = 'monthly'; // 'monthly', 'daily', 'weekly', 'yearly'
    let selectedUnit = 'all'; // 'all', 'Barueri', 'Osasco', etc.

    // --- UI Elements ---
    const monthSelector = document.getElementById('month-selector');
    // --- Vendas UI ---
    const saleNameInp = document.getElementById('sale-name');
    const saleValueInp = document.getElementById('sale-value');
    const saleDateInp = document.getElementById('sale-date');
    const salePaymentInp = document.getElementById('sale-payment');
    const saleUnitInp = document.getElementById('sale-unit');
    const saleObsInp = document.getElementById('sale-obs');

    // --- Despesas UI ---
    const costNameInp = document.getElementById('cost-name');
    const costValueInp = document.getElementById('cost-value');
    const costDateInp = document.getElementById('cost-date');
    const costCategoryInp = document.getElementById('cost-category');
    const costUnitInp = document.getElementById('cost-unit');
    const costObsInp = document.getElementById('cost-obs');

    const revenueStat = document.getElementById('stat-revenue');
    const costsStat = document.getElementById('stat-costs');
    const balanceStat = document.getElementById('stat-balance');

    const performanceList = document.getElementById('performance-list');

    const addSaleBtn = document.getElementById('add-sale-btn');
    const addCostBtn = document.getElementById('add-cost-btn');
    const addFixedCostBtn = document.getElementById('add-fixed-cost-btn');
    const clearBtn = document.getElementById('clear-dashboard-btn');
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const saveGoalBtn = document.getElementById('save-goal-btn');

    // --- Helpers ---
    const formatCurrency = (val) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    const parseCurrency = (str) => {
        if (!str) return 0;
        const val = parseFloat(str.replace(/[^\d]/g, '')) / 100 || 0;
        return val;
    };

    const applyCurrencyMask = (inp) => {
        if (!inp) return;
        inp.addEventListener('input', (e) => {
            let val = e.target.value.replace(/\D/g, "");
            val = (val / 100).toFixed(2) + "";
            val = val.replace(".", ",");
            val = val.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
            e.target.value = val;
        });
    };

    const currencyInps = document.querySelectorAll('.input-currency-mask');
    currencyInps.forEach(applyCurrencyMask);

    // --- Core Functions ---
    const initMonthSelector = () => {
        if (!monthSelector) return;
        monthSelector.innerHTML = monthsNames.map((name, index) => `
            <button class="month-btn ${index === selectedMonth ? 'active' : ''}" data-month="${index}">
                ${name}
            </button>
        `).join('');

        // Add event listeners to buttons
        monthSelector.querySelectorAll('.month-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                selectedMonth = parseInt(e.currentTarget.dataset.month);
                updateMonthSelectorUI();
                calculate();
            });
        });
    };

    const updateMonthSelectorUI = () => {
        if (!monthSelector) return;
        monthSelector.querySelectorAll('.month-btn').forEach((btn, index) => {
            if (index === selectedMonth) btn.classList.add('active');
            else btn.classList.remove('active');
        });
    };

    const initTabs = () => {
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.tab;

                // Update buttons
                tabButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Update content
                tabContents.forEach(content => {
                    if (content.id === `tab-${target}`) {
                        content.classList.add('active');
                    } else {
                        content.classList.remove('active');
                    }
                });
            });
        });
    };

    const saveLogs = () => {
        localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(logs));
        calculate();
    };

    const saveGoal = (val) => {
        const key = `${selectedYear}-${selectedMonth}`;
        goals[key] = val;
        localStorage.setItem(STORAGE_KEY_GOALS, JSON.stringify(goals));
        calculate();
    };

    const loadLogs = async () => {
        const savedLogs = localStorage.getItem(STORAGE_KEY_LOGS);
        if (savedLogs) Object.assign(logs, JSON.parse(savedLogs));

        try {
            // Fetch real-time payroll data from the Financeiro Module
            const res = await fetch('https://financeiro-blush-nine.vercel.app/api/payroll/dashboard-sync');
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.data) {
                    // Filter out any stale virtual payroll logs just in case they were cached
                    logs = logs.filter(l => !l.id || !l.id.toString().startsWith('payroll-'));
                    // Inject the dynamic payroll costs
                    logs = [...logs, ...data.data];
                }
            }
        } catch (err) {
            console.warn('Financeiro Sync Warning: Could not fetch payroll data from API.', err);
        }

        const savedGoals = localStorage.getItem(STORAGE_KEY_GOALS);
        if (savedGoals) goals = JSON.parse(savedGoals);

        const savedFixed = localStorage.getItem(STORAGE_KEY_FIXED);
        if (savedFixed) fixedExpenses = JSON.parse(savedFixed);

        const savedBills = localStorage.getItem(STORAGE_KEY_BILLS);
        if (savedBills) bills = JSON.parse(savedBills);

        initMonthSelector();
        calculate();
        renderFixedExpensesList();
        renderBillsList();
        checkDueBills();
    };

    const saveFixedExpenses = () => {
        localStorage.setItem(STORAGE_KEY_FIXED, JSON.stringify(fixedExpenses));
        calculate();
        renderFixedExpensesList();
    };

    const calculate = () => {
        let totalRev = 0;
        let totalCost = 0;
        const procStats = {};

        // Filter logs for current month/year AND selected unit
        const filteredLogs = logs.filter(item => {
            if (!item.date) return false;
            const itemDate = new Date(item.date);
            const matchMonth = itemDate.getUTCMonth() === selectedMonth && itemDate.getUTCFullYear() === selectedYear;
            const matchUnit = selectedUnit === 'all' || (item.unit || '') === selectedUnit;
            return matchMonth && matchUnit;
        });

        filteredLogs.forEach(item => {
            if (item.type === 'sale') {
                totalRev += item.value;
                const name = item.name || 'Outros';
                procStats[name] = (procStats[name] || 0) + item.value;
            } else {
                totalCost += item.value;
            }
        });

        const balance = totalRev - totalCost;

        // Add Fixed Expenses to calculation
        const totalFixed = fixedExpenses.reduce((sum, item) => sum + item.value, 0);
        totalCost += totalFixed;

        // Get Goal for current month
        const goalKey = `${selectedYear}-${selectedMonth}`;
        const currentGoal = goals[goalKey] || 0;

        updateUI(totalRev, totalCost, balance, procStats, filteredLogs, currentGoal);
        updateCharts(totalRev, totalCost, procStats);
        updateReportSections(totalRev, totalCost, balance, filteredLogs, procStats);
    };

    const updateUI = (rev, cost, bal, stats, filteredLogs, currentGoal) => {
        if (revenueStat) revenueStat.innerText = formatCurrency(rev);
        if (costsStat) costsStat.innerText = formatCurrency(cost);
        if (balanceStat) {
            balanceStat.innerText = formatCurrency(bal);
            balanceStat.className = 'stat-value ' + (bal >= 0 ? 'text-green' : 'text-pink');
        }

        // History lists
        const renderItem = (item) => `
            <li class="history-item ${item.type}">
                <div class="item-main">
                    <span class="item-title">${item.name}</span>
                    <div class="item-meta">
                        <span class="item-date">${item.date ? new Date(item.date).toLocaleDateString() : 'N/A'}</span>
                        ${item.unit ? `<span class="badge-unit">${item.unit}</span>` : ''}
                        ${item.category ? `<span class="badge-category">${item.category}</span>` : ''}
                        ${item.payment ? `<span style="font-size:0.75rem; color:var(--text-muted)">• ${item.payment}</span>` : ''}
                    </div>
                </div>
                <strong class="item-value">${item.type === 'sale' ? '+' : '-'}${formatCurrency(item.value)}</strong>
            </li>
        `;

        // Dashboard History (last 5)
        const dashboardHistory = document.getElementById('mini-history-list');
        if (dashboardHistory) {
            let baseHtml = filteredLogs.slice().reverse().slice(0, 5).map(renderItem).join('');

            // Add Fixed Expenses to Dashboard History (Visual Only)
            if (fixedExpenses.length > 0) {
                const fixedHtml = fixedExpenses.map(item => `
                    <li class="history-item cost fixed-cost">
                        <div class="item-main">
                            <span class="item-title">${item.name} <span class="badge-fixed">Fixo</span></span>
                            <div class="item-meta">
                                <span class="item-date">Todo mês</span>
                                <span class="badge-category">${item.category}</span>
                            </div>
                        </div>
                        <strong class="item-value">-${formatCurrency(item.value)}</strong>
                    </li>
                `).join('');
                baseHtml = fixedHtml + baseHtml;
            }
            dashboardHistory.innerHTML = baseHtml;
        }

        // Sales Tab List
        const salesListHost = document.getElementById('sales-list');
        if (salesListHost) {
            const salesOnly = filteredLogs.filter(l => l.type === 'sale').reverse();
            salesListHost.innerHTML = salesOnly.length ? salesOnly.map(renderItem).join('') : '<p style="text-align:center; padding:20px; color:var(--text-muted)">Nenhuma venda neste mês.</p>';
        }

        // Expense Tab List
        const costsListHost = document.getElementById('costs-list');
        if (costsListHost) {
            const costsOnly = filteredLogs.filter(l => l.type === 'cost').reverse();
            costsListHost.innerHTML = costsOnly.length ? costsOnly.map(renderItem).join('') : '<p style="text-align:center; padding:20px; color:var(--text-muted)">Nenhuma despesa neste mês.</p>';
        }

        // Update Titles
        const goalMonthName = document.getElementById('goal-month-name');
        if (goalMonthName) goalMonthName.innerText = monthsNames[selectedMonth];

        // Update Goal Progress Bar
        const goalBar = document.getElementById('goal-bar');
        const goalText = document.getElementById('goal-progress-text');
        const goalInput = document.getElementById('goal-input');

        if (goalBar && goalText) {
            const perc = currentGoal > 0 ? Math.min((rev / currentGoal) * 100, 100) : 0;
            goalBar.style.width = perc + '%';
            goalText.innerText = `META: ${formatCurrency(rev)} / ${formatCurrency(currentGoal)}`;

            if (perc < 30) goalBar.style.background = 'var(--danger)';
            else if (perc < 80) goalBar.style.background = 'var(--primary)';
            else goalBar.style.background = 'var(--success)';
        }

        if (goalInput && !goalInput.value && currentGoal > 0) {
            let val = (currentGoal).toFixed(2).replace(".", ",");
            val = val.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
            goalInput.value = val;
        }

        const marginStat = document.getElementById('stat-margin');
        if (marginStat) {
            const margin = rev > 0 ? (bal / rev) * 100 : 0;
            marginStat.innerText = margin.toFixed(1) + '%';
        }

        const sortedProcs = Object.entries(stats).sort((a, b) => b[1] - a[1]);
        if (performanceList) {
            if (sortedProcs.length === 0) {
                performanceList.innerHTML = '<p class="text-muted" style="text-align:center; padding: 20px;">Nenhum lançamento.</p>';
            } else {
                performanceList.innerHTML = sortedProcs.slice(0, 5).map(([name, val]) => {
                    const perc = Math.min((val / (rev || 1)) * 100, 100);
                    return `
                        <div class="perf-item" style="border:none; padding: 10px 0;">
                            <div class="perf-info">
                                <span>${name}</span>
                                <span>${formatCurrency(val)}</span>
                            </div>
                            <div class="perf-bar-bg">
                                <div class="perf-bar-fill" style="width: ${perc}%"></div>
                            </div>
                            <div class="perf-footer">${perc.toFixed(1)}% do faturamento total</div>
                        </div>
                    `;
                }).join('');
            }
        }
    };

    // --- Report Sections ---
    const updateReportSections = (totalRev, totalCost, balance, filteredLogs, procStats) => {
        // Summary Cards
        const totalFixed = fixedExpenses.reduce((sum, item) => sum + item.value, 0);
        const realBalance = totalRev - totalCost;

        const revEl = document.getElementById('report-total-revenue');
        const costEl = document.getElementById('report-total-costs');
        const netEl = document.getElementById('report-net-result');
        const entriesEl = document.getElementById('report-total-entries');

        if (revEl) revEl.textContent = formatCurrency(totalRev);
        if (costEl) costEl.textContent = formatCurrency(totalCost);
        if (netEl) {
            netEl.textContent = formatCurrency(realBalance);
            netEl.style.color = realBalance >= 0 ? '#00c853' : 'var(--danger)';
        }
        if (entriesEl) entriesEl.textContent = filteredLogs.length;

        // Top Procedures Ranking
        const rankingList = document.getElementById('report-ranking-list');
        if (rankingList) {
            const sorted = Object.entries(procStats).sort((a, b) => b[1] - a[1]);
            const maxVal = sorted.length > 0 ? sorted[0][1] : 1;

            if (sorted.length === 0) {
                rankingList.innerHTML = '<p class="text-muted" style="text-align:center; padding:20px;">Nenhum procedimento registrado.</p>';
            } else {
                rankingList.innerHTML = sorted.slice(0, 8).map(([name, val], i) => {
                    const perc = (val / maxVal) * 100;
                    const count = filteredLogs.filter(l => l.type === 'sale' && l.name === name).length;
                    return `
                        <div class="ranking-item">
                            <span class="ranking-number">${i + 1}</span>
                            <div class="ranking-info">
                                <span class="ranking-name">${name}</span>
                                <div class="ranking-bar-bg">
                                    <div class="ranking-bar-fill" style="width: ${perc}%"></div>
                                </div>
                            </div>
                            <div style="text-align:right">
                                <span class="ranking-value">${formatCurrency(val)}</span>
                                <div class="ranking-count">${count} venda${count > 1 ? 's' : ''}</div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        // Payment Methods Breakdown
        const paymentList = document.getElementById('report-payment-methods');
        if (paymentList) {
            const paymentStats = {};
            filteredLogs.filter(l => l.type === 'sale').forEach(l => {
                const method = l.payment || 'Não informado';
                if (!paymentStats[method]) paymentStats[method] = { total: 0, count: 0 };
                paymentStats[method].total += l.value;
                paymentStats[method].count++;
            });

            const sortedPayments = Object.entries(paymentStats).sort((a, b) => b[1].total - a[1].total);
            const maxPayment = sortedPayments.length > 0 ? sortedPayments[0][1].total : 1;

            if (sortedPayments.length === 0) {
                paymentList.innerHTML = '<p class="text-muted" style="text-align:center; padding:20px;">Nenhum dado dispon\u00edvel.</p>';
            } else {
                const methodIcons = {
                    'Dinheiro': 'payments', 'Pix': 'qr_code', 'Cart\u00e3o de Cr\u00e9dito': 'credit_card',
                    'Cart\u00e3o de D\u00e9bito': 'credit_card', 'Transfer\u00eancia': 'swap_horiz', 'Boleto': 'receipt'
                };
                paymentList.innerHTML = sortedPayments.map(([method, data], i) => {
                    const perc = (data.total / maxPayment) * 100;
                    const icon = methodIcons[method] || 'account_balance_wallet';
                    return `
                        <div class="ranking-item">
                            <span class="ranking-number" style="background: rgba(33,150,243,0.1); color: #2196f3;"><span class="material-symbols-outlined" style="font-size:0.9rem">${icon}</span></span>
                            <div class="ranking-info">
                                <span class="ranking-name">${method}</span>
                                <div class="ranking-bar-bg">
                                    <div class="ranking-bar-fill" style="width: ${perc}%; background: linear-gradient(90deg, #2196f3, #42a5f5)"></div>
                                </div>
                            </div>
                            <div style="text-align:right">
                                <span class="ranking-value">${formatCurrency(data.total)}</span>
                                <div class="ranking-count">${data.count} transa\u00e7\u00e3o${data.count > 1 ? 'es' : ''}</div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        // Unit Comparison
        const unitList = document.getElementById('report-units');
        if (unitList) {
            const unitStats = {};
            filteredLogs.filter(l => l.type === 'sale').forEach(l => {
                const unit = l.unit || 'Sem unidade';
                if (!unitStats[unit]) unitStats[unit] = { total: 0, count: 0 };
                unitStats[unit].total += l.value;
                unitStats[unit].count++;
            });

            const sortedUnits = Object.entries(unitStats).sort((a, b) => b[1].total - a[1].total);
            const maxUnit = sortedUnits.length > 0 ? sortedUnits[0][1].total : 1;

            if (sortedUnits.length === 0) {
                unitList.innerHTML = '<p class="text-muted" style="text-align:center; padding:20px;">Nenhum dado dispon\u00edvel.</p>';
            } else {
                unitList.innerHTML = sortedUnits.map(([unit, data], i) => {
                    const perc = (data.total / maxUnit) * 100;
                    return `
                        <div class="ranking-item">
                            <span class="ranking-number" style="background: rgba(156,39,176,0.1); color: #9c27b0;"><span class="material-symbols-outlined" style="font-size:0.9rem">location_on</span></span>
                            <div class="ranking-info">
                                <span class="ranking-name">${unit}</span>
                                <div class="ranking-bar-bg">
                                    <div class="ranking-bar-fill" style="width: ${perc}%; background: linear-gradient(90deg, #9c27b0, #ce93d8)"></div>
                                </div>
                            </div>
                            <div style="text-align:right">
                                <span class="ranking-value">${formatCurrency(data.total)}</span>
                                <div class="ranking-count">${data.count} venda${data.count > 1 ? 's' : ''}</div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
    };

    // --- Charts Logic ---
    const updateCharts = (rev, cost, stats) => {
        if (typeof Chart === 'undefined') return;

        const ctxBar = document.getElementById('mainCompareChart');
        if (ctxBar) {
            if (revCostChart) revCostChart.destroy();
            revCostChart = new Chart(ctxBar, {
                type: 'bar',
                data: {
                    labels: ['Este Mês'],
                    datasets: [
                        { label: 'Faturamento', data: [rev], backgroundColor: '#00c853', borderRadius: 8 },
                        { label: 'Custos', data: [cost], backgroundColor: '#ff1744', borderRadius: 8 }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true, ticks: { callback: v => formatCurrency(v) } } },
                    plugins: { legend: { position: 'bottom' } }
                }
            });
        }

        const ctxEvol = document.getElementById('evolutionChart');
        if (ctxEvol) {
            const grouped = aggregateDataByRange(logs, chartRange);
            if (evolutionChart) evolutionChart.destroy();

            const container = document.getElementById('evolution-chart-container');
            if (container) {
                const minWidth = grouped.labels.length * 60;
                container.querySelector('canvas').style.minWidth = Math.max(minWidth, 600) + 'px';
            }

            evolutionChart = new Chart(ctxEvol, {
                type: 'line',
                data: {
                    labels: grouped.labels,
                    datasets: [
                        {
                            label: 'Faturamento',
                            data: grouped.revs,
                            borderColor: '#00c853',
                            backgroundColor: 'rgba(0, 200, 83, 0.1)',
                            fill: true,
                            tension: 0.4
                        },
                        {
                            label: 'Custos',
                            data: grouped.costs,
                            borderColor: '#ff1744',
                            backgroundColor: 'rgba(255, 23, 68, 0.1)',
                            fill: true,
                            tension: 0.4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true, ticks: { callback: v => formatCurrency(v) } } },
                    plugins: { legend: { position: 'top' } }
                }
            });
        }

        const ctxCat = document.getElementById('categoryChart');
        if (ctxCat) {
            const catStats = {};
            logs.forEach(l => {
                const cat = l.category || (l.type === 'sale' ? 'Vendas' : 'Outros');
                catStats[cat] = (catStats[cat] || 0) + l.value;
            });

            if (categoryChart) categoryChart.destroy();
            categoryChart = new Chart(ctxCat, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(catStats),
                    datasets: [{
                        data: Object.values(catStats),
                        backgroundColor: [
                            '#e6007e', '#ff4db1', '#00c853', '#2196f3', '#ff9800', '#9c27b0', '#795548'
                        ],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'right' } },
                    cutout: '70%'
                }
            });
        }
    };

    const aggregateDataByRange = (items, range) => {
        const revsMap = {};
        const costsMap = {};
        const labels = [];

        const sorted = [...items].sort((a, b) => new Date(a.date) - new Date(b.date));

        sorted.forEach(item => {
            if (!item.date) return;
            const d = new Date(item.date);
            if (isNaN(d.getTime())) return;
            let label = '';

            if (range === 'daily') {
                label = `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
            } else if (range === 'weekly') {
                const firstDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
                const weekNum = Math.ceil((d.getUTCDate() + firstDay.getUTCDay()) / 7);
                const month = d.getUTCMonth();
                const monthName = monthsNames[month] || 'N/A';
                label = `Sem. ${weekNum} (${monthName.substring(0, 3)})`;
            } else if (range === 'yearly') {
                label = d.getUTCFullYear().toString();
            } else {
                const month = d.getUTCMonth();
                const monthName = monthsNames[month] || 'N/A';
                label = monthName.substring(0, 3) + '/' + d.getUTCFullYear().toString().substring(2);
            }

            if (!labels.includes(label)) labels.push(label);
            if (item.type === 'sale') revsMap[label] = (revsMap[label] || 0) + item.value;
            else costsMap[label] = (costsMap[label] || 0) + item.value;
        });

        if (labels.length === 0) {
            const currentLabel = monthsNames[selectedMonth].substring(0, 3);
            labels.push(currentLabel);
        }

        return {
            labels,
            revs: labels.map(l => revsMap[l] || 0),
            costs: labels.map(l => costsMap[l] || 0)
        };
    };

    // --- Events ---
    if (addSaleBtn) {
        addSaleBtn.addEventListener('click', () => {
            const name = saleNameInp.value.trim();
            const value = parseCurrency(saleValueInp.value);
            const unit = saleUnitInp.value;
            const payment = salePaymentInp.value;
            const obs = saleObsInp.value.trim();

            let itemDate;
            if (saleDateInp && saleDateInp.value) {
                itemDate = new Date(saleDateInp.value + 'T12:00:00Z');
            } else {
                itemDate = new Date();
                if (selectedMonth !== now.getMonth() || selectedYear !== now.getFullYear()) {
                    itemDate = new Date(Date.UTC(selectedYear, selectedMonth, 1, 12));
                }
            }

            if (!name || value <= 0) {
                alert('Por favor, informe o procedimento e um valor válido.');
                return;
            }

            logs.push({
                type: 'sale',
                name,
                value,
                unit,
                payment,
                obs,
                date: itemDate.toISOString()
            });

            saleNameInp.value = '';
            saleValueInp.value = '';
            saleObsInp.value = '';
            saveLogs();
        });
    }

    if (addCostBtn) {
        addCostBtn.addEventListener('click', () => {
            const name = costNameInp.value.trim();
            const value = parseCurrency(costValueInp.value);
            const category = costCategoryInp.value;
            const unit = costUnitInp.value;
            const obs = costObsInp.value.trim();

            let itemDate;
            if (costDateInp && costDateInp.value) {
                itemDate = new Date(costDateInp.value + 'T12:00:00Z');
            } else {
                itemDate = new Date();
                if (selectedMonth !== now.getMonth() || selectedYear !== now.getFullYear()) {
                    itemDate = new Date(Date.UTC(selectedYear, selectedMonth, 1, 12));
                }
            }

            if (!name || value <= 0) {
                alert('Por favor, informe a descrição e um valor válido.');
                return;
            }

            logs.push({
                type: 'cost',
                name,
                value,
                category,
                unit,
                obs,
                date: itemDate.toISOString()
            });

            costNameInp.value = '';
            costValueInp.value = '';
            costObsInp.value = '';
            saveLogs();
        });
    }

    // Unit Selector
    const unitSelector = document.getElementById('unit-selector');
    if (unitSelector) {
        unitSelector.querySelectorAll('.unit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                unitSelector.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedUnit = btn.dataset.unit;
                calculate();
            });
        });
    }

    if (saveGoalBtn) {
        saveGoalBtn.addEventListener('click', () => {
            const val = parseCurrency(document.getElementById('goal-input').value);
            if (val <= 0) {
                alert('Por favor, defina uma meta válida.');
                return;
            }
            saveGoal(val);
            alert('Meta de faturamento salva com sucesso!');
        });
    }

    if (addFixedCostBtn) {
        addFixedCostBtn.addEventListener('click', () => {
            const nameEl = document.getElementById('fixed-cost-name');
            const valueEl = document.getElementById('fixed-cost-value');
            const categoryEl = document.getElementById('fixed-cost-category');

            const name = nameEl.value.trim();
            const value = parseCurrency(valueEl.value);
            const category = categoryEl.value;

            if (!name || value <= 0) {
                alert('Por favor, informe o nome e um valor válido.');
                return;
            }

            fixedExpenses.push({
                id: Date.now(),
                name,
                value,
                category
            });

            nameEl.value = '';
            valueEl.value = '';
            saveFixedExpenses();
        });
    }

    function renderFixedExpensesList() {
        const list = document.getElementById('fixed-costs-list');
        if (!list) return;
        list.innerHTML = fixedExpenses.map(item => `
            <li class="history-item cost">
                <div class="item-main">
                    <span class="item-title">${item.name}</span>
                    <div class="item-meta">
                        <span class="badge-category">${item.category}</span>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:15px;">
                    <strong class="item-value">${formatCurrency(item.value)}</strong>
                    <button class="btn-remove" onclick="removeFixedExpense(${item.id})">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </div>
            </li>
        `).join('');
    }

    window.removeFixedExpense = (id) => {
        fixedExpenses = fixedExpenses.filter(i => i.id !== id);
        saveFixedExpenses();
    };

    const rangeSelector = document.getElementById('chart-range-selector');
    if (rangeSelector) {
        rangeSelector.querySelectorAll('.range-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                rangeSelector.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                chartRange = btn.dataset.range;
                calculate();
            });
        });
    }

    // =========================================
    // BILLS MANAGEMENT & PAYMENT REMINDER POPUP
    // =========================================

    const saveBills = () => {
        localStorage.setItem(STORAGE_KEY_BILLS, JSON.stringify(bills));
        renderBillsList();
    };

    // --- Bill Type Toggle ---
    const billTypeRadios = document.querySelectorAll('input[name="bill-type"]');
    const billDueDayGroup = document.getElementById('bill-due-day-group');
    const billDueDateGroup = document.getElementById('bill-due-date-group');

    billTypeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'fixo') {
                if (billDueDayGroup) billDueDayGroup.style.display = '';
                if (billDueDateGroup) billDueDateGroup.style.display = 'none';
            } else {
                if (billDueDayGroup) billDueDayGroup.style.display = 'none';
                if (billDueDateGroup) billDueDateGroup.style.display = '';
            }
        });
    });

    // --- Add Bill ---
    const addBillBtn = document.getElementById('add-bill-btn');
    if (addBillBtn) {
        addBillBtn.addEventListener('click', () => {
            const nameEl = document.getElementById('bill-name');
            const valueEl = document.getElementById('bill-value');
            const categoryEl = document.getElementById('bill-category');
            const dueDayEl = document.getElementById('bill-due-day');
            const dueDateEl = document.getElementById('bill-due-date');
            const typeEl = document.querySelector('input[name="bill-type"]:checked');

            const name = nameEl.value.trim();
            const value = parseCurrency(valueEl.value);
            const category = categoryEl.value;
            const billType = typeEl ? typeEl.value : 'fixo';

            if (!name || value <= 0) {
                alert('Por favor, informe o nome e o valor da conta.');
                return;
            }

            let dueDay = null;
            let dueDateManual = null;

            if (billType === 'fixo') {
                dueDay = parseInt(dueDayEl.value);
                if (!dueDay || dueDay < 1 || dueDay > 31) {
                    alert('Por favor, informe um dia de vencimento válido (1-31).');
                    return;
                }
            } else {
                if (!dueDateEl.value) {
                    alert('Por favor, informe a data de vencimento.');
                    return;
                }
                dueDateManual = dueDateEl.value; // YYYY-MM-DD
            }

            bills.push({
                id: Date.now(),
                name,
                value,
                dueDay,
                dueDateManual,
                type: billType,
                category,
                payments: {}
            });

            nameEl.value = '';
            valueEl.value = '';
            if (dueDayEl) dueDayEl.value = '';
            if (dueDateEl) dueDateEl.value = '';
            saveBills();
            checkDueBills();
        });
    }

    // --- Render Bills List ---
    function renderBillsList() {
        const list = document.getElementById('bills-list');
        if (!list) return;

        if (bills.length === 0) {
            list.innerHTML = '<p style="text-align:center; padding:20px; color:var(--text-muted)">Nenhuma conta cadastrada.</p>';
            return;
        }

        list.innerHTML = bills.map(bill => {
            const dueLabel = bill.type === 'fixo'
                ? `Todo dia ${bill.dueDay}`
                : `Vence em ${new Date(bill.dueDateManual + 'T12:00:00').toLocaleDateString('pt-BR')}`;
            const typeBadge = bill.type === 'fixo'
                ? '<span class="popup-bill-badge type-fixo">Fixo</span>'
                : '<span class="popup-bill-badge type-variavel">Variável</span>';

            return `
                <li class="history-item cost">
                    <div class="item-main">
                        <span class="item-title">${bill.name} ${typeBadge}</span>
                        <div class="item-meta">
                            <span class="item-date">${dueLabel}</span>
                            <span class="badge-category">${bill.category}</span>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:15px;">
                        <strong class="item-value">${formatCurrency(bill.value)}</strong>
                        <button class="btn-remove" onclick="removeBill(${bill.id})">
                            <span class="material-symbols-outlined">delete</span>
                        </button>
                    </div>
                </li>
            `;
        }).join('');
    }

    window.removeBill = (id) => {
        bills = bills.filter(b => b.id !== id);
        saveBills();
        checkDueBills();
    };

    // --- Due Date Calculation ---
    function getBillDueDate(bill) {
        const today = new Date();
        if (bill.type === 'fixo') {
            // Due date = dueDay of current month
            const year = today.getFullYear();
            const month = today.getMonth();
            // Clamp dueDay to the last day of the month
            const lastDay = new Date(year, month + 1, 0).getDate();
            const day = Math.min(bill.dueDay, lastDay);
            return new Date(year, month, day);
        } else {
            // Variable: use the manual date
            return new Date(bill.dueDateManual + 'T12:00:00');
        }
    }

    function getPaymentKey(bill) {
        const dueDate = getBillDueDate(bill);
        if (bill.type === 'fixo') {
            return `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}`;
        } else {
            // For variable: use the exact date as key
            return bill.dueDateManual;
        }
    }

    function isBillPaid(bill) {
        const key = getPaymentKey(bill);
        return bill.payments && bill.payments[key] === true;
    }

    // --- Check Due Bills & Show Popup ---
    function checkDueBills() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const dueBills = [];

        bills.forEach(bill => {
            if (isBillPaid(bill)) return; // Already paid this cycle

            const dueDate = getBillDueDate(bill);
            dueDate.setHours(0, 0, 0, 0);

            const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

            // Show if: due within 5 days OR overdue
            if (diffDays <= 5) {
                dueBills.push({
                    ...bill,
                    dueDate,
                    diffDays,
                    isOverdue: diffDays < 0
                });
            }
        });

        // Sort: overdue first (most overdue at top), then by closest due date
        dueBills.sort((a, b) => a.diffDays - b.diffDays);

        renderPopup(dueBills);
    }

    // --- Render Popup ---
    function renderPopup(dueBills) {
        const popup = document.getElementById('payment-popup');
        const popupBody = document.getElementById('popup-body');
        const popupCount = document.getElementById('popup-count');
        const minBtn = document.getElementById('popup-minimized-btn');
        const minBadge = document.getElementById('popup-mini-badge');

        if (!popup || !popupBody) return;

        popupCount.textContent = dueBills.length;
        if (minBadge) minBadge.textContent = dueBills.length;

        if (dueBills.length === 0) {
            popupBody.innerHTML = `
                <div class="popup-empty">
                    <span class="material-symbols-outlined">check_circle</span>
                    Tudo em dia! Nenhum pagamento pendente.
                </div>
            `;
            // Show popup briefly, then auto-minimize after 3 seconds
            popup.classList.remove('hidden');
            if (minBtn) minBtn.style.display = 'none';
            setTimeout(() => {
                popup.classList.add('hidden');
                // Don't show minimized button if nothing is pending
            }, 3000);
            return;
        }

        // Show popup
        popup.classList.remove('hidden');
        if (minBtn) minBtn.style.display = 'none';

        popupBody.innerHTML = dueBills.map(bill => {
            const dueStr = bill.dueDate.toLocaleDateString('pt-BR');
            let statusBadge = '';
            let diffText = '';

            if (bill.isOverdue) {
                const daysLate = Math.abs(bill.diffDays);
                statusBadge = '<span class="popup-bill-badge overdue">Vencida</span>';
                diffText = `Venceu há ${daysLate} dia${daysLate > 1 ? 's' : ''}`;
            } else if (bill.diffDays === 0) {
                statusBadge = '<span class="popup-bill-badge overdue">Vence Hoje</span>';
                diffText = 'Vence hoje!';
            } else {
                statusBadge = '<span class="popup-bill-badge upcoming">Próximo</span>';
                diffText = `Vence em ${bill.diffDays} dia${bill.diffDays > 1 ? 's' : ''}`;
            }

            const typeBadge = bill.type === 'fixo'
                ? '<span class="popup-bill-badge type-fixo">Fixo</span>'
                : '<span class="popup-bill-badge type-variavel">Variável</span>';

            return `
                <div class="popup-bill-item ${bill.isOverdue || bill.diffDays === 0 ? 'overdue' : ''}">
                    <div class="popup-bill-top">
                        <span class="popup-bill-name">${bill.name}</span>
                        <span class="popup-bill-value">${formatCurrency(bill.value)}</span>
                    </div>
                    <div class="popup-bill-meta">
                        <span class="popup-bill-due">
                            <span class="material-symbols-outlined">calendar_month</span>
                            ${dueStr} • ${diffText}
                        </span>
                        ${statusBadge}
                        ${typeBadge}
                    </div>
                    <div class="popup-bill-actions">
                        <button class="btn-mark-paid" onclick="markBillPaid(${bill.id})">
                            <span class="material-symbols-outlined">check_circle</span> Pago
                        </button>
                        <button class="btn-mark-unpaid" onclick="markBillUnpaid(${bill.id})">
                            <span class="material-symbols-outlined">cancel</span> Não Pago
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // --- Popup Actions ---
    window.markBillPaid = (id) => {
        const bill = bills.find(b => b.id === id);
        if (!bill) return;
        const key = getPaymentKey(bill);
        if (!bill.payments) bill.payments = {};
        bill.payments[key] = true;
        saveBills();
        checkDueBills();
    };

    window.markBillUnpaid = (id) => {
        const bill = bills.find(b => b.id === id);
        if (!bill) return;
        const key = getPaymentKey(bill);
        if (bill.payments && bill.payments[key]) {
            delete bill.payments[key];
        }
        saveBills();
        checkDueBills();
    };

    // --- Popup Open/Close ---
    const popupCloseBtn = document.getElementById('popup-close-btn');
    const popupMinBtn = document.getElementById('popup-minimized-btn');
    const paymentPopup = document.getElementById('payment-popup');

    if (popupCloseBtn && paymentPopup) {
        popupCloseBtn.addEventListener('click', () => {
            paymentPopup.classList.add('hidden');
            // Show minimized bell if there are pending bills
            const count = parseInt(document.getElementById('popup-count').textContent || '0');
            if (count > 0 && popupMinBtn) {
                popupMinBtn.style.display = 'flex';
            }
        });
    }

    if (popupMinBtn && paymentPopup) {
        popupMinBtn.addEventListener('click', () => {
            popupMinBtn.style.display = 'none';
            paymentPopup.classList.remove('hidden');
        });
    }

    // --- Init ---
    try {
        initTabs();
        loadLogs();
    } catch (err) {
        console.error('CRITICAL: Dashboard initialization failed!', err);
    }
});

// --- Profile Menu Logic (Robust) ---
function initProfileMenu() {
    const profileTrigger = document.getElementById('profile-trigger');
    const userProfileWrapper = document.getElementById('user-profile');
    const logoutBtn = document.getElementById('logout-btn');

    if (!profileTrigger || !userProfileWrapper) return;

    profileTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        userProfileWrapper.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (!userProfileWrapper.contains(e.target)) {
            userProfileWrapper.classList.remove('active');
        }
    });

    // Handle profile menu items
    const dropdownItems = userProfileWrapper.querySelectorAll('.dropdown-item');
    dropdownItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const text = item.textContent.trim();
            if (text.includes('Meu Perfil')) {
                window.location.href = 'profile.html';
            } else if (text.includes('Alterar Senha')) {
                window.location.href = 'profile.html#change-password';
            }
        });
    });

    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            localStorage.removeItem('virtuosa_user');
            window.location.href = 'login.html';
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProfileMenu);
} else {
    initProfileMenu();
}

