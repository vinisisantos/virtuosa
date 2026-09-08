# Recepção de novos leads por campanha

Modelo aprovado por Vinicius em 08/09/2026. Escopo: caixas homologadas de leads de Osasco, SBC e SCS, usando exclusivamente a biblioteca pessoal da Claudenice, autorizada como fonte da automação. Não compartilha essa biblioteca no Inbox dos outros usuários.

## Operação

Em **CRM → Automações → unidade → Recepção por campanha**, administradores podem habilitar/pausar a recepção, editar a saudação institucional e escolher a pergunta da pasta correspondente a cada campanha. O prazo é fixo em 60 segundos. Desktop e mobile possuem as mesmas ações.

- Primeira entrada nova pelo WhatsApp após a ativação: reserva persistente por conversa; aguarda 60 segundos a partir da criação da conversa.
- Envia a saudação institucional sem nome do lead, sem se passar por uma atendente humana. Não altera a resposta rápida manual.
- Após o aceite do provedor, envia a pergunta mapeada por **ID** da resposta e chave canônica da campanha (`savedReplyCampaignKey`). Reordenação da biblioteca não muda a seleção. O vínculo explícito campanha/pasta prevalece sobre o título da pasta.
- Sete perguntas iniciais foram identificadas: Barriga Trincada, Preenchimento Facial, Glúteos Perfeitos 60 ml e 120 ml (separados), Harmonização de Glúteos, Combo Harmonização e Harmonização de Mamas.
- Campanha sem pergunta válida recebe **somente a saudação**, com pendência na configuração e registro `greeting_only`. Não escolher explicação/preço como fallback. Botox, Gordura Localizada, MonjiFast, HyperSlim, Emagrecimento e Definição e Adeus Rosto Cansado precisavam de associação própria no estudo inicial.
- Confere antes de cada saída: unidade, telefone, instância, bloqueio/arquivamento/fechamento, agendamento, saída do estágio inicial, resposta humana ou de outra automação e resposta recebida após a saudação. A atribuição automática de responsável, sozinha, não cancela.
- Os dois textos são congelados ao preparar o primeiro envio. Mudanças de conteúdo na biblioteca valem para próximas recepções. Mudança de campanha/configuração, exclusão da resposta ou troca de pasta/autor interrompem o par, evitando misturar procedimentos.
- Replays, mensagens de saída, histórico sinalizado, eventos mais de dois minutos atrasados, clientes/conversas anteriores ao marco e instâncias pessoais não entram. Não há backfill ou envio para contatos antigos.
- Se a conexão estiver indisponível antes da tentativa, a fila adia por um minuto. A recepção expira em quinze minutos para não cumprimentar tardiamente um contato sem contexto.

## Coexistência

A saudação antiga CTWA e a saudação do formulário recebido diretamente pelo WhatsApp são substituídas somente no escopo novo após o agendador autenticar. A sincronização do nome do formulário é mantida. Configuração pausada não recai automaticamente no fluxo antigo. Conversas antigas com captura de nome já iniciada e caixas fora do escopo conservam o comportamento anterior. A integração Zapier/Meta sem entrada de WhatsApp não foi alterada.

## Fila e falhas

`WhatsAppWelcomeJob`: chave única `conversationId`, índice `(status,dueAt)`, RLS habilitada. Estados `pending → processing → sending`. O ID e o horário de aceite de cada etapa ficam persistidos. Terminam em `completed`, `greeting_only`, `cancelled` ou `uncertain`, com auditoria em `AutomationLog`.

Reservas concorrentes usam `FOR UPDATE SKIP LOCKED` e token exclusivo. Uma reserva interrompida antes de iniciar HTTP pode ser retomada após dois minutos. Depois de iniciar HTTP, a tentativa fica incerta: **não há retry automático**. Isso também vale quando o provedor aceita mas falha a persistência. Conferir a conversa/recibo antes de agir manualmente. `sent` comprova aceite pelo provedor, não leitura nem entrega no aparelho.

## Implantação e agendador

O build de produção aplica SQL idempotente para a tabela nova e executa `scripts/setup-campaign-welcome-cron.mjs`, usando o singleton e as credenciais já configuradas no ambiente de implantação. Não altera grants, não busca credenciais privilegiadas e não modifica os jobs existentes.

- Requer permissão administrativa `cron`/`net` e `CRON_SECRET` já configurado. Se faltar, o provisionamento falha; não declarar a automação operacional.
- `campaign-welcome-every-15-seconds`: checagem SQL a cada 15 segundos. Só faz HTTP quando existe fila vencida, reserva interrompida ou bootstrap inicial ainda não autenticado.
- Bootstrap vazio limitado a quinze minutos após o provisionamento. Se um build falhar, não fica chamando um endpoint inexistente indefinidamente; um novo deploy renova a janela se ainda não houve ativação.
- O primeiro `POST /api/cron/campaign-welcome` autenticado confere a assinatura do segredo configurado e grava `readyAt` em `AppSetting`, **sem enviar mensagens**. O marco é do runtime publicado, não do início do build.
- Job separado de retenção, diário, conserva sete dias de `cron.job_run_details` somente destes dois jobs.
- Worker com limite de três conversas/seis etapas e orçamento de 45 segundos, com timeout de 15 segundos por chamada externa. O máximo da rota é 60 segundos.
- Em operação saudável, espera-se início entre 60 e 75 segundos mais latência do provedor. Rajadas, indisponibilidade e timeouts podem atrasar/interromper; não existe garantia de segundo exato.

### Peso medido e estimativa revisada

- Zero nova consulta/polling ao abrir Inbox ou uma conversa.
- Cinco consultas somente ao abrir a configuração administrativa: automação, biblioteca (até 100), campanhas (até 200), estado operacional e últimas vinte recepções.
- Par isolado nos testes: 15 operações do worker, 6 do remetente, 2 de entrada e 2 da rota = aproximadamente **25 operações**. Manutenção/biblioteca são compartilhadas no lote. O estudo preliminar estimava 16–20; a diferença inclui auditoria, autenticação operacional e revalidação adicional. Não é incremento líquido: substitui consultas e envios da recepção anterior. Outras entradas nos primeiros dois minutos podem fazer uma consulta de elegibilidade.
- Até duas chamadas de envio por lead; nenhum envio de teste real. Volume observado no estudo: 129,2 leads/dia em média, pico diário 179 e pico amostrado 3/minuto. Cenário isolado conservador: aproximadamente 3.230 operações/dia para esses leads, além de 5.760 checagens SQL locais/dia e uma limpeza diária. Não são 5.760 invocações vazias do Vercel.

## Verificação

`npm test`, `npx tsc --noEmit`, `npm run build`; SQL real em PostgreSQL descartável (PGlite), sem `.env` ou conexões externas. Teste visual: `node --experimental-strip-types --import ./tests/register-paths.mjs tests/campaign-welcome-ui.mjs` com aplicação local na porta 3210 e todas as APIs substituídas por fixtures; larguras 390, 430 e 1440 em cada unidade.

Após publicar, conferir Ready, resposta 401 sem credencial na rota, `AppSetting.readyAt`, três configurações e primeiros registros operacionais. Não testar chamando o worker autenticado sobre uma fila real nem cadastrando cliente fictício em produção. A entrega externa será comprovada pelos recibos dos próximos leads reais elegíveis.
