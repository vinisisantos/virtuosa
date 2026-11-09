# Alice autônoma — operação em SBC

## Escopo autorizado

Piloto na caixa Leads - Paloma de SBC, com Claude Sonnet 4.6 e todas as campanhas. Osasco mantém sugestões revisáveis. Não há teto financeiro mensal para a geração autônoma; continuam as barreiras técnicas, de conteúdo e de intervenção humana. A estrutura nasce desativada no deploy. A ativação é uma ação administrativa auditada no painel `/crm/alice`.

## Conversas e cadência

- Cada turno aguarda no mínimo 30 segundos desde a última entrada recebida. O tempo total também inclui a fila, a geração e a rede; não é uma promessa de resposta em exatamente 30 segundos.
- O complemento do mesmo turno usa uma única geração e espera três segundos após o primeiro envio. Antes de cada saída, o sistema confere a conversa e a autorização novamente.
- Mensagem nova substitui a saída antiga ainda não iniciada. Resposta humana ou “Assumir atendimento” muda para Manual e cancela os próximos envios. Uma requisição já iniciada na rede pode concluir.
- A recepção antiga fica suspensa somente nas conversas assumidas pela Alice. ACK, eco de saída, histórico e reações não iniciam novo atendimento.
- O piloto funciona de madrugada. Os horários oferecidos para avaliações continuam limitados a segunda a sexta, 10h–20h, e sábado, 8h–13h. A oferta deve ter data explícita. Horários ocupados por outras clientes não são bloqueados.

## Pendências

A primeira ativação exige uma prévia assinada e a seleção da conversa inicial. A retomada autorizada começa pela Juh da campanha Barriga Trincada, pendente desde quarta-feira, 04/11/2026, às 17h36. O lote inclui pendências elegíveis a partir desse ponto, em ordem cronológica, com máximo de 200. O nome sozinho não é identificador suficiente: a prévia vincula conversa, fonte e horário. Se a âncora mudar, é preciso atualizar a prévia.

O botão de pausa global cancela a fila ainda não iniciada e devolve as conversas ao modo Manual. Retomar sem nova âncora permite novas entradas; não repete o lote antigo. Uma retomada explícita pode reabrir apenas itens cancelados pela pausa global que nunca começaram um envio, nunca os enviados, incertos ou parcialmente enviados.

## Agenda e segurança

O agendamento é executado pelo serviço existente somente quando houver aceitação inequívoca de uma oferta realmente enviada, nome válido, cadastro/oportunidade únicos e responsável Gabriela Anselmo ativa em SBC. A lease do turno e as configurações são conferidas novamente na transação de gravação. Não é fabricada uma sessão de administrador para o worker.

Após a gravação, o fluxo existente envia a confirmação com endereço, data e hora e mantém o aviso de grupo. Sem confirmação do provedor, o agendamento é preservado e a equipe é avisada; não há reenvio automático. A IA não pode afirmar que reservou um horário sem a gravação real.

Conteúdo clínico, falta de base, dúvida de interpretação, resposta inválida ou baixa confiança interrompem o agente e encaminham à equipe. Isso não representa uma falha de entrega nem autoriza inventar uma resposta.

## Identificação do atendimento no Inbox

Após a primeira saída aceita na ativação atual da conversa, a lista identifica a atendente como Alice, em vez de “Sem atendente”. Apenas entrar na fila não comprova atendimento. A prova vem de `AliceAutonomousTurn.firstSentAt`, com a mesma conversa/instância, e deixa de valer ao mudar para Manual, pausar comercialmente, bloquear ou encerrar o chat. Não se cria uma usuária fictícia nem se altera `assignedTo` para conceder acessos. Leituras anteriores à atualização permanecem sujeitas ao intervalo normal de refresh do Inbox.

Novas respostas e confirmações de agenda autônomas registram `respondedByName = Alice`, sem ID de usuária humana. A interface também reconhece o nome legado “Alice (automação)”; não reescreve mensagens de operadores humanos nem renomeia genericamente as outras automações. A mudança de autoria é mostrada mesmo quando recepção e Alice têm `respondedBy` nulo. Os indicadores históricos de respostas humanas não passam a contabilizar a Alice como pessoa.

O botão “Assumir atendimento” pausa o agente e cancela as próximas saídas antes de atribuir a pessoa autorizada. A confirmação automática de uma agenda humana mantém sua identificação anterior. Uma nova avaliação criada pela Alice reutiliza a outbox e o aviso ao grupo existentes, com a origem da caixa de SBC e a mesma deduplicação; não há segunda automação ou reenvio de avisos antigos.

A lista acrescenta no máximo uma consulta de prova de atendimento por página/atualização com chats autônomos da caixa de SBC; não faz consulta por item, não acrescenta polling e não acessa o modelo ou a Evolution para obter esse rótulo. A retomada humana de SBC usa a barreira de pausa existente (duas atualizações curtas); as demais caixas preservam o caminho anterior.

## Painel e custos

O painel reúne conversas, fila, turnos com envio aceito, encaminhamentos, falhas, situações incertas e agendamentos registrados. “Envio aceito” não comprova entrega ou leitura. Agendamento não comprova comparecimento nem venda.

Os custos são calculados a partir dos tokens retornados pela Anthropic, incluindo categorias de cache. São estimativas em dólares, não a fatura do provedor. Se uma chamada é interrompida sem dados de uso, seu custo fica não apurado, nunca tratado como zero confirmado. A latência das novas entradas é separada da latência das retomadas.

O acompanhamento é atualizado por ação humana, sem polling do navegador. A lista tem paginação manual. A pausa global e o acesso ao painel exigem administração e o acesso já autorizado à Alice; não concedem acesso a outras unidades.

## Carga e falhas

O pg_cron verifica a fila indexada a cada dez segundos (8.640 verificações SQL/dia), mas chama a Vercel apenas quando há trabalho vencido e não existe lease global válida. Cada invocação gera no máximo um turno e pode continuar apenas seu complemento, com espera curta de até três segundos. Novas entradas têm prioridade sobre o lote histórico; dentro do lote é mantida a ordem cronológica. Não há loop drenando todos os contatos ou polling por item renderizado.

Uma resposta de duas mensagens utiliza uma chamada ao modelo; a estimativa inicial é de 20–30 operações Prisma por etapa, além do enfileiramento/recepção. Relações podem produzir SQL adicional. O claim mantém somente uma lease global por uma transação curta, sem segurar o banco durante rede ou geração. O agendamento usa o serviço e os controles adicionais existentes. A leitura administrativa agrupa métricas e contatos em consultas limitadas, sem consulta por linha.

Falha ou envio incerto ativa um respiro operacional de cinco minutos no worker. Isso não é limite financeiro. A fila durável distingue processamento interrompido de envio incerto e nunca repete uma saída que pode ter sido aceita. A equipe deve conferir o histórico antes de retomar um caso incerto.

## Publicação

A migração aditiva cria `AliceAutonomousTurn` com unicidade por conversa/fonte, índices de fila, RLS e acesso público revogado. O build de produção reaplica as migrações idempotentes já usadas pelo projeto e provisiona o agendador; não ativa o piloto nem escolhe a coorte histórica por conta própria. O estado real da publicação e da ativação deve ser confirmado em produção, não inferido deste documento.

Como o build reaplica arquivos antigos, a migração inicial do copiloto não pode recriar uma restrição mais estreita após existir `agent`. Ela cria a restrição inicial somente se ausente e preserva a ampliação posterior; a migração da autonomia continua responsável por autorizar o terceiro modo. O teste de replay cobre a sequência antiga → autonomia → conversa ativa → antiga → autonomia, repetida sem reescrever o modo do chat.
