/*
  Warnings:

  - You are about to drop the column `hashedPassword` on the `Journal` table. All the data in the column will be lost.
  - You are about to drop the column `hidden` on the `Journal` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Journal" DROP COLUMN "hashedPassword",
DROP COLUMN "hidden";
