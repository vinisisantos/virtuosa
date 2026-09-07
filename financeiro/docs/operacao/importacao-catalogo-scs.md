# Catálogo particular SCS — importação de 06/09/2026

Vinicius confirmou a importação integral dos 500 registros de `PROCEDIMENTOS SAO CAETANO.pdf`, incluindo produtos, retornos, testes, valores zerados e variantes de nomes/preços, somente para SCS. A soma de preços unitários é R$ 439.053,89; não é receita nem lançamento de venda.

## Fonte conferida

O manifesto em `scripts/data/scs-catalog-2026-09-06.json` conserva código, nome, preço/custo em centavos, duração e página de cada linha. Foram conferidas as 12 páginas e o total impresso. O script fixa os hashes do PDF e das linhas aprovadas e rejeita manifesto diferente.

Há 16 nomes repetidos com preços diferentes e 13 códigos reutilizados para itens distintos. Por isso, os IDs da importação derivam da fonte e posição da linha, não só de nome/código. Os valores e durações zero são preservados. Categoria usa o padrão `Estética`, pois o PDF não traz categorias; a descrição registra a origem e o código, sem inferir orientação clínica.

## Segurança e execução

- A conexão local de diagnóstico permanece somente leitura. Não ampliar permissões ou extrair segredos do ambiente administrativo.
- Simulação: `node --env-file=.env --experimental-strip-types scripts/import-scs-catalog.mjs`. Não grava, mostra quantos registros faltam e rejeita conflito com cadastro preexistente de SCS.
- A gravação exige `--apply`, ambiente Vercel `production` e `SCS_CATALOG_IMPORT_ON_DEPLOY=pdf-2026-09-06-confirmed`. O build reutiliza sua conexão administrativa existente em modo sessão; nenhuma nova credencial é criada.
- Habilitar esse sinalizador somente para o deploy autorizado. Removê-lo depois do log de sucesso e da leitura independente; builds comuns não importam dados.
- Uma transação serializável faz uma leitura de conferência, um INSERT em lote com `ON CONFLICT (id) DO NOTHING` e uma leitura de verificação. Sem tabela/índice/endpoint novo, consultas por item ou polling.
- O script compara todos os campos importados e preserva os registros preexistentes, inclusive timestamps. Erros/conflitos revertem a transação. Não há UPDATE/DELETE nem escrita em vendas, pacotes ou outras unidades.
- Reexecução intacta insere zero. Se alguém editar um registro importado, a reexecução bloqueia em vez de restaurar o valor antigo.

## Conferência e uso

1. Confirmar 500 itens próprios SCS, 34 preços zero e soma em centavos 43.905.389. Comparar cada linha com o manifesto, não apenas o total.
2. Conferir fingerprint/contagens dos cadastros de Osasco, SBC e Todas contra a leitura anterior.
3. Reexecutar somente a simulação e exigir `toInsert: 0`, `existing: 500`.
4. Atualizar Procedimentos e os formulários de venda de SCS; conferir as duas variantes Pison Melasma (R$ 700 e R$ 910) e um retorno de valor zero. Itens compartilhados permanecem disponíveis além dos 500 próprios.

Testes: `node --experimental-strip-types --test tests/scs-catalog-import.test.mjs` usa PostgreSQL isolado (PGlite), sem banco real. Valida fonte, total, variantes, campos zero, permissões do deploy, simulação, lote de três operações, idempotência, conflitos, preservação de vendas e rollback integral por erro em uma linha.

Não executar o endpoint bulk legado para reproduzir este arquivo: ele deduplica por nome, ignora códigos/custos e transforma duração zero em 60. Não usar essa importação para restaurar módulos de IA retirados.
