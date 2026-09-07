import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { inboxAppointmentsQuery, inboxAppointmentSnapshot } from '../src/lib/whatsapp/inbox-appointments-query.ts';
import { withInboxAppointment } from '../src/lib/whatsapp/inbox-appointments.ts';
import { inboxSlaSnapshot } from '../src/lib/whatsapp/inbox-sla.ts';
async function fixture() {
    const pg = new PGlite();
    await pg.exec(`
    CREATE TABLE "Agendamento" (id text, unit text, "startTime" timestamp, "clientPhone" text, procedimento text, status text);
    CREATE TABLE "WhatsAppContact" (id text, phone text, unit text);
    CREATE TABLE "WhatsAppInstance" (id text, unit text);
    CREATE TABLE "WhatsAppConversation" (id text, "instanceId" text, "contactId" text);
    INSERT INTO "WhatsAppContact" VALUES ('c','5511987654321','SCS'),('lid','123456789012345@lid','SCS'),('ddd','5521987654321','SCS');
    INSERT INTO "WhatsAppInstance" VALUES ('scs','SCS'),('sbc','SBC'),('osasco','Osasco'),('shared','Todas'),('other-owner','SCS');
    INSERT INTO "WhatsAppConversation" VALUES ('scs-chat','scs','c'),('sbc-chat','sbc','c'),('osasco-chat','osasco','c'),
      ('shared-chat','shared','c'),('private-chat','other-owner','c'),('lid-chat','scs','lid'),('ddd-chat','scs','ddd');
    INSERT INTO "Agendamento" VALUES
      ('a-scs','SCS','2026-09-08 10:00','(11) 8765-4321','Avaliação','pendente'),
      ('a-sbc','SBC','2026-09-09 10:00','11987654321','Avaliação','confirmado'),
      ('a-osasco','Osasco','2026-08-01 10:00','5511987654321','Avaliação','nao_confirmou'),
      ('cancelled','SCS','2026-09-10 10:00','11987654321','Avaliação','desmarcou'),
      ('no-show','SCS','2026-09-11 10:00','11987654321','Avaliação','nao_compareceu'),
      ('final','SCS','2026-09-12 10:00','11987654321','Avaliação','finalizado'),
      ('procedure','SCS','2026-09-13 10:00','11987654321','Procedimento','pendente');
  `);
    const run = async (ids, unit, allowed) => {
        const sql = inboxAppointmentsQuery(ids, unit, allowed);
        return (await pg.query(sql.text, sql.values)).rows;
    };
    return { pg, run };
}
test('agenda real isolada por instância/unidade, DDD e telefone com/sem 55/nono dígito', async () => {
    const { pg, run } = await fixture();
    try {
        const rows = await run(['scs', 'sbc', 'osasco']);
        assert.deepEqual(rows.map(r => [r.conversationId, r.id]), [['osasco-chat', 'a-osasco'], ['sbc-chat', 'a-sbc'], ['scs-chat', 'a-scs']]);
        assert.deepEqual(await run([]), []);
        assert.equal((await run(['scs']))[0].unit, 'SCS');
        assert.ok(!rows.some(r => r.conversationId === 'private-chat' || r.conversationId === 'lid-chat' || r.conversationId === 'ddd-chat'));
    }
    finally {
        await pg.close();
    }
});
test('instância Todas usa a unidade selecionada autorizada, sem vazar outras unidades', async () => {
    const { pg, run } = await fixture();
    try {
        assert.equal((await run(['shared'], 'SBC', ['SBC']))[0].id, 'a-sbc');
        assert.deepEqual(await run(['shared'], 'SBC', ['SCS']), []);
        assert.equal((await run(['shared'], null, ['SCS']))[0].id, 'a-scs');
        assert.deepEqual(await run(['shared'], null, []), []);
    }
    finally {
        await pg.close();
    }
});
test('cancelar/faltar/finalizar remove suspensão; remarcar devolve novo horário sem mensagem nova', async () => {
    const { pg, run } = await fixture();
    try {
        for (const status of ['desmarcou', 'nao_compareceu', 'nao_respondeu', 'fechou_pacote', 'nao_fechou', 'finalizado', 'desconhecido']) {
            await pg.query('UPDATE "Agendamento" SET status=$1 WHERE id=$2', [status, 'a-scs']);
            assert.deepEqual(await run(['scs']), []);
        }
        await pg.exec(`UPDATE "Agendamento" SET status='confirmado',"startTime"='2026-09-15 11:30' WHERE id='a-scs'`);
        const rows = await run(['scs']);
        const snapshot = inboxAppointmentSnapshot(rows.map(r => ({ ...r, startTime: new Date(`${r.startTime}Z`) })));
        assert.equal(snapshot['scs-chat'].startTime, '2026-09-15T11:30:00.000Z');
    }
    finally {
        await pg.close();
    }
});
test('snapshot atualiza cards paginados/selecionados e preserva contagem de não lidas e histórico', () => {
    const conversation = { id: 'chat', unreadCount: 1, lastInboundAt: '2026-09-07T12:00:00Z', lastOutboundAt: '2026-09-07T11:00:00Z' };
    const appointment = { id: 'a', unit: 'SCS', startTime: '2026-09-08T12:00:00Z' };
    const scheduled = withInboxAppointment(conversation, { chat: appointment });
    assert.equal(scheduled.unreadCount, 1);
    assert.equal(scheduled.lastInboundAt, conversation.lastInboundAt);
    assert.deepEqual(inboxSlaSnapshot({ ...scheduled, isScheduled: !!scheduled.scheduledEvaluation }), { state: 'scheduled', label: 'Avaliação agendada', minutes: null, level: null });
    assert.equal(withInboxAppointment(scheduled, { chat: { ...appointment } }), scheduled);
    const cancelled = withInboxAppointment(scheduled, {});
    assert.equal(cancelled.scheduledEvaluation, null);
    assert.equal(inboxSlaSnapshot({ ...cancelled, isScheduled: !!cancelled.scheduledEvaluation }).state, 'waiting');
});
