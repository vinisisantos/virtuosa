-- Busca completa do inbox. Este arquivo precisa ser executável como um único
-- script pelo `prisma db execute`. Os índices são criados separadamente pelo
-- bootstrap de produção para que cada CREATE INDEX CONCURRENTLY rode fora de
-- uma transação e não bloqueie as escritas do webhook.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- `translate` é imutável e, por isso, pode ser usada tanto na consulta quanto
-- no índice funcional. O mapa cobre os sinais diacríticos usados em português
-- sem depender da volatilidade da extensão `unaccent`.
CREATE OR REPLACE FUNCTION public.virtuosa_search_normalize(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
AS $function$
  SELECT TRANSLATE(
    LOWER(input),
    'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
    'aaaaaaeeeeiiiiooooouuuucnyy'
  );
$function$;
