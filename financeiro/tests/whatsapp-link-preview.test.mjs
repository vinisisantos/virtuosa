import assert from "node:assert/strict";
import test from "node:test";
import {
  firstWhatsAppLink,
  parseLinkPreviewHtml,
} from "../src/lib/whatsapp/link-preview.ts";

test("extrai o primeiro link HTTP e remove pontuação de encerramento", () => {
  assert.equal(
    firstWhatsAppLink("Veja aqui: https://clinicasgestao.com.br/avaliacao/osasco."),
    "https://clinicasgestao.com.br/avaliacao/osasco",
  );
  assert.equal(firstWhatsAppLink("Arquivo ftp://example.com/teste"), null);
});

test("lê metadados Open Graph independentemente da ordem dos atributos", () => {
  const preview = parseLinkPreviewHtml(`
    <html>
      <head>
        <meta content="Clínica &amp; Avaliação" property="og:title">
        <meta name="description" content="Atendimento personalizado &amp; gratuito">
        <meta content="/arte.jpg" property="og:image">
      </head>
    </html>
  `, "https://clinicasgestao.com.br/avaliacao/osasco");

  assert.deepEqual(preview, {
    url: "https://clinicasgestao.com.br/avaliacao/osasco",
    title: "Clínica & Avaliação",
    description: "Atendimento personalizado & gratuito",
    thumbnailUrl: "https://clinicasgestao.com.br/arte.jpg",
  });
});

test("usa title como fallback e ignora páginas sem metadados úteis", () => {
  assert.deepEqual(
    parseLinkPreviewHtml("<html><head><title>  Página de teste  </title></head></html>", "https://example.com"),
    {
      url: "https://example.com",
      title: "Página de teste",
      description: null,
      thumbnailUrl: null,
    },
  );
  assert.equal(parseLinkPreviewHtml("<html><body>Sem cabeçalho</body></html>", "https://example.com"), null);
});
