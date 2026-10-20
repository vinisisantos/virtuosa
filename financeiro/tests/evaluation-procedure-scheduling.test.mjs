import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

let existing, created, updated, settingsReads, locked;
globalThis.prisma = {};
const { upsertPipelineEvaluationAppointment } = await import('../src/lib/evaluation-scheduling.ts');
const { EVALUATION_GROUP_INSTANCE_ID } = await import('../src/lib/whatsapp/evaluation-group-notice-config.ts');

function database(unit = 'SBC') {
  return {
    $executeRaw: async () => { locked = true; return 1; },
    $queryRaw: async () => existing ? [{ ...existing, unit }] : [],
    user: { findFirst: async () => ({ id: 'operator', name: 'Operadora', unit, permissions: { crm: true } }) },
    profissional: { findFirst: async () => ({ id: 'professional', name: 'Operadora', unit }) },
    agendamento: {
      findFirst: async () => { if (unit === 'SBC') assert.ok(locked); return existing; },
      create: async ({ data }) => {
        created.push(data);
        return { id: 'appointment', createdAt: new Date(), ...data };
      },
      update: async ({ data }) => {
        updated.push(data);
        return { ...existing, ...data };
      },
    },
    appSetting: { findUnique: async () => { settingsReads++; return null; } },
    whatsAppEvaluationGroupNotice: { upsert: async () => { throw new Error('configuração desligada não deve enfileirar'); } },
  };
}
function request(overrides = {}) {
  return {
    deal: { id: 'deal', clientName: 'Cliente Teste', unit: 'SBC' },
    clientPhone: '5511900000001',
    startTime: new Date(Date.now() + 86400000),
    assigneeUserId: 'operator',
    sourceInstanceId: EVALUATION_GROUP_INSTANCE_ID,
    ...overrides,
  };
}
beforeEach(() => { existing = null; created = []; updated = []; settingsReads = 0; locked = false; });

test('nova avaliação elegível exige procedimento explícito antes de criar agenda', async () => {
  await assert.rejects(upsertPipelineEvaluationAppointment(request(), database()), /procedimento de interesse/);
  assert.equal(created.length, 0);
  assert.equal(settingsReads, 0);
});

test('persiste procedimento sem mudar tipo Avaliação e não envia com configuração desligada', async () => {
  const appointment = await upsertPipelineEvaluationAppointment(request({ evaluationProcedure: '  Tratamento  corporal ' }), database());
  assert.equal(appointment.procedimento, 'Avaliação');
  assert.equal(appointment.evaluationProcedure, 'Tratamento corporal');
  assert.equal(appointment.evaluationGroupNoticeId, null);
  assert.equal(created.length, 1);
  assert.equal(settingsReads, 1);
});

test('editar ou reagendar avaliação antiga com gate desligado não exige campo nem enfileira aviso', async () => {
  existing = { id: 'old', createdAt: new Date(0), updatedAt: new Date(), unit:'SBC', evaluationProcedure: 'Tratamento anterior', startTime: new Date(0), status: 'confirmado' };
  const appointment = await upsertPipelineEvaluationAppointment(request({ evaluationProcedure: '' }), database());
  assert.equal(appointment.evaluationProcedure, 'Tratamento anterior');
  assert.equal(appointment.status, 'pendente');
  assert.equal(appointment.evaluationGroupNoticeId, null);
  assert.equal(updated.length, 1);
  assert.equal(created.length, 0);
  assert.equal(settingsReads, 1);
});

test('outra caixa SBC e outras unidades preservam criação sem procedimento adicional', async () => {
  const otherInstanceDb = database();
  otherInstanceDb.agendamento.findFirst = async () => existing;
  await upsertPipelineEvaluationAppointment(request({ sourceInstanceId: 'outra-caixa' }), otherInstanceDb);
  await upsertPipelineEvaluationAppointment(request({ deal: { id: 'other', clientName: 'Teste', unit: 'SCS' } }), database('SCS'));
  assert.equal(created.length, 2);
  assert.equal(settingsReads, 0);
  assert.equal(locked, false);
});

test('concorrência por negócio encontra avaliação criada pela transação anterior e não duplica', async () => {
  let tail = Promise.resolve();
  const run = async () => {
    const db = database();
    let release;
    db.$executeRaw = async () => {
      const previous = tail;
      tail = new Promise((resolve) => { release = resolve; });
      await previous;
      locked = true;
      return 1;
    };
    db.agendamento.create = async ({ data }) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      created.push(data);
      existing = { id: 'concurrent-appointment', createdAt: new Date(), ...data };
      return existing;
    };
    try {
      return await upsertPipelineEvaluationAppointment(request({ evaluationProcedure: 'Tratamento corporal' }), db);
    } finally {
      release?.();
    }
  };
  const results = await Promise.all([run(), run()]);
  assert.equal(created.length, 1);
  assert.equal(updated.length, 1);
  assert.equal(settingsReads, 1);
  assert.equal(results[0].id, results[1].id);
});

test('novo agendamento rejeita telefone como nome em todas as unidades', async () => {
  for (const unit of ['SBC', 'Osasco', 'SCS']) {
    await assert.rejects(upsertPipelineEvaluationAppointment(request({
      deal: { id: 'deal', clientName: '(11) 99999-9999', unit },
      evaluationProcedure: 'Tratamento corporal',
    }), database(unit)), { code: 'EVALUATION_CLIENT_NAME_REQUIRED' });
  }
  assert.equal(created.length, 0);
  assert.equal(updated.length, 0);
});

test('releitura protegida impede request antigo de substituir nome corrigido por telefone', async () => {
  const startTime = new Date(Date.now() + 86400000);
  existing = { id: 'old', createdAt: new Date(0), clientName: '(11) 99999-9999', unit: 'SBC', startTime, status: 'pendente' };
  const db = database();
  db.$queryRaw = async () => [{ ...existing, clientName: 'Ana' }];
  await assert.rejects(upsertPipelineEvaluationAppointment(request({
    deal: { id: 'deal', clientName: '(11) 99999-9999', unit: 'SBC' }, startTime,
  }), db), { code: 'EVALUATION_CLIENT_NAME_REQUIRED' });
  assert.equal(created.length, 0);
  assert.equal(updated.length, 0);
});
