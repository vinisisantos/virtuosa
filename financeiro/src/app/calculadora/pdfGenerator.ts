// PDF Generator for Pricing Calculator
import { CalcState, calc, fmt, Insumo } from './useCalc';

// We use a lightweight approach: generate a styled HTML and trigger window.print()
// This avoids adding a heavy PDF library dependency.

export function generatePDF(s: CalcState) {
  const r = calc(s);
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const insumosRows = s.insumos
    .filter(i => i.valor > 0)
    .map(i => `<tr><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${i.nome}</td><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:13px;font-weight:600;">${fmt(i.valor)}</td></tr>`)
    .join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Simulação - ${s.nome || 'Procedimento'}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, sans-serif; color: #1f2937; background: #fff; padding: 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 2px solid #ec4899; }
    .logo { display: flex; align-items: center; gap: 12px; }
    .logo-icon { width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(135deg, #ec4899, #be185d); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 22px; font-weight: 900; }
    .logo-text { font-size: 22px; font-weight: 900; color: #be185d; }
    .logo-sub { font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; }
    .date { text-align: right; font-size: 12px; color: #6b7280; }
    .price-box { background: linear-gradient(135deg, #fdf2f8, #fce7f3); border-radius: 16px; padding: 24px 32px; margin-bottom: 28px; border: 1px solid rgba(236,72,153,0.15); }
    .price-label { font-size: 12px; font-weight: 700; color: #ec4899; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
    .price-name { font-size: 16px; font-weight: 700; color: #9d174d; margin-bottom: 4px; }
    .price-value { font-size: 36px; font-weight: 900; color: #be185d; }
    .price-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 16px; }
    .price-chip { background: rgba(255,255,255,0.7); border-radius: 10px; padding: 10px 14px; }
    .price-chip-label { font-size: 11px; font-weight: 700; color: #9d174d; }
    .price-chip-value { font-size: 16px; font-weight: 900; color: #be185d; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 13px; font-weight: 800; color: #ec4899; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #fce7f3; }
    table { width: 100%; border-collapse: collapse; }
    th { padding: 8px 12px; text-align: left; font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; border-bottom: 2px solid #f3f4f6; }
    th:last-child { text-align: right; }
    td { padding: 6px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
    td:last-child { text-align: right; font-weight: 600; }
    .total-row td { border-top: 2px solid #e5e7eb; font-weight: 800; font-size: 14px; background: #f9fafb; }
    .kpi-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; margin-bottom: 28px; }
    .kpi { background: #f9fafb; border-radius: 12px; padding: 14px 16px; border: 1px solid #f3f4f6; }
    .kpi-label { font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; }
    .kpi-value { font-size: 18px; font-weight: 900; color: #1f2937; margin-top: 2px; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    @media print {
      body { padding: 20px; }
      @page { margin: 15mm; size: A4; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">
      <div class="logo-icon">V</div>
      <div>
        <div class="logo-text">Virtuosa</div>
        <div class="logo-sub">Precificação de Procedimentos</div>
      </div>
    </div>
    <div class="date">
      <div style="font-weight:700;color:#374151;">Simulação</div>
      <div>${dateStr}</div>
      <div>${timeStr}</div>
    </div>
  </div>

  <div class="price-box">
    <div class="price-label">Preço Sugerido</div>
    <div class="price-name">${s.nome || 'Procedimento'}</div>
    <div class="price-value">${fmt(r.preco)}</div>
    <div class="price-grid">
      <div class="price-chip">
        <div class="price-chip-label">Lucro Clínica</div>
        <div class="price-chip-value">${fmt(r.lucroClinicaVal)}</div>
      </div>
      <div class="price-chip">
        <div class="price-chip-label">Lucro Parceiro</div>
        <div class="price-chip-value">${fmt(r.lucroParceiroVal)}</div>
      </div>
      <div class="price-chip">
        <div class="price-chip-label">Base de Custo</div>
        <div class="price-chip-value">${fmt(r.baseCusto)}</div>
      </div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi">
      <div class="kpi-label">Hora Maca</div>
      <div class="kpi-value">${fmt(r.horaMaca)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Custos Mensais</div>
      <div class="kpi-value">${fmt(r.custosMensais)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Total Insumos</div>
      <div class="kpi-value">${fmt(r.totalInsumos)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Margem Lucro</div>
      <div class="kpi-value">${s.lucroClinica.toFixed(1)}%</div>
    </div>
  </div>

  <div class="two-col">
    <div class="section">
      <div class="section-title">Custos Fixos Mensais</div>
      <table>
        <tr><td>Aluguel / Espaço</td><td>${fmt(s.aluguel)}</td></tr>
        <tr><td>Energia Elétrica</td><td>${fmt(s.energiaEletrica)}</td></tr>
        <tr><td>Água / Internet</td><td>${fmt(s.aguaInternet)}</td></tr>
        <tr><td>Contador</td><td>${fmt(s.contador)}</td></tr>
        <tr><td>Salários</td><td>${fmt(s.salarios)}</td></tr>
        <tr><td>Pró-labore</td><td>${fmt(s.proLabore)}</td></tr>
        <tr class="total-row"><td>Total Fixos</td><td>${fmt(r.fixos)}</td></tr>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Custos Variáveis Mensais</div>
      <table>
        <tr><td>Materiais / Insumos gerais</td><td>${fmt(s.materiaisGerais)}</td></tr>
        <tr><td>Marketing / Tráfego</td><td>${fmt(s.marketingTrafego)}</td></tr>
        <tr><td>Comissões</td><td>${fmt(s.comissoes)}</td></tr>
        <tr><td>Taxas e plataformas</td><td>${fmt(s.taxasPlataformas)}</td></tr>
        <tr><td>Outros</td><td>${fmt(s.outros)}</td></tr>
        <tr class="total-row"><td>Total Variáveis</td><td>${fmt(r.variaveis)}</td></tr>
      </table>
    </div>
  </div>

  <div class="two-col" style="margin-top:8px;">
    <div class="section">
      <div class="section-title">Insumos do Procedimento</div>
      <table>
        <thead><tr><th>Insumo</th><th>Valor</th></tr></thead>
        <tbody>
          ${insumosRows || '<tr><td colspan="2" style="text-align:center;color:#9ca3af;padding:16px;">Nenhum insumo cadastrado</td></tr>'}
          ${s.locacaoAparelho > 0 ? `<tr><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">Locação de Aparelho</td><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:13px;font-weight:600;">${fmt(s.locacaoAparelho)}</td></tr>` : ''}
          <tr class="total-row"><td>Total Insumos</td><td>${fmt(r.totalInsumos)}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title">Parâmetros da Simulação</div>
      <table>
        <tr><td>Dias trabalhados / mês</td><td>${s.diasTrabalhados} dias</td></tr>
        <tr><td>Horas trabalhadas / dia</td><td>${s.horasDia}h ${s.minutosDia > 0 ? s.minutosDia + 'min' : ''}</td></tr>
        <tr><td>Quantidade de salas</td><td>${s.qtdSalas}</td></tr>
        <tr><td>Duração do procedimento</td><td>${s.duracaoHoras}h ${s.duracaoMinutos > 0 ? s.duracaoMinutos + 'min' : ''}</td></tr>
        <tr><td>Impostos</td><td>${s.impostos}%</td></tr>
        <tr><td>Taxa Cartão</td><td>${s.taxaCartao}%</td></tr>
        <tr><td>Desconto Paciente</td><td>${s.descontoPaciente}%</td></tr>
        <tr><td>Lucro Clínica</td><td>${s.lucroClinica}%</td></tr>
        <tr><td>Lucro Parceiro</td><td>${s.lucroParceiro}%</td></tr>
      </table>
    </div>
  </div>

  <div class="section" style="margin-top:8px;">
    <div class="section-title">Composição do Preço Final</div>
    <table>
      <tr><td>Custo Hora no Procedimento</td><td>${fmt(r.custoHoraProcedimento)}</td></tr>
      <tr><td>Total Insumos</td><td>${fmt(r.totalInsumos)}</td></tr>
      <tr><td>Base de Custo</td><td>${fmt(r.baseCusto)}</td></tr>
      <tr><td>+ Lucro Clínica (${s.lucroClinica}%)</td><td>${fmt(r.lucroClinicaVal)}</td></tr>
      <tr><td>+ Lucro Parceiro (${s.lucroParceiro}%)</td><td>${fmt(r.lucroParceiroVal)}</td></tr>
      <tr><td>+ Impostos e Taxas</td><td>${fmt(r.impostosVal)}</td></tr>
      <tr class="total-row"><td style="font-size:15px;color:#be185d;">Preço Final Sugerido</td><td style="font-size:18px;color:#be185d;">${fmt(r.preco)}</td></tr>
    </table>
  </div>

  <div class="footer">
    Virtuosa — Documento gerado automaticamente em ${dateStr} às ${timeStr} · Este documento é uma simulação e não constitui proposta comercial.
  </div>
</body>
</html>`;

  // Open in new window and trigger print (save as PDF)
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  // Wait for fonts to load, then trigger print
  setTimeout(() => {
    win.print();
  }, 600);
}
