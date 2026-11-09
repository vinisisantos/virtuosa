# Relatório da Alice de SBC no OpenMausBot

## Escopo

Esta integração entrega ao OpenMausBot somente indicadores agregados das últimas 24 horas da Alice na unidade São Bernardo do Campo (SBC). A API não aceita unidade, intervalo ou identificador de conversa como parâmetro e não retorna nomes, telefones, mensagens nem registros individuais. A ferramenta MCP é somente leitura.

## Estado

- Implementação local: endpoint REST e adaptador MCP local.
- Produção: pendente de publicar o código e configurar `OPENMAUSBOT_SBC_REPORT_TOKEN` no ambiente de produção.
- OpenMausBot: a ferramenta deve ser cadastrada depois que a API estiver publicada e o mesmo token estiver salvo nas variáveis do servidor MCP. Não salvar o token nas instruções, memória ou rotina do bot.
- Rotina recorrente: quatro execuções por dia, após a conexão estar confirmada. Até a VPS estar disponível, rotinas locais dependem do OpenMausBot estar aberto; confirme a opção “Also run when OpenMausBot starts” para recuperar uma execução perdida na próxima inicialização.

## Métricas disponibilizadas

O relatório contém horário de geração, período de 24 horas, estado da Alice e os totais de conversas, respostas enviadas, fila, envios incertos, falhas, casos que precisam de atendimento humano, agendamentos, tokens, custo agregado e tempos médios. Os custos são retornados em microdólares (um milionésimo de dólar); o adaptador não arredonda nem converte esse valor.

## Configuração quando produção estiver pronta

1. Cadastre um token aleatório forte (mínimo de 32 caracteres) como `OPENMAUSBOT_SBC_REPORT_TOKEN` no ambiente de produção do CRM e no ambiente do servidor MCP do OpenMausBot. Os dois valores devem coincidir. Não compartilhe o token em conversas, instruções do bot ou arquivos versionados.
2. No OpenMausBot, abra **Plugins → MCP servers → Add server** e cadastre um servidor local (stdio): comando `node`, argumento absoluto para `financeiro/scripts/openmausbot-alice-sbc-report.mjs` e variável de ambiente `OPENMAUSBOT_SBC_REPORT_TOKEN` com o valor salvo como credencial.
3. Habilite a ferramenta `get_alice_sbc_report` apenas para o bot responsável por esses relatórios.
4. Crie uma rotina diária com quatro horários adequados ao expediente de São Paulo. A instrução da rotina está abaixo.

## Instrução da rotina

> Consulte `get_alice_sbc_report` uma vez. Apresente um resumo curto, sempre identificando SBC e o período retornado. Mostre conversas, respostas enviadas, fila, casos incertos, falhas, casos que precisam de pessoa, agendamentos, tempos médios e custo agregado se estiverem disponíveis. Compare somente dados incluídos na resposta; não invente metas, causas ou tendências. Se a API falhar, informe que o relatório não pôde ser atualizado. Não tente corrigir dados, enviar mensagens, alterar configurações ou agir em outra unidade.

## Limites operacionais

O endpoint faz duas consultas ao banco por solicitação: uma leitura de configuração e uma consulta agregada. Quatro chamadas diárias representam oito consultas por dia, sem polling ou busca por conversa. A credencial deve ser revogada e substituída se for exposta. Esta integração não pausa, ativa nem altera a Alice.
