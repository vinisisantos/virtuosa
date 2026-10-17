# Avisos de avaliações ao grupo SBC

O grupo AVALIAÇÕES SBC recebe avisos pela Leads - Paloma. O painel de destino e histórico fica em Automações → SBC. Ele não libera a leitura de grupos no Inbox.

## Eventos e limites

- Novo agendamento: mantém o corte original do piloto e as regras existentes.
- Confirmação: uma ocorrência por avaliação e data/horário, após uma mudança para Confirmado.
- Cancelamento: uma ocorrência por avaliação e data/horário, após uma mudança futura para Desmarcou de uma avaliação ainda futura. Exige vínculo comprovado com a Leads - Paloma e nome, telefone e procedimento explícitos.

O cancelamento informa nome, telefone, procedimento, data e horário no fuso de São Paulo. Não envia mensagem adicional à cliente, não dispara por exclusão e não percorre cancelamentos antigos. Repetir o status ou reabrir e desmarcar o mesmo horário não reenvia. Reagendamento individual já existente não constitui aviso de remarcação ao grupo.

Status e aviso são gravados na mesma transação; o HTTP ocorre após o commit. Antes de enviar, o worker revalida agenda, origem, destino, ativação e conexão. Uma avaliação reaberta, remarcada ou excluída invalida o aviso pendente. Depois de iniciar HTTP, resultado incerto nunca autoriza reenvio automático. `submitted` é aceite do provedor, não comprovação de entrega ou leitura.

## Publicação dos cancelamentos

1. Publicar o código compatível e a migração `20261017120000_evaluation_group_cancellation_events/migration.sql`. Ela amplia somente a restrição de eventos, preservando dados e índices. O build não ativa cancelamentos.
2. Confirmar o deploy mais recente Ready no domínio de produção. Aguardar pelo menos dois minutos e drenar requisições antigas antes da ativação.
3. Conferir a configuração aprovada e a ausência de avisos `processing`/`sending`. Executar o `finalize.sql` da mesma pasta em conexão de migração. Ele exige o grupo e a instância exatos, a expansão aplicada e a fila drenada; mantém os cortes de agendamento/confirmação e adiciona somente `cancellationsActivatedAt`.
4. Ler a configuração e os totais novamente. Não criar uma avaliação fictícia nem fazer envio de teste ao grupo. Conferir a primeira ocorrência legítima no histórico e no WhatsApp.

Os dois SQLs são idempotentes e usam limites de espera por lock. Se houver fila ocupada ou configuração divergente, interromper a ativação e investigar; não remover guardas para forçar a execução.

## Pausa e retorno seguro

Pausar o grupo no painel bloqueia todos os novos avisos. Para suspender apenas cancelamentos, remover operacionalmente `cancellationsActivatedAt` com autorização, preservando os demais campos. Não apagar eventos, reduzir a restrição antiga nem promover código incompatível com os novos eventos. Não desligar o cron compartilhado de entrada e confirmações de mensagens.

Sem tabela, índice, endpoint frequente, polling ou serviço novo. O teste isolado mede dez operações de banco no caminho da outbox e um HTTP por cancelamento elegível, além da transação de atualização já existente. O lote e o orçamento do worker compartilhado permanecem inalterados.
