import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
function sources(dir) {
  return readdirSync(new URL(dir, root), {withFileTypes:true}).flatMap(entry =>
    entry.isDirectory() ? sources(`${dir}/${entry.name}`) : /\.(tsx?|mjs)$/.test(entry.name) ? [`${dir}/${entry.name}`] : []);
}

test('runtime não contém integrações, rotas ou modelos retirados', () => {
  const retired = /@google\/generative-ai|generativelanguage\.googleapis|api\.(openai|groq|mistral)|@\/lib\/ai[-/]|AI_INBOX_|AI_WHATSAPP_|crmSilentAnalysis/;
  for (const file of sources('src')) assert.doesNotMatch(read(file), retired, file);
  assert.doesNotMatch(read('prisma/schema.prisma'), /model (Ai\w+|CrmSilentAnalysisSetting|CrmConversationInsight|WhatsAppMessageTranscript|InsumoUpload)\b/);
  assert.doesNotMatch(read('scripts/vercel-build.mjs'), /_ai_|approved_campaign_knowledge|prepare-ai-inbox/);
  assert.doesNotMatch(read('middleware.ts'), /ai-inbox|ai-test|testar-ia/);
  assert.equal(existsSync(new URL('public/ai-training', root)), false);
  for(const route of ['chat','insumos','crm/ai-shadow','crm/ai-insights','testar-ia/[token]']) {
    assert.equal(existsSync(new URL(`src/app/${route}/page.tsx`, root)), false);
  }
});

test('webhook, envio, agenda, folha e vendas convencionais permanecem disponíveis', () => {
  for(const path of ['src/app/api/whatsapp/webhook/route.ts','src/app/api/whatsapp/send/route.ts','src/app/api/whatsapp/messages/route.ts','src/app/api/crm/evaluations/route.ts','src/app/api/folha-inteligente/employees/route.ts','src/app/api/cron/whatsapp-callbacks/route.ts']) {
    assert.ok(existsSync(new URL(path,root)),path);
  }
  const sales=read('src/components/dashboard/sales-section.tsx');
  assert.match(sales,/parseExcelFile/);
  assert.match(sales,/onClick=\{addSale\}/);
  assert.doesNotMatch(sales,/\/api\/(chat|sales\/extract)/);
  const order=read('src/components/order-modal.tsx');
  assert.match(order,/\/api\/orders\/scrape/);
  assert.doesNotMatch(order,/\/api\/orders\/ai-price/);
});
