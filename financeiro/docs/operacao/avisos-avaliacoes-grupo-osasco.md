# Avisos de avaliações ao grupo Lead Osasco

Osasco reutiliza a fila e o processamento de SBC pela caixa Leads Osasco. A configuração `whatsapp_evaluation_group_osasco_v1` é independente; SBC mantém destino, configuração e cortes existentes. SCS não recebe avisos de grupo por esta extensão.

## Publicação e ativação

1. Publicar código e migração `20261020120000_evaluation_group_osasco_destination/migration.sql`. O SQL idempotente amplia apenas a restrição de instâncias permitidas, sem criar configuração, gates, eventos ou backfill.
2. Confirmar a versão compatível Ready no domínio e aguardar pelo menos dois minutos, com requisições antigas drenadas. A migração pode aguardar lock por até cinco segundos; se falhar, investigar sem remover guardas.
3. Em Automações → Osasco, um administrador com acesso de resposta à caixa confere o grupo. A consulta aceita somente o nome Lead Osasco (normalizando espaços, maiúsculas e acentos); o JID identifica o destino. Confirmar integrantes autorizados e a capacidade de envio da caixa. A API recusa a ativação se o grupo permitir envio somente para administradores; a consulta atual não comprova que a caixa é administradora. Não contornar esse bloqueio nem enviar mensagem de teste.
4. Ativar explicitamente o grupo cria os quatro cortes no mesmo instante: agendamento, confirmação, cancelamento e reagendamento. Salvar o mesmo destino já ativo preserva os cortes; reativar após pausa ou trocar de destino cria novos cortes. Configuração inexistente mantém Osasco desativado. Não copiar datas de corte de SBC nem enfileirar eventos antigos.
5. Conferir a primeira ocorrência legítima no histórico e no WhatsApp. `submitted` significa aceite do provedor, sem comprovar entrega ou leitura. Não reenviar automaticamente resultados incertos.

## Regras preservadas

A conferência manual do grupo de Osasco também consulta o número conectado à instância exata e apresenta a quantidade de grupos retornados e de nomes ausentes. São dois GETs paralelos, com limite de doze segundos cada, somente ao pressionar Conferir grupo; não há consulta extra ao banco, polling ou leitura de participantes. O painel mostra apenas o telefone da caixa e possíveis nomes relacionados a Lead/Leads Osasco, nunca outros grupos, perfis ou credenciais. Resultados de nome semelhante são pistas de diagnóstico e não podem ser usados para ativar os avisos. A ativação continua revalidando exclusivamente a lista estrita, em um GET; a conferência de SBC mantém seu comportamento anterior e uma única consulta.

Se a integração não informar o telefone ou o nome de algum grupo, não presumir que o número está errado ou que deixou o grupo. Conferir os metadados no backend autorizado antes de alterar o destino. Variáveis marcadas como sensitive na Vercel permanecem protegidas: este diagnóstico usa os valores já presentes no runtime e não exige descriptografá-los, exportá-los ou gravá-los localmente.

Somente avaliações futuras elegíveis, com nome de pessoa válido, telefone e procedimento de interesse. Confirmação, cancelamento e reagendamento exigem origem comprovada na mesma caixa e configuração. Procedimento editável não autoriza usar telefone como nome. A fila grava junto da mudança e envia depois do commit; o worker revalida agenda, origem, grupo, ativação e conexão antes do HTTP. Alteração posterior invalida avisos pendentes. Tentativas anteriores ao HTTP são limitadas a três; após iniciar envio, timeout ou resultado incerto não voltam à fila.

Não há tabela, coluna, índice, endpoint, polling ou cron novo. O processamento continua global: o webhook recupera no máximo um aviso no orçamento de oito segundos, depois de atendimento e recibos. O caminho isolado da outbox usa oito operações de banco e um HTTP no agendamento; confirmação/cancelamento dez e um; reagendamento onze e um, além das operações existentes da agenda. Pausar no painel desativa apenas esta configuração; preservar eventos e o cron compartilhado.

## Procedimento e nome no agendamento

Em Osasco e SBC, o formulário abre com o procedimento já salvo; na ausência dele, usa os procedimentos explícitos do negócio e depois uma campanha válida. Campanhas genéricas, vazias ou com marcadores não preenchem o campo. O texto permanece editável para acrescentar interesses e observações, e só vira `Agendamento.evaluationProcedure` quando a equipe salva o formulário. A campanha não comprova a origem da caixa e o servidor não a converte silenciosamente em procedimento. O tipo da agenda continua Avaliação.

Um novo agendamento, uma mudança explícita de nome ou um reagendamento exige nome válido. Telefone, JID, URL e marcadores genéricos não podem ser usados como nome; nomes legítimos com acentos, apóstrofos e hífens permanecem aceitos. Uma alteração somente de status não obriga a corrigir um nome legado, mas esse cadastro incompleto não gera aviso ao grupo. A correção de nome por Agenda/Avaliações também atualiza o negócio e o cliente vinculados na mesma unidade e transação.

O preenchimento do rascunho e a validação de nome não acrescentam consultas nem HTTP. A propagação de uma correção de nome vinculada por Agenda/Avaliações pode acrescentar até três operações de banco, somente quando o nome muda; esse custo não está incluído nas medições isoladas da outbox acima. Nenhum cadastro legado é corrigido em lote por esta publicação.
