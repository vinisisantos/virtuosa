# IA assistida no Inbox de SCS — desenho técnico e viabilidade

Data: 05/09/2026. Agente: Codex.

Status: escopo e teto de US$ 5/dia confirmados por “Pode fazer”. Código implementado e validado localmente; não implantado/ativado em produção. Estimativas iniciais preservadas abaixo; resultado da implementação e carga revisada ao final.

## Objetivo e limites

Observar respostas humanas, extrair conhecimento por assunto e sugerir respostas para perguntas semanticamente equivalentes. Começar somente nas instâncias autorizadas de SCS. Envio continua manual. Observar não habilita canário, envio automático, agenda automática nem conhecimento experimental de outros runtimes.

Captura automática não equivale a publicação automática: conteúdo novo ou alterado entra em revisão por assunto. Um conteúdo aprovado pode ser usado em novas perguntas equivalentes sem aprovação repetida. Explicações de procedimentos e cuidados posteriores exigem validação técnica e condições de aplicação explícitas.

## Evidência atual

- Next.js 16.1.6, Prisma 6.19.2, Postgres/Supabase e Vercel; singleton limitado a uma conexão por processo.
- Duas instâncias ativas de SCS, ambas captadoras de leads.
- Em 04/09: 767 mensagens, 310 recebidas, 328 saídas com autoria identificada em 110 conversas.
- Em 05/09, até a consulta noturna: 569 mensagens, 243 recebidas, 234 saídas com autoria identificada em 78 conversas. O dia ainda não estava completo.
- Essas contagens são de atividade das caixas, não de leads novos nem de exemplos válidos para aprendizado. Autoria é um sinal inicial, não prova suficiente para promoção de conteúdo.
- `WhatsAppMessage.timestamp` é `timestamp without time zone` com valores UTC. Agrupar dias com `timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'`; uma conversão única produz dias incorretos.
- `pg_cron` 1.6.4 e `pg_net` 0.20.0 instalados. `vector` 0.8.0 disponível, ainda não instalado.
- Conexão local não tem CREATE no banco/esquemas nem USAGE no schema cron. Não pode executar migração ou criar job.
- `OPENAI_API_KEY` e `CRON_SECRET` constam nos metadados de produção Vercel do projeto financeiro. Valores não foram lidos/baixados; funcionamento das credenciais ainda não foi testado.
- A mineração atual usa palavras-chave e pode inferir Barriga Trincada só por conter abdômen/gordura. A memória de treinamento usa sobreposição de palavras, sem filtro semântico confiável por procedimento. Não reutilizar esses classificadores como motor deste recurso.
- Na auditoria anterior não havia memória/procedimentos aprovados de SCS/Todas na base de IA. Isso não descreve o conteúdo de outros módulos, nem autoriza importar treinamento experimental.

## Modelo proposto

### 1. Captura incremental

- Uma fila própria por conversa recebe sinal após nova resposta humana elegível persistida com sucesso; custo-alvo de uma gravação adicional, sem chamada de IA no envio.
- Usar unidade/instância resolvidas no servidor e lista explícita de instâncias participantes. Não confiar no seletor da interface como autorização.
- Enfileirar também correções suportadas de mensagens, com versão/fingerprint; webhook repetido não cria extração duplicada.
- Saídas automáticas, tentativas que falharam, autoria desconhecida e texto da IA sem correção não viram evidência humana automaticamente. Áudios só entram quando já houver transcrição válida; transcrever automaticamente está fora deste piloto.
- Começar com eventos posteriores à ativação. Importação retroativa exige ação/escopo próprios; não reprocessar todo o histórico silenciosamente.
- Versões sucessivas da mesma conversa são consolidadas antes da extração. Se uma mensagem chega durante processamento, preservar o trabalho novo para outro ciclo.

### 2. Observador independente

- Novo endpoint `/api/cron/ai-inbox-observe`, autenticado pelo segredo operacional, com rota explicitamente tratada em `financeiro/middleware.ts` (middleware ativo na raiz do app).
- Job próprio a cada 15 minutos: 96 invocações/dia. Não alterar nem incorporar IA ao job dos lembretes existentes.
- Até cinco versões de conversas por lote, uma chamada de extração, até 40 lotes/dia: capacidade máxima inicial de 200 versões/dia, não 200 pessoas distintas.
- Cada ciclo vazio ou com cota esgotada não chama a IA. Fila pendente permanece visível e não é descartada.
- Claim/lease e idempotência duráveis no banco, com transações curtas. Nunca manter conexão/transação aberta enquanto aguarda a API.
- Recuperar contexto em lote, com mensagens limitadas e agrupadas por conversa, sem query por mensagem.
- Extrair perguntas/intenção, resposta geral, procedimento/protocolo, região/objetivo, condições, risco, fontes e possível conflito. Não tratar texto de cliente ou atendente como instrução de sistema.
- Dados individuais não entram no conhecimento compartilhado. Redução de PII e revisão são obrigatórias; não prometer anonimização infalível apenas por regex.

### 3. Conhecimento semântico e revisão

- Nova base dedicada, isolada de AiTrainingMemory/AiShadowRun e do canário, para evitar alimentar outros runtimes ou distorcer métricas existentes.
- Embeddings `text-embedding-3-small`, inicialmente 512 dimensões; indexação de conteúdos novos/alterados em lote. Busca via pgvector no próprio Postgres.
- Recuperar até cinco fichas aprovadas, vigentes e compatíveis com unidade/procedimento. Similaridade não é aprovação nem comprovação de aplicabilidade; o gerador deve checar o contexto e citar internamente as fichas usadas.
- Para o piloto, até 500 fichas ativas e busca vetorial exata no conjunto filtrado. Vetores dessas 500 fichas ocupam aproximadamente 1 MB, sem contar texto/índices/overhead. Não criar HNSW antes de medir necessidade.
- Identificar duplicidades, agrupar variantes de pergunta e apresentar conflitos. Edição invalida aprovação/embedding anteriores até nova revisão; não substituir uma ficha vigente com base apenas na mensagem mais recente.
- Informação clínica e pós-procedimento dependem de validação da responsável técnica, registrada por pessoa autorizada. Não generalizar conduta individual, medicação, recomendação condicionada ou sintomas/complicações.
- Horários, preços e agenda devem priorizar os cadastros vigentes e suas condições, não uma mensagem antiga.
- Fichas sem clareza de procedimento geram pedido de esclarecimento; abdômen/flacidez não identificam sozinhos um tratamento.

### 4. Sugestões dentro do chat

- Endpoint dedicado `/api/whatsapp/reply-suggestions` e componente isolado, mobile-first, inserido no Inbox.
- Gerar somente por ação da atendente; abrir/trocar/atualizar chat não chama modelo ou embeddings.
- Acesso validado por conversa, instância, unidade SCS e `canReply`. VIEWER não pode gerar ou usar; administradores seguem o proxy explícito existente.
- Recarregar histórico recente no servidor; não aceitar histórico, campanha ou conhecimento arbitrários enviados pelo navegador.
- Por solicitação efetiva: uma busca de embedding da pergunta contextualizada e uma chamada de geração. Sem retries de IA automáticos; clique duplicado/contexto idêntico reaproveita operação válida.
- Prévia com texto sugerido, fontes autorizadas e alertas. Inserção exige clique e preserva texto já digitado; não assume conversa, não envia mensagem e não reserva agenda.
- Resposta nova, edição, mudança de retorno/campanha, retirada de fonte aprovada ou revogação de acesso invalida a sugestão. Revalidar ao aplicar, além da invalidação da interface; isso pode acrescentar até três leituras nessa ação.
- Sem base suficiente: sinalizar a lacuna, permitir orientação comercial segura ou recomendar conferência humana. Não preencher lacunas clínicas com conhecimento genérico do modelo.

### 5. Painel Aprendizados

Dentro do fluxo do Inbox, listar pendências por assunto, conteúdo aprovado, conflitos, fontes, versão, consumo e fila. Acesso às conversas de origem continua restrito; ficha publicada para a unidade não expõe a conversa bruta a outro dono.

Revisores autorizados podem corrigir, aprovar, rejeitar e desativar fichas. Aprovação clínica é distinta de permissão genérica de atendimento. Nenhuma promoção automática por repetição de uma resposta ou por uma sugestão da própria IA.

## Estrutura de dados

Três tabelas aditivas propostas:

1. `AiInboxObservation`: fila/coalescência por conversa, versão capturada, lease, tentativas, próxima execução e erro resumido.
2. `AiInboxKnowledge`: ficha, escopo, metadados, fonte, revisão/versionamento e embedding `vector(512)`.
3. `AiInboxOperation`: idempotência, geração/extração, auditoria, snapshot/fichas usadas, tokens e reserva/custo de API.

Reutilizar AppSetting para configuração do piloto e controle diário de orçamento, com chave própria e atualização atômica. Não reutilizar a memória experimental como base de produção.

Índices novos: fila por unidade/status/vencimento; unicidade de fila/idempotência; conhecimento por unidade/status/procedimento; operações por unidade/data/tipo e identidade. Busca vetorial exata inicialmente; validar planos com limites reais.

Migração idempotente e aditiva: criar extensão, tabelas, índices e privilégios mínimos; não apagar nem reclassificar dados existentes. Bloquear exposição direta por APIs públicas do Supabase (RLS/privilégios) e validar acesso no servidor. Aplicação/migração do agendador requer acesso administrativo, hoje indisponível pela conexão local.

## Carga estimada, antes da implementação

| Ação | Banco | APIs externas |
| --- | --- | --- |
| Abrir/atualizar chat | Zero operações novas do recurso | Zero |
| Resposta humana elegível | Uma gravação na fila | Zero |
| Ciclo vazio do observador | Aproximadamente duas leituras | Zero |
| Lote de até cinco conversas | 12–20 operações, incluindo claim, contexto, reserva, persistência e auditoria | Uma extração; até uma indexação em lote |
| Gerar sugestão nova | 15–22 operações, incluindo acesso, contexto, busca, reserva, revalidação e auditoria | Um embedding e uma geração |
| Aplicar sugestão | Até três leituras para revalidar contexto/fontes/acesso | Zero; envio separado continua manual |
| Abrir página do painel | Duas–três consultas paginadas/agregadas | Zero |

No cenário de 328 respostas/dia, 96 ciclos e cotas máximas: ordem de 3.600 operações adicionais/dia antes das ações de revisão/aplicação, sem fan-out por mensagem. Estes números são orçamento de implementação, não medição de SQL real. Medir queries, planos e CPU antes da publicação.

## Custo e limites propostos

Preços Standard short-context consultados: GPT-5.6 Terra, US$ 2/M tokens de entrada e US$ 12/M saída; text-embedding-3-small, US$ 0,02/M entrada. Saída inclui raciocínio cobrado.

| Uso | Limite técnico de referência | Custo máximo de referência |
| --- | --- | --- |
| Uma sugestão | 8.000 tokens entrada + 1.200 saída | US$ 0,0304 |
| 100 sugestões/dia | Mesmo limite por sugestão | US$ 3,04 |
| Um lote de observação | 12.000 entrada + 2.000 saída | US$ 0,048 |
| 40 lotes/dia | Até 200 versões de conversas | US$ 1,92 |
| Embeddings do piloto | Exemplo conservador de 400.000 tokens/dia | US$ 0,008 |

Total de referência: US$ 4,968/dia. Proposta: teto operacional de US$ 5/dia por SCS, com reserva atômica conservadora antes de cada chamada e contabilização de uso. Se não houver orçamento suficiente, pausar IA e preservar fila; Inbox/envio manual continuam funcionando. Uma chamada com resultado incerto conserva sua reserva para impedir gasto duplicado. Validar contagem de tokens/limites de entrada antes de afirmar um teto real implantado.

Câmbio, tributos, infraestrutura e eventual importação histórica não estão incluídos. Limites de 100 sugestões/200 versões são tetos, não garantia de que todo o histórico diário será processado. Ajustar após observar fila/uso e qualidade. Não criar contratação, comprar créditos ou alterar plano.

## Verificação antes de concluir

- Testar paráfrases positivas e negativas: funcionamento versus vaga de agenda; cuidado posterior do mesmo protocolo versus outro; pergunta específica que exige identificar procedimento; correção de informação vigente.
- Testar evidência insuficiente, conflito de fichas, instruções maliciosas dentro da conversa, dados pessoais e conteúdo clínico não aprovado.
- Testar isolamento SCS/Osasco/SBC, OWNER/MANAGER/AGENT/VIEWER, proxy administrativo, revogação e acesso às fontes.
- Testar concorrência, duplo clique, custo reservado, timeout, mensagem durante geração, edição e retirada de ficha aprovada.
- Testar captura/idempotência e retomada da fila, sem usar clientes reais como destinatários de testes.
- Validar UI em 390, 430 e 1440 px, texto longo, carregamento/erro, teclado e preservação de rascunho.
- Executar testes, `npx tsc --noEmit`, lint direcionado, build e `git diff --check`; um commit por mudança lógica. Fetch/rebase antes de eventual push.

## Pendências específicas

- Limites/custo do estudo ampliado confirmados pelo usuário após apresentação do estudo.
- Disponibilizar execução administrativa da migração e do novo agendador; não tentar contornar a conexão somente leitura nem copiar credenciais de produção para o ambiente local.
- Testar credencial/modelos em ambiente autorizado e custo controlado; listar a variável em produção não comprova funcionamento.
- Registrar responsáveis pela aprovação técnica na ativação do piloto. Até aprovação, conteúdo clínico permanece pendente.
- A implantação em produção deve ser tratada separadamente após código/testes e preparação do banco, sem ativação parcial.

## Fontes

- [OpenAI — embeddings](https://developers.openai.com/api/docs/guides/embeddings)
- [OpenAI — Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI — preços](https://developers.openai.com/api/docs/pricing)
- [Supabase — busca semântica](https://supabase.com/docs/guides/ai/semantic-search)
- Evidência local: `src/lib/ai-training.ts`, `src/app/api/crm/ai-shadow/knowledge/mine/route.ts`, `src/lib/whatsapp/instance-resolver.ts`, `src/app/crm/inbox/page.tsx`, `scripts/setup-whatsapp-callback-cron.ts`, `prisma/schema.prisma` e consulta agregada temporária removida após o diagnóstico.

## Resultado da implementação local

- Três tabelas aditivas e extensão vetorial; RLS habilitado, sem concessão a anon/authenticated. Migração deliberadamente fora do build automático até preparação administrativa.
- Captura de textos enviados e editados pelo CRM, uma gravação adicional elegível e falha isolada do envio. Não atribuir ao humano mensagens enviadas por fora do CRM sem autoria identificada. Áudio não é transcrito automaticamente; transcrições já existentes podem contextualizar o lote.
- Observador separado dos lembretes. Até cinco conversas/40 lotes, mas respostas longas reduzem o lote; nenhuma promessa de cobrir 200 pessoas únicas. Textos que excedem o contexto seguro ficam sinalizados para revisão. Falhas mantêm reserva e podem ser retomadas explicitamente por revisor; não há retry da API dentro de uma solicitação.
- Busca exata por vetores de 512 dimensões. Apenas fichas aprovadas/vigentes; informações clínicas exigem procedimento explícito no contexto recebido e aprovação técnica. O cadastro atual AiUnitKnowledge fornece somente endereço/horários e prevalece sobre memória; regras clínicas experimentais não são importadas.
- Candidatos não alteram fichas aprovadas. Versões/histórico, validade de até 90 dias e sinalização de fichas semelhantes. Revisão e fontes brutas limitadas à caixa autorizada; fichas aprovadas são compartilhadas sem expor a conversa de outro dono.
- Botão Sugerir resposta, inserção sem substituir o rascunho e painel Aprendizados responsivo. Rascunho invalidado por alterações no contexto/fonte/permissão; silêncio da IA quando não houver fonte suficiente. Sem envio, tomada de conversa ou reserva de agenda.
- Claims de papel/unidade/permissões são relidos antes de usar o resolvedor existente; um JWT antigo não preserva uma permissão revogada para a IA.
- Reserva conservadora em micros de dólar: US$ 0,03056 por sugestão, US$ 0,04848 por lote, US$ 0,0005 por indexação em aprovação. A entrada é limitada por bytes UTF-8 com folga de envelope; saída tem limite explícito de tokens. Custos reais são registrados quando conhecidos, mas a reserva não é devolvida, inclusive em timeout. O teto de US$ 5/dia inclui todas essas operações; indexações/revisões podem reduzir a capacidade diária restante.

### Correção do dimensionamento inicial

A checagem completa não cabe nas três leituras inicialmente estimadas para aplicar uma sugestão. Os testes exercitaram **21 instruções SQL por geração e oito por aplicação** no adaptador de teste; isso NÃO inclui consultas reais do resolvedor de instância, relacionamentos aninhados do Prisma, lookup de campanha e cadastro da unidade substituídos por fixtures. Reservar aproximadamente **30–35 operações por geração**, **12–14 por aplicação**, **até 30–35 por lote de cinco** e **6–8 por abertura do painel** incluindo acesso. São limites de planejamento revisados, não medição de latência/CPU em produção. Há zero consultas novas ao abrir/trocar o chat e nenhuma chamada adicional à Evolution.

No cenário completo (328 capturas + 96 ciclos vazios como margem + 40 lotes + 100 sugestões + 100 aplicações), reservar ordem de **6.800 operações/dia**, além de revisões. A estimativa inicial de 3.600 excluía aplicação e subestimava a revalidação. O teto de IA e as 96 invocações do observador não aumentaram. Medir planos/latência no ambiente autorizado antes de ativar; o singleton e transações curtas continuam obrigatórios.

### Verificações realizadas

- 16 testes com PostgreSQL/pgvector em memória (PGlite): idempotência da migração, RLS/privilégios, fila/coalescência, nova revisão durante lease, fontes, isolamento, visualizador, limite monetário/quantitativo concorrente, conteúdo clínico, invalidação, aprovação e cron.
- Geração/embeddings substituídos por respostas sintéticas nos testes: comprovam contratos e regras, não qualidade semântica real nem validade da chave em produção. Não houve chamada paga de IA nesta implementação.
- Puppeteer com fixture local e respostas fictícias: 390, 430 e 1440 px; rolagem até os controles, texto longo, carregamento/erro, estado vazio, preservação de rascunho e invalidação após mensagem nova. Sem overflow e sem erros de página. Fixture pública temporária removida antes do build; componente de fixture permanece apenas em tests/fixtures.
- Prisma validate/generate, TypeScript, lint direcionado e build de produção locais. Warnings existentes do Next sobre middleware/edge não impediram o build.
- Nenhum WhatsApp enviado e nenhum dado real criado/alterado. relatorios/ preexistente preservado.

Ativação e teste real controlado: ver `docs/operacao/ia-inbox-scs.md`.
