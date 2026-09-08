# Lembrete de confirmação sem resposta

## Operação

- Nas caixas de leads homologadas de Osasco, SBC e SCS, o padrão aprovado é **2 horas sem resposta**, com envio das **08h às 21h, America/Sao_Paulo**.
- O prazo começa na solicitação de confirmação de presença enviada pela ação **Confirmar avaliação**, não na mensagem de dados enviada ao agendar. A solicitação deve ter envio concluído, balão persistido e auditoria de sucesso com vínculo exato à mensagem.
- Configuração administrativa em **Automações → unidade → AGENDA · Sem resposta**. O atalho **Ferramentas → Lembrete sem resposta** no Inbox abre o mesmo editor; em celular, Ferramentas é o botão **⋯**. A edição vale para toda a unidade, não só para o contato aberto.
- Mensagem editável (até 4.000 caracteres), prazo inteiro de 1 a 24 horas, ativar/desativar. As variáveis seguem o renderizador existente de agenda, incluindo nome, primeiro nome, data, hora e unidade.
- O primeiro cadastro cria três configurações ativas de forma idempotente. A ativação inicial/reativação define um marco servidor: confirmações anteriores não entram. Salvar uma configuração já ativa não retroage esse marco nem autoriza trocar sua unidade/instância.

## Condições antes do envio

O processamento exige avaliação futura, status `pendente` ou `nao_confirmou`, mesma data e horário da solicitação, Pipeline ainda `agendado`, telefone correspondente e mesma instância homologada/conectada. Não envia para conversa bloqueada, arquivada ou encerrada. Mensagem excluída/com falha não origina lembrete.

Qualquer entrada posterior à solicitação interrompe o lembrete, independentemente do conteúdo ou de uma saída humana subsequente. A seleção usa `lastInboundAt` **e** o histórico para proteger contra resumo defasado, eventos fora de ordem e importação tardia. A revalidação imediatamente antes da chamada externa repete as condições e detecta alterações de configuração, destinatário ou sessão.

O lembrete não confirma, cancela ou libera o horário e não muda o Pipeline. Não se mistura com o lembrete existente para avaliações já confirmadas.

## Carga e idempotência

- Sem tabela/migração/índice novo. `Automation` guarda configuração e `AutomationLog` guarda histórico/reserva. A solicitação existente passa a registrar `confirmationMessageId` e `confirmationSentAt` na mesma atualização de log, sem query adicional.
- O cron já existente `/api/cron/whatsapp-callbacks` mantém suas rotinas e processa a nova rotina no final, se ainda tiver mais de 20 segundos disponíveis dentro do orçamento de 55 segundos. Não há nova invocação periódica.
- Uma leitura de configurações e uma seleção SQL parametrizada com joins, no máximo um candidato por ciclo. Uma leitura basta se todas estiverem desativadas; fora de 08–21h não consulta. A primeira materialização faz até três upserts extras, sem duplicar configurações concorrentes.
- A seleção parte de logs recentes indexados e usa IDs exatos de agenda/conversa. A mensagem é resolvida por **conversationId + messageId**, nunca só pelo ID do provedor. Não há varredura de todos os chats nem consulta por cartão.
- Por tentativa: reserva (1), checagem de bloqueio do remetente compartilhado (1), revalidação (1), mensagem/conversa (2), log/contador (2): sete operações além da seleção/configurações. No máximo uma chamada extra ao provedor por ciclo.
- A reserva tem chave primária determinística por tipo + agendamento + horário, independente da automação/unidade. Qualquer reserva existente bloqueia repetição, inclusive `processing`, `skipped`, `uncertain` ou erro. Não reutilizar a política de retry das confirmações antigas.
- `success` significa que o provedor aceitou e a mensagem/auditoria foram persistidas, não garantia de leitura ou recebimento no dispositivo. Falha externa ou após aceite fica `uncertain`; conferir o histórico sem reenviar cegamente. Uma reserva ainda `processing` depois de interrupção também não é repetida.
- PostgreSQL e WhatsApp não são uma única transação: a checagem usa mensagens já recebidas pelo webhook. Uma entrada ainda não entregue ao servidor ou concorrente depois da última checagem não pode ser antecipada.
- O cron roda a cada 15 minutos: o alvo de 2h pode ser atendido no ciclo seguinte e atrasar mais com fila/orçamento insuficiente. Fora da faixa, aguarda a próxima janela somente se a avaliação ainda não começou.

## Validação

- `npm test`: **306 testes passaram**, incluindo 42 novos de regras, SQL em PostgreSQL efêmero (PGlite), disputas da chave primária, revalidação, falhas simuladas e autorização/validação da API real com banco simulado. O parser de timestamp em testes é UTC, como no Prisma. PGlite serializa operações; não equivale a teste de concorrência distribuída em produção.
- `node --experimental-strip-types tests/evaluation-no-response-ui.mjs` com servidor local na porta 3210: **13 cenários passaram**, em 390, 430 e 1440 px, três unidades, conteúdo longo, edição, erros, permissões, teclado e equivalente na tela de Automações. Todas as APIs simuladas, saídas externas bloqueadas. Capturas revisadas também em tema claro.
- `npx tsc --noEmit`, lint dos módulos novos e build passaram antes do commit.
- EXPLAIN ANALYZE somente leitura validou tipos/SQL no banco real antes da criação: 0 candidatos, planejamento 67,967 ms e execução 0,415 ms. Isso não mede carga real de candidatos; a consulta é exercitada com cenários elegíveis no banco efêmero.

## Conferência após publicação

Verificar configuração ativa e prazo 2h em cada unidade, sem sobrescrever futura edição administrativa. Confirmar deploy e autenticação das APIs. Aguardar envio normal de nova solicitação de confirmação e o ciclo operacional; não enviar mensagens de teste a leads reais. Auditar resultado e balão, respeitando a instância da unidade. A entrega externa completa só pode ser confirmada quando houver uma ocorrência real elegível.
