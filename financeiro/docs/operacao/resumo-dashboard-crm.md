# Resumo agregado da própria unidade no CRM

`permissions.crmDashboardUnit = true`, junto de `crm = true`, permite consultar o resumo agregado do dashboard CRM na própria unidade ativa do usuário. Não concede Financeiro, Estatísticas detalhadas, acesso a outras unidades ou novas capacidades no Inbox. Não depende do papel MANAGER de uma caixa WhatsApp.

O servidor exige uma unidade de origem válida. Unidade ausente, Todas ou inativa não abre consulta ampla por essa permissão. Se o usuário já puder selecionar uma unidade adicional, a nova chave não a transforma em visão agregada: conserva-se o filtro pessoal nesse recorte. Filtro por outro usuário continua reservado a administradores/Marketing. As permissões unitárias anteriores não foram reduzidas.

## Ativação e sessão

1. Publicar o endpoint compatível e confirmar Ready no domínio.
2. Com autorização específica, travar e conferir o cadastro alvo, unidade, estado ativo e permissões. Mesclar somente a nova chave ao JSON, em operação idempotente com auditoria; não substituir as permissões pelo conjunto de um administrador.
3. Conferir as demais chaves intactas e comparar os dois perfis no mesmo período. Não alterar atribuições, criar leads ou aplicar ajustes manuais para igualar o gráfico.
4. Atualizar a página. O `/api/auth/me` já renova o JWT e o armazenamento local com as permissões atuais.

O formulário atual conserva as chaves existentes ao editar o usuário; esta chave não adiciona um controle novo à interface. Revogação operacional deve remover ou desativar somente `crmDashboardUnit`, mediante autorização, com auditoria e refresh da sessão. Não habilitar `dashboard`, `crmEstatistica` ou `admin` para contornar o recorte.

## Carga e verificação

Sem schema, migração, endpoint, serviço, polling ou consulta nova por abertura. O endpoint usa os mesmos filtros e helpers canônicos do administrador; maior volume de linhas corresponde ao agregado já existente da unidade. O teste de integração compara todos os argumentos de consulta e o payload completo dos dois perfis, incluindo ajustes auditáveis e cabeçalhos sem cache.

`tests/crm-dashboard-scope.test.mjs` cobre paridade, recorte pessoal, valor booleano estrito, unidade inválida, tentativas de outra unidade/operador, comportamento anterior e autenticação. `tests/crm-dashboard-ui.mjs` usa somente APIs simuladas para conferir os dois perfis em 390, 430 e 1440 px.
