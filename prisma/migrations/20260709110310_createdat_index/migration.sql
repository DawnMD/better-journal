-- DropIndex
DROP INDEX "Journal_userId_trash_updatedAt_idx";

-- CreateIndex
CREATE INDEX "Journal_userId_trash_updatedAt_createdAt_idx" ON "Journal"("userId", "trash", "updatedAt", "createdAt");
