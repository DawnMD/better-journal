-- AI insights: per-note analysis columns and a per-user daily request counter.
--
-- Hand-edited. `prisma migrate dev` also emitted these two statements:
--
--   DROP INDEX "Note_searchVector_idx";
--   ALTER TABLE "Note" ALTER COLUMN "searchVector" DROP DEFAULT;
--
-- Both were removed. Prisma cannot represent a `GENERATED ALWAYS AS ... STORED`
-- column, so it reads the real `searchVector` as drift from the plain
-- `Unsupported("tsvector")` declared in schema.prisma and "corrects" it -- which
-- would drop the full-text GIN index created in 20260730080102_add_note_search
-- and silently disable search. Any future `migrate dev` that touches Note will
-- emit these again; strip them the same way before applying.

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "aiAnalyzedAt" TIMESTAMP(3),
ADD COLUMN     "aiMood" TEXT,
ADD COLUMN     "aiThemes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiUsage_userId_day_key" ON "AiUsage"("userId", "day");
