-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "attendance" INTEGER,
ADD COLUMN     "officials" JSONB,
ADD COLUMN     "referee" TEXT,
ADD COLUMN     "venueCity" TEXT;
