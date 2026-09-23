-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "awayFormation" TEXT,
ADD COLUMN     "broadcasts" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "homeFormation" TEXT;

-- CreateTable
CREATE TABLE "MatchLineup" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "starter" BOOLEAN NOT NULL DEFAULT false,
    "position" TEXT,
    "jersey" INTEGER,
    "grid" TEXT,

    CONSTRAINT "MatchLineup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchVideo" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "embeddable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MatchVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchLineup_matchId_teamId_idx" ON "MatchLineup"("matchId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchLineup_matchId_playerId_key" ON "MatchLineup"("matchId", "playerId");

-- CreateIndex
CREATE INDEX "MatchVideo_matchId_kind_idx" ON "MatchVideo"("matchId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "MatchVideo_matchId_provider_url_key" ON "MatchVideo"("matchId", "provider", "url");

-- AddForeignKey
ALTER TABLE "MatchLineup" ADD CONSTRAINT "MatchLineup_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchLineup" ADD CONSTRAINT "MatchLineup_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchVideo" ADD CONSTRAINT "MatchVideo_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
