# Botox Pink Friday — SBC

Entrega de 27/11/2026 solicitada após o chat da Elen ter recebido a identificação genérica Botox.

O identificador Meta `120251255419000006` corresponde exclusivamente a `BOTOX PINK FRIDAY`, em SBC. A captura prioriza esse ID sobre texto genérico, campanha pai e link de criativo antigo. Não identificar a promoção pela palavra Botox ou pelo preço citado pela cliente. Os IDs de Endolaser e Combo preparados em outra branch continuam sem ativação nesta entrega.

## Condições e contexto da Alice

Fonte comercial: orientações de Vinicius em 26/11/2026, confirmadas para uso no atendimento em 27/11. A oferta tem valor fechado de R$ 399 para o terço superior, toxina botulínica Dysport, até 50 unidades do próprio produto e aplicação pela biomédica. Retorno em torno de 15 dias, com retoque quando indicado. Não converter unidades, prescrever dose individual, validar arredondamento do preço ou inventar duração de efeito/resultados.

A oferta é exclusiva de SBC, com validade até 29/11/2026 inclusive. A comparação usa São Paulo e deixa de considerar a oferta vigente no início de 30/11. Não prometer manutenção do preço por agendamento ou prorrogação automática.

O sincronizador fixa uma revisão privada com duas fichas novas: regras comuns Pink Friday e Botox. A fonte única de preços recebe uma seção isolada. A seleção carrega somente a ficha e preço da oferta identificada, preservando voz, segurança, apresentação e histórico. Preços comerciais antigos do manual são substituídos apenas no contexto desta promoção; o arquivo de origem é preservado. Osasco e campanhas antigas não recebem as fichas ou preços novos.

O campo campaignId é projetado na mesma consulta de clientes existente. A identificação acrescenta zero queries, inferências, endpoints, índices, tabelas, polling ou invocações por mensagem. A ficha respeita os limites de 14 documentos e 36 mil caracteres. Ausência de ficha/preço ou excesso de contexto interrompem a seleção em vez de retornar a uma oferta anterior.

## Configuração e conferência

1. Publicar a revisão privada fixada antes do CRM. Conferir TypeScript, testes de identificação, isolamento, expiração, guardas e build/deploy Ready.
2. Cadastrar a campanha no CRM somente se não existir em SBC, com ID e link documentados nas notas, sem inventar investimento ou data inicial.
3. Corrigir apenas Client.campaignName dos registros comprovados pelo ID em SBC e seus SalesPipeline.campaignNameSnapshot. Preservar campaignId, origem, chegada, responsáveis, mensagens, etapas e valores. Aplicação transacional e idempotente; conferir a quantidade antes e depois.
4. Conferir o chat da Elen no Inbox e o modo agent. A atualização de conhecimento não exige reenviar uma resposta já enviada nem retomar backlog. A próxima mensagem elegível usa o novo contexto.
5. Observar o próximo lead natural pelo ID e conferir também anúncios antigos e Osasco. Não enviar mensagens de teste a clientes nem ao provedor para homologar a configuração.
