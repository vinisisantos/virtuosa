-- Estrutura apenas: não altera conversas, não preenche histórico e não ativa envios.
DO $$ BEGIN
  CREATE TYPE "LeadMemoryResultLevel" AS ENUM ('NATURAL', 'MEDIO', 'EVIDENTE', 'NAO_INFORMADO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "LeadMemoryFunnelStage" AS ENUM (
    'NOVO', 'QUEIXA_DEFINIDA', 'EXPLICADO', 'CONVIDADO', 'AGENDADO',
    'CONFIRMADO', 'FALTOU', 'FECHOU', 'PERDIDO'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "LeadMemory" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "unidade" TEXT NOT NULL,
  "nome" TEXT,
  "nomeConfirmado" BOOLEAN NOT NULL DEFAULT FALSE,
  "campanhaOrigem" TEXT,
  "procedimentoInteresse" TEXT,
  "queixaPrincipal" TEXT,
  "nivelResultado" "LeadMemoryResultLevel" NOT NULL DEFAULT 'NAO_INFORMADO',
  "primeiraVez" BOOLEAN,
  "saudeObservacoes" TEXT,
  "precoPerguntado" BOOLEAN NOT NULL DEFAULT FALSE,
  "precoInformado" TEXT,
  "objecoes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "etapaFunil" "LeadMemoryFunnelStage" NOT NULL DEFAULT 'NOVO',
  "avaliacaoData" TIMESTAMP(3),
  "apresentacaoFeitaEm" TIMESTAMP(3),
  "perguntasFeitas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "resumo" VARCHAR(600),
  "ultimaMensagemClienteEm" TIMESTAMP(3),
  "ultimaMensagemAliceEm" TIMESTAMP(3),
  "escalarHumano" BOOLEAN NOT NULL DEFAULT FALSE,
  "motivoEscalonamento" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeadMemory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LeadMemory_unidade_check" CHECK ("unidade" = 'SBC'),
  CONSTRAINT "LeadMemory_conversationId_fkey" FOREIGN KEY ("conversationId")
    REFERENCES "WhatsAppConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "LeadMemory_conversationId_key" ON "LeadMemory"("conversationId");

-- Sem políticas públicas: conteúdo pessoal fica acessível somente ao backend autorizado.
ALTER TABLE "LeadMemory" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "LeadMemory" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "LeadMemory" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "LeadMemory" FROM authenticated;
  END IF;
END $$;
