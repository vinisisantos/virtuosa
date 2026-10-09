import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:3210';
const output = await mkdtemp(join(tmpdir(), 'virtuosa-evaluation-procedure-'));
const browser = await puppeteer.launch({ headless: true });
const user = { id: 'operator', name: 'Operadora Teste', role: 'VENDEDOR', unit: 'SBC', permissions: { crm: true, agenda: true, unitSBC: true } };
const professional = { id: 'professional', name: 'Responsável Teste', unit: 'SBC', isActive: true, color: '#8b5cf6' };
const procedure = 'Tratamento corporal com nome longo confirmado pela pessoa';
async function clickUncovered(button, page, label, assertTouchTarget = true) {
  await button.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await page.waitForFunction((element) => {
    const rect = element.getBoundingClientRect();
    return !element.disabled && rect.top >= 0 && rect.bottom <= innerHeight
      && element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
  }, {}, button);
  if (assertTouchTarget) assert.ok(await button.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width >= 44 && rect.height >= 44;
  }), `alvo de toque: ${label}`);
  await button.click();
}
const results = [];
try {
  for (const width of [390, 430, 1440]) {
    for (const kind of ['pipeline', 'agenda']) {
      console.log(`Validando ${kind} em ${width}px`);
      const page = await browser.newPage();
      const errors = [];
      const agendaCreates = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewport({ width, height: 900 });
      await page.evaluateOnNewDocument((user) => {
        localStorage.setItem('virtuosa_user', JSON.stringify(user));
        localStorage.setItem('virtuosa_global_unit', 'SBC');
        localStorage.setItem('virtuosa_tour_done', JSON.stringify({ agenda: true, clientes: true }));
      }, user);
      await page.setRequestInterception(true);
      page.on('request', async (request) => {
        const url = new URL(request.url());
        if (url.origin !== origin && !['data:', 'blob:'].includes(url.protocol)) return request.abort();
        if (!url.pathname.startsWith('/api/')) return request.continue();
        let data = {};
        if (url.pathname === '/api/auth/me') data = { authenticated: true, user };
        else if (url.pathname === '/api/pipelines') data = [{ id: 'pipeline', name: 'Funil Teste SBC', unit: 'SBC', stages: [{ id: 'scheduled', name: 'Agendado', position: 0, color: '#8b5cf6' }] }];
        else if (url.pathname === '/api/agenda' && request.method() === 'POST') {
          const payload = JSON.parse(request.postData());
          agendaCreates.push(payload);
          data = { id: 'synthetic-appointment', ...payload };
        }
        else if (['/api/pipeline', '/api/agenda'].includes(url.pathname)) data = [];
        else if (url.pathname === '/api/profissionais') data = [professional];
        else if (url.pathname === '/api/crm/evaluations/assignees') data = { assignees: [{ id: 'operator', name: professional.name, unit: 'SBC' }] };
        else if (url.pathname === '/api/users') data = [user];
        else if (url.pathname === '/api/catalog') data = { services: [] };
        else if (['/api/clients', '/api/clients/search'].includes(url.pathname)) data = { clients: [] };
        else if (url.pathname === '/api/contracts') data = { contracts: [{ status: 'assinado' }] };
        else if (url.pathname.includes('notifications')) data = { notifications: [], unreadCount: 0 };
        await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      });
      await page.goto(`${origin}${kind === 'pipeline' ? '/crm/pipeline?createEvaluation=1' : '/agenda'}`, { waitUntil: 'networkidle0' });
      if (kind === 'agenda') {
        // Guard the delayed onboarding transition as well as its saved preference.
        const skip = await page.waitForFunction(() => [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Pular tour')), { timeout: 2200 }).catch(() => null);
        if (skip) await skip.asElement().click();
        await page.waitForFunction(() => ![...document.querySelectorAll('button')].some((button) => button.textContent.includes('Pular tour')));
        const button = await page.waitForFunction(() => [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Novo Agendamento')));
        await clickUncovered(button.asElement(), page, `abrir agenda/${width}`, width < 768);
        await page.waitForSelector('[placeholder="Ex: Laser, Botox..."]');
        await page.type('[placeholder="Digite o nome do cliente"]', 'Pessoa Sintética');
        await page.type('[placeholder="(11) 99999-9999"]', '11999990000');
        await page.type('[placeholder="Ex: Laser, Botox..."]', 'Avaliação');
      }
      await page.waitForSelector('[aria-label="Procedimento de interesse"]');
      await page.click('[aria-label="Procedimento de interesse"]');
      await page.type('[aria-label="Procedimento de interesse"]', procedure);
      await page.waitForFunction(() => document.querySelector('[aria-label="Procedimento de interesse"]').getBoundingClientRect().height >= 44);
      const geometry = await page.$eval('[aria-label="Procedimento de interesse"]', (input) => {
        const rect = input.getBoundingClientRect();
        return { left: rect.left, right: rect.right, height: rect.height, required: input.required, maxLength: input.maxLength, value: input.value };
      });
      assert.ok(geometry.left >= 0 && geometry.right <= width + 1, `campo fora da tela: ${kind}/${width}`);
      assert.ok(geometry.height >= 44, 'alvo de toque');
      assert.equal(geometry.required, true);
      assert.equal(geometry.maxLength, 160);
      assert.match(geometry.value, /confirmado pela pessoa/);
      assert.deepEqual(errors, [], `erros JS ${kind}/${width}`);
      await page.screenshot({ path: join(output, `${kind}-${width}.png`), fullPage: true });
      if (kind === 'agenda') {
        await page.$eval('[role="dialog"]', (dialog) => { dialog.scrollTop = dialog.scrollHeight; });
        assert.ok(await page.$eval('[role="dialog"]', (dialog) => {
          const button = [...dialog.querySelectorAll('button')].find((button) => /Criar/.test(button.textContent));
          if (!button) return false;
          const rect = button.getBoundingClientRect();
          return !button.disabled && rect.top >= 0 && rect.bottom <= innerHeight && rect.width >= 44 && rect.height >= 44
            && button.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
        }), `ação de salvar acessível: agenda/${width}`);
        await page.screenshot({ path: join(output, `${kind}-${width}-actions.png`), fullPage: true });
        const save = await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] button')].find((button) => /Criar/.test(button.textContent)));
        await clickUncovered(save.asElement(), page, `salvar agenda/${width}`);
        await page.waitForFunction(() => !document.querySelector('[role="dialog"][aria-label="Novo Agendamento"]'));
        assert.equal(agendaCreates.length, 1, `um único POST sintético: agenda/${width}`);
        assert.equal(agendaCreates[0].unit, 'SBC');
        assert.equal(agendaCreates[0].procedimento, 'Avaliação');
        assert.equal(agendaCreates[0].evaluationProcedure, procedure);
        assert.equal(agendaCreates[0].clientName, 'Pessoa Sintética');
        assert.equal(agendaCreates[0].clientPhone, '11999990000');
        assert.deepEqual(errors, [], `erros JS após salvar agenda/${width}`);
        await page.screenshot({ path: join(output, `${kind}-${width}-saved.png`), fullPage: true });
      }
      results.push({ kind, width, passed: true });
      await page.close();
    }
  }
  console.log(JSON.stringify({ output, results }));
} finally {
  await browser.close();
}
