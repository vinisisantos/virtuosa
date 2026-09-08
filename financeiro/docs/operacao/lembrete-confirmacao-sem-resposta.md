# Lembrete de confirmação sem resposta — envio manual

## Operação atual

Vinicius pediu que o envio aconteça **somente quando clicar no botão**, substituindo a versão automática. O prazo padrão de **2 horas sem resposta** foi preservado nas caixas homologadas de Osasco, SBC e SCS.

- No chat: **Ferramentas → Enviar lembrete sem resposta**. No celular, Ferramentas é **⋯**. Clicar envia diretamente para a conversa escolhida, sem abrir a configuração.
- Durante a requisição o botão fica desabilitado; depois do sucesso mostra **Lembrete já enviado** para a ocorrência exibida. Mesmo após recarregar a página ou em cliques concorrentes, a reserva no servidor impede repetição.
- Envio segue `canReply` do resolvedor existente (proprietário/membro autorizado/proxy administrativo explícito). Consulta, outra caixa ou unidade não ganham acesso. Identidade extraída do JWT verificado, nunca dos cabeçalhos fornecidos pelo cliente.
- Texto, prazo e habilitação ficam em **Automações → unidade → AGENDA · Sem resposta** e continuam administrativos. Habilitar significa **permitir envio pelo botão**, nunca envio automático. Salvar/abrir não dispara mensagens.
- A rotina foi retirada do cron. Sem clique não existe envio e não é preciso esperar ciclo de 15 minutos. Lembrete do dia para avaliações já confirmadas e outras automações foram preservados.

## Regras antes do envio

- Confirmação de presença enviada com sucesso e vinculada à mensagem exata por `conversationId + messageId`. Contagem pelo timestamp desse envio, não pela mensagem imediata de dados do agendamento.
- Pelo menos o prazo configurado sem qualquer entrada do lead, padrão 2h (editável de 1 a 24h). **Sem restrição de horário do dia**, inclusive após 21h e antes de 8h. Continua exigindo avaliação futura. Campos legados `earliestHour`/`latestHour` não limitam o envio e deixam de ser gravados na criação/edição da configuração; não é necessária migração.
- Avaliação futura, pendente ou `nao_confirmou`, mesma data da solicitação, Pipeline ainda `agendado`, telefone correspondente, unidade/instância homologadas e conectadas. Conversa não bloqueada, arquivada ou encerrada.
- Resumo `lastInboundAt` e histórico são consultados, inclusive entradas antigas importadas depois da solicitação. Resposta, confirmação, cancelamento, reagendamento ou mudança de configuração/destinatário antes do envio impedem o disparo.
- O clique individual pode usar confirmação vinculada anterior ao cadastro do modelo: o marco de ativação da antiga rotina automática não é mais uma barreira. Não há varredura/disparo retroativo ou em lote. Logs legados sem `confirmationMessageId` continuam inelegíveis; não se adivinha qual mensagem foi enviada.
- Consulta restrita ao ID do chat escolhido desde a seleção até a revalidação final; nunca usa outro contato como fallback.
- Não confirma/cancela/libera horário nem move Pipeline. Registra `source: manual`, identidade do operador e mensagem no histórico.

## Carga e idempotência

- Sem tabela/migração/índice novo. `Automation` e `AutomationLog` mantêm configuração/auditoria. Configuração ausente é criada por upsert de ID fixo no primeiro envio autorizado da unidade ou na abertura administrativa; não exige cadastro manual no banco.
- Zero chamadas/queries extras ao abrir chat/menu e **zero trabalho deste lembrete no cron**. Um POST por clique, sem polling ou GET de elegibilidade por conversa.
- Caminho habitual: 1–3 leituras de acesso, 1 da conversa, 1 da configuração e 1 seleção SQL; se elegível, mais 7 operações para reserva, bloqueio, revalidação, balão/conversa e log/contador. Aproximadamente 11–13 operações por envio, mais 1 upsert se faltar configuração. Uma chamada ao provedor, sem fan-out.
- Reserva determinística tipo + agendamento + horário, compartilhada com tentativas históricas da versão automática. Todos os estados reservados bloqueiam novo envio: processing, success, skipped, uncertain ou erro. Não reutilizar retry de outras confirmações.
- Falha externa, timeout ou falha de auditoria após aceite fica incerta e não libera repetição. A interface não mostra sucesso nesses casos. Sucesso comprova aceite/persistência, não leitura ou entrega no aparelho.
- Revalidação não é transação distribuída com WhatsApp: entradas ainda não recebidas pelo webhook ou concorrentes após a última checagem não podem ser antecipadas.

## Validação e teste operacional

- `npm test`: **324 testes passaram**, cobrindo política, SQL PostgreSQL efêmero/PGlite, isolamento, clique concorrente, revalidação, falhas e API real com JWT/banco sintéticos. Inclui 12 cenários de madrugada/antes de 8h/a partir de 21h nas três unidades, limite exato de 2h, não repetição e um cenário que atravessa 21h entre clique e envio. Timestamp sem fuso interpretado como UTC no fixture, como no Prisma.
- `node --experimental-strip-types tests/evaluation-no-response-ui.mjs`: **15 cenários passaram**, com servidor local porta 3210, APIs simuladas e saídas externas bloqueadas. Desktop/mobile 390/430/1440, três unidades, permissões, envio direto, loading, erro, botão desabilitado e configuração sem envio. Capturas também revisadas no tema claro.
- Antes do commit: `npx tsc --noEmit`, lint direcionado, build e `git diff --check`.
- Após deploy: atualizar o Inbox e, em atendimento real elegível, abrir Ferramentas/⋯ e clicar **Enviar lembrete sem resposta**; conferir balão/log e recebimento. Não enviar testes a leads reais. O acesso local ao banco é de auditoria, sem INSERT em Automation; usar o fluxo normal autenticado.

## Versão anterior preservada

O commit `cbfd915` havia publicado processamento automático no cron a cada 15 minutos, após marco de ativação e no máximo um envio por ciclo. A mudança para envio manual remove explicitamente esse comportamento a pedido de Vinicius. Mensagens, configurações e reservas históricas não são apagadas.

O commit `b1e7f0f` tornou o envio manual, mas ainda mantinha a faixa 08–21h. Vinicius pediu retirar essa trava; a liberação atual vale somente para este lembrete manual, sem mudar horários de outras automações.
