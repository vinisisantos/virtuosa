// Local-only fixture runner. Mount tests/fixtures/ai-inbox-preview.tsx temporarily
// at /testar-ia/ai-inbox-preview.tmp, run Next dev on 3210, then remove the route.
import assert from "node:assert/strict";
import puppeteer from "puppeteer";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = await mkdtemp(join(tmpdir(), "ai-inbox-ui-"));
const browser = await puppeteer.launch({ headless: true });
const results = [];
try {
  for (const width of [390, 430, 1440]) {
    const page = await browser.newPage();
    await page.setViewport({
      width,
      height: width < 500 ? 844 : 1000,
      deviceScaleFactor: 1,
    });
    let generations = 0;
    let returnError = false;
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setRequestInterception(true);
    page.on("request", async (req) => {
      const url = new URL(req.url());
      if (!url.hostname || !["127.0.0.1", "localhost"].includes(url.hostname))
        return req.abort();
      if (url.pathname.startsWith("/api/whatsapp/reply-suggestions")) {
        const body = JSON.parse(req.postData());
        if (body.action === "generate") generations++;
        await new Promise((r) => setTimeout(r, 150));
        return req.respond({
          status: returnError ? 503 : 200,
          contentType: "application/json",
          body: JSON.stringify(
            returnError
              ? { error: "Cota diária atingida; continue manualmente." }
              : body.action === "apply"
                ? { text: "Nosso horário aprovado é das 10h às 20h." }
                : {
                    id: "suggestion",
                    text: "Nosso horário aprovado é das 10h às 20h.",
                    reason:
                      "Pergunta equivalente à ficha aprovada de funcionamento.",
                    needsHuman: false,
                    sources: [{ id: "k1", topic: "Funcionamento" }],
                  },
          ),
        });
      }
      if (url.pathname.startsWith("/api/whatsapp/ai-inbox/knowledge")) {
        await new Promise((r) => setTimeout(r, 200));
        const content = {
          topic:
            "Funcionamento da unidade e condições especiais que precisam ser verificadas em feriados prolongados",
          questions: [
            "Qual o horário de funcionamento?",
            "Quando abre e fecha?",
          ],
          answer: "Atendimento em dias úteis, das 10h às 20h. ".repeat(12),
          procedure: "",
          conditions:
            "Confirmar alterações em feriados e campanhas especiais. Não corresponde a disponibilidade de agenda.",
          clinical: false,
        };
        return req.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            req.method() === "GET"
              ? {
                  items:
                    url.searchParams.get("status") === "rejected"
                      ? []
                      : [
                          {
                            id: "k1",
                            version: 1,
                            content,
                            status: "pending",
                            relatedIds: ["k2"],
                            expiresAt: null,
                            sourceConversationId: "test-conversation",
                            sourceInstanceId: "scs",
                          },
                        ],
                  canReview: true,
                  canReviewClinical: false,
                  summary: {
                    queued: 20,
                    failed: 1,
                    budget: JSON.stringify({
                      reserved: 1200000,
                      suggestions: 12,
                      batches: 5,
                    }),
                  },
                }
              : { success: true },
          ),
        });
      }
      if (url.pathname.startsWith("/api/"))
        return req.respond({
          status: 200,
          contentType: "application/json",
          body: "{}",
        });
      return req.continue();
    });
    await page.goto("http://127.0.0.1:3210/testar-ia/ai-inbox-preview.tmp", {
      waitUntil: "networkidle0",
    });
    const click = async (text) => {
      const element = await page.waitForSelector(`::-p-text(${text})`);
      await element.click();
    };
    const fits = async () => {
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      assert.equal(overflow, false, `horizontal overflow ${width}`);
      const modal = await page.evaluate(() => {
        const e = document.querySelector('[data-slot="dialog-content"]');
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return {
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          w: innerWidth,
          h: innerHeight,
        };
      });
      if (modal)
        assert.ok(
          modal.left >= 0 &&
            modal.right <= modal.w + 1 &&
            modal.top >= 0 &&
            modal.bottom <= modal.h + 1,
          JSON.stringify(modal),
        );
    };
    assert.equal(generations, 0, "Opening a chat must not call AI");
    await click("Sugerir resposta");
    await page.waitForSelector("::-p-text(Acrescentar ao rascunho)");
    await fits();
    await page.screenshot({ path: join(directory, `${width}-suggestion.png`) });
    await click("Acrescentar ao rascunho");
    await page.waitForFunction(() =>
      document
        .querySelector('textarea[aria-label="Rascunho"]')
        .value.includes("Nosso horário"),
    );
    assert.ok(
      (
        await page.$eval('textarea[aria-label="Rascunho"]', (e) => e.value)
      ).startsWith("Meu texto já digitado."),
    );
    await click("Sugerir resposta");
    await page.waitForSelector("::-p-text(Acrescentar ao rascunho)");
    await click("Simular mensagem nova");
    assert.equal(await page.$("::-p-text(Acrescentar ao rascunho)"), null);
    await click("Aprendizados");
    await page.waitForSelector("::-p-text(Carregando…)");
    await fits();
    await page.waitForSelector("::-p-text(Revisar ficha)");
    await fits();
    await page.screenshot({ path: join(directory, `${width}-knowledge.png`) });
    await click("Revisar ficha");
    await page.waitForSelector("::-p-text(Salvar correção)");
    await fits();
    const approval = await page.$("::-p-text(Aprovar ficha)");
    assert.equal(await approval.evaluate((e) => e.disabled), true);
    await approval.scrollIntoView();
    await fits();
    await page.screenshot({ path: join(directory, `${width}-editor.png`) });
    await click("Rejeitados");
    await page.waitForSelector("::-p-text(Nenhuma ficha neste filtro.)");
    await fits();
    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => !document.querySelector('[data-slot="dialog-content"]'),
    );
    returnError = true;
    await click("Sugerir resposta");
    await page.waitForSelector(
      "::-p-text(Cota diária atingida; continue manualmente.)",
    );
    await fits();
    await click("Modo revisor");
    assert.equal(await page.$("::-p-text(Sugerir resposta)"), null);
    await click("Aprendizados");
    await page.waitForSelector("::-p-text(Revisar ficha)");
    await fits();
    assert.deepEqual(errors, []);
    results.push({ width, generations, result: "passed" });
    await page.close();
  }
  console.log(JSON.stringify({ results, screenshots: directory }));
} finally {
  await browser.close();
}
