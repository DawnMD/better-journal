-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Note_journalId_idx" ON "Note"("journalId");

-- CreateIndex
CREATE INDEX "Journal_userId_trash_updatedAt_idx" ON "Journal"("userId", "trash", "updatedAt");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
