# Regras Permanentes — Virtuosa CRM

Leia antes de qualquer alteração. Este repositório usa dados reais e push na `main` afeta produção.

## Arquitetura

- App principal: Next.js App Router em `financeiro/`, com React 19, TypeScript, Prisma e Tailwind.
- Hospedagem: Vercel em `clinicasgestao.com.br`; push na branch `main` dispara deploy automático.
- Banco: Postgres/Supabase via Prisma (`financeiro/prisma/schema.prisma`). O `.env` local aponta para produção; scripts locais podem ler/escrever dados reais.
- Prisma deve usar o singleton `financeiro/src/lib/db.ts`; ele adiciona `connection_limit=1` e `pool_timeout=20`.
- WhatsApp: Evolution API v2 auto-hospedada em VPS; `EVOLUTION_API_URL` só é acessível em produção/Vercel porque a VPS restringe IPs.
- Unidades ativas: Osasco, SBC e SCS; instâncias com unidade `Todas` são compartilhadas, mas continuam isoladas por dono.
- Inbox WhatsApp é isolado por dono da instância em `financeiro/src/lib/whatsapp/instance-resolver.ts`; admin só acessa outro dono via `targetUserId`/`targetInstanceId`.
- Origem imutável de lead fica em `Client.originUnit`; unidade atual (`Client.unit`/pipeline) pode mudar por transferência.

## Padrão de código

- Código limpo e direto: nomes descritivos, funções pequenas, uma responsabilidade por função e sem duplicação.
- Lógica compartilhada deve ir para `financeiro/src/lib/` ou helper local existente; não espalhe regras de negócio em componentes.
- Eficiente por padrão: evitar queries N+1, usar `select` só com campos necessários e não buscar dados que não serão usados.
- Não criar `new PrismaClient`; use sempre o singleton de `@/lib/db`.
- Normalize dados na escrita quando houver rótulos canônicos; não resolva inconsistência só com remendos na leitura.
- Não remover, ocultar ou alterar comportamento existente sem aprovação explícita do Vinicius.
- Comentários devem explicar restrições não óbvias; não narrar código evidente.

## Estudo de viabilidade antes de implementar

Quando aplica: mudança de schema/migração, nova tabela ou índice, novo endpoint
que pode ser chamado com frequência, automação/webhook novo, qualquer coisa
que rode em loop por registro (fan-out), ou mudança que afeta mais de uma
unidade/papel de usuário. Não aplica a correção pontual de bug, ajuste de
texto/CSS ou mudança de uma linha sem impacto de carga — não transforme isso
em burocracia para o que é trivial.

Quando aplica, antes de escrever código:

1. Investigue o que já existe e o que a mudança vai tocar (schema, queries,
   quantas chamadas por ação/render, se introduz polling ou loop) — sem
   implementar ainda.
2. Cruze com os limites já conhecidos do sistema (ver "Armadilhas
   conhecidas" abaixo): pool de conexões do Supabase, invocações/CPU do
   Vercel Hobby, rate limit da Evolution API, volume real de uso (quantos
   usuários, quantos registros).
3. Estime o peso concreto da mudança — não em termos vagos ("pode ficar
   mais lento"), mas em números: quantas queries a mais por tela, quantas
   chamadas de API a mais por conversa/dia, se precisa de índice novo.
4. Apresente o resultado ANTES de codar: o que foi confirmado, o modelo
   técnico proposto, o que vai pesar e quanto, e as perguntas de decisão que
   só o Vinicius pode responder (regra de negócio, escopo, tradeoff de
   custo). Só implemente depois da confirmação.

## Fluxo de trabalho

- Um commit por mudança lógica; mensagem em pt-BR no formato `tipo(escopo): causa raiz -> solução`.
- Antes de commitar, rode `npx tsc --noEmit` em `financeiro/`; ignore apenas ruídos pré-existentes de `.next/`, `scripts/` e `scratch.ts`.
- Antes de push, rode `git pull --rebase` ou `git fetch` + `git rebase origin/main`; há outras IAs commitando no mesmo repo.
- Push na `main` = deploy imediato em produção. Só faça push quando a alteração estiver completa, revisada e testável.
- Scripts temporários de diagnóstico devem ser `*.tmp.*`, não devem ser commitados e devem ser apagados ao final.
- Escritas/migrações em produção exigem SQL idempotente (`IF EXISTS`/`IF NOT EXISTS`) e explicação do risco antes de executar.
- Ao finalizar, informe o que foi alterado, o que foi verificado e o que testar manualmente.

## Armadilhas conhecidas

- `WhatsAppMessage.messageId` não é único global; a unicidade real é `conversationId + messageId`. Nunca busque mensagem só por `messageId`.
- Contatos LID (`@lid`/`@hosted.lid`) podem falhar ao enviar pelo telefone; use primeiro o JID exato do evento e aplique status por `messageId + instância`.
- Evolution 2.3.7 quebra `/settings/set` com 500 em `integrationSession.update()`; rejeição de chamadas é aplicada no corpo de `/instance/create` e diagnosticada em `whatsapp_call_block_sync_state`.
- A VPS da Evolution não é alcançável localmente; testes locais contra endpoints da Evolution tendem a falhar por rede/IP, não necessariamente por código.
- Vercel Hobby já estourou invocações/CPU; evite polling agressivo, chamadas por item renderizado e endpoints que fan-out por registro.
- Campanhas CTWA genéricas têm variantes (`desconhecida`, `Campanha Desconhecida`, `Via Link`); normalize ao escrever e compare com helpers existentes.
- Link “Ver Anúncio” depende de `Client.fbclid` contendo URL `http` válida; `externalAdReply.sourceUrl` deve ser persistido quando existir.
- Leads via `wa.me` sem `externalAdReply` não têm metadados de anúncio recuperáveis; diferencie de falha de rastreio.
- Pipeline, Client e WhatsApp se conectam principalmente por telefone normalizado; cuidado com sufixos e números com/sem `55`.
- `Client.originUnit` é carimbado uma vez na criação e nunca deve ser sobrescrito por sync, transferência ou edição manual.
