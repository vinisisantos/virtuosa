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
    totalReceitaRecorrente: number;
    totalReceitaLifetime: number;
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
    receitaRecorrente: number;
    budget: number;
    budgetType: "shared_estimated" | "individual_estimated" | "none";
    budgetGroupName: string | null;
    budgetDays: number;
    uniqueClients: number;
    buyerClients: number;
    conversionRate: number;
    acquisitionPackages: number;
    recurringPackages: number;
    salesWithoutProcedures: number;
    procedures: Array<{
      name: string;
      packages: number;
      clients: number;
      packageRevenue: number;
      averagePackageTicket: number;
    }>;
  }>;
  budgetGroups: Array<{
    id: string;
    name: string;
    platform: string;
    dailyBudget: number;
    rechargeAmount: number | null;
    rechargeIntervalDays: number | null;
    startDate: string;
    endDate: string | null;
    budgetDays: number;
    estimatedSpend: number;
    campaignNames: string[];
    allocationBasis: "leads";
  }>;
  bySource: Array<{ source: string; total: number; vendas: number; receita: number }>;
  salesSummary: {
    totalSales: number;
    uniqueClients: number;
    totalRevenue: number;
    averageTicket: number;
    incompleteValueSales: number;
    salesWithoutProcedures: number;
  };
  salesByType: Array<{
    type: "primeira_compra" | "recorrencia" | "venda_direta";
    sales: number;
    revenue: number;
  }>;
  procedures: Array<{
    name: string;
    packages: number;
    clients: number;
    packageRevenue: number;
    averagePackageTicket: number;
    byOrigin: Record<"lead_com_campanha" | "outro_lead" | "nao_lead", {
      packages: number;
      clients: number;
      packageRevenue: number;
    }>;
  }>;
  procedureCombinations: Array<{ name: string; packages: number; revenue: number }>;
  demandByOrigin: Array<{
    origin: "lead_com_campanha" | "outro_lead" | "nao_lead";
    packages: number;
    clients: number;
    revenue: number;
  }>;
  detailedSales: {
    coverage: {
      detailedDeals: number;
      legacyDeals: number;
      items: number;
      sessions: number;
      paidRevenue: number;
      subtotal: number;
      discount: number;
      courtesyItems: number;
      courtesySessions: number;
    };
    byOrigin: Array<{
      origin: "lead_com_campanha" | "outro_lead" | "nao_lead";
      packages: number;
      clients: number;
      sessions: number;
      paidRevenue: number;
    }>;
    procedures: Array<{
      name: string;
      packages: number;
      clients: number;
      sessions: number;
      paidRevenue: number;
      subtotal: number;
      discount: number;
      courtesySessions: number;
      includedSessions: number;
      additionalSessions: number;
      unclassifiedSessions: number;
      byOrigin: Record<"lead_com_campanha" | "outro_lead" | "nao_lead", {
        packages: number;
        clients: number;
        sessions: number;
        paidRevenue: number;
      }>;
    }>;
    campaignUpsell: Array<{
      campaignName: string;
      packages: number;
      packagesWithAdditional: number;
      additionalAttachRate: number;
      includedSessions: number;
      additionalSessions: number;
      includedPaidRevenue: number;
      additionalPaidRevenue: number;
      mixedPaidRevenue: number;
      courtesySessions: number;
    }>;
    packages: Array<{
      dealId: string;
      clientName: string;
      origin: "lead_com_campanha" | "outro_lead" | "nao_lead";
      campaignName: string | null;
      totalValue: number;
      sessions: number;
      paidRevenue: number;
      procedures: Array<{
        name: string;
        sessions: number;
        paidAmount: number;
        itemType: string;
        classification: string;
        includedSessions: number;
        additionalSessions: number;
      }>;
    }>;
  };
  criteria: {
    leadDate: string;
    confirmedMeta: string;
    campaignPerformance: string;
    historical: string;
    attributionWindow: string;
    recurringRevenue: string;
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

const SALE_TYPE_NAMES: Record<CampaignReportPayload["salesByType"][number]["type"], string> = {
  primeira_compra: "Primeira compra via lead",
  recorrencia: "Recorrência inferida",
  venda_direta: "Venda direta da clínica",
};

const DEMAND_ORIGIN_NAMES: Record<CampaignReportPayload["demandByOrigin"][number]["origin"], string> = {
  lead_com_campanha: "Lead com campanha",
  outro_lead: "Outros leads",
  nao_lead: "Não é lead",
};

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string) => value ? value.split("-").reverse().join("/") : "Todo o período";

export async function generateCampaignReportPdf(payload: CampaignReportPayload) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const width = doc.internal.pageSize.getWidth();
  const generatedAt = new Date().toLocaleString("pt-BR");
  const lastTableY = () => (doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 0;

  const addHeader = (title: string, subtitle: string) => {
    doc.setTextColor(27, 27, 39);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(title, 16, 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(95, 95, 110);
    doc.text(subtitle, 16, 24);
    doc.text(`Gerado em ${generatedAt}`, width - 16, 24, { align: "right" });
    doc.setDrawColor(124, 58, 237);
    doc.setLineWidth(0.8);
    doc.line(16, 28, width - 16, 28);
  };

  doc.setProperties({ title: "Relatório de Campanhas", subject: "Precisão de origem e performance de campanhas" });
  addHeader("RELATÓRIO DE CAMPANHAS E AQUISIÇÃO", `${payload.unit} | ${date(payload.from)} a ${date(payload.to)}`);

  autoTable(doc, {
    startY: 34,
    head: [["Leads recebidos", "Meta confirmado", "Meta a validar", "Conversão 30 dias", "Receita aquisição", "Receita recorrente / LTV"]],
    body: [[
      String(payload.kpis.totalLeads),
      String(payload.kpis.totalMetaLeads),
      String(payload.kpis.pendingMetaLeads),
      `${payload.kpis.taxaConversao}% (${payload.kpis.totalConvertidos})`,
      currency(payload.kpis.totalReceita),
      currency(payload.kpis.totalReceitaRecorrente),
    ]],
    theme: "grid",
    headStyles: { fillColor: [27, 27, 39], textColor: [255, 255, 255], fontStyle: "bold" },
    bodyStyles: { fontStyle: "bold", textColor: [45, 45, 55] },
    styles: { fontSize: 8, cellPadding: 3, halign: "center" },
    margin: { left: 16, right: 16 },
  });

  if (payload.budgetGroups.length > 0) {
    autoTable(doc, {
      startY: lastTableY() + 5,
      head: [["Orçamento compartilhado", "Período", "Valor diário", "Investimento estimado", "Recarga operacional", "Campanhas"]],
      body: payload.budgetGroups.map(group => [
        group.name,
        `${group.budgetDays} dia(s) desde ${date(group.startDate)}`,
        currency(group.dailyBudget),
        currency(group.estimatedSpend),
        group.rechargeAmount && group.rechargeIntervalDays
          ? `${currency(group.rechargeAmount)} / ${group.rechargeIntervalDays} dias`
          : "Não informada",
        group.campaignNames.join(", "),
      ]),
      theme: "grid",
      headStyles: { fillColor: [236, 72, 153], textColor: [255, 255, 255], fontStyle: "bold" },
      styles: { fontSize: 6.8, cellPadding: 2, overflow: "linebreak" },
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right" } },
      margin: { left: 16, right: 16 },
    });
  }

  autoTable(doc, {
    startY: lastTableY() + 7,
    head: [["Campanha", "Investimento", "Leads", "Clientes", "Compradores", "Conversão", "CPL", "CAC", "ROAS", "Receita aquisição", "Receita recorrente"]],
    body: payload.campaigns.map((campaign) => {
      const cpl = campaign.leads > 0 ? campaign.budget / campaign.leads : 0;
      const cac = campaign.convertidos > 0 ? campaign.budget / campaign.convertidos : 0;
      const roas = campaign.budget > 0 ? campaign.receita / campaign.budget : 0;
      return [
        campaign.campaignName,
        campaign.budget > 0
          ? `${currency(campaign.budget)}${campaign.budgetType === "shared_estimated" ? " (rateio est.)" : " (est.)"}`
          : campaign.budgetGroupName ? "Sem leads para rateio" : "Não informado",
        String(campaign.leads),
        String(campaign.uniqueClients),
        String(campaign.buyerClients),
        `${campaign.conversionRate.toFixed(1)}%`,
        cpl ? currency(cpl) : "-",
        cac ? currency(cac) : "-",
        roas ? `${roas.toFixed(1)}x` : "-",
        currency(campaign.receita),
        currency(campaign.receitaRecorrente),
      ];
    }),
    theme: "striped",
    headStyles: { fillColor: [6, 104, 225], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    styles: { fontSize: 6.2, cellPadding: 1.9, overflow: "linebreak" },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { halign: "right" },
      2: { halign: "center" },
      3: { halign: "center" },
      4: { halign: "center" },
      5: { halign: "center" },
      6: { halign: "center" },
      7: { halign: "right" },
      8: { halign: "center" },
      9: { halign: "right" },
      10: { halign: "right" },
    },
    margin: { left: 16, right: 16 },
  });

  const campaignTableY = lastTableY();
  autoTable(doc, {
    startY: campaignTableY + 7,
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

  const criteriaY = campaignTableY + 9;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(27, 27, 39);
  doc.setFontSize(9);
  doc.text("Critérios de leitura", width / 2 + 4, criteriaY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.4);
  doc.setTextColor(80, 80, 92);
  const criteria = [
    `Data dos leads: ${payload.criteria.leadDate}.`,
    `Atribuição: ${payload.criteria.attributionWindow}.`,
    `Recorrência: ${payload.criteria.recurringRevenue}.`,
    `Performance: ${payload.criteria.campaignPerformance}.`,
    `${payload.kpis.unassignedConfirmedMetaLeads} lead(s) Meta confirmado(s) sem campanha cadastrada não entram na tabela de performance.`,
    `${payload.kpis.pendingMetaLeads} registro(s) permanecem como Meta a validar.`,
  ];
  let lineY = criteriaY + 5;
  for (const item of criteria) {
    const lines = doc.splitTextToSize(item, width / 2 - 22);
    doc.text(lines, width / 2 + 4, lineY);
    lineY += lines.length * 4 + 2;
  }

  doc.addPage();
  addHeader("VENDAS DA UNIDADE E PROCEDIMENTOS", `${payload.unit} | Fechamentos de ${date(payload.from)} a ${date(payload.to)}`);

  autoTable(doc, {
    startY: 34,
    head: [["Pacotes fechados", "Clientes únicos", "Receita total", "Ticket médio", "Sem valor", "Sem procedimentos"]],
    body: [[
      String(payload.salesSummary.totalSales),
      String(payload.salesSummary.uniqueClients),
      currency(payload.salesSummary.totalRevenue),
      currency(payload.salesSummary.averageTicket),
      String(payload.salesSummary.incompleteValueSales),
      String(payload.salesSummary.salesWithoutProcedures),
    ]],
    theme: "grid",
    headStyles: { fillColor: [27, 27, 39], textColor: [255, 255, 255], fontStyle: "bold" },
    bodyStyles: { fontStyle: "bold", textColor: [45, 45, 55] },
    styles: { fontSize: 8, cellPadding: 3, halign: "center" },
    margin: { left: 16, right: 16 },
  });

  const salesDetailY = lastTableY() + 7;
  autoTable(doc, {
    startY: salesDetailY,
    head: [["Tipo de venda", "Pacotes", "Receita"]],
    body: payload.salesByType.map((item) => [
      SALE_TYPE_NAMES[item.type],
      String(item.sales),
      currency(item.revenue),
    ]),
    theme: "grid",
    headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: "bold" },
    styles: { fontSize: 7.4, cellPadding: 2.5 },
    columnStyles: { 1: { halign: "center" }, 2: { halign: "right" } },
    margin: { left: 16, right: width * 0.58 },
  });
  const typeTableY = lastTableY();

  autoTable(doc, {
    startY: salesDetailY,
    head: [["Origem comercial", "Clientes", "Pacotes", "Receita"]],
    body: payload.demandByOrigin.map((item) => [
      DEMAND_ORIGIN_NAMES[item.origin],
      String(item.clients),
      String(item.packages),
      currency(item.revenue),
    ]),
    theme: "grid",
    headStyles: { fillColor: [124, 58, 237], textColor: [255, 255, 255], fontStyle: "bold" },
    styles: { fontSize: 7.4, cellPadding: 2.5, overflow: "linebreak" },
    columnStyles: { 1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "right" } },
    margin: { left: width * 0.44, right: 16 },
  });
  const combinationTableY = lastTableY();

  autoTable(doc, {
    startY: Math.max(typeTableY, combinationTableY) + 7,
    head: [["Procedimento", "Total", "Clientes", "Lead c/ campanha", "Outros leads", "Não é lead", "Receita dos pacotes"]],
    body: payload.procedures.length > 0
      ? payload.procedures.slice(0, 10).map((item) => [
          item.name,
          String(item.packages),
          String(item.clients),
          String(item.byOrigin.lead_com_campanha.packages),
          String(item.byOrigin.outro_lead.packages),
          String(item.byOrigin.nao_lead.packages),
          currency(item.packageRevenue),
        ])
      : [["Nenhum procedimento registrado", "0", "0", "0", "0", "0", currency(0)]],
    theme: "striped",
    headStyles: { fillColor: [6, 104, 225], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    styles: { fontSize: 6.9, cellPadding: 1.8, overflow: "linebreak" },
    columnStyles: {
      0: { cellWidth: 86 },
      1: { halign: "center" },
      2: { halign: "center" },
      3: { halign: "center" },
      4: { halign: "center" },
      5: { halign: "center" },
      6: { halign: "right" },
    },
    margin: { left: 16, right: 16 },
  });

  const noteY = Math.min(lastTableY() + 6, 194);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(90, 90, 102);
  const procedureNote = doc.splitTextToSize(
    "Nota: Receita dos pacotes é o valor total dos pacotes que contêm cada procedimento. Como um pacote pode conter vários procedimentos, os valores das linhas não devem ser somados entre si.",
    width - 32,
  );
  doc.text(procedureNote, 16, noteY);

  doc.addPage();
  addHeader(
    "ITENS VENDIDOS, DESCONTOS E ADICIONAIS",
    `${payload.unit} | Valores exatos dos fechamentos registrados no formato detalhado`,
  );

  autoTable(doc, {
    startY: 34,
    head: [["Pacotes detalhados", "Legado sem detalhe", "Sessões", "Valor pago", "Subtotal tabela", "Desconto", "Sessões cortesia"]],
    body: [[
      String(payload.detailedSales.coverage.detailedDeals),
      String(payload.detailedSales.coverage.legacyDeals),
      String(payload.detailedSales.coverage.sessions),
      currency(payload.detailedSales.coverage.paidRevenue),
      currency(payload.detailedSales.coverage.subtotal),
      currency(payload.detailedSales.coverage.discount),
      String(payload.detailedSales.coverage.courtesySessions),
    ]],
    theme: "grid",
    headStyles: { fillColor: [124, 58, 237], textColor: [255, 255, 255], fontStyle: "bold" },
    bodyStyles: { fontStyle: "bold", textColor: [45, 45, 55] },
    styles: { fontSize: 7.4, cellPadding: 2.7, halign: "center" },
    margin: { left: 16, right: 16 },
  });

  autoTable(doc, {
    startY: lastTableY() + 7,
    head: [["Procedimento", "Sessões", "Pacotes", "Clientes", "Valor pago", "Desconto", "Da campanha", "Adicionais", "Cortesia", "Não é lead"]],
    body: payload.detailedSales.procedures.length > 0
      ? payload.detailedSales.procedures.map((item) => [
          item.name,
          String(item.sessions),
          String(item.packages),
          String(item.clients),
          currency(item.paidRevenue),
          currency(item.discount),
          String(item.includedSessions),
          String(item.additionalSessions),
          String(item.courtesySessions),
          `${item.byOrigin.nao_lead.sessions} / ${currency(item.byOrigin.nao_lead.paidRevenue)}`,
        ])
      : [["Sem fechamentos detalhados", "0", "0", "0", currency(0), currency(0), "0", "0", "0", `0 / ${currency(0)}`]],
    theme: "striped",
    headStyles: { fillColor: [27, 27, 39], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    styles: { fontSize: 6.6, cellPadding: 1.7, overflow: "linebreak" },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { halign: "center" },
      2: { halign: "center" },
      3: { halign: "center" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "center" },
      7: { halign: "center" },
      8: { halign: "center" },
      9: { halign: "right" },
    },
    margin: { left: 16, right: 16 },
  });

  if (payload.detailedSales.packages.length > 0) {
    doc.addPage();
    addHeader(
      "PACOTES DETALHADOS",
      `${payload.unit} | Composição e valor pago por cliente`,
    );
    autoTable(doc, {
      startY: 34,
      head: [["Cliente", "Origem", "Campanha", "Procedimentos", "Sessões", "Valor pago"]],
      body: payload.detailedSales.packages.map((pkg) => [
        pkg.clientName,
        DEMAND_ORIGIN_NAMES[pkg.origin],
        pkg.campaignName || "-",
        pkg.procedures.map((item) => {
          const tags = [
            item.itemType === "courtesy" ? "cortesia" : "",
            item.additionalSessions > 0 ? `+${item.additionalSessions} adicional(is)` : "",
          ].filter(Boolean).join(", ");
          return `${item.name}: ${item.sessions} sessão(ões), ${currency(item.paidAmount)}${tags ? ` (${tags})` : ""}`;
        }).join("\n"),
        String(pkg.sessions),
        currency(pkg.paidRevenue),
      ]),
      theme: "striped",
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [247, 249, 252] },
      styles: { fontSize: 6.8, cellPadding: 2, overflow: "linebreak", valign: "top" },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 30 },
        2: { cellWidth: 36 },
        3: { cellWidth: 118 },
        4: { halign: "center" },
        5: { halign: "right" },
      },
      margin: { left: 16, right: 16 },
    });
  }

  if (payload.detailedSales.campaignUpsell.length > 0) {
    doc.addPage();
    addHeader(
      "ADICIONAIS POR CAMPANHA",
      `${payload.unit} | Sessões contratadas além da oferta padrão`,
    );
    autoTable(doc, {
      startY: 34,
      head: [["Campanha", "Pacotes", "Com adicional", "Taxa", "Incluídas", "Adicionais", "Cortesia", "Valor adicionais", "Valor itens mistos"]],
      body: payload.detailedSales.campaignUpsell.map((campaign) => [
        campaign.campaignName,
        String(campaign.packages),
        String(campaign.packagesWithAdditional),
        `${campaign.additionalAttachRate.toFixed(1)}%`,
        String(campaign.includedSessions),
        String(campaign.additionalSessions),
        String(campaign.courtesySessions),
        currency(campaign.additionalPaidRevenue),
        currency(campaign.mixedPaidRevenue),
      ]),
      theme: "striped",
      headStyles: { fillColor: [192, 38, 211], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 247, 252] },
      styles: { fontSize: 7.1, cellPadding: 2.2, overflow: "linebreak" },
      columnStyles: {
        0: { cellWidth: 58 },
        1: { halign: "center" },
        2: { halign: "center" },
        3: { halign: "center" },
        4: { halign: "center" },
        5: { halign: "center" },
        6: { halign: "center" },
        7: { halign: "right" },
        8: { halign: "right" },
      },
      margin: { left: 16, right: 16 },
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(90, 90, 102);
    doc.text(
      "Valor de itens mistos permanece separado: o mesmo procedimento contém sessões incluídas e adicionais, portanto não há rateio estimado do pagamento.",
      16,
      Math.min(lastTableY() + 6, 194),
    );
  }

  const campaignProcedureRows = payload.campaigns.flatMap((campaign) => {
    if (campaign.buyerClients === 0) return [];
    if (campaign.procedures.length === 0) {
      return [[
        campaign.campaignName,
        "Sem procedimento registrado",
        String(campaign.buyerClients),
        String(campaign.acquisitionPackages),
        currency(campaign.receita),
        campaign.acquisitionPackages > 0 ? currency(campaign.receita / campaign.acquisitionPackages) : currency(0),
      ]];
    }
    return campaign.procedures.map((procedure) => [
      campaign.campaignName,
      procedure.name,
      String(procedure.clients),
      String(procedure.packages),
      currency(procedure.packageRevenue),
      currency(procedure.averagePackageTicket),
    ]);
  });

  if (campaignProcedureRows.length > 0 || payload.procedureCombinations.length > 0) {
    doc.addPage();
    addHeader(
      "PROCEDIMENTOS POR CAMPANHA",
      `${payload.unit} | Primeiras compras atribuídas em até 30 dias`,
    );

    autoTable(doc, {
      startY: 34,
      head: [["Campanha", "Procedimento da primeira compra", "Clientes", "Pacotes", "Valor dos pacotes", "Ticket médio"]],
      body: campaignProcedureRows.length > 0
        ? campaignProcedureRows
        : [["Sem compras atribuídas", "-", "0", "0", currency(0), currency(0)]],
      theme: "striped",
      headStyles: { fillColor: [6, 104, 225], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [247, 249, 252] },
      styles: { fontSize: 7.1, cellPadding: 2.2, overflow: "linebreak" },
      columnStyles: {
        0: { cellWidth: 42 },
        1: { cellWidth: 92 },
        2: { halign: "center" },
        3: { halign: "center" },
        4: { halign: "right" },
        5: { halign: "right" },
      },
      margin: { left: 16, right: 16 },
    });

    autoTable(doc, {
      startY: lastTableY() + 8,
      head: [["Combinações mais vendidas na unidade", "Pacotes", "Receita dos pacotes"]],
      body: payload.procedureCombinations.length > 0
        ? payload.procedureCombinations.slice(0, 8).map((item) => [item.name, String(item.packages), currency(item.revenue)])
        : [["Nenhuma combinação registrada", "0", currency(0)]],
      theme: "grid",
      headStyles: { fillColor: [124, 58, 237], textColor: [255, 255, 255], fontStyle: "bold" },
      styles: { fontSize: 7.1, cellPadding: 2.2, overflow: "linebreak" },
      columnStyles: { 1: { halign: "center" }, 2: { halign: "right" } },
      margin: { left: 16, right: 16 },
    });

    const campaignNoteY = Math.min(lastTableY() + 6, 194);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(90, 90, 102);
    doc.text(
      "Os procedimentos por campanha consideram somente a primeira compra atribuída. Pacotes posteriores permanecem na receita recorrente/LTV.",
      16,
      campaignNoteY,
    );
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
