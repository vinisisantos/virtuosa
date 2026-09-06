# Piloto de memória semântica e sugestões — SCS

Implementado com ativação explícita, envio manual e teto de US$ 5/dia. Não ativar treinamento/canário existentes para usar este recurso.

## Preparação e riscos

1. Definir os IDs internos das instâncias SCS participantes, revisores do conhecimento e responsáveis técnicas. O revisor também precisa de acesso operacional à caixa de origem. Sem responsável técnica cadastrada, conteúdo clínico permanece pendente.
2. Em ambiente administrativo autorizado, verificar extensão `vector` e schema `extensions`, privilégios do runtime e permissões de pg_cron/pg_net. A conexão local de diagnóstico é somente leitura. Não copiar segredos de produção para o `.env` local.
3. Executar `prisma/migrations/20260906010000_ai_inbox_scs/migration.sql` por conexão administrativa. É aditiva/idempotente, cria extensão/tabelas/índices e não apaga dados existentes. Pode obter locks curtos no catálogo; verificar primeiro em staging. Se vector já existir em outro schema, parar e avaliar compatibilidade em vez de movê-la implicitamente.
4. Verificar que o papel de runtime pode operar as três tabelas por conexão servidor, mas `anon`/`authenticated` não podem acessar os registros via API pública Supabase. A migração não concede privilégios a um papel customizado desconhecido; esse papel deve ser validado pelo administrador. Não desabilitar RLS para contornar erro.
5. Publicar código com os flags desativados. Confirmar que a nova rota existe e rejeita cron não autenticado com 401. O build normal não executa esta migração nem altera job/configuração.

## Configuração explícita

O script `scripts/setup-ai-inbox-scs.ts` reutiliza o singleton do projeto. Execute usando o executor TypeScript autorizado, com variáveis já presentes no ambiente administrativo, sem expor valores de segredos em logs.

Variáveis operacionais:

- `AI_INBOX_INSTANCE_IDS`: IDs internos das caixas SCS, separados por vírgula.
- `AI_INBOX_REVIEWER_IDS`: IDs de revisores ativos, separados por vírgula.
- `AI_INBOX_CLINICAL_REVIEWER_IDS`: subconjunto dos revisores designados como responsáveis técnicos; pode ficar vazio inicialmente.
- `CRON_SECRET`: a credencial já usada pelo ambiente de produção, sem rotação.

Sem `--apply`, o script valida alvos e descreve a simulação, sem gravações. Com `--apply`, grava AppSetting `ai_inbox_scs_v1` e cria somente o job `ai-inbox-scs-observer-every-15-minutes` (`*/15 * * * *`) para `https://clinicasgestao.com.br/api/cron/ai-inbox-observe`. A data inicial da ativação é preservada em reexecuções.

Depois de verificar schema, script, credencial e rollout, habilitar no ambiente do app:

- `AI_INBOX_SCS_ENABLED=true`: gate do servidor e da captura.
- `NEXT_PUBLIC_AI_INBOX_SCS_ENABLED=true`: gate de build para mostrar controles no Inbox.

Ambos exigem publicação da configuração correta. `enabled` do AppSetting é um terceiro gate; pausar a configuração mantém envio manual intacto. Instâncias de Osasco/SBC/Todas não participam implicitamente.

## Homologação controlada antes do atendimento real

1. Validar credencial/modelo com uma pergunta operacional sem dados pessoais e orçamento reservado. Presença de variável em Vercel não prova chave válida ou acesso ao modelo. Os testes locais usam provider fictício.
2. Observar uma resposta humana elegível de SCS e confirmar uma única fila; esperar o job ou disparar uma única execução autenticada. Nenhum envio de WhatsApp é necessário para testar a geração; não usar cliente real como destinatário de teste.
3. Confirmar ficha pendente com fonte correta e sem PII. Aprovar pelo painel, com validade e conferência explícitas. Explicações clínicas precisam da responsável técnica.
4. Testar com dados autorizados: “qual o horário de funcionamento?” versus “quando abre e fecha?”; “tem vaga às 10h?” não deve ser tratado como expediente. Sem horário cadastrado/aprovado, a IA deve sinalizar lacuna.
5. Procedimento conhecido versus região genérica: Botox não pode recuperar orientação de harmonização de mamas; abdômen/flacidez não define protocolo. Sintomas/complicações devem ir à equipe técnica, sem prescrição do modelo.
6. Inserir sugestão em rascunho já preenchido, conferir preservação do texto e envio manual. Editar mensagem/ficha, revogar permissão e receber nova mensagem durante geração: sugestão anterior deve ser bloqueada.
7. Validar cron/job próprio, fila, reserva e latência com acesso autorizado; não alterar o job dos lembretes. Medir queries reais antes de ampliar escopo/limites.

## Uso diário

- A equipe responde normalmente pelo CRM; textos elegíveis alimentam fila após persistência. Alterações são consolidadas com atraso mínimo de dois minutos e processadas pelo job de quinze minutos.
- “Aprendizados” permite revisar, corrigir, aprovar, rejeitar e desativar fichas. Correção volta a pendente e invalida embedding/aprovação. Fichas semelhantes são sinalizadas, não sobrescritas automaticamente.
- “Sugerir resposta” gera só por clique. “Usar/Acrescentar ao rascunho” revalida o contexto; nunca envia ou assume atendimento.
- Falhas têm reserva preservada e ficam visíveis na fila. Revisor pode usar “Retomar falhas da fila”; a nova tentativa continua sujeita a orçamento/cotas.
- Não há backfill histórico, transcrição automática, agenda automática ou envio autônomo. Ausência de fonte produz pedido de revisão humana, não uma resposta clínica genérica.
- Leases evitam sobreposição por conversa, mas a validação em PGlite serializa transações; confirmar concorrência real entre processos em staging. Custos não conhecidos por timeout continuam reservados.

## Pausar com segurança

O script com `--pause` sem `--apply` apenas descreve a ação. Com ambos, muda somente `enabled=false` e remove o job exclusivo da IA. Não apaga fila, fichas, auditoria, mensagens, instâncias nem jobs existentes. Desativar o flag do servidor também interrompe novas operações; para ocultar os botões, desativar o flag público e republicar.

## Testes locais

`node --experimental-strip-types --test tests/ai-inbox.test.mjs` usa banco PostgreSQL/pgvector isolado e provider fictício, nunca DATABASE_URL.

Para a interface, montar temporariamente uma página em `src/app/testar-ia/ai-inbox-preview.tmp/page.tsx` reexportando `tests/fixtures/ai-inbox-preview.tsx`, iniciar Next dev no loopback 3210 e executar `node tests/ai-inbox-ui.mjs`. O runner bloqueia rede externa e intercepta todas as APIs com dados fictícios. Remover a página temporária antes de build/commit. O runner gera screenshots em um diretório temporário próprio.
