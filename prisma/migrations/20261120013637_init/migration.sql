-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');

-- CreateEnum
CREATE TYPE "ResearchStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('COMPANY', 'PRODUCT', 'SERVICE', 'TECHNOLOGY', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New conversation',
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchSession" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "summary" TEXT,
    "status" "ResearchStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ResearchSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "type" "EntityType" NOT NULL DEFAULT 'OTHER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchSessionEntity" (
    "id" TEXT NOT NULL,
    "researchSessionId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,

    CONSTRAINT "ResearchSessionEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchFact" (
    "id" TEXT NOT NULL,
    "researchSessionId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "sourceId" TEXT,
    "attribute" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "normalizedValue" TEXT,
    "unit" TEXT,
    "currency" TEXT,
    "effectiveAt" TIMESTAMP(3),
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confidence" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "ResearchFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "researchSessionId" TEXT,
    "searchLogId" TEXT,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "domain" TEXT,
    "snippet" TEXT,
    "publishedAt" TIMESTAMP(3),
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contentHash" TEXT,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchLog" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT,
    "researchSessionId" TEXT,
    "query" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'tavily',
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Conversation_userId_updatedAt_idx" ON "Conversation"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ResearchSession_conversationId_startedAt_idx" ON "ResearchSession"("conversationId", "startedAt");

-- CreateIndex
CREATE INDEX "ResearchSession_topic_idx" ON "ResearchSession"("topic");

-- CreateIndex
CREATE INDEX "Entity_canonicalName_idx" ON "Entity"("canonicalName");

-- CreateIndex
CREATE UNIQUE INDEX "Entity_canonicalName_type_key" ON "Entity"("canonicalName", "type");

-- CreateIndex
CREATE INDEX "ResearchSessionEntity_entityId_idx" ON "ResearchSessionEntity"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchSessionEntity_researchSessionId_entityId_key" ON "ResearchSessionEntity"("researchSessionId", "entityId");

-- CreateIndex
CREATE INDEX "ResearchFact_entityId_attribute_observedAt_idx" ON "ResearchFact"("entityId", "attribute", "observedAt");

-- CreateIndex
CREATE INDEX "ResearchFact_researchSessionId_idx" ON "ResearchFact"("researchSessionId");

-- CreateIndex
CREATE INDEX "ResearchFact_sourceId_idx" ON "ResearchFact"("sourceId");

-- CreateIndex
CREATE INDEX "Source_researchSessionId_idx" ON "Source"("researchSessionId");

-- CreateIndex
CREATE INDEX "Source_searchLogId_idx" ON "Source"("searchLogId");

-- CreateIndex
CREATE INDEX "Source_retrievedAt_idx" ON "Source"("retrievedAt");

-- CreateIndex
CREATE INDEX "Source_url_idx" ON "Source"("url");

-- CreateIndex
CREATE INDEX "SearchLog_conversationId_createdAt_idx" ON "SearchLog"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "SearchLog_researchSessionId_idx" ON "SearchLog"("researchSessionId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSession" ADD CONSTRAINT "ResearchSession_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSessionEntity" ADD CONSTRAINT "ResearchSessionEntity_researchSessionId_fkey" FOREIGN KEY ("researchSessionId") REFERENCES "ResearchSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSessionEntity" ADD CONSTRAINT "ResearchSessionEntity_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchFact" ADD CONSTRAINT "ResearchFact_researchSessionId_fkey" FOREIGN KEY ("researchSessionId") REFERENCES "ResearchSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchFact" ADD CONSTRAINT "ResearchFact_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchFact" ADD CONSTRAINT "ResearchFact_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_researchSessionId_fkey" FOREIGN KEY ("researchSessionId") REFERENCES "ResearchSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_searchLogId_fkey" FOREIGN KEY ("searchLogId") REFERENCES "SearchLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchLog" ADD CONSTRAINT "SearchLog_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchLog" ADD CONSTRAINT "SearchLog_researchSessionId_fkey" FOREIGN KEY ("researchSessionId") REFERENCES "ResearchSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
