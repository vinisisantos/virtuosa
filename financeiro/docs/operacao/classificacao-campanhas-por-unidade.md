# Classificação de campanhas por unidade

Atualizado em 08/09/2026.

## Identidade e isolamento

- A entrada de lead seleciona o cadastro ativo pelo telefone normalizado **e unidade atual**. A unidade filtra a consulta antes do limite de candidatos; não é apenas pontuação de preferência.
- O mesmo telefone pode ter cadastros e negócios separados em SBC, SCS e Osasco. Um cadastro transferido não pode ser atualizado a partir de outra unidade usando somente `originUnit`.
- Inbox e resumo do contato selecionam a campanha dentro da unidade da conversa. Na caixa `Todas`, o contexto segue o helper existente (seleção atual e depois unidade do contato). Sem unidade determinada, não se escolhe uma campanha global arbitrária.
- A Central de Follow-up mantém o piloto Osasco e não herda campanhas das demais unidades. A integração de formulários Meta também deduplica telefone/e-mail dentro da unidade.
- O DDD faz parte da chave: dois telefones com o mesmo sufixo não são a mesma pessoa. Formatos brasileiros com/sem `55` e nono dígito são compatíveis. LID não vira telefone.

## Sinais de campanha

1. Abertura CTWA explícita, como “Olá! Eu vim pelo GLÚTEOS PERFEITOS, gostaria de saber mais sobre isso”.
2. Link exato do criativo, ID de anúncio e demais marcadores unitários já homologados.
3. Termos específicos do anúncio e da mensagem, antes do nome da campanha pai devolvido pela Meta.
4. Correspondência completa com campanhas ativas e resolução da Meta quando disponível.

Glúteos Perfeitos, sua versão 120 ml, Harmonização de Glúteos e Harmonização de Mamas são campanhas distintas. Não deduzir uma delas a partir de “harmonização”, “preenchimento do bumbum”, “qual o preço?” ou outro termo insuficiente. Múltiplos procedimentos na mesma inferência textual não são desempate por ordem da lista. Aberturas explícitas continuam prevalecendo como sinal de origem mesmo quando a conversa aborda outro assunto depois.

O texto permite recuperar o nome, mas não inventar URL, ID ou origem da conta Meta. Os IDs legados confirmados de aberturas específicas foram preservados. Uma pergunta posterior pode preencher uma etiqueta vazia, mas não promove sozinha a origem para Meta nem sobrescreve uma campanha específica já registrada. Quando a campanha do cadastro muda, o negócio aberto da mesma unidade recebe o snapshot correspondente.

## Recepção

A automação existente continua aguardando um minuto e usa a campanha do cadastro da própria unidade. O reconhecimento da abertura Glúteos Perfeitos permite selecionar sua pergunta salva. Não há replay de filas concluídas, envio retroativo ou novas mensagens de teste.

## Carga e validação

- Nenhum schema, índice, endpoint, polling ou chamada externa nova.
- Nenhuma consulta adicional por tela. O reconhecimento explícito dispensa a consulta às campanhas ativas no webhook.
- Quando um telefone entra em uma segunda unidade, o fluxo normal cria um cadastro e um negócio próprios. Quando uma mensagem posterior preenche a campanha, há até uma atualização adicional do snapshot do negócio aberto.
- Testes: `campaign-attribution.test.mjs`, `campaign-track-mapping.test.mjs`, `whatsapp-lead-client-selection.test.mjs` e suíte geral. Responsividade conferida pelo roteiro `inbox-header-ui.mjs` em 390, 430 e 1440 px com APIs simuladas.

## Reparo histórico

A prevenção não reclassifica em massa registros antigos nem substitui escolhas feitas por atendentes. Os casos relatados foram auditados em leitura. A correção pontual de vínculos já persistidos deve usar sessão autorizada do CRM e preservar histórico, chegada, origem, mensagens e agendamentos. O acesso local de diagnóstico é somente leitura; não alterar suas permissões nem obter credenciais privilegiadas para contornar essa restrição.
