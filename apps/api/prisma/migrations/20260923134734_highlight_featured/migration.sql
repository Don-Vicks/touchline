-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "highlightSearchedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MatchVideo" ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false;
