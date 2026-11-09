---
version: 1
slug: "financeiro-src-app-crm-alice-page-tsx"
primary_target: "financeiro/src/app/crm/alice/page.tsx"
related_targets: ["financeiro/src/components/whatsapp/ai-assistant-composer.tsx", "financeiro/src/components/whatsapp/ai-assistant-mode-bar.tsx"]
---

# Acompanhamento da Alice — extensão do CRM

THESIS
Administradoras de SBC precisam saber se a Alice está operando, o que exige intervenção e quanto custou, e conseguir interrompê-la sem procurar configurações.

OWN-WORLD
Operate, código direto. Herdar navegação, tipografia, tokens claros/escuros e densidade do CRM existente. Nenhuma nova marca ou ilustração. seed: none (unavailable).

STORY
Primeiro o estado e o controle de pausa; depois atividade, custo e atendimentos com problemas identificáveis; por fim as regras e a escolha explícita do início das pendências.

FIRST VIEWPORT
Shell existente do CRM; título, unidade SBC, período e Atualizar. Estado ativo/pausado com controle imediato. Resumo tabular de atividade e custos. A interação distintiva é acompanhar o estado real de cada atendimento e abrir sua conversa, sem confundir envio aceito com entrega ou sugerir eficácia não medida.

FORM
Extensão operacional com controles familiares, listas e campos nativos. Mobile-first, sem nova estética. Carregamento, erro, vazio, foco e nomes longos cobertos em 390, 430 e 1440 px. Nenhum dado ilustrativo em produção.

FINISH
A página termina com as regras operacionais verificáveis e a ativação protegida por confirmação. A conversa possui Manual, Alice e Autônomo só em SBC, com Assumir atendimento para parar a IA. Revisão visual independente e capturas obrigatórias antes da entrega; nenhuma ativação real nos testes.

EVIDÊNCIAS DE COERÊNCIA — 2026-11-09
Documentação escopada concluída por inspeção do código e das capturas locais. A página e a modebar continuam no shell do CRM: Inter herdada, tokens semânticos de fundo/texto/cartão/borda e acento violeta existentes em `financeiro/src/app/globals.css`, sem fonte, marca ou estética paralela. Controles arredondados, superfícies delimitadas e ações primária/neutra seguem o vocabulário dos componentes incumbentes; os alvos de 44 px preservam a operação móvel. A lista mantém os mesmos dados e ações, empilhados no celular e em colunas no desktop.

As capturas `.impeccable/review/alice-list-{390,430,1440}.png` e `alice-conversation-{390,430,1440}.png` mostram nomes longos, estados distintos, custo não apurado, ação de conversa e foco no modo Autônomo. O teste local `financeiro/tests/alice-monitoring-ui.mjs` usa somente fixtures e intercepta todas as APIs; não é homologação com dados reais.

O veredito de finishreviewer é `ship` restrito aos dois achados resolvidos: contraste/foco da modebar e evidência da lista populada. As capturas são do modo escuro; não estender esse veredito a outros temas, backend, produção ou ativação autônoma.

Drift preexistente apenas registrado: `globals.css` já mantém a escala de raios do Tailwind e aliases legados de raios com valores diferentes para os mesmos nomes. Nenhuma normalização foi feita. Não há `DESIGN.md`/`PRODUCT.md` na raiz do projeto; esta extensão não os cria nem transforma decisões desta página em regras globais.
