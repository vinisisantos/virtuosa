# Identificação de disparos — Osasco, SBC e SCS

Escopo ampliado em 09/09/2026: novos lotes manuais do Inbox e da Central de Follow-up de Osasco, SBC e SCS. Não ativa envios, não modifica prazos/cadências/limite de dez, não marca o histórico por heurística e não modifica o módulo legado de Broadcasts.

## Registro e isolamento

- O compositor envia UUID do lote, origem, quantidade (1–10) e rótulo da campanha apresentada ao operador. O rótulo é uma fotografia contextual do lote, não reatribui campanha ao lead.
- A rota existente valida o formato, exige conversa, `claimConversation`, texto/imagem e usa as mesmas verificações de instância, propriedade, `canReply`, bloqueio, conexão e elegibilidade do rechame.
- A unidade real da instância precisa ser Osasco, SBC ou SCS; em `Todas`, usa a unidade persistida do contato, nunca a unidade declarada no pedido. O metadado registra essa unidade real.
- Após aceite do provedor **com ID real de mensagem**, `WhatsAppMessage.dispatchMetadata` recebe JSON v1 dentro da gravação já existente. Autoria, horário e status vêm da própria mensagem, não do navegador. Sem ID real não há selo; não confundir resposta HTTP com confirmação de entrega.
- Para lotes identificados, upsert por `conversationId + messageId` trata eco anterior à resposta sem duplicar mensagem ou sobrescrever status de entrega/leitura. Não há retry automático do envio.

## Leitura e interface

- Uma consulta SQL agrupada por atualização da lista busca o último disparo de cada conversa visível já autorizada nas três unidades. Busca lateral usa índice parcial por conversa/data/ID, retornando no máximo um registro por conversa, e não varre o histórico completo. Padrão 120 conversas, teto 200. Sem conversa com unidade real habilitada, zero consultas adicionais.
- Histórico inclui o JSON na consulta existente para as três unidades. Não há endpoint novo, chamada por selo, consulta ao abrir detalhes ou novo polling. O status mostrado é o último informado pelo WhatsApp nos dados carregados; no chat aberto, o histórico atualizado tem precedência sobre o snapshot da lista.
- Lista e cabeçalho mostram selo/megafone; cada saída identificada tem marcador próprio. Clique/toque abre detalhes; mobile usa painel inferior, desktop janela central. Visualização não assume conversa nem envia mensagem.
- `sent`/`SERVER_ACK` = enviada, sem comprovação de entrega; `delivered`/`DELIVERY_ACK` = entregue; `read` = lida. Exclusão posterior preserva o registro do disparo. Falhas não inventam novo selo nem apagam um disparo anterior.

## Migração e verificação

- Duas etapas aditivas e idempotentes no build Vercel: coluna JSONB opcional com lock timeout de cinco segundos; índice parcial criado `CONCURRENTLY` em execução separada, sem bloquear escritas durante a construção. Registros antigos permanecem nulos. Não executar as demais migrações históricas manualmente.
- Testes: `npm test`, `npx tsc --noEmit`, lint direcionado e `npm run build`. UI sintética: `node tests/whatsapp-dispatch-ui.mjs` com servidor local na porta 3210, APIs interceptadas e rede externa bloqueada; 390, 430 e 1440 px nas três unidades, entrega/falha/leitura, consulta e modo claro.
- Homologação operacional: em um envio real autorizado de cada unidade, verificar selo no contato, autoria e status; recarregar; verificar mensagem individual sem marcação. Testes do agente não enviam WhatsApp real a leads.
