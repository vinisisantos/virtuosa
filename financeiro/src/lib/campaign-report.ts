export type CampaignReportPayload = {
  unit: string;
  from: string;
  to: string;
  kpis: {
    totalLeads: number;
    totalMetaLeads: number;
    pendingMetaLeads: number;
    manualAttributionLeads: number;
    unassignedConfirmedMetaLeads: number;
    totalConvertidos: number;
    totalReceita: number;
    taxaConversao: string;
    totalBudget: number;
    overallCpl: number;
    overallCac: number;
    overallRoas: number;
  };
  campaigns: Array<{
    campaignName: string;
    leads: number;
    convertidos: number;
    receita: number;
    budget: number;
  }>;
  bySource: Array<{ source: string; total: number; vendas: number; receita: number }>;
  criteria: {
    leadDate: string;
    confirmedMeta: string;
    campaignPerformance: string;
    historical: string;
  };
};

const SOURCE_NAMES: Record<string, string> = {
  meta_ads: "Meta Ads confirmado",
  meta_ads_pendente: "Meta Ads a validar",
  atribuicao_manual: "Atribuição manual",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  indicacao: "Indicação",
  google: "Google",
  site: "Site",
  outro: "Outro",
  desconhecido: "Desconhecido",
};

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string) => value ? value.split("-").reverse().join("/") : "Todo o período";

export async function generateCampaignReportPdf(payload: CampaignReportPayload) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const width = doc.internal.pageSize.getWidth();
  const generatedAt = new Date().toLocaleString("pt-BR");

  doc.setProperties({ title: "Relatório de Campanhas", subject: "Precisão de origem e performance de campanhas" });
  doc.setTextColor(27, 27, 39);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("RELATÓRIO DE CAMPANHAS E ORIGEM DE LEADS", 16, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(95, 95, 110);
  doc.text(`${payload.unit} | ${date(payload.from)} a ${date(payload.to)}`, 16, 24);
  doc.text(`Gerado em ${generatedAt}`, width - 16, 24, { align: "right" });
  doc.setDrawColor(124, 58, 237);
  doc.setLineWidth(0.8);
  doc.line(16, 28, width - 16, 28);

  autoTable(doc, {
    startY: 34,
    head: [["Leads recebidos", "Meta confirmado", "Meta a validar", "Atribuição manual", "Conversão Meta", "Receita Meta"]],
    body: [[
      String(payload.kpis.totalLeads),
      String(payload.kpis.totalMetaLeads),
      String(payload.kpis.pendingMetaLeads),
      String(payload.kpis.manualAttributionLeads),
      `${payload.kpis.taxaConversao}% (${payload.kpis.totalConvertidos})`,
      currency(payload.kpis.totalReceita),
    ]],
    theme: "grid",
    headStyles: { fillColor: [27, 27, 39], textColor: [255, 255, 255], fontStyle: "bold" },
    bodyStyles: { fontStyle: "bold", textColor: [45, 45, 55] },
    styles: { fontSize: 8, cellPadding: 3, halign: "center" },
    margin: { left: 16, right: 16 },
  });

  const summary = doc as typeof doc & { lastAutoTable?: { finalY: number } };
  autoTable(doc, {
    startY: (summary.lastAutoTable?.finalY || 48) + 7,
    head: [["Campanha cadastrada", "Orçamento cadastrado", "Leads Meta confirmados", "Conversões", "CPL", "CAC", "ROAS", "Receita"]],
    body: payload.campaigns.map((campaign) => {
      const cpl = campaign.leads > 0 ? campaign.budget / campaign.leads : 0;
      const cac = campaign.convertidos > 0 ? campaign.budget / campaign.convertidos : 0;
      const roas = campaign.budget > 0 ? campaign.receita / campaign.budget : 0;
      return [
        campaign.campaignName,
        currency(campaign.budget),
        String(campaign.leads),
        String(campaign.convertidos),
        cpl ? currency(cpl) : "-",
        cac ? currency(cac) : "-",
        roas ? `${roas.toFixed(1)}x` : "-",
        currency(campaign.receita),
      ];
    }),
    theme: "striped",
    headStyles: { fillColor: [6, 104, 225], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    styles: { fontSize: 7.3, cellPadding: 2.6, overflow: "linebreak" },
    columnStyles: {
      0: { cellWidth: 58 },
      1: { halign: "right" },
      2: { halign: "center" },
      3: { halign: "center" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "center" },
      7: { halign: "right" },
    },
    margin: { left: 16, right: 16 },
  });

  const campaignTable = doc as typeof doc & { lastAutoTable?: { finalY: number } };
  autoTable(doc, {
    startY: (campaignTable.lastAutoTable?.finalY || 60) + 7,
    head: [["Origem", "Leads", "Vendas", "Receita"]],
    body: payload.bySource.map((source) => [
      SOURCE_NAMES[source.source] || source.source,
      String(source.total),
      String(source.vendas),
      currency(source.receita),
    ]),
    theme: "grid",
    headStyles: { fillColor: [124, 58, 237], textColor: [255, 255, 255], fontStyle: "bold" },
    styles: { fontSize: 7.5, cellPadding: 2.4 },
    columnStyles: { 1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "right" } },
    margin: { left: 16, right: width / 2 + 4 },
  });

  const sourceTable = doc as typeof doc & { lastAutoTable?: { finalY: number } };
  const criteriaY = (sourceTable.lastAutoTable?.finalY || 95) + 7;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(27, 27, 39);
  doc.setFontSize(9);
  doc.text("Critérios de leitura", width / 2 + 4, criteriaY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.4);
  doc.setTextColor(80, 80, 92);
  const criteria = [
    `Data: ${payload.criteria.leadDate}.`,
    `Meta confirmado: ${payload.criteria.confirmedMeta}.`,
    `Performance: ${payload.criteria.campaignPerformance}.`,
    `Histórico: ${payload.criteria.historical}.`,
    `${payload.kpis.unassignedConfirmedMetaLeads} lead(s) Meta confirmado(s) sem campanha cadastrada não entram na tabela de performance.`,
  ];
  let lineY = criteriaY + 5;
  for (const item of criteria) {
    const lines = doc.splitTextToSize(item, width / 2 - 22);
    doc.text(lines, width / 2 + 4, lineY);
    lineY += lines.length * 4 + 2;
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 130);
    doc.text(`Virtuosa CRM | Página ${page} de ${pages}`, width - 16, 202, { align: "right" });
  }

  const filePeriod = `${payload.from || "inicio"}-${payload.to || "atual"}`;
  doc.save(`relatorio-campanhas-${payload.unit.toLowerCase().replace(/\s+/g, "-")}-${filePeriod}.pdf`);
}
