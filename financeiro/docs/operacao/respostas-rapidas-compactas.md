# Biblioteca de respostas rápidas compacta

## Uso

- Abra **Respostas rápidas** pelo compositor do Inbox ou do follow-up.
- A biblioteca mostra os títulos dentro das mesmas categorias. Toque/clique para expandir a mensagem completa; só uma ocorrência fica aberta, inclusive quando uma resposta global aparece em várias pastas.
- **Usar resposta** acrescenta a mensagem ao rascunho existente. Expandir não insere e nenhuma dessas ações envia ao contato.
- Na resposta expandida, **Editar** mantém o texto bruto e suas variáveis; **⋯ → Excluir resposta** solicita confirmação.
- **Organizar** mostra os controles de posição. No desktop, arraste pelo puxador ou use Espaço, setas e Espaço para concluir; no celular, use subir/descer. **Concluir** volta aos títulos.
- Busca continua encontrando títulos, categorias e conteúdo, inclusive quando recolhido. Categorias, associação a campanhas e criação pelo botão da pasta permanecem iguais.

## Dados, custo e compatibilidade

Mudança exclusiva do componente compartilhado `saved-replies-dialog.tsx`, aplicada às três unidades e aos compositores que já o usam. Nenhuma alteração de schema, endpoint, permissão, texto salvo ou regra de campanha/unidade.

A biblioteca usa a carga e o cache existentes: uma requisição GET com respostas/categorias/campanhas; zero consultas adicionais e zero chamadas ao expandir, buscar, entrar/sair de organização ou reabrir a biblioteca carregada. Cada reordenação explícita continua usando uma única requisição PUT com a ordem completa. Erro restaura a ordem anterior.

Respostas globais são identificadas por pasta + resposta no estado de expansão. O ID canônico, a posição e o isolamento por usuário não mudam. A prévia continua personalizada pelo contexto; a seleção entrega o template original ao compositor, preservando a resolução individual no lote.

Não registrar sensores de toque do dnd-kit: eles já causaram travamento de rolagem no iPhone. A lista mantém rolagem vertical nativa e os controles móveis têm alvos de 44 px. Títulos longos quebram linha e o texto completo não é truncado.

O `Dialog.Popup` do Base UI intercepta setas para impedir navegação fora de uma janela. Somente quando o foco está no puxador e o modo Organizar está ativo, `preventBaseUIHandler()` permite que essas teclas cheguem ao sensor do dnd-kit no `document`. Não liberar as setas globalmente. Escape mantém o fechamento normal da biblioteca, descartando um arraste ainda não concluído.

## Verificação

Com `npm run dev -- --hostname 127.0.0.1 --port 3210` em execução:

```sh
node tests/saved-replies-ui.mjs
npm test
npx tsc --noEmit
npx eslint src/components/whatsapp/saved-replies-dialog.tsx
npm run build
```

O teste de interface intercepta todas as APIs e bloqueia destinos externos. Não utilizar testes que enviem mensagens ou modifiquem a biblioteca de usuários reais. Cobre 390, 430 e 1440 px, três unidades, claro/escuro, carregamento, erro, lista vazia, busca, mensagem longa, variável personalizada/bruta, duplicação global, edição, criação, exclusão confirmada/cancelada, ordenação e rollback.

Após publicar, conferir em aparelho real: rolar uma mensagem longa, recolher, usar no rascunho sem enviar e reordenar pelos botões. Não encurtar ou renomear os textos existentes para imitar os exemplos do mockup.
