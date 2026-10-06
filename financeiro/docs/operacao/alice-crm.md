# Alice no CRM

## Escopo e segurança

- A integração é de sugestão assistida: somente o proprietário configurado solicita a geração e revisa/edita antes de decidir se envia.
- O envio automático, o agendamento automático e o modo agente permanecem bloqueados.
- A base é lida do repositório privado `vinisisantos/virtuosa-agent`, em commit fixo, apenas durante o build. As conversas não fazem chamadas ao GitHub.
- A seleção por conversa preserva integralmente as instruções centrais, prioriza a ficha da campanha e os preços antes de referências genéricas e limita o contexto documental a 36 mil caracteres. Se faltar ou não couber uma instrução essencial, a geração falha fechada. Isso evita que uma pergunta sobre uma campanha receba apenas regras gerais ou uma ficha de outro procedimento.
- Só SBC e Osasco estão no escopo. Mamas e Preenchimento Facial continuam excluídos; conteúdo clínico/fora do escopo gera texto local de encaminhamento.
- Em SBC, a Gabriela recebe notificação e acesso somente à conversa atribuída a ela, por uma tela isolada; ela não se torna membro da instância. Osasco encaminha à equipe local já autorizada na instância.
- O aprendizado antigo e seu observador horário permanecem ativos durante a homologação. Somente no corte final, depois da Alice validada, `ALICE_RETIRE_DEEPSEEK_AFTER_CUTOVER=confirmed` faz o endpoint legado responder 410. Após confirmar que a nova versão está publicada e funcional, execute `scripts/disable-ai-learning-cron.mjs` com conexão administrativa para remover o agendamento. O build nunca o remove antecipadamente; os dados históricos permanecem intactos.

## Configuração necessária para ativar

Não inclua valores secretos em código, GitHub, logs ou documentação. Cadastre as variáveis somente no ambiente necessário; Preview não deve usar o banco de produção:

1. `ALICE_CONTENT_READ_TOKEN`: fine-grained token somente de leitura (`Contents: read`), limitado ao repositório privado `vinisisantos/virtuosa-agent`.
2. `ALICE_OWNER_USER_ID`: ID exato do usuário Vinicius; sem ele, as rotas da Alice retornam 403.
3. `ALICE_SBC_HANDOFF_USER_ID`: ID exato da comercial Gabriela, conferido no cadastro ativo de SBC. Sem ele, o encaminhamento recai apenas na equipe já autorizada na instância.
4. `ALICE_HERMES_BRIDGE_URL`: URL HTTPS da ponte privada na VM, terminada em `/v1/suggest`.
5. `ALICE_HERMES_BRIDGE_SECRET`: segredo aleatório de pelo menos 32 caracteres, idêntico no CRM e na VM, armazenado fora dos repositórios.
6. `ALICE_CONVERSATION_DATA_APPROVED=true`: somente após autorização e validação de minimização dos trechos enviados ao Hermes.
7. `ALICE_ENABLE_LIVE_SUGGESTIONS=true`: habilita sugestões reais somente após autenticação, HTTPS e testes de ponta a ponta.
8. `ALICE_RETIRE_DEEPSEEK_AFTER_CUTOVER=confirmed`: definir somente no corte validado; depois do deploy funcional, remover o cron legado manualmente. Definir antes faz o endpoint retornar 410 sem ativar a Alice.

Além disso, o proprietário precisa ativar Alice em `/crm/assistente-ia`. Essa chave não substitui os bloqueios do servidor. Sem qualquer pré-requisito, o endpoint falha fechado e não chama o modelo. A VM não recebe credenciais de WhatsApp nem acesso ao banco.

O build valida manifesto, unidades, exclusões e allowlist dos documentos. Ausência do token deixa a aplicação compilável, mas a base indisponível e sugestões ao vivo bloqueadas. Falha em ler ou validar a base aborta o build. A revisão do repositório está deliberadamente fixada; atualizar a base requer revisar e alterar a revisão fixada no sincronizador.

## Dados, carga e validação

- Por clique explícito, o CRM lê até 12 mensagens textuais recentes, monta um contexto sanitizado e faz no máximo uma chamada HTTPS assinada à ponte Hermes. Não existe polling nem fan-out por conversa. A cota é limitada a 300 solicitações por dia.
- Quatro cenários fictícios na VM (Barriga Trincada, Glúteos Perfeitos 120 ml, Emagreça até 2 kg e Gordura Localizada) retornaram JSON válido em cerca de 20–29 segundos, consumindo aproximadamente 10,5–10,8 mil tokens de entrada por chamada. A cota de 300/dia é um teto de segurança, não uma capacidade garantida pelo plano ChatGPT; monitore limites e latência antes de aumentar uso.
- Não envia identificadores de CRM, número de telefone, e-mail ou nomes dos participantes no payload. O corpo pode ainda conter informações identificadoras que a sanitização não reconheça; por isso a habilitação continua protegida pela aprovação explícita de uso de dados.
- A ponte usa uma sessão one-shot no Hermes, rejeita eventos de ferramenta, limita uma inferência simultânea e tenta excluir a sessão após o resultado. Isso não é garantia de retenção zero nos sistemas externos; proteger disco, logs e backups da VM.
- As únicas escritas de uma sugestão são os registros de orçamento/operação, rascunho e, quando necessário, notificação interna/atribuição autorizada. Nenhuma rota de geração chama a API de envio do WhatsApp.
- Para validar: `npm test`, `npx tsc --noEmit`, build, teste visual `node --experimental-strip-types --import ./tests/register-paths.mjs tests/ai-assistant-ui.mjs` com as APIs interceptadas e rede externa bloqueada. Testar 390, 430 e 1440 px nas unidades SBC e Osasco; conferir o bloqueio de credenciais/base, modo manual, geração explícita, revisão e encaminhamento.
- Antes de ativar com dados reais, testar CRM → HTTPS/HMAC → Hermes (`openai-codex`, `gpt-6-luna`) somente com conversa fictícia, verificar acesso exclusivo do proprietário e observar que gerar, inserir ou descartar rascunho não chama `/api/whatsapp/send`.
- Correções dos documentos da Alice exigem publicar uma nova revisão no repositório privado, revisar a allowlist e o commit fixo no sincronizador do CRM e reconstruir o aplicativo. O Hermes da VM não deve autoeditar a base oficial.
