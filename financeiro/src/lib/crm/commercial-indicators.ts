export type CommercialIndicatorLead = {
  key: string;
  clientId: string;
  conversationId: string;
  receivedAt: Date | string;
  campaignLabel: string;
  assigneeLabel: string;
};

export type CommercialIndicatorMessage = {
  conversationId: string;
  fromMe: boolean;
  timestamp: Date | string;
};

export type CommercialIndicatorAppointment = {
  clientId: string;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type AuditedRate = {
  numerator: number;
  denominator: number;
  percentage: number;
};

export type CommercialIndicatorSnapshot = {
  received: number;
  contacted: number;
  responded: number;
  scheduled: number;
  attended: number;
  missed: number;
  closed: number;
  notClosed: number;
  rates: {
    response: AuditedRate;
    scheduling: AuditedRate;
    attendance: AuditedRate;
    closing: AuditedRate;
    sla15: AuditedRate;
  };
  firstResponseMinutes: {
    average: number | null;
    median: number | null;
    p90: number | null;
    sampleSize: number;
  };
};

export type CommercialIndicatorBreakdown = CommercialIndicatorSnapshot & {
  label: string;
};

export type CommercialIndicators = {
  totals: CommercialIndicatorSnapshot;
  byCampaign: CommercialIndicatorBreakdown[];
  byAssignee: CommercialIndicatorBreakdown[];
  coverage: {
    campaignClassified: number;
    campaignUnclassified: number;
    assigned: number;
    unassigned: number;
  };
};

type LeadFact = CommercialIndicatorLead & {
  contacted: boolean;
  responded: boolean;
  firstResponseMinutes: number | null;
  appointmentStatus: string | null;
};

const ATTENDED_STATUSES = new Set(["compareceu", "fechou_pacote", "nao_fechou"]);
const UNCLASSIFIED_CAMPAIGN = "Sem campanha classificada";
const UNASSIGNED = "Sem responsável";

function timestamp(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function auditedRate(numerator: number, denominator: number): AuditedRate {
  return {
    numerator,
    denominator,
    percentage: denominator > 0 ? roundOne((numerator / denominator) * 100) : 0,
  };
}

function percentile(sortedValues: number[], percentileValue: number) {
  if (sortedValues.length === 0) return null;
  const index = Math.max(0, Math.ceil(percentileValue * sortedValues.length) - 1);
  return sortedValues[index];
}

function median(sortedValues: number[]) {
  if (sortedValues.length === 0) return null;
  const middle = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2 === 0
    ? (sortedValues[middle - 1] + sortedValues[middle]) / 2
    : sortedValues[middle];
}

function summarize(facts: LeadFact[]): CommercialIndicatorSnapshot {
  const received = facts.length;
  const contacted = facts.filter((fact) => fact.contacted).length;
  const responded = facts.filter((fact) => fact.responded).length;
  const scheduled = facts.filter((fact) => fact.appointmentStatus !== null).length;
  const attended = facts.filter((fact) => ATTENDED_STATUSES.has(fact.appointmentStatus || "")).length;
  const missed = facts.filter((fact) => fact.appointmentStatus === "nao_compareceu").length;
  const closed = facts.filter((fact) => fact.appointmentStatus === "fechou_pacote").length;
  const notClosed = facts.filter((fact) => fact.appointmentStatus === "nao_fechou").length;
  const responseTimes = facts
    .map((fact) => fact.firstResponseMinutes)
    .filter((value): value is number => value !== null)
    .sort((first, second) => first - second);
  const withinSla = responseTimes.filter((minutes) => minutes <= 15).length;
  const medianResponse = median(responseTimes);
  const p90Response = percentile(responseTimes, 0.9);

  return {
    received,
    contacted,
    responded,
    scheduled,
    attended,
    missed,
    closed,
    notClosed,
    rates: {
      response: auditedRate(responded, contacted),
      scheduling: auditedRate(scheduled, received),
      attendance: auditedRate(attended, attended + missed),
      closing: auditedRate(closed, closed + notClosed),
      sla15: auditedRate(withinSla, responseTimes.length),
    },
    firstResponseMinutes: {
      average: responseTimes.length > 0
        ? roundOne(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length)
        : null,
      median: medianResponse === null ? null : roundOne(medianResponse),
      p90: p90Response === null ? null : roundOne(p90Response),
      sampleSize: responseTimes.length,
    },
  };
}

function groupedBreakdown(facts: LeadFact[], labelFor: (fact: LeadFact) => string) {
  const grouped = new Map<string, LeadFact[]>();
  for (const fact of facts) {
    const label = labelFor(fact);
    const values = grouped.get(label) || [];
    values.push(fact);
    grouped.set(label, values);
  }

  return [...grouped.entries()]
    .map(([label, values]) => ({ label, ...summarize(values) }))
    .sort((first, second) => second.received - first.received || first.label.localeCompare(second.label, "pt-BR"));
}

function factsFrom(params: {
  leads: CommercialIndicatorLead[];
  messages: CommercialIndicatorMessage[];
  appointments: CommercialIndicatorAppointment[];
}) {
  const messagesByConversation = new Map<string, Array<CommercialIndicatorMessage & { time: number }>>();
  for (const message of params.messages) {
    const time = timestamp(message.timestamp);
    if (time === null) continue;
    const values = messagesByConversation.get(message.conversationId) || [];
    values.push({ ...message, time });
    messagesByConversation.set(message.conversationId, values);
  }
  for (const values of messagesByConversation.values()) {
    values.sort((first, second) => first.time - second.time);
  }

  const leadsByConversation = new Map<string, Array<CommercialIndicatorLead & { time: number }>>();
  const leadsByClient = new Map<string, Array<CommercialIndicatorLead & { time: number }>>();
  for (const lead of params.leads) {
    const time = timestamp(lead.receivedAt);
    if (time === null) continue;
    const normalized = { ...lead, time };
    const conversationLeads = leadsByConversation.get(lead.conversationId) || [];
    conversationLeads.push(normalized);
    leadsByConversation.set(lead.conversationId, conversationLeads);
    const clientLeads = leadsByClient.get(lead.clientId) || [];
    clientLeads.push(normalized);
    leadsByClient.set(lead.clientId, clientLeads);
  }
  for (const values of [...leadsByConversation.values(), ...leadsByClient.values()]) {
    values.sort((first, second) => first.time - second.time);
  }

  const appointmentsByLead = new Map<string, Array<CommercialIndicatorAppointment & { time: number }>>();
  for (const appointment of params.appointments) {
    // O ciclo comercial é definido pelo momento em que a avaliação foi criada.
    // Uma mudança posterior de status não pode atribuí-la a um lead mais recente.
    const effectiveTime = timestamp(appointment.createdAt);
    if (effectiveTime === null) continue;
    const eligibleLeads = (leadsByClient.get(appointment.clientId) || [])
      .filter((lead) => lead.time <= effectiveTime);
    const targetLead = eligibleLeads.at(-1);
    if (!targetLead) continue;
    const values = appointmentsByLead.get(targetLead.key) || [];
    values.push({ ...appointment, time: effectiveTime });
    appointmentsByLead.set(targetLead.key, values);
  }

  return params.leads.flatMap((lead): LeadFact[] => {
    const receivedAt = timestamp(lead.receivedAt);
    if (receivedAt === null) return [];
    const conversationLeads = leadsByConversation.get(lead.conversationId) || [];
    const position = conversationLeads.findIndex((item) => item.key === lead.key);
    const nextLeadAt = position >= 0 ? conversationLeads[position + 1]?.time : undefined;
    const messageWindow = (messagesByConversation.get(lead.conversationId) || [])
      .filter((message) => message.time >= receivedAt && (nextLeadAt === undefined || message.time < nextLeadAt));
    const firstOutbound = messageWindow.find((message) => message.fromMe);
    const firstInboundAfterOutbound = firstOutbound
      ? messageWindow.find((message) => !message.fromMe && message.time > firstOutbound.time)
      : undefined;
    const leadAppointments = (appointmentsByLead.get(lead.key) || [])
      .sort((first, second) => second.time - first.time);

    return [{
      ...lead,
      campaignLabel: lead.campaignLabel.trim() || UNCLASSIFIED_CAMPAIGN,
      assigneeLabel: lead.assigneeLabel.trim() || UNASSIGNED,
      contacted: !!firstOutbound,
      responded: !!firstInboundAfterOutbound,
      firstResponseMinutes: firstOutbound
        ? Math.max(0, (firstOutbound.time - receivedAt) / 60_000)
        : null,
      appointmentStatus: leadAppointments[0]?.status || null,
    }];
  });
}

export function buildCommercialIndicators(params: {
  leads: CommercialIndicatorLead[];
  messages: CommercialIndicatorMessage[];
  appointments: CommercialIndicatorAppointment[];
}): CommercialIndicators {
  const facts = factsFrom(params);
  const campaignClassified = facts.filter((fact) => fact.campaignLabel !== UNCLASSIFIED_CAMPAIGN).length;
  const assigned = facts.filter((fact) => fact.assigneeLabel !== UNASSIGNED).length;

  return {
    totals: summarize(facts),
    byCampaign: groupedBreakdown(facts, (fact) => fact.campaignLabel),
    byAssignee: groupedBreakdown(facts, (fact) => fact.assigneeLabel),
    coverage: {
      campaignClassified,
      campaignUnclassified: facts.length - campaignClassified,
      assigned,
      unassigned: facts.length - assigned,
    },
  };
}
