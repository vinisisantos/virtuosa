export const PRODUCT_NAME = 'Clínicas Gestão';
export const CONTACT_EMAIL = 'saobernardo@clinicavirtuosa.com';
export const DEMO_CTA = 'Solicitar demonstração';
export const CONTACT_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Solicitar demonstração do Clínicas Gestão')}`;

export type ProductItem = { title: string; text: string };

export const PAIN_POINTS: ProductItem[] = [
  { title: 'Conversa sem resposta', text: 'O anúncio abre o WhatsApp, a conversa se perde entre vários celulares e o interesse esfria.' },
  { title: 'Origem invisível', text: 'Sem saber qual campanha trouxe cada cliente, fica difícil decidir onde investir.' },
  { title: 'Informação espalhada', text: 'Agenda, contratos, pagamentos e custos em planilhas e sistemas que não conversam.' },
];

export const MODULES: ProductItem[] = [
  { title: 'WhatsApp da equipe', text: 'Centralize as conversas com responsáveis definidos e acesso conforme as permissões da equipe.' },
  { title: 'Funil por unidade', text: 'Acompanhe cada contato até o fechamento e transfira atendimentos entre unidades mantendo o registro da unidade de origem.' },
  { title: 'Origem das campanhas', text: 'Identifique a origem dos contatos quando os dados do anúncio estiverem disponíveis para acompanhar o resultado das campanhas.' },
  { title: 'Agenda', text: 'Organize avaliações e sessões por profissional e unidade para consultar os horários da equipe.' },
  { title: 'Contratos digitais', text: 'Gere contratos a partir de modelos e acompanhe o envio e a assinatura eletrônica.' },
  { title: 'Pagamentos e cancelamentos', text: 'Mantenha recebimentos, pacotes e cancelamentos vinculados ao cliente para consultar o que foi contratado e registrado.' },
  { title: 'Custos e DRE gerencial', text: 'Veja as despesas por categoria e o resultado financeiro do mês, com separação por unidade.' },
  { title: 'Relatórios', text: 'Acompanhe indicadores comerciais e consulte o histórico de cada cliente em relatórios exportáveis para PDF.' },
];

export const ALICE_POINTS: string[] = [
  'Prepara sugestões de resposta para a equipe revisar, editar e enviar.',
  'No modo automático habilitado, conduz conversas e pode agendar avaliações conforme as regras configuradas.',
  'É orientada a encaminhar questões de saúde à profissional habilitada, sem fazer diagnósticos, indicar doses ou prometer resultados.',
  'Sinaliza a necessidade de apoio humano e permite que a equipe assuma a conversa.',
];

export const PIPELINE_PREVIEW = [
  { stage: 'Novo lead', cards: ['Glúteos · Campanha 120 ml', 'Barriga Trincada'] },
  { stage: 'Avaliação', cards: ['Lipo Laser · sábado de manhã'] },
  { stage: 'Fechado', cards: ['Gordura Localizada · contrato assinado'] },
];
