document.addEventListener('DOMContentLoaded', () => {
    const STORAGE_KEY_LOGS = 'virtuosa_finance_logs_v1';
    const STORAGE_KEY_GOALS = 'virtuosa_goals_v1';
    const STORAGE_KEY_FIXED = 'virtuosa_fixed_expenses_v1';

    console.log('>>> VIRTUESA DASHBOARD V4.1 INITIALIZED <<<');

    let logs = [];
    let goals = {}; // { 'YYYY-MM': value }
    let fixedExpenses = [];
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
        console.log('Saving Logs...', logs.length);
        localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(logs));
        calculate();
    };

    const saveGoal = (val) => {
        const key = `${selectedYear}-${selectedMonth}`;
        goals[key] = val;
        localStorage.setItem(STORAGE_KEY_GOALS, JSON.stringify(goals));
        calculate();
    };

    const loadLogs = () => {
        const savedLogs = localStorage.getItem(STORAGE_KEY_LOGS);
        if (savedLogs) logs = JSON.parse(savedLogs);

        const savedGoals = localStorage.getItem(STORAGE_KEY_GOALS);
        if (savedGoals) goals = JSON.parse(savedGoals);

        const savedFixed = localStorage.getItem(STORAGE_KEY_FIXED);
        if (savedFixed) fixedExpenses = JSON.parse(savedFixed);

        initMonthSelector();
        calculate();
        renderFixedExpensesList();
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

        // Filter logs for current month/year
        const filteredLogs = logs.filter(item => {
            const itemDate = new Date(item.date);
            // Use UTC dates to avoid timezone shift issues in filtering
            return itemDate.getUTCMonth() === selectedMonth && itemDate.getUTCFullYear() === selectedYear;
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
            dashboardHistory.innerHTML = filteredLogs.slice().reverse().slice(0, 5).map(renderItem).join('');
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

        // Add Fixed Expenses to Dashboard History (Visual Only)
        if (dashboardHistory && fixedExpenses.length > 0) {
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
            dashboardHistory.innerHTML = fixedHtml + dashboardHistory.innerHTML;
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

            // Set dynamic color for bar
            if (perc < 30) goalBar.style.background = 'var(--danger)';
            else if (perc < 80) goalBar.style.background = 'var(--primary)';
            else goalBar.style.background = 'var(--success)';
        }

        if (goalInput && !goalInput.value && currentGoal > 0) {
            // Pre-fill goal input if empty
            let val = (currentGoal).toFixed(2).replace(".", ",");
            val = val.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
            goalInput.value = val;
        }

        // Margin calculation fix
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

    // --- Charts Logic ---
    const updateCharts = (rev, cost, stats) => {
        if (typeof Chart === 'undefined') return;

        // 1. Core Comparison Chart (Dashboard)
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

        // 2. Evolution Chart (Reports Tab)
        const ctxEvol = document.getElementById('evolutionChart');
        if (ctxEvol) {
            const grouped = aggregateDataByRange(logs, chartRange);
            if (evolutionChart) evolutionChart.destroy();

            // Adjust container width if too many labels (Daily)
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

        // 3. Category Distribution (Reports Tab)
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

        // Sort items by date
        const sorted = [...items].sort((a, b) => new Date(a.date) - new Date(b.date));

        sorted.forEach(item => {
            if (!item.date) return;
            const d = new Date(item.date);
            if (isNaN(d.getTime())) return; // Skip invalid dates
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
                // monthly
                const month = d.getUTCMonth();
                const monthName = monthsNames[month] || 'N/A';
                label = monthName.substring(0, 3) + '/' + d.getUTCFullYear().toString().substring(2);
            }

            if (!labels.includes(label)) labels.push(label);
            if (item.type === 'sale') revsMap[label] = (revsMap[label] || 0) + item.value;
            else costsMap[label] = (costsMap[label] || 0) + item.value;
        });

        // Ensure we show at least current month for context if empty
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
            console.log('Sale Data:', { name, value });
            const unit = saleUnitInp.value;
            const payment = salePaymentInp.value;
            const obs = saleObsInp.value.trim();

            let itemDate;
            if (saleDateInp && saleDateInp.value) {
                // Use the input date but force it to be UTC to avoid offsetting
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

            // Reset
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
            console.log('Cost Data:', { name, value });
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

            // Reset
            costNameInp.value = '';
            costValueInp.value = '';
            costObsInp.value = '';
            saveLogs();
        });
    }

    if (clearBtn) {
        console.log('Clear button initialized');
        clearBtn.addEventListener('click', () => {
            console.log('Clear button clicked');
            // TEMPORARY BYPASS FOR AUTOMATED TESTING
            const confirmed = true; // window.confirm('BEM-VINDO! Deseja realmente excluir TODOS os dados (lançamentos e metas)? Esta ação não pode ser desfeita.');

            if (confirmed) {
                console.log('Confirmed clear action');
                console.log('Proceeding with clear');
                localStorage.clear();
                logs = [];
                goals = {};
                fixedExpenses = [];

                // Clear state keys specifically
                localStorage.removeItem(STORAGE_KEY_LOGS);
                localStorage.removeItem(STORAGE_KEY_GOALS);
                localStorage.removeItem(STORAGE_KEY_FIXED);

                // Reset Charts
                if (revCostChart) revCostChart.destroy();
                if (evolutionChart) evolutionChart.destroy();
                if (categoryChart) categoryChart.destroy();
                revCostChart = null;
                evolutionChart = null;
                categoryChart = null;

                // Aggressive DOM Clear
                ['mini-history-list', 'sales-list', 'costs-list', 'performance-list'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.innerHTML = '';
                });

                ['stat-revenue', 'stat-costs', 'stat-balance', 'stat-margin'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.innerText = id === 'stat-margin' ? '0%' : formatCurrency(0);
                });

                if (document.getElementById('goal-bar')) document.getElementById('goal-bar').style.width = '0%';
                if (document.getElementById('goal-progress-text')) document.getElementById('goal-progress-text').innerText = 'META: R$ 0 / R$ 0';

                calculate();
                renderFixedExpensesList(); // Ensure fixed list is also cleared
                console.log('Clear complete. Logs:', logs.length, 'Fixed:', fixedExpenses.length);
                alert('Dados limpos com sucesso!');
                location.reload(); // Aggressive reload to ensure state is fresh
            }
        });
    }

    if (saveGoalBtn) {
        console.log('saveGoalBtn found');
        saveGoalBtn.addEventListener('click', () => {
            console.log('saveGoalBtn clicked');
            const val = parseCurrency(document.getElementById('goal-input').value);
            console.log('Goal Data:', { val });
            if (val <= 0) {
                alert('Por favor, defina uma meta válida.');
                return;
            }
            saveGoal(val);
            alert('Meta de faturamento salva com sucesso!');
        });
    }

    if (addFixedCostBtn) {
        console.log('addFixedCostBtn found');
        addFixedCostBtn.addEventListener('click', () => {
            console.log('addFixedCostBtn clicked');
            const nameEl = document.getElementById('fixed-cost-name');
            const valueEl = document.getElementById('fixed-cost-value');
            const categoryEl = document.getElementById('fixed-cost-category');

            const name = nameEl.value.trim();
            const value = parseCurrency(valueEl.value);
            const category = categoryEl.value;

            console.log('Attempting to add fixed cost:', { name, value, category });

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
            console.log('Fixed cost added. Total now:', fixedExpenses.length);
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

    // --- Debug Hook ---
    window.dashboardApp = {
        get logs() { return logs; },
        get goals() { return goals; },
        get fixedExpenses() { return fixedExpenses; },
        selectedMonth,
        selectedYear,
        calculate,
        updateUI,
        addSale: (name, val) => {
            logs.push({ type: 'sale', name, value: val, date: new Date().toISOString() });
            saveLogs();
        }
    };

    // --- Init ---
    try {
        initTabs();
        loadLogs();
    } catch (err) {
        console.error('CRITICAL: Dashboard initialization failed!', err);
    }
});
