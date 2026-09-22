import type { DomainFixture } from "@touchline/football-domain";

const RANK: Record<string, number> = {
  sportmonks: 4,
  "api-football": 4,
  "football-data": 3,
  openligadb: 3,
  thesportsdb: 1,
};

function fold(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\b(fc|afc|if|bk|sc|ac|cf|sv|vfb|tsv|fk)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function sameSide(a: string, b: string) {
  const left = fold(a);
  const right = fold(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const [short, long] = left.length < right.length ? [left, right] : [right, left];
  return short.length >= 5 && long.includes(short);
}

function sameMatch(a: DomainFixture, b: DomainFixture) {
  if (a.kickoffAt.slice(0, 10) !== b.kickoffAt.slice(0, 10)) return false;
  return (
    (sameSide(a.home.name, b.home.name) && sameSide(a.away.name, b.away.name)) ||
    (sameSide(a.home.name, b.away.name) && sameSide(a.away.name, b.home.name))
  );
}

function better(next: DomainFixture, current: DomainFixture) {
  const rank = (RANK[next.provider] ?? 0) - (RANK[current.provider] ?? 0);
  if (rank !== 0) return rank > 0;
  return next.events.length > current.events.length;
}

export function mergeFixtures(fixtures: DomainFixture[]) {
  const kept: DomainFixture[] = [];
  for (const fixture of fixtures) {
    const index = kept.findIndex((current) => sameMatch(current, fixture));
    if (index === -1) kept.push(fixture);
    else if (better(fixture, kept[index]!)) kept[index] = fixture;
  }
  return kept;
}
