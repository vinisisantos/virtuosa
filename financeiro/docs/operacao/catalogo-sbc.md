# Catálogo de procedimentos SBC

O catálogo de SBC usa ServiceCatalog como fonte de nomes, preços unitários e duração. A atualização aprovada em 21/10/2026 acrescenta 329 itens e alinha 147 durações à coluna Tempo do PDF, inclusive zeros. Mantém Entrada de Pacote a R$ 100 e não importa três registros de teste nem as quatro entradas alternativas de pacote. Os dez cadastros anteriores sem equivalência continuam preservados.

## Fonte e proteção dos dados

O manifesto `scripts/data/sbc-catalog-2026-10-21.json` foi conciliado com as 505 linhas da tabela de 21/10/2026, soma unitária R$ 445.074,89. SHA-256 do PDF: `c4650aa27a1f8a9c64f0a0a8ea5fc9e729bdcbadc635e3910d2df005dae3c270`. O importador valida também o hash do plano e preserva as variantes de mesmo nome com código identificável.

O lote faz duas leituras, um INSERT e um UPDATE em transação serializável. A reexecução intacta não grava nada. Conflitos nos campos conciliados ou edições posteriores dos itens importados interrompem a operação, sem substituir o cadastro. Somente duration e updatedAt podem mudar nos 147 alvos existentes; preços, custos, nomes, vínculos e outros campos são comparados antes e depois. A transação não modifica vendas, ofertas, pacotes, agendamentos ou registros das outras unidades.

Para simular, carregar as credenciais do ambiente correto em subprocesso e executar em financeiro `node --experimental-strip-types scripts/import-sbc-catalog.mjs`. Uma operação nova exige nova conciliação; não editar o manifesto para reaplicá-lo como uma tabela futura. A escrita requer `--apply` e `SBC_CATALOG_IMPORT_CONFIRMATION=sbc-pdf-2026-10-21-confirmed`, somente na execução administrativa explicitamente autorizada. Esse sinalizador não é adicionado ao build nem persistido na Vercel.

## Seleção por unidade

Pipeline, avaliações e Inbox usam o mesmo catálogo nas sugestões do procedimento de interesse, preservando texto livre e a duração própria da avaliação. Inbox consulta apenas quando o modal é aberto, sem polling ou consulta por conversa da lista. Agenda, pacotes e orçamento carregam os procedimentos da unidade do formulário e descartam respostas abortadas ou de uma seleção anterior.

A agenda mantém os procedimentos de pacotes contratados e oferece também busca no catálogo. Para SBC, tempos positivos são aplicados sem arredondamento para quinze minutos; os minutos exatos ficam disponíveis no seletor de fim. Tempo zero ou fora do intervalo suportado não inventa uma duração: o fim manual do formulário é preservado e deve ser conferido antes de salvar. As outras unidades conservam o cálculo anterior. Agendamentos já salvos não são recalculados.

Termos combina as sugestões manuais de ProcedimentoTermo com os nomes ativos do catálogo da unidade escolhida. Os itens SBC não são copiados para a lista global. A leitura usa duas consultas, independentemente da quantidade de procedimentos. Os nomes continuam disponíveis após iniciar ou preencher um documento.

## Verificações e conferência manual

Os testes isolados cobrem variantes, zeros, reexecução, edição concorrente, rollback e preservação de históricos. Testes de API cobrem autenticação, filtro de unidade, sugestões manuais e duração zero no cadastro. A interface é verificada com APIs interceptadas em 390, 430 e 1440 px: busca, seleção, troca de unidade, falha e retorno manual. Não criar vendas, documentos ou mensagens reais para testar.

Após publicação, recarregar o CRM, selecionar SBC e buscar um item novo, por exemplo CO2 Braços. Conferir também uma variante Pison e um procedimento curto na agenda, sem salvar um agendamento de teste em produção. A conferência visual em uma sessão autenticada real continua sendo um teste manual recomendado.
