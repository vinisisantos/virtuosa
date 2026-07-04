# Regras do Projeto — Virtuosa CRM

Instruções permanentes para qualquer agente de IA (Claude Code, Codex/GPT) trabalhando neste repositório. Leia antes de qualquer alteração.

## Arquitetura

- **App**: Next.js (App Router) em `financeiro/` — hospedado na Vercel (`clinicasgestao.com.br`), deploy automático a cada push na `main`.
- **Banco**: Postgres no Supabase via Prisma (`financeiro/prisma/schema.prisma`). O `.env` local aponta para o banco de **PRODUÇÃO** — todo script local roda contra dados reais.
- **WhatsApp**: Evolution API v2 auto-hospedada em VPS (`EVOLUTION_API_URL`, apenas em produção/Vercel). 7 instâncias conectadas. O VPS só aceita conexões de IPs autorizados — não é alcançável da máquina local.
- **Unidades**: Osasco, SBC, SCS (+ "Todas" para instâncias compartilhadas). Isolamento por unidade e por dono da instância é regra de segurança — ver `financeiro/src/lib/whatsapp/instance-resolver.ts`.

## Padrão de código (obrigatório)

- Código limpo e direto: nomes descritivos, funções pequenas com uma responsabilidade, sem duplicação — lógica repetida vai para um módulo em `src/lib/`.
- Eficiente por padrão: sem queries N+1, `select` só dos campos usados, sem loops de tentativa-e-erro contra APIs (descubra o formato correto e use só ele).
- Normalize dados na **escrita** (rótulos canônicos), não com remendos na leitura.
- Comentários apenas para restrições que o código não consegue mostrar (por que algo é assim), nunca para narrar o óbvio.
- Nenhuma funcionalidade pode ser removida ou ter comportamento alterado sem aprovação explícita do Vinicius.

## Fluxo de trabalho

- Um commit por correção/mudança lógica, mensagem em pt-BR no formato `tipo(escopo): descrição` explicando causa raiz → solução.
- `npx tsc --noEmit` limpo antes de todo commit (ignorar erros pré-existentes de `.next/`, `scripts/` e `scratch.ts`).
- Push na `main` = deploy imediato em produção. Antes do push, confirme que a mudança está completa e testável.
- Sempre `git pull --rebase` antes do push — outras ferramentas de IA também commitam neste repositório e conflitos são frequentes.
- Ao final, diga o que deve ser testado manualmente.

## Armadilhas conhecidas (não redescobrir do zero)

- **messageId do WhatsApp não é único global**: é o mesmo para remetente e destinatário. A unicidade em `WhatsAppMessage` é composta (`conversationId + messageId`). Nunca busque mensagem só por `messageId` sem escopo.
- **Contatos LID** (`@lid` / `@hosted.lid`): enviar mensagem pelo telefone para contato que a sessão só conhece por LID falha silenciosamente (fica em "sent"). Tente primeiro o JID exato do evento; updates de status de LID são aplicados via `messageId` + instância.
- **`/settings/set` da Evolution 2.3.7 está quebrado** (500 em `integrationSession.update()`): rejeição de chamadas é aplicada no corpo do `/instance/create` e há auto-sync com diagnóstico em `financeiro/src/lib/whatsapp-call-block-sync.ts` (resultado em AppSetting `whatsapp_call_block_sync_state`).
- **Supabase pooler**: limite de conexões de cliente (hoje 400, compute Small). Prisma usa `connection_limit=1` (`src/lib/db.ts`) — não criar `new PrismaClient` fora do singleton.
- **Vercel Hobby estourou limites** (invocações/CPU): evite adicionar polling agressivo ou chamadas de função por item renderizado; prefira consolidar endpoints e cachear no navegador.
- **Campanhas "desconhecidas"**: a atribuição CTWA tem rótulos genéricos variantes ("Campanha Desconhecida", "Desconhecido", "... (Via Link)") — ao filtrar ou comparar, normalize; ao corrigir, unifique na escrita.

## Dados de produção

- Scripts de diagnóstico: criar como `*.tmp.ts` na raiz de `financeiro/`, rodar com `npx tsx`, e **apagar depois**. Nunca commitar.
- Leitura é livre; qualquer escrita/migração em produção exige cuidado redobrado: índice novo antes de remover o antigo, `IF EXISTS`/`IF NOT EXISTS`, e explicar o risco antes de executar.
