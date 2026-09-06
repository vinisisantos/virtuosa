# Retirada dos módulos de IA — 06/09/2026

## Estado e ordem segura

A versão `246002d` retirou recursos, rotas, integrações, dependências de geração,
imagens de teste e modelos do cliente Prisma. Foi publicada e promovida antes
da limpeza de dados; as tabelas antigas não eram mais usadas pela aplicação.

As migrações históricas e o histórico Git permanecem como auditoria. Não
restaurar uma versão anterior a `246002d` depois de remover as tabelas.
WhatsApp manual, campanhas, CRM, agenda, automações convencionais, estoque,
planilhas Excel e folha de pagamento continuam no sistema.

## Limpeza administrativa única

1. Confirmar que o domínio aponta para a versão sem os recursos retirados.
2. Conferir testes, build, navegação e isolamento das integrações operacionais.
3. Remover as variáveis exclusivas de IA do projeto Vercel, sem revogar chaves
   globalmente nem remover credenciais compartilhadas de banco, Blob e WhatsApp.
4. Somente então cadastrar `LEGACY_MODULE_CLEANUP_ON_DEPLOY` com valor
   `confirmed-after-cutover` em produção e publicar a limpeza.
5. O build administrativo usa a conexão de migração existente, verifica
   dependências e materiais, executa a migração transacional e remove somente
   objetos sob `ai-training/`. Não concede permissões nem baixa credenciais.
6. Conferir o log `cleanup: complete` e as leituras após a publicação. Remover
   o flag de limpeza para que builds comuns não façam essa operação.

A migração elimina 22 tabelas exclusivas, a configuração e os orçamentos
exclusivos do piloto, sua permissão de usuário e apenas seu job e histórico de
execuções. Usa `IF EXISTS`, `RESTRICT`, timeout de lock de dois segundos e
transação: uma dependência externa inesperada aborta a operação. A extensão
vetorial só é excluída se não tiver outras dependências.

## Limites e recuperação

- Nenhuma conversa real, mídia operacional, campanha, cliente ou movimentação
  financeira é alvo da migração. Os testes preservam essas tabelas e os jobs
  convencionais.
- Referência operacional a material de treinamento interrompe a limpeza para
  revisão. Não substituir essa proteção por exclusão em cascata.
- Exclusão de Blob não é transacional com o banco; falha nessa etapa deve ser
  reportada e a execução pode ser repetida. O código em produção já não depende
  desses objetos nem das tabelas eliminadas.
- Dados exclusivos excluídos não têm desfazer pela interface. Código e imagens
  versionados permanecem recuperáveis no Git; dados exigem backup preexistente.
- Recuar o aplicativo apenas para outra versão sem os módulos retirados.

## Verificações

`npm test` inclui a migração aplicada duas vezes em PostgreSQL isolado e uma
dependência externa que força rollback. `npx tsc --noEmit` e `npm run build`
validam a aplicação. `tests/retired-modules-ui.mjs` testa as interfaces em
390/430/1440 px, com APIs fictícias e rede externa bloqueada; o envio manual do
Inbox é interceptado e não envia mensagens a clientes.
