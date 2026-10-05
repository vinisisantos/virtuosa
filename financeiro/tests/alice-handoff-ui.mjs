import assert from "node:assert/strict";
import puppeteer from "puppeteer";

// APIs interceptadas: nenhuma conversa ou mensagem real é aberta ou enviada.
const origin = "http://127.0.0.1:3210";
const browser = await puppeteer.launch({ headless: true });
try {
  for (const width of [390, 430, 1440]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: width < 600 ? 844 : 900, isMobile: width < 600, hasTouch: width < 600 });
    const sent = [];
    const errors = [];
    const user = { id: "gabriela-test", name: "Gabriela Teste", role: "GERENTE", unit: "SBC", permissions: { crm: true, unitSBC: true } };
    await page.evaluateOnNewDocument((currentUser) => {
      localStorage.setItem("virtuosa_user", JSON.stringify(currentUser));
      localStorage.setItem("virtuosa_unit", "SBC");
      localStorage.setItem("selectedUnit", "SBC");
    }, user);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on("request", async (request) => {
      const url = new URL(request.url());
      if (url.origin !== origin && !["data:", "blob:"].includes(url.protocol)) return request.abort();
      if (url.pathname === "/api/crm/alice-handoff/fictitious-conversation") {
        return request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({
          conversation: { id: "fictitious-conversation", contactName: "Cliente Fictícia", status: "open", canReply: true },
          messages: [
            { id: "1", body: "Vim pelo anúncio de glúteos perfeitos 120ml. Gostaria de saber mais.", type: "text", fromMe: false, timestamp: "2026-10-05T12:00:00Z", mediaUrl: null },
            { id: "2", body: "Posso te ajudar com isso.", type: "text", fromMe: true, timestamp: "2026-10-05T12:01:00Z", mediaUrl: null },
          ],
        }) });
      }
      if (url.pathname === "/api/whatsapp/send") {
        sent.push(JSON.parse(request.postData()));
        return request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
      }
      if (url.pathname === "/api/auth/me") {
        return request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, user }) });
      }
      if (url.pathname.startsWith("/api/")) return request.respond({ status: 200, contentType: "application/json", body: "{}" });
      return request.continue();
    });
    await page.goto(`${origin}/crm/inbox/alice-handoff/fictitious-conversation`, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.body.innerText.includes("Cliente Fictícia"));
    assert.match(await page.$eval("body", (element) => element.innerText), /Somente esta conversa está disponível/);
    assert.equal(sent.length, 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `sem overflow em ${width}`);
    await page.type("#alice-handoff-reply", "Resposta revisada pela Gabriela.");
    assert.equal(sent.length, 0, "digitar não envia mensagem");
    await page.click('button[aria-label="Enviar resposta"]');
    await page.waitForFunction(() => document.querySelector("#alice-handoff-reply")?.value === "");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].conversationId, "fictitious-conversation");
    assert.equal(sent[0].delegatedHandoff, true);
    assert.equal(sent[0].body, "Resposta revisada pela Gabriela.");
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Visão delegada da Alice: 390, 430 e 1440 px, envio só após clique explícito.");
} finally {
  await browser.close();
}
