export const pipelineToClientStage: Record<string, string> = {
  novo_lead: 'entrada',
  em_atendimento: 'em_andamento',
  enviado: 'em_andamento',
  agendado: 'em_andamento',
  em_negociacao: 'avaliacao',
  fechado: 'venda',
  perdido: 'nao_venda',
  finalizado: 'nao_venda',
  encerrado: 'nao_venda',
  descartado: 'nao_venda',
  sem_retorno: 'nao_venda',
  nao_viavel: 'nao_venda',
};

// Mantem a coluna legada `stage` alinhada ao nome real da PipelineStage.
export function pipelineStageKeyFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '_');
}

export function isDiscardPipelineStage(stage?: string | null): boolean {
  return !!stage && ['perdido', 'finalizado', 'encerrado', 'descartado', 'sem_retorno', 'nao_viavel'].includes(stage);
}

export function isScheduledPipelineStage(stage?: string | null): boolean {
  return stage === 'agendado';
}
