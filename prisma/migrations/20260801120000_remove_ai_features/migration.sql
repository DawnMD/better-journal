/*
  Warnings:

  - You are about to drop the column `aiThemes` on the `Note` table. All the data in the column will be lost.
  - You are about to drop the column `aiMood` on the `Note` table. All the data in the column will be lost.
  - You are about to drop the column `aiAnalyzedAt` on the `Note` table. All the data in the column will be lost.
  - You are about to drop the `AiUsage` table. All the data in the table will be lost.

*/
-- AlterTable
ALTER TABLE "Note" DROP COLUMN "aiThemes",
DROP COLUMN "aiMood",
DROP COLUMN "aiAnalyzedAt";

-- DropTable
DROP TABLE "AiUsage";
