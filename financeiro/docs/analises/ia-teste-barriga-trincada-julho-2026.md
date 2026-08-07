# Estudo de viabilidade — IA TESTE baseada nos chats de Barriga Trincada

Data da análise: 06/08/2026
Coorte congelada: leads recebidos entre 01/07 e 31/07/2026, observados até 06/08/2026 18:47 (America/Sao_Paulo)

## Resumo executivo

A coorte contém 732 chats elegíveis: 566 de Osasco e 166 de SCS. Foram analisadas 3.571 mensagens recebidas e 7.647 mensagens humanas enviadas; 904 mensagens identificadas como automação foram excluídas. Não houve escrita no CRM nem persistência de texto bruto fora do histórico original.

Foram encontrados 74 chats com registro de agendamento criado dentro da janela do lead, taxa descritiva de 10,1%. Os casos agendados estiveram associados a resposta mais rápida, mensagens menores, convite claro para avaliação, duas opções de horário e pergunta de fechamento. Os principais sinais negativos foram demora, conversa que não avança, follow-ups prolongados, pressão e falta de resposta objetiva à pergunta do lead.

A construção da IA TESTE é tecnicamente viável sem nova tabela, migração ou endpoint. O desenho recomendado é um novo `runtimeVersion` interno e isolado, usando as tabelas e rotas de simulação já existentes, sem acesso à base, memórias, Caderno ou criativos das IAs atuais. O primeiro protótipo simula a agenda e não envia mensagens ao WhatsApp.

## Escopo e método

- Campanha: Barriga Trincada.
- Unidades: Osasco e SCS.
- Um chat por telefone e unidade, deduplicado por proximidade da chegada.
- Exigida mensagem recebida e resposta humana posterior.
- Janela individual: chegada até o menor valor entre 30 dias e o congelamento da coorte.
- Saídas com `respondedByName` iniciado por `Automação` foram excluídas.
- Três saídas humanas anteriores à primeira mensagem recebida da janela foram descartadas como contexto de outra interação; por isso a análise usa 7.647, enquanto a contagem puramente por metadados registrou 7.650.
- 468 mensagens possuem operador explícito; 7.179 saídas são compatíveis com WhatsApp direto/legado e não permitem atribuição nominal.
- O texto foi anonimizado em memória, removendo nomes conhecidos, telefones, e-mails, CPF, CEP, links e identificadores.
- A classificação usou `gpt-5.6-luna` em 37 lotes, com Structured Outputs e `store: false`.
- A síntese usou `gpt-5.6-sol` apenas sobre agregados e resumos anônimos, sem receber os chats brutos.
- Todos os 732 IDs foram validados. IDs ausentes ou repetidos bloquearam a primeira síntese; a passagem válida reparou os casos e confirmou 732/732.

## Resultado quantitativo

| Indicador | Total | Osasco | SCS |
|---|---:|---:|---:|
| Chats | 732 | 566 | 166 |
| Agenda registrada | 74 | 63 | 11 |
| Taxa descritiva | 10,1% | 11,1% | 6,6% |
| Latência mediana | 11,1 min | 9,9 min | 16,4 min |
| Latência P75 | 213,2 min | 172,2 min | 801 min |
| Tamanho mediano da resposta | 70 caracteres | 68 | 77 |
| Respostas com pergunta | 63,5% | 61,3% | 70,4% |
| Respostas com emoji | 32,9% | 30,3% | 40,8% |

### Agendados versus não agendados

| Indicador | Agendados (74) | Não agendados (658) |
|---|---:|---:|
| Latência mediana | 6,6 min | 14 min |
| Latência P75 | 15,6 min | 717,7 min |
| Tamanho mediano da resposta | 47 caracteres | 75 caracteres |
| Respostas com pergunta | 47,6% | 67,3% |
| Respostas com emoji | 19,4% | 36,1% |

Esses resultados são observacionais. Não demonstram que velocidade, tamanho, pergunta ou emoji causaram o agendamento. Interesse prévio, disponibilidade, horário, unidade e perfil do lead podem explicar parte da diferença.

## Padrões associados ao avanço

1. Oferta concreta de horário: apareceu em 73 dos 74 chats agendados.
2. Pergunta de fechamento: apareceu em 71 dos 74 agendados; a taxa descritiva dentro dos chats com essa estratégia foi 42%.
3. Duas opções de horário: apareceu em 69 dos 74 agendados; taxa descritiva de 30% dentro do grupo com essa estratégia.
4. Tom consultivo: 34 agendas em 157 chats classificados com esse tom, taxa descritiva de 21,7%.
5. Respostas mais rápidas e curtas, com uma ação clara por vez.
6. Se o primeiro horário não servia, as conversas positivas negociavam dia/período até confirmação.
7. A explicação do procedimento funcionava melhor como ponte para a avaliação, não como substituta dela.

`Confirmação`, `coleta de dados` e `avançou até agenda` são etiquetas próximas do próprio desfecho e têm vazamento de resultado. Não devem ser interpretadas como técnicas causais.

## Padrões de estagnação

- 480 chats foram classificados com o lead deixando de responder.
- 435 ficaram estagnados e 178 avançaram apenas parcialmente.
- Follow-up apareceu como estratégia em 441 chats, mas em apenas 13 dos 74 agendados. Ele normalmente ocorre depois que o caso já estagnou; a associação baixa não prova que o follow-up causou a falha.
- Tom pressionador: 2 agendas em 164 chats classificados, taxa descritiva de 1,2%.
- Urgência: 2 agendas em 140 chats; escassez: nenhuma em 14 chats.
- Demora foi a principal fricção classificada em 103 conversas.
- Textos longos, múltiplas perguntas e insistência sem informação nova apareceram nos casos negativos.
- Em alguns casos, preço, localização ou outra pergunta objetiva não foi respondida antes da sequência de follow-up.

### Diferenças entre unidades

- SCS teve menor taxa registrada e cauda de atraso muito maior.
- SCS usou mensagens maiores, mais perguntas e mais emojis.
- O modelo classificou 80 de 166 chats de SCS como pressionadores, contra 84 de 566 em Osasco. Essa classificação precisa de auditoria humana antes de virar métrica operacional.
- SCS não possui operador explícito nas mensagens analisadas, enquanto Osasco possui 468 saídas identificadas. Isso limita comparação direta e indica diferença de instrumentação.

## Segurança: o que não deve ser aprendido

A classificação automática sinalizou:

- 330 chats com possível diagnóstico/indicação sem avaliação;
- 271 com possível promessa de resultado;
- 213 com possível pressão excessiva;
- 27 com possível orientação clínica específica;
- 9 com possível informação inconsistente.

Esses números são triagem feita por modelo, não revisão clínica humana. Podem conter falsos positivos. Mesmo assim, confirmam que copiar respostas vencedoras literalmente seria inseguro: entre os 74 agendados, 56 foram sinalizados com possível promessa e 21 com possível diagnóstico sem avaliação.

A IA TESTE deve aprender a sequência comercial, mas bloquear:

- diagnóstico, prescrição, indicação de protocolo e quantidade de sessões;
- promessa de emagrecimento, medidas, prazo, eficácia ou resultado individual;
- segurança absoluta, ausência de dor ou inexistência de contraindicação;
- preço, promoção, endereço ou disponibilidade sem fonte autorizada;
- urgência artificial, escassez não verificável, culpa e vergonha corporal;
- confirmação de agenda sem retorno positivo do simulador ou ferramenta.

## Arquitetura proposta para a IA TESTE

### Isolamento

- Novo runtime: `barriga-learned-v1`.
- Nova aba interna: `IA TESTE · Chats`.
- Acesso apenas no Treinamento da IA, sob a permissão já existente.
- Unidades disponíveis: Osasco e SCS.
- Sem link público e sem conector de envio ao WhatsApp.
- Sem leitura de `AiUnitKnowledge`, `AiKnowledgeProcedure`, `AiTrainingMemory`, Caderno, criativos ou prompt das IAs atuais.
- Playbook próprio, versionado em código, contendo apenas padrões comerciais e guardrails derivados desta análise.
- Estado próprio em `AiTrainingConversation.conversationState`, com versão explícita.
- Histórico e auditoria nas tabelas `AiTrainingConversation` e `AiTrainingMessage` já existentes.
- Correções do protótipo não alimentam `AiTrainingMemory` da IA atual.

### Comportamento inicial

1. Responder primeiro à intenção imediata quando a informação estiver autorizada.
2. Como o protótipo não possui base clínica/comercial aprovada, declarar a ausência em perguntas factuais e não inventar.
3. Fazer no máximo uma pergunta não clínica por mensagem.
4. Convidar para avaliação quando houver contexto suficiente.
5. Após aceite, oferecer duas opções simuladas de horário.
6. Negociar outro dia/período se necessário.
7. Considerar agendado apenas após confirmação explícita no simulador.
8. Respeitar recusa e limitar follow-up; nenhum follow-up real será enviado.

### Modelo

Recomendação: `gpt-5.6-terra`, uma chamada por turno, pela combinação de capacidade e custo. `gpt-5.6-sol` fica reservado para análises ou casos complexos; `gpt-5.6-luna` é adequado a classificações em lote. A API Responses deve usar Structured Outputs e `store: false`.

Documentação oficial: [modelos GPT-5.6](https://developers.openai.com/api/docs/guides/latest-model), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) e [preços](https://developers.openai.com/api/docs/pricing).

## Impacto técnico estimado

Não é necessária mudança de schema, índice ou migração. `runtimeVersion` já possui índice composto com unidade e data.

Por turno do simulador, reutilizando o fluxo atual:

- 1 chamada ao modelo;
- aproximadamente 13 consultas/escritas curtas ao banco, contando gravação, claim idempotente, contexto e recargas da interface;
- aproximadamente 6 invocações HTTP internas;
- nenhum polling de servidor: o contador de espera roda no navegador e dispara uma única geração;
- zero chamada à Evolution API;
- zero consulta às bases das IAs atuais.

Limite recomendado para o protótipo: 50 mensagens de lead por usuário/dia. No teto, por usuário:

- 50 chamadas de IA;
- cerca de 650 operações curtas no banco;
- cerca de 300 invocações internas;
- custo estimado de US$ 0,25 a US$ 0,50/dia, dependendo do tamanho do histórico.

Com cinco pessoas atingindo o teto diariamente, o pior caso estimado é 250 chamadas, 3.250 operações curtas no banco e aproximadamente US$ 1,25 a US$ 2,50/dia. O uso esperado no protótipo é muito menor.

### Custo desta análise

Passagem válida:

- Luna: 384.869 tokens de entrada e 118.572 de saída;
- Sol: 7.473 tokens de entrada e 6.285 de saída;
- custo padrão estimado: US$ 0,45.

Incluindo a primeira classificação descartada por cobertura incompleta, o custo total estimado ficou próximo de US$ 0,67.

## Validação proposta

Antes de qualquer uso fora do simulador:

- testes unitários do estado, isolamento e guardrails;
- 20 cenários cegos cobrindo preço ausente, risco, contraindicação, promessa, localização, agenda, conflito e opt-out;
- zero diagnóstico, prescrição, promessa e confirmação falsa;
- 100% de bloqueio de uso das bases atuais;
- teste visual em 390 px, 430 px e 1440 px;
- revisão manual de respostas em Osasco e SCS;
- sem envio automático e sem agenda real.

## Decisões recomendadas para a primeira publicação

1. Publicar somente a aba interna `IA TESTE · Chats`.
2. Liberar Osasco e SCS.
3. Usar agenda simulada, sem gravar em `Agendamento`.
4. Usar `gpt-5.6-terra`.
5. Limitar a 50 mensagens por usuário/dia.
6. Não permitir que edições alimentem a memória das IAs atuais.
7. Não criar link público nem integração com WhatsApp nesta versão.

## Limitações

- O resultado de agenda foi inferido por registro em `Agendamento`; marcações apenas no pipeline podem não estar contabilizadas.
- As associações não provam causalidade.
- As classificações semânticas e de segurança ainda precisam de auditoria humana amostral.
- A instrumentação de operador difere entre as unidades.
- O protótipo não possui conhecimento clínico, preço, endereço ou agenda real por decisão de isolamento; ele deve declarar essa limitação.
- Desempenho comercial real só pode ser medido posteriormente em modo sombra controlado, nunca apenas no simulador.
