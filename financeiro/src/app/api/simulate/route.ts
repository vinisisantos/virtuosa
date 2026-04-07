import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * POST /api/simulate — Simula os fluxos do sistema Meta CRM.
 * 
 * Aceita um body JSON com { action: string } para cada tipo de simulação:
 * 
 *  - "lead"        → Simula recebimento de um Lead Ad da Meta
 *  - "message_in"  → Simula recebimento de mensagem WhatsApp
 *  - "full_flow"   → Simula o fluxo completo: lead + conversa + mensagens
 *  - "seed"        → Popula dados de demonstração (10 leads, pipeline, conversas)
 *  - "cleanup"     → Remove TODOS os dados simulados
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = body.action || 'lead';

    switch (action) {
      case 'lead':
        return simulateLead(body);
      case 'message_in':
        return simulateInboundMessage(body);
      case 'full_flow':
        return simulateFullFlow();
      case 'seed':
        return seedDemoData();
      case 'cleanup':
        return cleanupSimulation();
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error('[Simulate] Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// GET — show available actions
export async function GET() {
  return NextResponse.json({
    info: 'API de Simulação do Meta CRM',
    actions: {
      lead: 'Simula recebimento de um Lead Ad da Meta',
      message_in: 'Simula recebimento de mensagem WhatsApp',
      full_flow: 'Simula fluxo completo: lead → conversa → mensagens',
      seed: 'Popula dados de demonstração (10 leads + pipeline + conversas)',
      cleanup: 'Remove todos os dados simulados (tag SIMULACAO)',
    },
    usage: 'POST /api/simulate com body { "action": "seed" }',
  });
}

// ─── Simulate a single lead from Meta Lead Ads ───
async function simulateLead(body: { name?: string; phone?: string; email?: string }) {
  const names = [
    'Ana Silva', 'Mariana Costa', 'Juliana Oliveira', 'Fernanda Santos',
    'Camila Pereira', 'Beatriz Lima', 'Carolina Souza', 'Isabela Ferreira',
    'Larissa Rodrigues', 'Amanda Almeida',
  ];
  const name = body.name || names[Math.floor(Math.random() * names.length)];
  const phone = body.phone || `+5511${Math.floor(900000000 + Math.random() * 99999999)}`;
  const email = body.email || `${name.toLowerCase().replace(/\s/g, '.')}@email.com`;
  const leadgenId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // 1. Create MetaLead
  const metaLead = await prisma.metaLead.create({
    data: {
      leadgenId,
      formId: 'form_demo_001',
      formName: 'Formulário Avaliação Grátis',
      adId: 'ad_demo_001',
      adName: 'Campanha Verão 2026',
      campaignId: 'campaign_demo_001',
      campaignName: 'Estética Corporal - Verão',
      platform: Math.random() > 0.5 ? 'instagram' : 'facebook',
      name,
      email,
      phone,
      rawData: JSON.stringify({ simulated: true, timestamp: new Date().toISOString() }),
      status: 'processado',
      processedAt: new Date(),
    },
  });

  // 2. Check for duplicate client
  const cleanPhone = phone.replace('+55', '').slice(-11);
  let client = await prisma.client.findFirst({
    where: {
      OR: [
        { phone: { contains: cleanPhone } },
        { email },
      ],
      isActive: true,
    },
  });

  let isDuplicate = false;
  if (client) {
    isDuplicate = true;
    await prisma.client.update({
      where: { id: client.id },
      data: {
        tags: client.tags?.includes('SIMULACAO') ? client.tags : (client.tags ? client.tags + ',SIMULACAO' : 'SIMULACAO,Meta Ads'),
      },
    });
  } else {
    client = await prisma.client.create({
      data: {
        name,
        phone,
        email,
        source: 'instagram',
        stage: 'entrada',
        unit: 'Barueri',
        tags: 'SIMULACAO,Meta Ads',
      },
    });
  }

  // 3. Update MetaLead with clientId
  await prisma.metaLead.update({
    where: { id: metaLead.id },
    data: { clientId: client.id },
  });

  // 4. Create pipeline entry
  const stages = ['novo_lead', 'em_atendimento', 'em_negociacao'];
  const stage = stages[Math.floor(Math.random() * stages.length)];
  const values = [0, 500, 1200, 2500, 3800, 5000];
  const value = values[Math.floor(Math.random() * values.length)];

  const pipeline = await prisma.salesPipeline.create({
    data: {
      clientId: client.id,
      clientName: name,
      stage,
      value,
      source: 'meta_ads',
      unit: 'Barueri',
      leadId: metaLead.id,
      notes: 'Lead simulado para demonstração',
    },
  });

  // 5. Create WhatsApp conversation
  const waId = phone.replace('+', '');
  let conversation = await prisma.whatsAppConversation.findUnique({ where: { waId } });

  if (!conversation) {
    conversation = await prisma.whatsAppConversation.create({
      data: {
        waId,
        contactName: name,
        contactPhone: phone,
        clientId: client.id,
        source: 'meta_ads',
        adName: 'Campanha Verão 2026',
        status: 'aberta',
        unit: 'Barueri',
      },
    });
  }

  // 6. Log webhook
  await prisma.webhookLog.create({
    data: {
      source: 'meta_lead',
      eventType: 'leadgen',
      payload: JSON.stringify({ leadgen_id: leadgenId, simulated: true }),
      status: 'processed',
      processedAt: new Date(),
    },
  });

  return NextResponse.json({
    success: true,
    message: `✅ Lead simulado: ${name}`,
    data: {
      isDuplicate,
      metaLeadId: metaLead.id,
      clientId: client.id,
      pipelineId: pipeline.id,
      conversationId: conversation.id,
      stage,
      value,
    },
  });
}

// ─── Simulate an inbound WhatsApp message ───
async function simulateInboundMessage(body: { conversationId?: string; message?: string }) {
  // Find a conversation to add a message to
  let conversation;
  if (body.conversationId) {
    conversation = await prisma.whatsAppConversation.findUnique({ where: { id: body.conversationId } });
  } else {
    conversation = await prisma.whatsAppConversation.findFirst({ orderBy: { lastMessageAt: 'desc' } });
  }

  if (!conversation) {
    return NextResponse.json({ error: 'Nenhuma conversa encontrada. Execute "seed" ou "lead" primeiro.' }, { status: 404 });
  }

  const messages = [
    'Olá, vi o anúncio de vocês no Instagram! Gostaria de agendar uma avaliação.',
    'Boa tarde! Quanto custa o pacote de depilação a laser?',
    'Oi, tenho interesse nos procedimentos estéticos. Quais vocês oferecem?',
    'Olá! Vi que vocês têm promoção. Ainda está valendo?',
    'Bom dia! Gostaria de saber mais sobre o tratamento corporal.',
    'Oi, uma amiga indicou vocês. Como faço para agendar?',
    'Olá! Vocês atendem aos sábados?',
    'Boa tarde, gostaria de remarcar minha sessão.',
  ];

  const msgText = body.message || messages[Math.floor(Math.random() * messages.length)];
  const msgId = `sim_msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const message = await prisma.whatsAppMessage.create({
    data: {
      conversationId: conversation.id,
      waMessageId: msgId,
      direction: 'inbound',
      type: 'text',
      body: msgText,
      status: 'delivered',
      timestamp: new Date(),
    },
  });

  await prisma.whatsAppConversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: new Date(),
      unreadCount: { increment: 1 },
      status: 'aberta',
    },
  });

  return NextResponse.json({
    success: true,
    message: `✅ Mensagem simulada de ${conversation.contactName}: "${msgText.substring(0, 50)}..."`,
    data: {
      messageId: message.id,
      conversationId: conversation.id,
      contactName: conversation.contactName,
    },
  });
}

// ─── Simulate the full flow ───
async function simulateFullFlow() {
  const results = [];

  // Create a lead
  const leadRes = await simulateLead({
    name: 'Maria Demonstração',
    phone: `+5511${Math.floor(900000000 + Math.random() * 99999999)}`,
    email: `maria.demo.${Date.now()}@email.com`,
  });
  const leadData = await leadRes.json();
  results.push({ step: '1. Lead criado', ...leadData });

  // Add some messages to the conversation
  if (leadData.data?.conversationId) {
    const msgs = [
      'Oi, vi o anúncio no Instagram e quero saber mais!',
      'Quais procedimentos estéticos vocês oferecem?',
      'Qual o valor de um pacote completo?',
    ];

    for (let i = 0; i < msgs.length; i++) {
      // Inbound message
      const inRes = await simulateInboundMessage({
        conversationId: leadData.data.conversationId,
        message: msgs[i],
      });
      const inData = await inRes.json();
      results.push({ step: `2.${i + 1} Mensagem recebida`, ...inData });

      // Outbound response
      const outMsgs = [
        'Olá Maria! Tudo bem? 😊 Somos a Virtuosa Estética. Fico feliz pelo interesse!',
        'Oferecemos depilação a laser, tratamentos corporais, faciais e muito mais!',
        'Nossos pacotes começam a partir de R$ 1.200. Posso agendar uma avaliação grátis para você? 💖',
      ];

      await prisma.whatsAppMessage.create({
        data: {
          conversationId: leadData.data.conversationId,
          waMessageId: `sim_out_${Date.now()}_${i}`,
          direction: 'outbound',
          type: 'text',
          body: outMsgs[i],
          sentBy: 'Vinicius',
          status: 'delivered',
          timestamp: new Date(Date.now() + (i * 30000) + 15000),
        },
      });
      results.push({ step: `2.${i + 1}b Resposta enviada`, message: outMsgs[i].substring(0, 50) + '...' });
    }
  }

  return NextResponse.json({
    success: true,
    message: '✅ Fluxo completo simulado: Lead → CRM → Pipeline → Conversa com mensagens',
    results,
  });
}

// ─── Seed demonstration data ───
async function seedDemoData() {
  const leads = [
    { name: 'Ana Carolina Silva', phone: '+5511987654321', email: 'ana.silva@email.com', stage: 'novo_lead', value: 0 },
    { name: 'Mariana Costa Oliveira', phone: '+5511976543210', email: 'mariana.costa@email.com', stage: 'novo_lead', value: 0 },
    { name: 'Juliana Ferreira Santos', phone: '+5511965432109', email: 'juliana.f@email.com', stage: 'em_atendimento', value: 2500 },
    { name: 'Fernanda Lima Pereira', phone: '+5511954321098', email: 'fernanda.lima@email.com', stage: 'em_atendimento', value: 1800 },
    { name: 'Camila Souza Rodrigues', phone: '+5511943210987', email: 'camila.souza@email.com', stage: 'em_negociacao', value: 5200 },
    { name: 'Beatriz Almeida Costa', phone: '+5511932109876', email: 'beatriz.a@email.com', stage: 'em_negociacao', value: 3800 },
    { name: 'Carolina Santos Lima', phone: '+5511921098765', email: 'carolina.s@email.com', stage: 'fechado', value: 4500 },
    { name: 'Isabela Oliveira', phone: '+5511910987654', email: 'isabela.o@email.com', stage: 'fechado', value: 6200 },
    { name: 'Larissa Pereira', phone: '+5511909876543', email: 'larissa.p@email.com', stage: 'perdido', value: 2000 },
    { name: 'Amanda Rodrigues', phone: '+5511998765432', email: 'amanda.r@email.com', stage: 'novo_lead', value: 0 },
  ];

  const created = [];

  for (const lead of leads) {
    // Create client
    const client = await prisma.client.create({
      data: {
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        source: 'instagram',
        stage: 'entrada',
        unit: 'Barueri',
        tags: 'SIMULACAO,Meta Ads',
        totalSpent: lead.stage === 'fechado' ? lead.value : 0,
        visitCount: lead.stage === 'fechado' ? 3 : lead.stage === 'em_negociacao' ? 1 : 0,
      },
    });

    // Create MetaLead
    const metaLead = await prisma.metaLead.create({
      data: {
        leadgenId: `sim_seed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        formName: 'Formulário Avaliação Grátis',
        campaignName: 'Campanha Verão 2026',
        platform: Math.random() > 0.4 ? 'instagram' : 'facebook',
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        clientId: client.id,
        status: 'processado',
        processedAt: new Date(Date.now() - Math.random() * 7 * 86400000),
      },
    });

    // Create pipeline
    await prisma.salesPipeline.create({
      data: {
        clientId: client.id,
        clientName: lead.name,
        stage: lead.stage,
        value: lead.value,
        source: 'meta_ads',
        unit: 'Barueri',
        leadId: metaLead.id,
        lostReason: lead.stage === 'perdido' ? 'Achou caro, vai comparar em outro lugar' : undefined,
        closedAt: ['fechado', 'perdido'].includes(lead.stage) ? new Date() : undefined,
      },
    });

    // Create conversation with messages
    const waId = lead.phone.replace('+', '');
    const conversation = await prisma.whatsAppConversation.create({
      data: {
        waId,
        contactName: lead.name,
        contactPhone: lead.phone,
        clientId: client.id,
        source: 'meta_ads',
        adName: 'Campanha Verão 2026',
        status: lead.stage === 'fechado' || lead.stage === 'perdido' ? 'finalizada' : 'aberta',
        unit: 'Barueri',
        unreadCount: lead.stage === 'novo_lead' ? Math.floor(Math.random() * 3) + 1 : 0,
        lastMessageAt: new Date(Date.now() - Math.random() * 3 * 86400000),
      },
    });

    // Add realistic messages
    const convMessages = [
      { dir: 'inbound', body: `Oi, vi o anúncio de vocês! Gostaria de saber mais sobre os procedimentos.`, delay: 0 },
      { dir: 'outbound', body: `Olá ${lead.name.split(' ')[0]}! 😊 Que bom que nos encontrou! Somos a Virtuosa Estética. O que te interessou?`, delay: 60000 },
      { dir: 'inbound', body: `Quero saber sobre depilação a laser e tratamento corporal`, delay: 180000 },
    ];

    if (lead.stage !== 'novo_lead') {
      convMessages.push(
        { dir: 'outbound', body: `Perfeito! Temos pacotes ótimos. Posso te agendar uma avaliação gratuita? 💖`, delay: 240000 },
        { dir: 'inbound', body: `Sim! Pode ser na próxima semana?`, delay: 300000 },
      );
    }

    if (lead.stage === 'em_negociacao' || lead.stage === 'fechado') {
      convMessages.push(
        { dir: 'outbound', body: `Claro! O pacote completo fica R$ ${lead.value.toLocaleString('pt-BR')}. Parcelamos em até 12x no cartão.`, delay: 360000 },
        { dir: 'inbound', body: lead.stage === 'fechado' ? `Fechado! Vou querer sim 🎉` : `Vou pensar e te retorno...`, delay: 420000 },
      );
    }

    const baseTime = Date.now() - Math.random() * 5 * 86400000;
    for (let i = 0; i < convMessages.length; i++) {
      const m = convMessages[i];
      await prisma.whatsAppMessage.create({
        data: {
          conversationId: conversation.id,
          waMessageId: `sim_seed_msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          direction: m.dir,
          type: 'text',
          body: m.body,
          sentBy: m.dir === 'outbound' ? 'Vinicius' : undefined,
          status: 'delivered',
          timestamp: new Date(baseTime + m.delay),
        },
      });
    }

    created.push({ name: lead.name, stage: lead.stage, value: lead.value });
  }

  // Create some webhook logs
  const logSources = ['meta_lead', 'meta_message', 'meta_message'];
  const logStatuses = ['processed', 'processed', 'error', 'processed', 'processed'];
  for (let i = 0; i < 8; i++) {
    await prisma.webhookLog.create({
      data: {
        source: logSources[i % logSources.length],
        eventType: logSources[i % logSources.length] === 'meta_lead' ? 'leadgen' : 'messages',
        status: logStatuses[i % logStatuses.length],
        errorMessage: logStatuses[i % logStatuses.length] === 'error' ? 'Token expirado - necessário renovar' : null,
        processedAt: logStatuses[i % logStatuses.length] !== 'error' ? new Date() : null,
        createdAt: new Date(Date.now() - i * 3600000),
      },
    });
  }

  // Create MetaConfig (demo values)
  await prisma.metaConfig.upsert({
    where: { unit: 'Barueri' },
    create: {
      appId: 'DEMO_APP_ID',
      verifyToken: 'virtuosa_verify_2026',
      unit: 'Barueri',
      isActive: true,
    },
    update: {},
  });

  return NextResponse.json({
    success: true,
    message: `✅ Dados de demonstração criados: ${created.length} leads com conversas e pipeline`,
    data: {
      leadsCreated: created.length,
      leads: created,
      summary: {
        novo_lead: created.filter(l => l.stage === 'novo_lead').length,
        em_atendimento: created.filter(l => l.stage === 'em_atendimento').length,
        em_negociacao: created.filter(l => l.stage === 'em_negociacao').length,
        fechado: created.filter(l => l.stage === 'fechado').length,
        perdido: created.filter(l => l.stage === 'perdido').length,
      },
    },
  });
}

// ─── Cleanup simulation data ───
async function cleanupSimulation() {
  // Find clients with SIMULACAO tag
  const simClients = await prisma.client.findMany({
    where: { tags: { contains: 'SIMULACAO' } },
    select: { id: true, phone: true },
  });

  const clientIds = simClients.map(c => c.id);

  // Delete in order (foreign key constraints)
  // 1. Messages in conversations linked to these clients
  const conversations = await prisma.whatsAppConversation.findMany({
    where: { clientId: { in: clientIds } },
    select: { id: true },
  });
  const convIds = conversations.map(c => c.id);

  const deletedMessages = await prisma.whatsAppMessage.deleteMany({
    where: { conversationId: { in: convIds } },
  });

  // 2. Conversations
  const deletedConversations = await prisma.whatsAppConversation.deleteMany({
    where: { clientId: { in: clientIds } },
  });

  // 3. Pipeline entries
  const deletedPipeline = await prisma.salesPipeline.deleteMany({
    where: { clientId: { in: clientIds } },
  });

  // 4. MetaLeads
  const deletedLeads = await prisma.metaLead.deleteMany({
    where: { clientId: { in: clientIds } },
  });

  // 5. Clients
  const deletedClients = await prisma.client.deleteMany({
    where: { tags: { contains: 'SIMULACAO' } },
  });

  // 6. Simulated webhook logs
  const deletedLogs = await prisma.webhookLog.deleteMany({
    where: { payload: { contains: 'simulated' } },
  });

  return NextResponse.json({
    success: true,
    message: '🗑️ Dados de simulação removidos',
    deleted: {
      clients: deletedClients.count,
      leads: deletedLeads.count,
      pipeline: deletedPipeline.count,
      conversations: deletedConversations.count,
      messages: deletedMessages.count,
      webhookLogs: deletedLogs.count,
    },
  });
}
