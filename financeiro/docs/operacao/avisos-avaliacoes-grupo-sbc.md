# Avisos de avaliações ao grupo SBC

O grupo AVALIAÇÕES SBC recebe avisos pela Leads - Paloma. O painel de destino e histórico fica em Automações → SBC. Ele não libera a leitura de grupos no Inbox.

## Eventos e limites

- Novo agendamento: mantém o corte original do piloto e as regras existentes.
- Confirmação: uma ocorrência por avaliação e data/horário, após uma mudança para Confirmado.
- Cancelamento: uma ocorrência por avaliação e data/horário, após uma mudança futura para Desmarcou de uma avaliação ainda futura. Exige vínculo comprovado com a Leads - Paloma e nome, telefone e procedimento explícitos.
- Reagendamento: uma ocorrência por alteração real de data/horário de avaliação ativa e futura, incluindo agendas já criadas com origem comprovada na Leads - Paloma. Informa horário anterior e novo, além de nome, telefone e procedimento. Salvar igual não repete; voltar a um horário anterior é uma nova alteração.

As datas usam o fuso de São Paulo. O cancelamento não envia mensagem adicional à cliente, não dispara por exclusão e não percorre cancelamentos antigos. Repetir o status ou reabrir e desmarcar o mesmo horário não reenvia. O aviso de reagendamento ao grupo preserva a notificação individual já existente.

Status e aviso são gravados na mesma transação; o HTTP ocorre após o commit. Antes de enviar, o worker revalida agenda, origem, destino, ativação e conexão. Uma avaliação reaberta, remarcada ou excluída invalida o aviso pendente. Depois de iniciar HTTP, resultado incerto nunca autoriza reenvio automático. `submitted` é aceite do provedor, não comprovação de entrega ou leitura.

## Publicação dos cancelamentos

1. Publicar o código compatível e a migração `20261017120000_evaluation_group_cancellation_events/migration.sql`. Ela amplia somente a restrição de eventos, preservando dados e índices. O build não ativa cancelamentos.
2. Confirmar o deploy mais recente Ready no domínio de produção. Aguardar pelo menos dois minutos e drenar requisições antigas antes da ativação.
3. Conferir a configuração aprovada e a ausência de avisos `processing`/`sending`. Executar o `finalize.sql` da mesma pasta em conexão de migração. Ele exige o grupo e a instância exatos, a expansão aplicada e a fila drenada; mantém os cortes de agendamento/confirmação e adiciona somente `cancellationsActivatedAt`.
4. Ler a configuração e os totais novamente. Não criar uma avaliação fictícia nem fazer envio de teste ao grupo. Conferir a primeira ocorrência legítima no histórico e no WhatsApp.

Os dois SQLs são idempotentes e usam limites de espera por lock. Se houver fila ocupada ou configuração divergente, interromper a ativação e investigar; não remover guardas para forçar a execução.

## Publicação dos reagendamentos

1. Publicar a migração `20261017150000_evaluation_group_reschedule_events/migration.sql` e o código compatível. A expansão adiciona somente `previousStartTime` opcional e amplia a restrição de eventos. Não ativa envios nem altera avisos antigos.
2. Confirmar a versão mais recente Ready no domínio e aguardar ao menos dois minutos, com requisições antigas drenadas. Conferir o destino aprovado e ausência de avisos em processamento/envio.
3. Executar `finalize.sql` da mesma pasta em conexão de migração. Ele adiciona somente `reschedulesActivatedAt`, preservando os três cortes anteriores. Ler a configuração novamente.
4. Validar a primeira alteração legítima e a contagem de uma ocorrência. Recuperação pontual exige autorização e prova de origem e de horário anterior; usa uma chave determinística, sem alterar a agenda ou chamar o provedor diretamente. Não enviar outros reagendamentos antigos.

Agenda, Avaliações e Pipeline gravam o aviso na transação da mudança. A versão gravada identifica a ocorrência; nova mudança invalida avisos anteriores ainda não enviados, mas não reabre os já aceitos ou incertos. Não é necessário endpoint, índice ou polling novo. O caminho isolado de reagendamento mede onze operações de banco e um HTTP; o Pipeline adiciona um lock/leitura para a agenda SBC existente. Lote e orçamento compartilhados permanecem iguais.

## Pausa e retorno seguro

Pausar o grupo no painel bloqueia todos os novos avisos. Para suspender apenas cancelamentos ou reagendamentos, remover operacionalmente somente `cancellationsActivatedAt` ou `reschedulesActivatedAt`, respectivamente, com autorização. Preservar os demais campos, a coluna e os eventos existentes. Não reduzir a restrição nem promover código incompatível com os novos eventos. Não desligar o cron compartilhado de entrada e confirmações de mensagens.

Sem tabela, índice, endpoint frequente, polling ou serviço novo. O teste isolado mede dez operações de banco no caminho da outbox e um HTTP por cancelamento elegível, além da transação de atualização já existente. O lote e o orçamento do worker compartilhado permanecem inalterados.
