-- CreateTable: CRM Day Zero Model (Evolution API)
-- Tabelas criadas apenas a partir do momento de conexão da instância.
-- Nenhum dado histórico é importado (syncFullHistory: false).

CREATE TABLE "CRMContact" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "source" TEXT,
    "instanceName" TEXT,
    "leadStatus" TEXT NOT NULL DEFAULT 'new',
    "lastContactAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CRMContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CRMSession" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "assigneeId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "CRMSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CRMMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'text',
    "text" TEXT,
    "rawPayload" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CRMMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CRMContact_phone_key" ON "CRMContact"("phone");

-- CreateIndex
CREATE INDEX "CRMContact_phone_idx" ON "CRMContact"("phone");

-- CreateIndex
CREATE INDEX "CRMContact_leadStatus_idx" ON "CRMContact"("leadStatus");

-- CreateIndex
CREATE INDEX "CRMContact_lastContactAt_idx" ON "CRMContact"("lastContactAt");

-- CreateIndex
CREATE INDEX "CRMSession_contactId_idx" ON "CRMSession"("contactId");

-- CreateIndex
CREATE INDEX "CRMSession_status_idx" ON "CRMSession"("status");

-- CreateIndex
CREATE INDEX "CRMSession_startedAt_idx" ON "CRMSession"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CRMMessage_messageId_key" ON "CRMMessage"("messageId");

-- CreateIndex
CREATE INDEX "CRMMessage_sessionId_idx" ON "CRMMessage"("sessionId");

-- CreateIndex
CREATE INDEX "CRMMessage_contactId_idx" ON "CRMMessage"("contactId");

-- CreateIndex
CREATE INDEX "CRMMessage_timestamp_idx" ON "CRMMessage"("timestamp");

-- AddForeignKey
ALTER TABLE "CRMSession" ADD CONSTRAINT "CRMSession_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "CRMContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMMessage" ADD CONSTRAINT "CRMMessage_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "CRMSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMMessage" ADD CONSTRAINT "CRMMessage_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "CRMContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
