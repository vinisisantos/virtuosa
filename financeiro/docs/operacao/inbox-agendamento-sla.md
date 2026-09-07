# Agendamento direto e espera no Inbox

Regra aprovada em 07/09/2026 para SCS, SBC e Osasco.

## Comportamento

- O botão **Agendar** abre o formulário existente do Pipeline com o contato e a unidade do chat. Fica no cabeçalho, na mesma linha da identificação, tanto no computador como no celular.
- O formulário exige data, horário e responsável da unidade. Usa os mesmos endpoints, validações de conflito e confirmações de WhatsApp já existentes no agendamento do Pipeline. Não cria uma agenda paralela.
- Uma avaliação ativa em `Agendamento` substitui o relógio de espera por um calendário. Não basta ter um estágio chamado Agendado.
- Estados ativos: `pendente`, `confirmado`, `nao_confirmou` e aliases explícitos. Cancelamento, falta, encerramento ou status desconhecido não suspendem o relógio.
- O estado operacional prevalece sobre a data: uma avaliação antiga ainda pendente continua sinalizada até registrar seu desfecho.
- Mensagens não lidas, rechame e histórico de primeira resposta humana (média, mediana, P90 e SLA de 15 minutos) permanecem inalterados.
- Se o agendamento deixar de estar ativo, o relógio volta à regra normal de última entrada/saída. Não há reescrita de timestamps.

## Isolamento e custo

`inbox-appointments-query.ts` consulta avaliações reais por telefone normalizado (DDD, com/sem 55 e nono dígito) e unidade, apenas para conversas das instâncias autorizadas. Contatos LID não são tratados como telefones. Para instância `Todas`, respeita a unidade selecionada/autorizada ou a unidade do contato.

O snapshot também atualiza conversas paginadas e selecionadas quando a resposta incremental contém `conversations: []`. Assim, alterações de agenda não dependem de mensagem nova.

- Uma query em lote a mais por atualização normal de `/api/whatsapp/conversations`; zero no resumo `summary=unread`.
- Nenhum endpoint, polling, migration ou backfill novo. Poll visível existente de 30 s: até 120 queries adicionais/hora por aba, 960 em 8 horas.
- Ao clicar AGENDAR: quatro GETs existentes (contato, funis, negócio e responsáveis). Salvar usa os POST/PUT existentes. Abrir um chat não faz essas quatro chamadas.
- Benchmark somente leitura em 07/09/2026, com todas as instâncias das três unidades: 204 correspondências, execução SQL de aproximadamente 52 ms. Reavaliar plano/índices se o volume crescer.
- O funil legado pode ter `unit=Barueri` e ser compartilhado. O isolamento está no negócio/avaliação e na unidade enviada à API; não impedir esse fallback pelo rótulo do funil.

## Verificação

```sh
npm test
npx tsc --noEmit
# Com o servidor de desenvolvimento em 127.0.0.1:3210:
node tests/inbox-scheduling-ui.mjs
node tests/inbox-header-ui.mjs
```

O teste de UI intercepta todas as APIs e bloqueia acessos externos: não grava clientes, agendas nem envia mensagens reais. Exercita SCS/SBC/Osasco em 390, 430 e 1440 px, contato novo/existente, validação, conflito, erro, agendamento e cancelamento com snapshot incremental vazio. Capturas ficam em diretório temporário informado na saída.

Teste manual de produção durante um atendimento real: atualizar o Inbox, abrir AGENDAR, conferir unidade/data/responsável, salvar e verificar a avaliação na aba Avaliações. O card deve trocar os minutos pelo calendário sem apagar mensagens não lidas. Não criar agendamento fictício em produção: o fluxo pode enviar confirmação automática.

## Cabeçalho compacto — 07/09/2026

Agendar é a única ação destacada. Ferramentas (ou ⋯ no celular) agrupa Horários, Notas, Ver anúncio quando há URL, Perfil & Funil, confirmação de avaliação quando elegível e ligação. Mais ações abre uma segunda lista no mesmo popup, evitando submenus que saem da tela: observação, retorno, não lida, arquivo, finalização/reabertura, bloqueio e exclusão administrativa. As condições de acesso e callbacks existentes permanecem; abrir o menu não faz consultas.

O nome ou telefone não é duplicado. Conta secundária continua identificada por texto ciano, discretamente abaixo do nome. Ícones acessíveis preservam estados de bloqueio, consulta, finalização e avaliação ativa. Avatar/nome continuam abrindo Perfil & Funil. A ação de observação encaminha o sinal à barra lateral e ao formulário já existente, sem criar novo campo ou endpoint.

O menu usa portal, limite da viewport, alvos de 44 px, navegação por teclado e retorno de foco; Escape fecha primeiro o overlay aberto. QA adicional cobre três unidades/larguras, consulta, bloqueio, contato sem nome, conversa finalizada, tema claro e confirmação elegível/já enviada com APIs simuladas. Nenhum envio ou gravação real em produção foi realizado pelo QA.
