# Ponte privada Alice ↔ Hermes

Esta ponte é um processo Node separado do CRM. Ela **não** recebe credenciais de WhatsApp, não consulta o banco e não tem rota de envio. Cada clique em “Gerar sugestão” aciona, no máximo, uma chamada ao Hermes com `gpt-6-luna`; o texto devolvido permanece um rascunho que Vinicius revisa e envia manualmente no CRM.

## Estado de segurança antes de ativar

- O CRM deve permanecer com `ALICE_ENABLE_LIVE_SUGGESTIONS` ausente ou `false` até que a VM dedicada, HTTPS e testes finais estejam prontos.
- Configure `ALICE_OWNER_USER_ID` com o ID exato do usuário Vinicius no CRM. Sem ele, as rotas da Alice respondem 403 e o controle não aparece no Inbox.
- O build do CRM ainda precisa de `ALICE_CONTENT_READ_TOKEN` para incluir a revisão aprovada dos documentos privados de `vinisisantos/virtuosa-agent`. Os arquivos não são enviados ao navegador.
- Configure `ALICE_HERMES_BRIDGE_URL` como `https://<host-privado>/v1/suggest` e `ALICE_HERMES_BRIDGE_SECRET` com segredo aleatório de pelo menos 32 caracteres, idêntico no CRM e na VM. Não versione o segredo.
- `ALICE_CONVERSATION_DATA_APPROVED=true` registra a autorização para enviar trechos sanitizados de conversas ao Hermes. Só depois, `ALICE_ENABLE_LIVE_SUGGESTIONS=true` e a chave “Habilitar Alice” da página do CRM podem ser ligados.

## Serviço na VM

Instale Node e uma versão testada/fixada do Hermes sob um usuário de serviço dedicado, autentique esse Hermes na conta ChatGPT pessoal do Vinicius e verifique `hermes auth status openai-codex`. Não compartilhe a sessão com a equipe. Execute `node infra/alice-hermes-bridge.mjs` com `ALICE_HERMES_BRIDGE_SECRET` e, opcionalmente, `ALICE_HERMES_PORT`/`ALICE_HERMES_EXECUTABLE` configurados fora do repositório. O processo escuta apenas em `127.0.0.1`; publique-o somente por um proxy HTTPS com firewall, limitação de taxa e sem registro dos corpos das requisições.

A ponte autentica cada requisição por HMAC-SHA256 com timestamp e nonce, rejeita repetição e aceita apenas uma inferência simultânea. O Hermes roda com `--safe-mode`, sem plugins/MCP/arquivos de configuração, com `context_engine` e limite de uma rodada; qualquer evento de ferramenta é rejeitado. O prompt passa por stdin, não por argumentos do processo. A sessão criada pelo Hermes é excluída pelo ID exato ao final, inclusive em falhas que devolvam o evento inicial. Como o armazenamento local do Hermes pode registrar a sessão antes da exclusão, a VM deve usar disco criptografado, acesso mínimo e política de retenção/backup apropriada para dados sensíveis.

## Verificação antes de disponibilizar

1. Teste HMAC, resposta JSON válida e recusa de replay com dados fictícios (`node --test tests/alice-hermes-bridge.test.mjs`).
2. Faça uma chamada sintética completa CRM → ponte → Hermes, sem números nem nomes reais. Confirme `model=gpt-6-luna` e que a resposta aparece apenas como rascunho.
3. Teste com outro usuário do CRM: GET/POST/PATCH de sugestões e configurações devem retornar 403; no Inbox, o controle deve estar oculto.
4. Inspecione o tráfego de `/api/whatsapp/send`: gerar, descartar e inserir a sugestão não podem chamar essa rota. Apenas o botão manual de envio a chama.
5. Valide o layout e os estados de erro em 390 px, 430 px e 1440 px. Sem VM ou qualquer variável obrigatória, o sistema deve falhar fechado e manter o atendimento manual.

O uso da assinatura ChatGPT compartilha os limites do plano. A VM tem custo separado; não há custo por token da API OpenAI nesta ponte. Antes de processar dados reais em um CRM hospedado remotamente, confirme a elegibilidade do fluxo com a documentação/termos vigentes da OpenAI.
