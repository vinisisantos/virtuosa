import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import puppeteer from "puppeteer";
import { inboxSource, MessageTimestamp } from "./helpers/whatsapp-message-status-components.mjs";

const output = await mkdtemp(join(tmpdir(), "virtuosa-message-status-"));
const globalsPath = fileURLToPath(new URL("../src/app/globals.css", import.meta.url));
const { css } = await postcss([tailwind()]).process(await readFile(globalsPath, "utf8"), { from: globalsPath });
const threadCss = inboxSource.match(/<style jsx global>\{`([\s\S]*?)`\}<\/style>/)?.[1];
assert.ok(threadCss, "CSS real do thread está disponível");
const pattern = await readFile(new URL("../public/crm-chat-pattern.svg", import.meta.url));
const localThreadCss = threadCss.replaceAll("url('/crm-chat-pattern.svg')", `url('data:image/svg+xml;base64,${pattern.toString("base64")}')`);
const states = ["pending", "sent", "delivered", "read", "played", "error", "deleted", "unknown"];

function message(status, isMe = true) {
  const text = status === "read"
    ? "Mensagem longa de demonstração para conferir a leitura no celular e no computador. O conteúdo deve quebrar normalmente sem sobrepor o horário nem os dois tiques azuis. Referência: ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789."
    : isMe ? `Mensagem de demonstração — ${status}` : "Resposta recebida do contato, sem tiques de envio.";
  return createElement("div", { className: `flex ${isMe ? "justify-end" : "justify-start"}` },
    createElement("div", { className: "relative flex max-w-[88%] flex-col sm:max-w-[72%] lg:max-w-[65%] xl:max-w-[min(60%,760px)]" },
      createElement("div", {
        "data-fixture-status": isMe ? status : "incoming",
        className: `inbox-message-bubble relative flex w-fit max-w-full flex-col rounded-lg px-2.5 pb-1.5 pt-1.5 text-[14.5px] leading-[1.35] sm:text-[14px] ${isMe ? "inbox-message-outgoing" : "inbox-message-incoming"}`,
      },
      createElement("div", { className: "break-words whitespace-pre-wrap" }, text,
        createElement("span", { className: `inline-block ${isMe ? "w-[58px]" : "w-[42px]"}`, "aria-hidden": true })),
      createElement(MessageTimestamp, { msg: { status, timestamp: "2026-09-11T15:30:00.000Z" }, isMe, className: "absolute bottom-1 right-2" })),
    ));
}

const content = renderToStaticMarkup(createElement("main", { className: "inbox-thread-messages flex min-h-screen flex-col gap-3 p-4 sm:p-8" },
  createElement("h1", { className: "text-base font-semibold text-foreground" }, "Confirmação das mensagens — demonstração local"),
  ...states.map((status) => createElement("section", { key: status }, message(status))),
  message("read", false),
));
const browser = await puppeteer.launch({ headless: true });
const results = [];
try {
  for (const theme of ["light", "dark"]) {
    for (const width of [390, 430, 1440]) {
      const page = await browser.newPage();
      const errors = [];
      const requests = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        requests.push(request.url());
        void request.abort();
      });
      await page.setViewport({ width, height: width === 430 ? 932 : width === 390 ? 844 : 900 });
      await page.setContent(`<!doctype html><html lang="pt-BR" data-mode="${theme}" data-theme="${theme}" class="${theme === "dark" ? "dark" : ""}"><head><meta charset="utf-8"><style>${css}\n${localThreadCss}</style></head><body>${content}</body></html>`);
      const measurements = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        width: innerWidth,
        states: [...document.querySelectorAll("[data-fixture-status]")].map((bubble) => {
          const status = bubble.dataset.fixtureStatus;
          const icon = bubble.querySelector("[data-message-status]");
          const svg = icon?.querySelector("svg");
          const timestamp = bubble.querySelector(".inbox-message-timestamp-outgoing, .inbox-message-timestamp-incoming");
          const bubbleRect = bubble.getBoundingClientRect();
          const timestampRect = timestamp.getBoundingClientRect();
          return {
            status, label: icon?.getAttribute("aria-label"), title: icon?.getAttribute("title"),
            color: icon ? getComputedStyle(icon).color : null,
            iconWidth: svg?.getBoundingClientRect().width,
            iconHeight: svg?.getBoundingClientRect().height,
            inside: timestampRect.left >= bubbleRect.left && timestampRect.right <= bubbleRect.right && timestampRect.bottom <= bubbleRect.bottom,
          };
        }),
      }));
      assert.equal(measurements.scrollWidth, width, "sem overflow horizontal");
      for (const state of measurements.states) {
        assert.equal(state.inside, true, `horário de ${state.status} dentro do balão`);
        if (["deleted", "incoming"].includes(state.status)) {
          assert.equal(state.color, null);
          continue;
        }
        assert.equal(state.iconWidth, 14, `largura estável para ${state.status}`);
        assert.equal(state.iconHeight, 14, `altura estável para ${state.status}`);
        assert.equal(state.title, state.label);
        assert.equal(state.color === "rgb(83, 189, 235)", ["read", "played"].includes(state.status));
      }
      assert.deepEqual(errors, []);
      assert.equal(requests.filter((url) => /^https?:/.test(url)).length, 0, "nenhuma chamada de rede");
      const screenshot = join(output, `${theme}-${width}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      results.push({ theme, width, screenshot, ...measurements });
      console.log(`OK ${theme} ${width}px`);
      await page.close();
    }
  }
  console.log(JSON.stringify({ output, passed: results.length, results }));
} finally {
  await browser.close();
}
