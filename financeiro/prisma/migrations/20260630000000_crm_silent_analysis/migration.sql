CREATE TABLE "CrmSilentAnalysisSetting" (
  "id" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "collectMessageBodies" BOOLEAN NOT NULL DEFAULT true,
  "includeOutbound" BOOLEAN NOT NULL DEFAULT true,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CrmSilentAnalysisSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrmConversationInsight" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "unit" TEXT,
  "channel" TEXT NOT NULL DEFAULT 'whatsapp',
  "contactPhone" TEXT,
  "contactName" TEXT,
  "instanceName" TEXT,
  "campaignName" TEXT,
  "source" TEXT,
  "status" TEXT NOT NULL DEFAULT 'collected',
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "inboundCount" INTEGER NOT NULL DEFAULT 0,
  "outboundCount" INTEGER NOT NULL DEFAULT 0,
  "firstMessageAt" TIMESTAMP(3),
  "lastMessageAt" TIMESTAMP(3),
  "lastAnalyzedAt" TIMESTAMP(3),
  "lastMessagePreview" TEXT,
  "summary" TEXT,
  "topics" JSONB,
  "objections" JSONB,
  "questions" JSONB,
  "rawSignals" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CrmConversationInsight_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrmSilentAnalysisSetting_unit_key" ON "CrmSilentAnalysisSetting"("unit");
CREATE INDEX "CrmSilentAnalysisSetting_isEnabled_idx" ON "CrmSilentAnalysisSetting"("isEnabled");

CREATE UNIQUE INDEX "CrmConversationInsight_conversationId_key" ON "CrmConversationInsight"("conversationId");
CREATE INDEX "CrmConversationInsight_unit_idx" ON "CrmConversationInsight"("unit");
CREATE INDEX "CrmConversationInsight_campaignName_idx" ON "CrmConversationInsight"("campaignName");
CREATE INDEX "CrmConversationInsight_lastMessageAt_idx" ON "CrmConversationInsight"("lastMessageAt");
CREATE INDEX "CrmConversationInsight_status_idx" ON "CrmConversationInsight"("status");
