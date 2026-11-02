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
    INSERT INTO "WhatsAppContact" VALUES ('c','5511987654321','Osasco'),('lid','123456789012345@lid','Osasco'),('ddd','5521987654321','Osasco'),('old','5511912345678','SBC');
    INSERT INTO "WhatsAppInstance" VALUES ('sbc','SBC'),('osasco','Osasco'),('shared','Todas'),('other-owner','Osasco');
    INSERT INTO "WhatsAppConversation" VALUES ('sbc-chat','sbc','c'),('osasco-chat','osasco','c'),('old-chat','sbc','old'),
      ('shared-chat','shared','c'),('private-chat','other-owner','c'),('lid-chat','osasco','lid'),('ddd-chat','osasco','ddd');
    INSERT INTO "Agendamento" VALUES
      ('a-osasco','Osasco','2026-09-08 10:00','(11) 8765-4321','Avaliação','pendente'),
      ('a-sbc','SBC','2026-09-09 10:00','11987654321','Avaliação','confirmado'),
      ('a-old','SBC','2026-08-01 10:00','5511912345678','Avaliação','nao_confirmou'),
      ('cancelled','Osasco','2026-09-10 10:00','11987654321','Avaliação','desmarcou'),
      ('no-show','Osasco','2026-09-11 10:00','11987654321','Avaliação','nao_compareceu'),
      ('final','Osasco','2026-09-12 10:00','11987654321','Avaliação','finalizado'),
      ('procedure','Osasco','2026-09-13 10:00','11987654321','Procedimento','pendente');
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
        const rows = await run(['sbc', 'osasco']);
        assert.deepEqual(rows.map(r => [r.conversationId, r.id]), [['old-chat', 'a-old'], ['osasco-chat', 'a-osasco'], ['sbc-chat', 'a-sbc']]);
        assert.deepEqual(await run([]), []);
        assert.equal((await run(['osasco']))[0].unit, 'Osasco');
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
        assert.deepEqual(await run(['shared'], 'SBC', ['Osasco']), []);
        assert.equal((await run(['shared'], null, ['Osasco']))[0].id, 'a-osasco');
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
            await pg.query('UPDATE "Agendamento" SET status=$1 WHERE id=$2', [status, 'a-osasco']);
            assert.deepEqual(await run(['osasco']), []);
        }
        await pg.exec(`UPDATE "Agendamento" SET status='confirmado',"startTime"='2026-09-15 11:30' WHERE id='a-osasco'`);
        const rows = await run(['osasco']);
        const snapshot = inboxAppointmentSnapshot(rows.map(r => ({ ...r, startTime: new Date(`${r.startTime}Z`) })));
        assert.equal(snapshot['osasco-chat'].startTime, '2026-09-15T11:30:00.000Z');
    }
    finally {
        await pg.close();
    }
});
test('snapshot atualiza cards paginados/selecionados e preserva contagem de não lidas e histórico', () => {
    const conversation = { id: 'chat', unreadCount: 1, lastInboundAt: '2026-09-07T12:00:00Z', lastOutboundAt: '2026-09-07T11:00:00Z' };
    const appointment = { id: 'a', unit: 'Osasco', startTime: '2026-09-08T12:00:00Z' };
    const scheduled = withInboxAppointment(conversation, { chat: appointment });
    assert.equal(scheduled.unreadCount, 1);
    assert.equal(scheduled.lastInboundAt, conversation.lastInboundAt);
    assert.deepEqual(inboxSlaSnapshot({ ...scheduled, isScheduled: !!scheduled.scheduledEvaluation }), { state: 'scheduled', label: 'Avaliação agendada', minutes: null, level: null });
    assert.equal(withInboxAppointment(scheduled, { chat: { ...appointment } }), scheduled);
    const cancelled = withInboxAppointment(scheduled, {});
    assert.equal(cancelled.scheduledEvaluation, null);
    assert.equal(inboxSlaSnapshot({ ...cancelled, isScheduled: !!cancelled.scheduledEvaluation }).state, 'waiting');
});
