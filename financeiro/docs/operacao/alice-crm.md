# Alice no CRM

## Escopo e segurança

- A integração é de sugestão assistida: a pessoa da equipe solicita a geração e revisa/edita antes de decidir se envia.
- O envio automático, o agendamento automático e o modo agente permanecem bloqueados.
- A base é lida do repositório privado `vinisisantos/virtuosa-agent`, em commit fixo, apenas durante o build. As conversas não fazem chamadas ao GitHub.
- Só SBC e Osasco estão no escopo. Mamas e Preenchimento Facial continuam excluídos; conteúdo clínico/fora do escopo gera texto local de encaminhamento.
- Notificações internas usam pessoas já autorizadas na instância e unidade. Osasco encaminha à equipe local e não concede acesso a outras pessoas.
- O aprendizado antigo fica preservado como arquivo, mas o observador automático deixa de processar conversas.

## Configuração necessária para ativar

Não inclua valores secretos em código, GitHub, logs ou documentação. Cadastre as variáveis em Production e Preview apenas nos ambientes em que forem necessárias:

1. `ALICE_CONTENT_READ_TOKEN`: fine-grained token somente de leitura (`Contents: read`), limitado ao repositório privado `vinisisantos/virtuosa-agent`.
2. `OPENAI_API_KEY`: credencial da API OpenAI usada pelo servidor para o modelo configurado.
3. `ALICE_OPENAI_CONVERSATION_DATA_APPROVED=true`: só cadastrar depois da autorização explícita do responsável para enviar trechos sanitizados de conversas reais ao provedor externo.
4. `ALICE_ENABLE_LIVE_SUGGESTIONS=true`: habilita a chamada de sugestões reais depois que a base e a credencial estiverem disponíveis e o uso de dados tiver sido aprovado.

Além disso, a administração precisa ativar Alice em `/crm/assistente-ia`. Essa chave administrativa não substitui os bloqueios do servidor. Sem qualquer pré-requisito, o endpoint falha fechado e não chama o modelo.

O build valida manifesto, unidades, exclusões e allowlist dos documentos. Ausência do token deixa a aplicação compilável, mas a base indisponível e sugestões ao vivo bloqueadas. Falha em ler ou validar a base aborta o build. A revisão do repositório está deliberadamente fixada; atualizar a base requer revisar e alterar a revisão fixada no sincronizador.

## Dados, carga e validação

- Por solicitação, o CRM lê até 12 mensagens textuais recentes, monta um contexto sanitizado e faz no máximo uma chamada ao provedor. Não existe polling nem fan-out por conversa.
- Não envia identificadores de CRM, número de telefone, e-mail ou nomes dos participantes no payload. O corpo pode ainda conter informações identificadoras que a sanitização não reconheça; por isso a habilitação continua protegida pela aprovação explícita de uso de dados.
- A chamada usa `store: false`; isso não deve ser interpretado como garantia de retenção zero nos sistemas do provedor.
- As únicas escritas de uma sugestão são os registros de orçamento/operação, rascunho e, quando necessário, notificação interna/atribuição autorizada. Nenhuma rota de geração chama a API de envio do WhatsApp.
- Para validar: `npm test`, `npx tsc --noEmit`, build, teste visual `node --experimental-strip-types --import ./tests/register-paths.mjs tests/ai-assistant-ui.mjs` com as APIs interceptadas e rede externa bloqueada. Testar 390, 430 e 1440 px nas unidades SBC e Osasco; conferir o bloqueio de credenciais/base, modo manual, geração explícita, revisão e encaminhamento.
