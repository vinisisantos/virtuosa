# Consulta compartilhada do calendário de avaliações

O calendário de Avaliações do CRM (`/crm/ouvidoria`) separa consulta de gestão. A autorização de Thais Amorim e Aline Fernanda é consultar todas as avaliações de Osasco e editar somente as próprias, sem acesso à Agenda geral de tratamentos ou ao Financeiro.

## Permissões

`crmEvaluationsViewUnit` exige `crm=true`, unidade ativa e coincidência entre a unidade do cadastro, o filtro validado no servidor e a unidade consultada. Não estende o compartilhamento a outras unidades que o perfil possa acessar. O rótulo na gestão de usuários é “Consultar todas as avaliações da unidade do cadastro”.

`crmEvaluationsAll`, administração e `multiUnit` preservam a gestão anterior. A nova permissão não equivale a essas permissões. A definição de avaliação própria permanece a do helper canônico `isOwnEvaluation`, por atribuição ou identificação da responsável.

## Servidor e interface

GET `/api/crm/evaluations` retorna `canViewAll`, `canManageAll` e `canEdit` por avaliação. Filtros, indicadores, lista e calendário usam o mesmo conjunto autorizado. A interface permite abrir detalhes alheios em modo de consulta, sem arraste, formulário de edição, reatribuição ou ações de WhatsApp. Avaliações próprias mantêm as ações anteriores.

PATCH mantém a autorização de escrita anterior. Para perfis de consulta sem acesso explícito à Agenda geral, PUT e DELETE de `/api/agenda` e POST `/api/checkin` também impedem alterar ou excluir avaliações alheias. PUT revalida a atribuição na transação. O comportamento dos gestores e dos usuários com acesso explícito à Agenda geral é preservado.

Falhas de carregamento exibem aviso e nova tentativa manual, sem polling nem retentativa automática. `/api/auth/me` renova as permissões da sessão antes de montar o conteúdo protegido do CRM; atualizar a página aplica a alteração de acesso.

## Carga e limites

Não há schema, migração, índice, serviço, endpoint ou polling novo. A autorização de leitura não consulta o banco: usa o contexto autenticado. A tela mantém uma chamada ao endpoint de avaliações por mudança de período ou filtro e reutiliza as consultas em lote existentes. O enriquecimento de uma lista não vazia pode executar até cinco operações Prisma adicionais às três leituras principais, independentemente de haver uma ou 35 avaliações; o carregamento das relações pode gerar SQL adicional do Prisma. Assim, sair de uma lista pessoal vazia para uma lista compartilhada pode ativar esse enriquecimento já existente, como no acesso de gestão.

A consulta não busca responsáveis para reatribuição nem verifica envio de confirmação/chat ao abrir detalhes alheios. A proteção alternativa da Agenda carrega a responsável nas duas leituras já existentes apenas para os novos perfis de consulta; check-in faz uma leitura adicional, dentro da transação, somente nesses perfis. As rotas anteriores dos demais perfis não ganham leituras de autorização.

## Ativação e conferência

Ativar somente nas contas exatas autorizadas, verificando nome, unidade Osasco, cadastro ativo, CRM habilitado e ausência de gestão global. Mesclar uma chave ao JSON existente de permissões, com lock, condição idempotente e AuditLog na mesma transação. Comparar os demais campos e os demais usuários antes e depois. Não reatribuir nem modificar avaliações para testar a visibilidade.

Testes: `evaluation-shared-read-access.test.mjs` cobre recortes e rotas reais com banco substituído; `evaluation-shared-read-ui.mjs` intercepta todas as APIs e valida 390, 430 e 1440 px. A validação da interface interceptada não equivale a login autenticado das operadoras em produção.

Para revogar a consulta, desativar somente `crmEvaluationsViewUnit` no perfil autorizado e renovar a sessão. Não alterar atribuições ou permissões de unidade como forma de revogação.
