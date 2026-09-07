import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const origin = 'http://127.0.0.1:3210';
const output = await mkdtemp(join(tmpdir(), 'virtuosa-inbox-schedule-'));
const browser = await puppeteer.launch({ headless: true });
const results = [];
const button = async (page, text) => {
    const handle = await page.waitForFunction(label => [...document.querySelectorAll('button')].find(b => {
        if (b.textContent.trim() !== label || b.disabled || !b.getClientRects().length)
            return false;
        const r = b.getBoundingClientRect();
        return b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }), {}, text);
    await handle.asElement().click();
    await handle.dispose();
};
const fit = async (page, width) => {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow ${width}`);
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].every(el => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1;
    })), `modal fora da tela ${width}`);
};
try {
    for (const unit of ['SCS', 'SBC', 'Osasco'])
        for (const width of [390, 430, 1440]) {
            const page = await browser.newPage();
            const errors = [], calls = [], writes = [];
            let scheduled = false, conflictOnce = unit === 'SCS' && width === 390, loadFailure = false;
            const newContact = unit === 'SBC' && width === 430;
            const user = { id: 'user-test', name: 'Operadora Teste', role: 'ADMINISTRADOR', unit, permissions: { crm: true, admin: true } };
            const instance = { id: 'instance-test', name: `Comercial ${unit}`, instanceName: `Comercial ${unit}`, unit, status: 'connected', userId: user.id, ownerId: user.id, canReply: true };
            const now = Date.now();
            const conv = { id: 'chat-test', instanceId: instance.id, instance, status: 'open', contact: { id: 'contact-test', name: 'Cliente com nome muito longo para conferir a organização no celular', phone: '5511987654321', unit }, lastMessage: 'Igualmente 💕', lastMessageAt: new Date(now).toISOString(), lastInboundAt: new Date(now - 49 * 60000).toISOString(), lastOutboundAt: new Date(now - 50 * 60000).toISOString(), unreadCount: 1, assignedTo: user.id, campaignName: 'Harmonização de Mamas', campaignAccountOrigin: 'secondary' };
            const appointment = { id: 'appointment-test', unit, startTime: '2026-09-15T12:30:00.000Z' };
            page.on('pageerror', e => errors.push(e.message));
            await page.setViewport({ width, height: 850 });
            await page.evaluateOnNewDocument(u => {
                localStorage.setItem('virtuosa_user', JSON.stringify(u));
                localStorage.setItem('virtuosa_unit', u.unit);
                localStorage.setItem('selectedUnit', u.unit);
            }, user);
            await page.setRequestInterception(true);
            page.on('request', async (req) => {
                const url = new URL(req.url());
                if (url.origin !== origin && !['data:', 'blob:'].includes(url.protocol))
                    return req.abort();
                if (!url.pathname.startsWith('/api/'))
                    return req.continue();
                calls.push(url.pathname);
                let data = { success: true }, status = 200;
                if (req.method() !== 'GET')
                    writes.push({ path: url.pathname, url: url.toString(), body: req.postData() ? JSON.parse(req.postData()) : null });
                if (url.pathname === '/api/auth/me')
                    data = { authenticated: true, user };
                else if (url.pathname.includes('/instances'))
                    data = { success: true, instances: [instance], users: [user] };
                else if (url.pathname === '/api/whatsapp/status')
                    data = { success: true, connected: true, instance, status: 'connected' };
                else if (url.pathname === '/api/whatsapp/conversations')
                    data = { conversations: url.searchParams.has('updatedSince') ? [] : [conv], appointmentSnapshot: scheduled ? { [conv.id]: appointment } : {}, serverTime: new Date().toISOString(), hasMore: false, queueCounts: { open: 1, unread: 1, callback: 0, followup: 0, lost: 0 } };
                else if (url.pathname === '/api/whatsapp/messages')
                    data = { messages: [{ id: 'msg-test', messageId: 'msg-wa', body: conv.lastMessage, type: 'text', fromMe: false, status: 'read', timestamp: conv.lastMessageAt }], hasMore: false };
                else if (url.pathname === '/api/clients') {
                    await new Promise(r => setTimeout(r, 250));
                    data = req.method() === 'POST' ? { client: { id: 'client-test', name: conv.contact.name, unit } } : { clients: newContact ? [] : [{ id: 'client-test', name: conv.contact.name, phone: conv.contact.phone, unit }] };
                    if (loadFailure) {
                        status = 503;
                        data = { error: 'Falha simulada' };
                    }
                }
                // O sistema também usa um funil legado compartilhado de Barueri.
                else if (url.pathname === '/api/pipelines')
                    data = [{ id: 'pipeline-test', unit: 'Barueri', stages: [{ id: 'lead', name: 'Novo Lead' }, { id: 'scheduled', name: 'Agendado' }] }];
                else if (url.pathname === '/api/pipeline') {
                    if (req.method() === 'GET')
                        data = newContact ? [] : [{ id: 'deal-test', clientId: 'client-test', unit, pipelineId: 'pipeline-test', stageId: 'lead' }];
                    else if (conflictOnce && !JSON.parse(req.postData()).forceScheduleConflict) {
                        status = 409;
                        data = { scheduleConflict: true, conflict: { clientName: 'Outro contato com nome longo no horário escolhido', unit, startTime: appointment.startTime, endTime: '2026-09-15T13:30:00Z', professionalName: 'Responsável Teste' } };
                        conflictOnce = false;
                    }
                    else {
                        scheduled = true;
                        data = { id: 'deal-test', clientId: 'client-test', pipelineId: 'pipeline-test', stageId: 'scheduled' };
                    }
                }
                else if (url.pathname === '/api/crm/evaluations/assignees')
                    data = { assignees: [{ id: 'assignee-test', name: 'Responsável Teste da Unidade', unit }] };
                else if (url.pathname === '/api/whatsapp/saved-replies')
                    data = { replies: [] };
                else if (url.pathname === '/api/whatsapp/saved-replies/categories')
                    data = { categories: [] };
                else if (url.pathname === '/api/whatsapp/contact-summary')
                    data = { summary: null, campaigns: [] };
                else if (url.pathname === '/api/users')
                    data = [];
                await req.respond({ status, contentType: 'application/json', body: JSON.stringify(data) });
            });
            await page.goto(`${origin}/crm/inbox`, { waitUntil: 'networkidle0' });
            await page.waitForSelector('[data-conversation-id="chat-test"]');
            assert.match(await page.$eval('[data-conversation-id="chat-test"]', el => el.innerText), /49m/);
            await page.click('[data-conversation-id="chat-test"]');
            await page.waitForSelector('[placeholder="Digite uma mensagem"]');
            assert.equal(calls.includes('/api/clients'), false, 'sem leitura extra ao abrir chat');
            await fit(page, width);
            await page.screenshot({ path: join(output, `${unit}-${width}-chat.png`), fullPage: true });
            await button(page, 'Agendar');
            await page.waitForSelector('[role=dialog]');
            await fit(page, width);
            await page.waitForSelector('[aria-label="Responsável pela avaliação"] option[value="assignee-test"]');
            await button(page, 'Confirmar');
            assert.equal(writes.filter(r => r.path === '/api/pipeline').length, 0, 'dados obrigatórios');
            await page.$eval('[aria-label="Data da avaliação"]', el => {
                Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '2026-09-15');
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            });
            await page.select('[aria-label="Responsável pela avaliação"]', 'assignee-test');
            await fit(page, width);
            await page.screenshot({ path: join(output, `${unit}-${width}-form.png`), fullPage: true });
            await button(page, 'Confirmar');
            if (unit === 'SCS' && width === 390) {
                await page.waitForSelector('[role=alert]');
                await fit(page, width);
                await page.screenshot({ path: join(output, `${unit}-${width}-conflict.png`), fullPage: true });
                await button(page, 'Agendar mesmo assim');
            }
            await page.waitForSelector('[role=dialog]', { hidden: true });
            await page.waitForSelector('[aria-label="Avaliação agendada. Contador de espera suspenso."]');
            const submitted = writes.filter(r => r.path === '/api/pipeline').at(-1);
            assert.equal(submitted.body.whatsappConversationId, conv.id);
            assert.equal(submitted.body.whatsappInstanceId, instance.id);
            assert.equal(submitted.body.stageId, 'scheduled');
            assert.equal(submitted.body.evaluationAssigneeUserId, 'assignee-test');
            assert.ok(submitted.body.evaluationStartTime.startsWith('2026-09-15T'));
            assert.equal(new URL(submitted.url).searchParams.get('unit'), unit);
            const card = await page.$eval('[data-conversation-id="chat-test"]', el => el.innerText);
            assert.doesNotMatch(card, /49m/);
            assert.match(card, /1/, 'não lidas preservadas');
            if (width < 1000) {
                await page.waitForFunction(() => {
                    const el = document.querySelector('[aria-label="Voltar para a lista de conversas"]');
                    if (!el)
                        return false;
                    const r = el.getBoundingClientRect();
                    return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
                });
                await page.click('[aria-label="Voltar para a lista de conversas"]');
                await page.waitForSelector('[data-conversation-id="chat-test"]', { visible: true });
            }
            await page.screenshot({ path: join(output, `${unit}-${width}-scheduled.png`), fullPage: true });
            if (width < 1000)
                await page.click('[data-conversation-id="chat-test"]');
            // A mudança chega só no snapshot: lista incremental vazia após cancelamento externo.
            scheduled = false;
            await page.evaluate(() => window.dispatchEvent(new Event('focus')));
            await page.waitForFunction(() => document.querySelector('[data-conversation-id="chat-test"]')?.innerText.includes('49m'));
            // Erro de carregamento tem saída e não cria agendamento silenciosamente.
            if (unit === 'SCS' && width === 430) {
                loadFailure = true;
                await button(page, 'Agendar');
                await page.waitForFunction(() => document.body.innerText.includes('Não foi possível consultar o contato.'));
                await fit(page, width);
                await button(page, 'Fechar');
                await page.waitForSelector('[role=dialog]', { hidden: true });
            }
            assert.deepEqual(errors, []);
            assert.ok(writes.every(r => r.path === '/api/pipeline' || (newContact && r.path === '/api/clients')), 'nenhuma mensagem enviada pelo teste');
            if (newContact)
                assert.equal(writes.filter(r => r.path === '/api/clients').length, 1);
            results.push({ unit, width, scheduled: true, cancelled: true, errors });
            await page.close();
        }
    console.log(JSON.stringify({ output, results }));
}
finally {
    await browser.close();
}
