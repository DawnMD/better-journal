-- DropIndex
DROP INDEX "Journal_userId_trash_updatedAt_createdAt_idx";

-- DropIndex
DROP INDEX "Note_journalId_idx";

-- CreateIndex
CREATE INDEX "Journal_userId_trash_updatedAt_idx" ON "Journal"("userId", "trash", "updatedAt");

-- CreateIndex
CREATE INDEX "Note_journalId_createdAt_idx" ON "Note"("journalId", "createdAt");
