document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration ---
    const STORAGE_KEY = 'virtuosa_calculator_v3';

    // --- State ---
    let state = {
        procedures: [
            { id: Date.now(), name: 'Depilação a Laser', totalSessions: 10, doneSessions: 3, subtotal: 1200, discount: 200, isCortesia: false }
        ],
        scenario: 'sem-multa',
        clientName: ''
    };

    // --- UI Elements ---
    const clientNameInput = document.getElementById('client-name');
    const proceduresBody = document.getElementById('procedures-body');
    const addBtn = document.querySelector('.btn-primary');
    const scenarioToggle = document.getElementById('scenario-toggle');
    const detalhamentoContainer = document.getElementById('detalhamento-container');
    const itemCountBadge = document.getElementById('item-count-badge');
    const pdfBtn = document.getElementById('pdf-btn');
    const whatsappBtn = document.getElementById('whatsapp-btn');
    const clearAllBtn = document.getElementById('clear-all-btn');
    const viewSummaryBtn = document.getElementById('view-summary-btn');
    const mainResultCard = document.getElementById('main-result-card');

    // Result Elements
    const resTitle = document.getElementById('result-title');
    const resTotalPago = document.getElementById('res-total-pago');
    const resTotalConsumido = document.getElementById('res-total-consumido');
    const resMultaPercent = document.getElementById('res-multa-percent');
    const resMultaValor = document.getElementById('res-multa-valor');
    const resTotalDevolver = document.getElementById('res-total-devolver');
    const footerLabel = document.getElementById('footer-scenario-label');
    const footerAmount = document.getElementById('footer-total-amount');

    // Progress Bar Elements


    // --- Persistence ---
    const saveState = () => {
        try {
            if (clientNameInput) state.clientName = clientNameInput.value;
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.error("Save error:", e);
        }
    };

    const loadState = () => {
        try {
            const saved = window.localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.procedures) state.procedures = parsed.procedures;
                if (parsed.scenario) state.scenario = parsed.scenario;
                if (parsed.clientName !== undefined) {
                    state.clientName = parsed.clientName;
                    if (clientNameInput) clientNameInput.value = state.clientName;
                }
            }
        } catch (e) {
            console.error("Load error:", e);
        }
    };

    // --- Helpers ---
    const formatCurrency = (val) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    // --- Core Logic ---
    const calculate = () => {
        let totalPagoGlobal = 0;
        let totalConsumidoGlobal = 0;
        let sumSubtotalForFine = 0;
        let totalDevolverBruto = 0;

        const results = state.procedures.map(p => {
            const done = Math.min(p.doneSessions, p.totalSessions);
            const total = p.totalSessions || 1;

            if (p.isCortesia) {
                const valorSessao = p.subtotal / total;
                const consumido = valorSessao * done;
                return { ...p, pago: 0, consumido, devolucao: 0, valorSessao };
            }

            const totalPago = Math.max(0, p.subtotal - p.discount);
            const baseValorSessao = state.scenario === 'sem-multa' ? totalPago : p.subtotal;
            const valorSessao = baseValorSessao / total;

            const consumido = valorSessao * done;
            const devolucao = Math.max(0, totalPago - consumido);

            totalPagoGlobal += totalPago;
            totalConsumidoGlobal += consumido;
            sumSubtotalForFine += p.subtotal;
            totalDevolverBruto += devolucao;

            return { ...p, pago: totalPago, consumido, devolucao, valorSessao };
        });

        const multaTotal = state.scenario === 'com-multa' ? (0.10 * sumSubtotalForFine) : 0;
        const totalDevolverFinal = Math.max(0, totalDevolverBruto - multaTotal);

        updateUI(results, totalPagoGlobal, totalConsumidoGlobal, multaTotal, totalDevolverFinal, sumSubtotalForFine);
        saveState();
    };

    const updateUI = (results, totalPago, totalConsumido, multa, totalDevolver, totalSubtotal) => {
        if (resTitle) resTitle.innerText = `Resumo: Cenário ${state.scenario === 'sem-multa' ? 'Sem Multa' : 'Com Multa'}`;

        const displayTotalPago = state.scenario === 'com-multa' ? totalSubtotal : totalPago;
        if (resTotalPago) resTotalPago.innerText = formatCurrency(displayTotalPago);
        if (resTotalConsumido) resTotalConsumido.innerText = formatCurrency(totalConsumido);
        if (resMultaPercent) resMultaPercent.innerText = state.scenario === 'sem-multa' ? '0%' : '10%';
        if (resMultaValor) resMultaValor.innerText = formatCurrency(multa);
        if (resTotalDevolver) resTotalDevolver.innerText = formatCurrency(totalDevolver);



        if (footerLabel) footerLabel.innerText = `A DEVOLVER (${state.scenario.toUpperCase().replace('-', ' ')}):`;
        if (footerAmount) footerAmount.innerText = formatCurrency(totalDevolver);
        if (itemCountBadge) itemCountBadge.innerText = `${state.procedures.length} ${state.procedures.length === 1 ? 'item adicionado' : 'itens adicionados'}`;

        renderDetails(results, multa);
    };

    const renderTable = () => {
        if (!proceduresBody) return;
        proceduresBody.innerHTML = '';
        state.procedures.forEach((p) => {
            const tr = document.createElement('tr');
            if (p.isCortesia) tr.classList.add('row-disabled');

            tr.innerHTML = `
                <td><input type="text" class="input-text" data-field="name" value="${p.name || ''}" placeholder="Nome..."></td>
                <td>
                    <div class="session-container">
                        <input type="number" class="input-session" data-field="doneSessions" value="${p.doneSessions}" min="0">
                        <span>/</span>
                        <input type="number" class="input-session" data-field="totalSessions" value="${p.totalSessions}" min="1">
                    </div>
                </td>
                <td><input type="text" class="input-currency" data-field="subtotal" value="${formatCurrency(p.subtotal).replace('R$\u00A0', '')}"></td>
                <td><input type="text" class="input-currency" data-field="discount" value="${formatCurrency(p.discount).replace('R$\u00A0', '')}"></td>
                <td style="text-align: center;"><input type="checkbox" class="checkbox-cortesia" data-field="isCortesia" ${p.isCortesia ? 'checked' : ''}></td>
                <td style="text-align: center;"><button class="btn-remove"><span class="material-symbols-outlined">delete</span></button></td>
            `;

            tr.querySelectorAll('input').forEach(input => {
                input.addEventListener('change', (e) => {
                    const field = e.target.dataset.field;
                    let val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;

                    if (field === 'subtotal' || field === 'discount') {
                        let raw = val.replace(/[^\d]/g, '');
                        val = parseFloat(raw) / 100 || 0;
                        e.target.value = formatCurrency(val).replace('R$\u00A0', '');
                    } else if (field === 'totalSessions' || field === 'doneSessions') {
                        val = parseInt(e.target.value) || 0;
                        if (field === 'doneSessions' && val > p.totalSessions) {
                            val = p.totalSessions;
                            e.target.value = val;
                        }
                    }

                    p[field] = val;
                    if (field === 'isCortesia') {
                        if (val) { p.subtotal = 0; p.discount = 0; }
                        renderTable();
                    }
                    calculate();
                });
            });

            tr.querySelector('.btn-remove').addEventListener('click', () => {
                state.procedures = state.procedures.filter(item => item.id !== p.id);
                renderTable(); calculate();
            });

            proceduresBody.appendChild(tr);
        });
    };

    const renderDetails = (results, multaTotal) => {
        if (!detalhamentoContainer) return;
        detalhamentoContainer.innerHTML = '';

        if (state.scenario === 'com-multa' && multaTotal > 0) {
            const multaBox = document.createElement('div');
            multaBox.className = 'multa-summary';
            multaBox.innerHTML = `<div style="display:flex; align-items:center; gap:8px;"><span class="material-symbols-outlined">warning</span><span>Multa 10% aplicada no total (global): <strong>${formatCurrency(multaTotal)}</strong></span></div>`;
            detalhamentoContainer.appendChild(multaBox);
        }

        results.forEach(p => {
            const detail = document.createElement('div');
            detail.className = 'detail-item';
            const pago = p.isCortesia ? 0 : Math.max(0, p.subtotal - p.discount);
            const base = state.scenario === 'sem-multa' ? pago : p.subtotal;
            const vSessao = base / (p.totalSessions || 1);
            const cons = vSessao * Math.min(p.doneSessions, p.totalSessions);
            const saldo = p.isCortesia ? 0 : Math.max(0, pago - cons);

            detail.innerHTML = `
                <div class="detail-header">
                    <div><h3>${p.name || 'P.'} ${p.isCortesia ? '🌸' : ''}</h3><p>${p.doneSessions} de ${p.totalSessions} sessões (${formatCurrency(vSessao)}/s)</p></div>
                    <span class="badge-outline pink">${p.isCortesia ? 'GRÁTIS' : `PAGO: ${formatCurrency(pago)}`}</span>
                </div>
                <div class="detail-footer">
                    <div class="row"><span>Valor Consumido</span><span>${formatCurrency(cons)}</span></div>
                    <div class="row"><span>Saldo Disponível</span><span class="text-green">${formatCurrency(saldo)}</span></div>
                    <div class="divider" style="margin: 8px 0; border-style: dashed;"></div>
                    <div class="row" style="font-weight: 700;"><span>Impacto na Devolução</span><span class="text-pink">${formatCurrency(p.isCortesia ? 0 : saldo)}</span></div>
                </div>
            `;
            detalhamentoContainer.appendChild(detail);
            const div = document.createElement('div'); div.className = 'divider'; detalhamentoContainer.appendChild(div);
        });
    };

    // --- Buttons ---
    if (addBtn) addBtn.addEventListener('click', () => {
        state.procedures.push({ id: Date.now(), name: '', totalSessions: 10, doneSessions: 0, subtotal: 0, discount: 0, isCortesia: false });
        renderTable(); calculate();
    });

    if (viewSummaryBtn) viewSummaryBtn.addEventListener('click', () => mainResultCard.scrollIntoView({ behavior: 'smooth' }));

    if (clearAllBtn) clearAllBtn.addEventListener('click', () => {
        const modal = document.getElementById('calc-clear-confirm-modal');
        if (modal) modal.style.display = 'flex';
    });

    // --- Profile menu logic moved to permissions.js ---

    // Custom clear modal buttons
    const calcClearConfirmBtn = document.getElementById('calc-clear-confirm-btn');
    const calcClearCancelBtn = document.getElementById('calc-clear-cancel-btn');
    const calcClearModal = document.getElementById('calc-clear-confirm-modal');

    if (calcClearConfirmBtn) {
        calcClearConfirmBtn.addEventListener('click', () => {
            state.procedures = []; state.clientName = '';
            if (clientNameInput) clientNameInput.value = '';
            window.localStorage.removeItem(STORAGE_KEY);
            renderTable(); calculate();
            if (calcClearModal) calcClearModal.style.display = 'none';
        });
    }
    if (calcClearCancelBtn) {
        calcClearCancelBtn.addEventListener('click', () => {
            if (calcClearModal) calcClearModal.style.display = 'none';
        });
    }
    if (calcClearModal) {
        calcClearModal.addEventListener('click', (e) => {
            if (e.target === calcClearModal) calcClearModal.style.display = 'none';
        });
    }

    if (whatsappBtn) whatsappBtn.addEventListener('click', () => {
        const msg = `*RESUMO DE CANCELAMENTO*\n\n🌸 *Cliente:* ${clientNameInput.value || 'Cliente'}\n✅ *Cenário:* ${state.scenario === 'sem-multa' ? 'Sem Multa' : 'Com Multa'}\n📊 *Total Pago:* ${resTotalPago.innerText}\n📉 *Total Consumido:* ${resTotalConsumido.innerText}\n⚠️ *Multa:* ${resMultaValor.innerText}\n\n✨ *TOTAL A DEVOLVER: ${footerAmount.innerText}*`;
        navigator.clipboard.writeText(msg).then(() => alert('Copiado!')).catch(() => alert('Copia Manual:\n\n' + msg));
    });

    if (clientNameInput) clientNameInput.addEventListener('input', saveState);

    if (scenarioToggle) scenarioToggle.querySelectorAll('.toggle-option').forEach(opt => {
        opt.addEventListener('click', () => {
            scenarioToggle.querySelector('.active').classList.remove('active');
            opt.classList.add('active');
            state.scenario = opt.dataset.value;
            calculate();
        });
    });

    if (pdfBtn) pdfBtn.addEventListener('click', () => {
        const loading = document.getElementById('loading-overlay');
        const printArea = document.getElementById('print-area');
        loading.classList.remove('loading-hidden');

        setTimeout(() => {
            const now = new Date().toLocaleString('pt-BR');
            let totalPagoG = 0; let totalConsG = 0; let sumSubG = 0; let totalDevG = 0;

            const itemsHtml = state.procedures.map(p => {
                const pago = p.isCortesia ? 0 : Math.max(0, p.subtotal - p.discount);
                const baseS = state.scenario === 'sem-multa' ? pago : p.subtotal;
                const vS = baseS / (p.totalSessions || 1);
                const cons = vS * Math.min(p.doneSessions, p.totalSessions);
                const dev = p.isCortesia ? 0 : Math.max(0, pago - cons);

                if (!p.isCortesia) { totalPagoG += pago; totalConsG += cons; sumSubG += p.subtotal; totalDevG += dev; }

                return `<tr><td>${p.name || 'P.'} ${p.isCortesia ? '(C)' : ''}</td><td>${p.p.doneSessions}/${p.totalSessions}</td><td>${formatCurrency(p.subtotal)}</td><td>${formatCurrency(p.discount)}</td><td>${formatCurrency(pago)}</td></tr>`;
            }).join('');

            const multaT = state.scenario === 'com-multa' ? (0.10 * sumSubG) : 0;
            const totalF = Math.max(0, totalDevG - multaT);

            const detailsHtml = state.procedures.map(p => {
                const pago = p.isCortesia ? 0 : Math.max(0, p.subtotal - p.discount);
                const baseS = state.scenario === 'sem-multa' ? pago : p.subtotal;
                const vS = baseS / (p.totalSessions || 1);
                const cons = vS * Math.min(p.doneSessions, p.totalSessions);
                const dev = p.isCortesia ? 0 : Math.max(0, pago - cons);

                return `<div class="pdf-item-detail"><div class="pdf-item-header"><span>${p.name || 'P.'} ${p.isCortesia ? '(C)' : ''}</span><span>${formatCurrency(cons)}</span></div><div class="row"><span>Pago:</span><span>${formatCurrency(pago)}</span></div><div class="row"><span>Saldo:</span><span>${formatCurrency(dev)}</span></div></div>`;
            }).join('');

            printArea.innerHTML = `
                <div class="pdf-template-header"><span class="pdf-logo-text">Virtuosa</span><div class="pdf-header-line"></div></div>
                <div class="pdf-watermark"><svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><path fill="#E91E63" d="M100,20 C120,20 140,40 140,70 C140,100 120,130 100,160 C80,130 60,100 60,70 C60,40 80,20 100,20 M100,40 C85,40 75,55 75,70 C75,95 90,115 100,135 C110,115 125,95 125,70 C125,55 115,40 100,40" /></svg></div>
                <div class="pdf-section">
                    <div style="margin-bottom: 20px;"><span style="color:var(--pink-main); font-weight:800; font-size:0.9rem; text-transform:uppercase;">Cliente:</span><div style="font-size:1.5rem; font-weight:700; color:var(--text-main); margin-top:5px; border-bottom:1px solid #fce4ec; padding-bottom:5px;">${clientNameInput.value || '_______________________'}</div></div>
                    <div class="pdf-title">Relatório de Cancelamento</div>
                    <div style="text-align:right; font-size:0.8rem; color:#666; margin-bottom:20px;">Gerado em: ${now}</div>
                    <div class="pdf-section-title">Resumo: Cenário ${state.scenario === 'sem-multa' ? 'Sem Multa' : 'Com Multa (10%)'}</div>
                    <div class="pdf-grid">
                        <div class="pdf-item"><div>Total Pago</div><div>${formatCurrency(state.scenario === 'com-multa' ? sumSubG : totalPagoG)}</div></div>
                        <div class="pdf-item"><div>Total Consumido</div><div style="color:var(--pink-main);">${formatCurrency(totalConsG)}</div></div>
                        <div class="pdf-item"><div>Multa</div><div>${formatCurrency(multaT)}</div></div>
                        <div class="pdf-item" style="background:#fdf2f7; border:1px solid #fce4ec;"><div>Total a Devolver</div><div style="color:var(--pink-main); font-weight:800;">${formatCurrency(totalF)}</div></div>
                    </div>
                </div>
                <div class="pdf-section"><div class="pdf-section-title">Detalhamento Financeiro</div>${detailsHtml}</div>
                <div class="pdf-signatures"><div class="signature-box">Assinatura da Cliente</div><div class="signature-box">Assinatura Unidade</div></div>
                <div class="pdf-footer-wave"></div>
            `;
            loading.classList.add('loading-hidden'); window.print();
        }, 800);
    });

    // --- Init ---
    loadState();
    if (scenarioToggle) {
        scenarioToggle.querySelectorAll('.toggle-option').forEach(opt => {
            if (opt.dataset.value === state.scenario) { scenarioToggle.querySelector('.active').classList.remove('active'); opt.classList.add('active'); }
        });
    }
    renderTable(); calculate();
});
