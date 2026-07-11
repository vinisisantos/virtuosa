'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from '@/components/toast';
import { useGlobalUnit } from '@/contexts/UnitContext';
import { formatCurrency } from '@/lib/currency';

/* ─── Types ─── */
export interface Procedure {
  id: number; name: string; totalSessions: number; doneSessions: number;
  subtotal: number; discount: number; isCortesia: boolean;
}

export interface CalcResult extends Procedure {
  pago: number; consumido: number; devolucao: number; valorSessao: number;
}

/* ─── Helpers ─── */
const STORAGE_KEY = 'virtuosa_calculator_v3';
export const DOCUMENT_BACKGROUND_URL = '/Modelo-Pagina-PDF.png';
export const fmt = formatCurrency;
export const parseCurrency = (raw: string) => { const d = raw.replace(/[^\d]/g, ''); return parseFloat(d) / 100 || 0; };

export const cardStyle: React.CSSProperties = {
  background: 'var(--card-bg)', backdropFilter: 'blur(20px)', borderRadius: 20,
  border: '1px solid var(--border)', boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
};

/* ─── Hook ─── */
export function useCancelamento() {
  const [procedures, setProcedures] = useState<Procedure[]>([
    { id: Date.now(), name: 'Depilação a Laser', totalSessions: 10, doneSessions: 3, subtotal: 1200, discount: 200, isCortesia: false },
  ]);
  const [scenario, setScenario] = useState<'sem-multa' | 'com-multa'>('sem-multa');
  const [clientName, setClientName] = useState('');
  const { globalUnit } = useGlobalUnit();
  const unidade = globalUnit || 'SCS';
  const [showClearModal, setShowClearModal] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  // Persistence
  const saveState = useCallback((procs: Procedure[], scen: string, name: string) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ procedures: procs, scenario: scen, clientName: name })); } catch {}
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.procedures) setProcedures(parsed.procedures);
        if (parsed.scenario) setScenario(parsed.scenario);
        if (parsed.clientName !== undefined) setClientName(parsed.clientName);
      }
    } catch {}
  }, []);

  useEffect(() => { saveState(procedures, scenario, clientName); }, [procedures, scenario, clientName, saveState]);

  // Calculator
  const calculate = useCallback(() => {
    let totalPagoGlobal = 0, totalConsumidoGlobal = 0, sumSubtotalForFine = 0;
    const results: CalcResult[] = procedures.map(p => {
      const done = Math.min(p.doneSessions, p.totalSessions);
      const total = p.totalSessions || 1;
      if (p.isCortesia) { const vS = p.subtotal / total; return { ...p, pago: 0, consumido: vS * done, devolucao: 0, valorSessao: vS }; }
      const totalPago = Math.max(0, p.subtotal - p.discount);
      const baseVS = scenario === 'sem-multa' ? totalPago : p.subtotal;
      const vS = baseVS / total;
      const consumido = vS * done;
      const saldoBruto = totalPago - consumido;
      const devolucao = Math.max(0, saldoBruto);
      totalPagoGlobal += totalPago; totalConsumidoGlobal += consumido;
      sumSubtotalForFine += p.subtotal;
      return { ...p, pago: totalPago, consumido, devolucao, valorSessao: vS };
    });
    const multaTotal = scenario === 'com-multa' ? (0.10 * sumSubtotalForFine) : 0;
    
    // Calcula o saldo global compensando os créditos e débitos de todos os procedimentos
    const saldoBrutoGlobal = totalPagoGlobal - totalConsumidoGlobal;
    const saldoLiquidoGlobal = saldoBrutoGlobal - multaTotal;
    
    const totalDevolverFinal = Math.max(0, saldoLiquidoGlobal);
    const totalAPagarEmpresaGlobal = saldoLiquidoGlobal < 0 ? Math.abs(saldoLiquidoGlobal) : 0;
    const totalDevolverBruto = Math.max(0, saldoBrutoGlobal);
    
    const displayTotalPago = totalPagoGlobal;
    const valorSemDesconto = sumSubtotalForFine;
    
    return { results, displayTotalPago, valorSemDesconto, totalConsumidoGlobal, multaTotal, totalDevolverFinal, totalDevolverBruto, sumSubtotalForFine, totalAPagarEmpresaGlobal };
  }, [procedures, scenario]);

  const { results, displayTotalPago, valorSemDesconto, totalConsumidoGlobal, multaTotal, totalDevolverFinal, totalDevolverBruto, totalAPagarEmpresaGlobal } = calculate();

  // CRUD
  const addProcedure = () => setProcedures(prev => [...prev, { id: Date.now(), name: '', totalSessions: 10, doneSessions: 0, subtotal: 0, discount: 0, isCortesia: false }]);
  const removeProcedure = (id: number) => setProcedures(prev => prev.filter(p => p.id !== id));
  const updateProcedure = (id: number, field: keyof Procedure, value: any) => {
    setProcedures(prev => prev.map(p => {
      if (p.id !== id) return p;
      const updated = { ...p, [field]: value };
      if (field === 'isCortesia' && value) { updated.subtotal = 0; updated.discount = 0; }
      if (field === 'doneSessions' && value > p.totalSessions) updated.doneSessions = p.totalSessions;
      return updated;
    }));
  };

  const handleClearAll = () => { setProcedures([]); setClientName(''); localStorage.removeItem(STORAGE_KEY); setShowClearModal(false); };

  const handleWhatsApp = () => {
    const semDescontoLine = scenario === 'com-multa' ? `\n💳 *Valor sem desconto:* ${fmt(valorSemDesconto)}` : '';
    const multaLines = scenario === 'com-multa' ? `\n⚠️ *Multa (10%):* ${fmt(multaTotal)}\n✨ *Valor a Devolver (com multa): ${fmt(totalDevolverFinal)}*` : `\n\n✨ *TOTAL A DEVOLVER: ${fmt(totalDevolverFinal)}*`;
    const ressarcimentoLine = totalAPagarEmpresaGlobal > 0 ? `\n\n🔴 *VALOR A RESSARCIR À EMPRESA: ${fmt(totalAPagarEmpresaGlobal)}*\n_(O cliente consumiu sessões acima do valor pago)_` : '';
    const msg = `*RESUMO DE CANCELAMENTO*\n\n🌸 *Cliente:* ${clientName || 'Cliente'}\n✅ *Cenário:* ${scenario === 'sem-multa' ? 'Sem Multa' : 'Com Multa'}\n📊 *Total Pago:* ${fmt(displayTotalPago)}${semDescontoLine}\n📉 *Total Consumido:* ${fmt(totalConsumidoGlobal)}${multaLines}${ressarcimentoLine}`;
    navigator.clipboard.writeText(msg).then(() => toast('Copiado!', 'success')).catch(() => toast('Erro ao copiar. Copie manualmente.', 'warning'));
  };

  const handlePDF = () => {
    setShowLoading(true);
    setTimeout(async () => {
      const now = new Date().toLocaleString('pt-BR');
      let totalPagoG = 0, totalConsG = 0, sumSubG = 0;
      let totalAPagarEmpresaG = 0;

      const rows = procedures.map(p => {
        const pago = p.isCortesia ? 0 : Math.max(0, p.subtotal - p.discount);
        const baseS = scenario === 'sem-multa' ? pago : p.subtotal;
        const vS = baseS / (p.totalSessions || 1);
        const cons = vS * Math.min(p.doneSessions, p.totalSessions);
        const saldoBruto = pago - cons;
        const dev = p.isCortesia ? 0 : Math.max(0, saldoBruto);
        const aPagarEmpresa = (!p.isCortesia && saldoBruto < 0) ? Math.abs(saldoBruto) : 0;
        if (!p.isCortesia) { totalPagoG += pago; totalConsG += cons; sumSubG += p.subtotal; }
        return { name: p.name || 'Procedimento', done: p.doneSessions, total: p.totalSessions, pago, cons, dev, cortesia: p.isCortesia, vS, aPagarEmpresa };
      });

      const multaT = scenario === 'com-multa' ? (0.10 * sumSubG) : 0;
      const saldoBrutoGlobal = totalPagoG - totalConsG;
      const saldoLiquidoGlobal = saldoBrutoGlobal - multaT;
      const totalF = Math.max(0, saldoLiquidoGlobal);
      totalAPagarEmpresaG = saldoLiquidoGlobal < 0 ? Math.abs(saldoLiquidoGlobal) : 0;
      
      const displayPago = totalPagoG;
      const valorSemDescontoLocal = sumSubG;

      // --- Build individual content blocks as HTML strings ---
      const blockMeta = `<div class="block" data-block="meta"><div class="meta">Relatório de Cancelamento<br>Gerado em: ${now}</div></div>`;

      const blockClient = `<div class="block" data-block="client"><div class="card"><div class="client-label">Cliente</div><div class="client-name">${clientName || '—'}</div></div></div>`;

      const semDescontoRow = scenario === 'com-multa' ? `
          <div class="summary-item"><div class="label">Valor sem desconto</div><div class="value" style="color:#888">${fmt(valorSemDescontoLocal)}</div></div>
      ` : '';

      const multaSummaryRows = scenario === 'com-multa' ? `
          <div class="summary-item"><div class="label">Multa (10%)</div><div class="value" style="color:#f59e0b">${fmt(multaT)}</div></div>
          <div class="summary-item summary-highlight"><div class="label">Valor a Devolver (com multa)</div><div class="value">${fmt(totalF)}</div></div>
      ` : `
          <div class="summary-item summary-highlight"><div class="label">Total a Devolver</div><div class="value">${fmt(totalF)}</div></div>
      `;

      const ressarcimentoRow = totalAPagarEmpresaG > 0 ? `
          <div class="summary-item" style="margin-top:8px;padding:12px 16px;background:rgba(239,68,68,0.08);border:1.5px solid rgba(239,68,68,0.25);border-radius:10px">
            <div class="label" style="color:#dc2626;font-weight:800;font-size:0.9rem">⚠ Valor a Ressarcir à Empresa</div>
            <div class="value" style="color:#dc2626;font-weight:900;font-size:1.1rem">${fmt(totalAPagarEmpresaG)}</div>
          </div>
          <div style="font-size:0.72rem;color:#b91c1c;margin-top:4px;padding:0 4px;font-style:italic">O cliente consumiu sessões acima do valor efetivamente pago. O valor acima deve ser ressarcido à empresa.</div>
      ` : '';

      const blockSummary = `<div class="block" data-block="summary"><div class="card">
        <div class="section-title">Resumo — Cenário ${scenario === 'sem-multa' ? 'Sem Multa' : 'Com Multa (10%)'}</div>
        <div class="summary-grid">
          <div class="summary-item"><div class="label">Total Pago</div><div class="value">${fmt(displayPago)}</div></div>
          ${semDescontoRow}
          <div class="summary-item"><div class="label">Total Consumido</div><div class="value" style="color:#e91e63">${fmt(totalConsG)}</div></div>
          ${multaSummaryRows}
          ${ressarcimentoRow}
        </div>
      </div></div>`;

      const blockDetailTitle = `<div class="block" data-block="detail-title"><div class="card-header"><div class="section-title">Detalhamento por Item</div></div></div>`;

      const blockItems = rows.map((r, i) => {
        const base = scenario === 'sem-multa' ? r.pago : (r.cortesia ? 0 : procedures[i]?.subtotal || 0);
        const subtotalVal = r.cortesia ? 0 : (procedures[i]?.subtotal || 0);
        const discountVal = r.cortesia ? 0 : (procedures[i]?.discount || 0);
        const sessoesDone = r.done;
        if (r.cortesia) {
          return `<div class="block" data-block="item-${i}">
            <div class="detail-item">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span style="font-weight:700;font-size:0.9rem">${r.name} <span style="color:#10b981;font-size:0.78rem">(Cortesia)</span></span>
              </div>
              <div style="padding:8px 12px;background:rgba(16,185,129,0.05);border-radius:8px;font-size:0.82rem;color:#10b981;font-weight:600">Procedimento cortesia — sem impacto no cálculo de devolução.</div>
            </div>
          </div>`;
        }
        const stepNum = discountVal > 0;
        return `<div class="block" data-block="item-${i}">
          <div class="detail-item">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <span style="font-weight:700;font-size:0.9rem">${r.name}</span>
              <span style="font-size:0.78rem;color:#e91e63;font-weight:700;background:rgba(230,0,126,0.06);padding:3px 12px;border-radius:8px">${sessoesDone}/${r.total} sessões</span>
            </div>
            <div style="background:#fafafa;border-radius:8px;padding:10px 14px;border:1px solid #eee">
              <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.82rem">
                <span style="color:#888">① Subtotal do pacote</span>
                <span style="font-weight:600">${fmt(subtotalVal)}</span>
              </div>
              ${discountVal > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.82rem">
                <span style="color:#888">② Desconto aplicado</span>
                <span style="font-weight:600;color:#f59e0b">− ${fmt(discountVal)}</span>
              </div>` : ''}
              <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.82rem">
                <span style="color:#888">${stepNum ? '③' : '②'} Valor efetivamente pago</span>
                <span style="font-weight:700">${fmt(r.pago)}</span>
              </div>
              <div style="height:1px;background:#eee;margin:6px 0;border-style:dashed"></div>
              ${scenario === 'com-multa' && discountVal > 0 ? `<div style="display:flex;justify-content:space-between;padding:5px 10px;font-size:0.78rem;background:rgba(245,158,11,0.06);border-radius:6px;margin:4px 0">
                <span style="color:#b45309">ⓘ Base de cálculo: <strong>subtotal sem desconto</strong></span>
                <span style="font-weight:600;color:#f59e0b">${fmt(subtotalVal)}</span>
              </div>` : ''}
              <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.82rem">
                <span style="color:#888">${stepNum ? '④' : '③'} Valor/sessão <span style="font-size:0.72rem;color:#bbb">(${fmt(base)} ÷ ${r.total})</span></span>
                <span style="font-weight:600">${fmt(r.vS)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.82rem">
                <span style="color:#888">${stepNum ? '⑤' : '④'} Valor consumido <span style="font-size:0.72rem;color:#bbb">(${fmt(r.vS)} × ${sessoesDone})</span></span>
                <span style="font-weight:600;color:#e91e63">${fmt(r.cons)}</span>
              </div>
              <div style="height:1px;background:#ddd;margin:6px 0"></div>
              ${(() => {
                const saldoBrutoItem = r.pago - r.cons;
                if (scenario === 'com-multa') {
                  const multaDoItem = 0.10 * subtotalVal;
                  const saldoLiquido = Math.max(0, r.dev - multaDoItem);
                  const itemRessarcimento = saldoBrutoItem < 0 ? Math.abs(saldoBrutoItem) : 0;
                  return `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.82rem">
                <span style="color:#555;font-weight:700">Saldo bruto <span style="font-size:0.72rem;color:#bbb;font-weight:400">(${fmt(r.pago)} − ${fmt(r.cons)})</span></span>
                <span style="font-weight:700;color:${saldoBrutoItem >= 0 ? '#10b981' : '#dc2626'}">${saldoBrutoItem < 0 ? '− ' : ''}${fmt(Math.abs(saldoBrutoItem))}</span>
              </div>
              ${itemRessarcimento > 0 ? `<div style="display:flex;justify-content:space-between;padding:6px 10px;font-size:0.82rem;background:rgba(239,68,68,0.06);border-radius:6px;margin:4px 0;border:1px solid rgba(239,68,68,0.15)">
                <span style="color:#dc2626;font-weight:700">⚠ Valor a ressarcir à empresa</span>
                <span style="font-weight:900;color:#dc2626">${fmt(itemRessarcimento)}</span>
              </div>` : `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.82rem">
                <span style="color:#b45309;font-weight:700">⚠ Multa contratual (10%) <span style="font-size:0.72rem;color:#bbb;font-weight:400">(10% × ${fmt(subtotalVal)})</span></span>
                <span style="font-weight:700;color:#f59e0b">− ${fmt(multaDoItem)}</span>
              </div>
              <div style="height:1px;background:#ddd;margin:4px 0"></div>
              <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:0.88rem">
                <span style="font-weight:800">Saldo a devolver <span style="font-size:0.72rem;color:#bbb;font-weight:400">(com multa)</span></span>
                <span style="font-weight:900;color:${saldoLiquido > 0 ? '#10b981' : '#e91e63'};font-size:1rem">${fmt(saldoLiquido)}</span>
              </div>`}`;
                }
                if (saldoBrutoItem < 0) {
                  const itemRessarcimento = Math.abs(saldoBrutoItem);
                  return `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:0.82rem">
                <span style="color:#555;font-weight:700">Saldo bruto <span style="font-size:0.72rem;color:#bbb;font-weight:400">(${fmt(r.pago)} − ${fmt(r.cons)})</span></span>
                <span style="font-weight:700;color:#dc2626">− ${fmt(itemRessarcimento)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;padding:6px 10px;font-size:0.88rem;background:rgba(239,68,68,0.06);border-radius:8px;margin:4px 0;border:1px solid rgba(239,68,68,0.15)">
                <span style="font-weight:800;color:#dc2626">⚠ Valor a ressarcir à empresa</span>
                <span style="font-weight:900;color:#dc2626;font-size:1rem">${fmt(itemRessarcimento)}</span>
              </div>`;
                }
                return `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:0.88rem">
                <span style="font-weight:800">Saldo a devolver <span style="font-size:0.72rem;color:#bbb;font-weight:400">(${fmt(r.pago)} − ${fmt(r.cons)})</span></span>
                <span style="font-weight:900;color:#10b981;font-size:1rem">${fmt(r.dev)}</span>
              </div>`;
              })()}
            </div>
          </div>
        </div>`;
      });

      const blockSignatures = `<div class="block" data-block="signatures">
        <div class="signatures">
          <div class="sig-box"><div class="sig-line">Assinatura da Cliente</div></div>
          <div class="sig-box"><div class="sig-line">Assinatura Unidade</div></div>
        </div>
        <div class="footer-text">© ${new Date().getFullYear()} Virtuosa Estética — Documento gerado automaticamente para fins de registro interno.</div>
      </div>`;

      // Combine all blocks in order
      const allBlocks = [blockMeta, blockClient, blockSummary, blockDetailTitle, ...blockItems, blockSignatures];

      // --- Build the full HTML with pagination script ---
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório de Cancelamento - ${clientName || 'Cliente'}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
@page{size:A4;margin:0}
html,body{width:794px;margin:0 auto;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#1a1a1a;background:#fff;line-height:1.4}
.page{position:relative;width:794px;height:1123px;overflow:hidden;background-image:url('${DOCUMENT_BACKGROUND_URL}');background-size:100% 100%;background-position:top left;background-repeat:no-repeat;page-break-after:always}
.page:last-child{page-break-after:auto}
.header{position:absolute;top:0;left:0;width:100%;height:120px}
.footer{position:absolute;bottom:0;left:0;width:100%;height:160px}
.content{position:absolute;top:120px;bottom:160px;left:40px;right:40px;overflow:hidden}
.meta{text-align:right;font-size:11px;color:#777;margin-bottom:10px}
.card{background:rgba(255,255,255,0.9);border-radius:10px;padding:12px 16px;margin-bottom:8px;border:1px solid rgba(233,30,99,0.08)}
.card-header{padding:12px 16px 4px;margin-bottom:0}
.client-label{font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#e91e63;font-weight:700;margin-bottom:2px}
.client-name{font-size:16px;font-weight:700}
.section-title{font-size:10px;text-transform:uppercase;letter-spacing:0.8px;color:#e91e63;font-weight:800;margin-bottom:6px;display:flex;align-items:center;gap:5px}
.section-title::before{content:'';display:inline-block;width:3px;height:12px;background:#e91e63;border-radius:2px}
.summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px}
.summary-item{background:rgba(255,255,255,0.95);border:1px solid #f0f0f0;border-radius:8px;padding:8px 12px}
.summary-item .label{font-size:10px;color:#888;margin-bottom:1px}
.summary-item .value{font-size:14px;font-weight:700}
.summary-highlight{background:rgba(253,242,248,0.95);border:1px solid #fce4ec}
.summary-highlight .value{color:#e91e63;font-size:16px;font-weight:800}
.detail-item{padding:7px 12px;border-bottom:1px solid rgba(0,0,0,0.05);background:rgba(255,255,255,0.9);margin-bottom:2px;border-radius:6px}
.detail-item:last-child{border-bottom:none}
.detail-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:3px}
.detail-name{font-weight:700;font-size:13px}
.detail-cortesia{color:#10b981;font-size:11px}
.detail-sessions{font-size:11px;color:#888}
.detail-values{display:flex;gap:18px;font-size:12px;color:#555}
.signatures{display:flex;justify-content:space-around;margin-top:80px;padding-top:20px}
.sig-box{text-align:center;min-width:160px}
.sig-line{border-top:1px solid #1a1a1a;padding-top:6px;font-size:11px;font-weight:600;color:#555}
.footer-text{text-align:center;margin-top:8px;font-size:9px;color:#aaa}
.block{break-inside:avoid}
#measure{position:absolute;left:-9999px;top:0;width:714px;visibility:hidden}
@media print{
  html,body{width:794px;margin:0;padding:0}
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  @page{size:A4;margin:0}
  .page{width:794px;height:1123px;margin:0;box-shadow:none}
}
</style></head><body>
<div id="measure"></div>
<div id="pages"></div>
<script>
(function(){
  var PAGE_W = 794;
  var PAGE_H = 1123;
  var HEADER_H = 120;
  var FOOTER_H = 160;
  var SIDE_PAD = 40;
  var CONTENT_H = PAGE_H - HEADER_H - FOOTER_H;

  var blocksHTML = ${JSON.stringify(allBlocks)};

  var measureDiv = document.getElementById('measure');
  var pagesDiv = document.getElementById('pages');

  // 1) Insert all blocks into measurement container
  var blockEls = [];
  blocksHTML.forEach(function(html) {
    var wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    var el = wrapper.firstElementChild;
    measureDiv.appendChild(el);
    blockEls.push(el);
  });

  // 2) Measure each block's height including margins
  var heights = blockEls.map(function(el) {
    var style = window.getComputedStyle(el);
    var mt = parseFloat(style.marginTop) || 0;
    var mb = parseFloat(style.marginBottom) || 0;
    return el.getBoundingClientRect().height + mt + mb;
  });

  // 3) Distribute blocks across pages
  var pages = [[]];
  var remaining = CONTENT_H;

  for (var i = 0; i < blockEls.length; i++) {
    var h = heights[i];
    // If a single block is taller than a full page (very rare but possible), force it.
    if (h > CONTENT_H) {
      if (pages[pages.length - 1].length > 0) pages.push([]);
      pages[pages.length - 1].push(i);
      remaining = 0;
    } else if (h <= remaining) {
      pages[pages.length - 1].push(i);
      remaining -= h;
    } else {
      pages.push([i]);
      remaining = CONTENT_H - h;
    }
  }

  // 4) Build page divs
  pages.forEach(function(blockIndices) {
    var pageDiv = document.createElement('div');
    pageDiv.className = 'page';

    // Header zone (transparent - background image shows through)
    var headerDiv = document.createElement('div');
    headerDiv.className = 'header';
    pageDiv.appendChild(headerDiv);

    // Content zone
    var contentDiv = document.createElement('div');
    contentDiv.className = 'content';
    blockIndices.forEach(function(idx) {
      contentDiv.appendChild(blockEls[idx]);
    });
    pageDiv.appendChild(contentDiv);

    // Footer zone (transparent - background image shows through)
    var footerDiv = document.createElement('div');
    footerDiv.className = 'footer';
    pageDiv.appendChild(footerDiv);

    pagesDiv.appendChild(pageDiv);
  });

  // 5) Clean up measurement container
  measureDiv.remove();
})();
</script>
</body></html>`;

      // Format data to save in history
      const historyData = {
        clientName: clientName || 'Cliente',
        unit: unidade,
        scenario: scenario === 'sem-multa' ? 'Sem Multa' : 'Com Multa (10%)',
        totalPago: totalPagoG,
        totalConsumido: totalConsG,
        multa: multaT,
        totalDevolver: totalF,
        valorAPagarEmpresa: totalAPagarEmpresaG,
        proceduresCount: rows.length,
        html: html,
      };

      try {
        await fetch('/api/cancelamentos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(historyData),
        });
      } catch (err) {
        console.error('Failed to save cancellation history', err);
      }

      const w = window.open('', '_blank');
      if (w) {
        w.document.write(html);
        w.document.close();
        w.onload = () => { setTimeout(() => w.print(), 200); };
      }
      setShowLoading(false);
    }, 300);
  };

  return {
    procedures, scenario, setScenario, clientName, setClientName, unidade,
    showClearModal, setShowClearModal, showLoading, resultRef,
    results, displayTotalPago, valorSemDesconto, totalConsumidoGlobal, multaTotal, totalDevolverFinal, totalDevolverBruto, totalAPagarEmpresaGlobal,
    addProcedure, removeProcedure, updateProcedure, handleClearAll, handleWhatsApp, handlePDF,
  };
}
