-- CreateTable
CREATE TABLE "NoteShare" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NoteShare_token_key" ON "NoteShare"("token");

-- CreateIndex
CREATE UNIQUE INDEX "NoteShare_noteId_key" ON "NoteShare"("noteId");

-- AddForeignKey
ALTER TABLE "NoteShare" ADD CONSTRAINT "NoteShare_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
