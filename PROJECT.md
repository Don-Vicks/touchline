# Touchline — project document

Touchline is a social second screen for **live football worldwide**. Fans open a matchroom, sit with a squad, talk through the game, and take YES/NO sides on what happens next. Scores, events, prices, and settlements are never invented in this app. Football comes from live feeds. Money markets, when enabled, come from [Panta](https://docs.panta.market).

This file is the working description of what is being built: product, feeds, market generation, and how the pieces fit.

## What it is

A matchday product, not a sportsbook homepage.

- **Fixtures** — live and upcoming matches from many leagues, not a UEFA-only calendar.
- **Matchroom** — scorebug, commentary timeline, terrace chat, who is in the room.
- **Calls** — binary YES/NO questions generated from real match state.
- **Squads** — clubs of fans, ranked by prediction XP.
- **Table** — global fan and squad standings.

Voice stays in the room: join, take a side, your squad. We do not say bet, odds, wager, or stake in the product UI.

## What it is not

- A replacement for official league apps.
- A price-making engine. Panta quotes and settles USDC.
- A place that fills empty kickoffs with fake scores.

If a feed is down, the room stays open and the UI says so.

## Layout

```text
apps/web                 Next.js 15 matchroom (port 3010 here)
apps/api                 Express, Prisma, Socket.IO, BullMQ workers (port 4000)
packages/football-domain Domain types, status mapping, clocks
packages/market-engine   Question templates, validation, evidence
packages/validation      Shared Zod schemas
```

PostgreSQL is the source of truth. Redis is presence, rate limits, queues, and the socket bridge.

## Football coverage (robust, not UEFA-only)

The product used to read as Premier League + UEFA. That was a calendar accident (international break) plus copy in the header. Coverage is now **worldwide domestic leagues first**, continental cups second.

### Live source (no paid key)

ESPN’s public soccer scoreboard. Each poll asks for live clocks and scores. Window sync walks a short calendar per league.

**Europe:** Premier League, Championship, La Liga, Serie A, Bundesliga, Ligue 1, Eredivisie, Primeira Liga, Scottish Premiership, Belgian Pro League, Süper Lig, Superliga, FA Cup, Carabao Cup.

**Americas:** MLS, Liga MX, Brasileirão, Liga Profesional, Libertadores, Sudamericana.

**Asia / Oceania:** Saudi Pro League, J1 League, A-League.

**International:** Nations League, plus World Cup when that feed has fixtures.

### Other feeds (merge, do not duplicate)

| Feed | Role |
| --- | --- |
| TheSportsDB (free test key) | Extra upcoming/past dates |
| OpenLigaDB | Bundesliga (1.) |
| football-data.org | Optional free token; big-five + Europe; extra codes fall back if the plan rejects them |
| API-Football / Sportmonks | Optional paid/plan keys if you already have them |

The same match from two feeds is stored once (`mergeFixtures`). Display names are canonicalised (Brasileirão, Liga MX, Nations League). Crests come from the provider; national teams fall back to flags.

Fixture lists **sort by kickoff**. League weight is only a tie-break. 2. Bundesliga is dropped so the board is not flooded by a second division.

## How live calls are detected and generated

Workers poll football feeds (`FOOTBALL_POLL_MS`, default 20s). Each fixture is ingested. A unique `provider + providerEventId` is stored once.

1. **Prematch** — status `SCHEDULED`, more than ~1 hour to kickoff. Opening the room (or window sync) runs `syncPrematch` → templates: home/away win, BTTS, over 2.5, clean sheets, corners/cards if the competition supplies them.
2. **Kickoff** — when status flips to `LIVE`, we fire a synthetic `KICKOFF` event so “penalty before FT” and similar templates can open even if ESPN has not sent a kickoff row.
3. **Live** — each new goal, corner, card, shot, VAR, sub runs `onFootballEvent` → `evaluate(snapshot, event)` in `packages/market-engine`. That emits short-window YES/NO candidates (usually 5 minutes). Cap: 6 open breaking markets. Dedupe by template + subject.
4. **Persist** — `persistCandidates` writes a `Market`. If `PANTA_API_KEY` is set, `attachPanta` quotes/builds/registers on Panta (operator keypair signs the create tx). If not, the market is `OPEN` as **XP-only**.
5. **Settle** — `observeOutcome` on every sync; Panta `syncPantaMarkets` copies remote prices/outcomes. XP follows the call.

YouTube highlights and Pinata catalog images are optional env (`YOUTUBE_API_KEY`, `PINATA_JWT` + `PINATA_IMAGE_CID`). The product runs without them.

## On-chain receipts

A USDC take-a-side stores `prediction.signature`. The API returns `explorerUrl` (`https://explorer.solana.com/tx/…`). The terrace posts a receipt line with that link. `/calls` is the book of every side you took. When Panta marks a position `claimable`, **Claim win** builds unsigned claim instructions, the wallet signs, then we record `claimSignature`. XP-only wins do not claim USDC.

## In-match prediction markets — strategy

Markets are **event-driven templates**, not an LLM guessing questions. The market engine (`packages/market-engine`) is deterministic and testable (`pnpm test`).

### Principles

1. **A real football event is the trigger.** Kickoff, corner, goal, card, shot, VAR, substitution. No market from vibes or commentary adjectives (those words are banned in questions).
2. **Binary and observable.** YES/NO against the official event feed. Resolution rules name the clock and the event id.
3. **Short windows for live.** Breaking markets usually close in five minutes. That matches how a terrace actually argues.
4. **Cap the board.** At most six open breaking markets on a match. Dedupe by template + subject + open status.
5. **Panta is the rail.** We persist a candidate, then quote → build → wallet sign → register. Without `PANTA_API_KEY`, the question can still appear as non-tradable. We never show fake prices.
6. **XP follows the call, not the size.** Correct = XP. Wrong = 0. Stake does not change the table.

### Prematch (status `SCHEDULED`, > ~1 hour to kickoff)

Opened once per fixture:

- Home win / away win (draw is NO)
- Both teams score
- Over 2.5 goals
- Each side’s clean sheet
- Over 8.5 corners / over 3.5 cards only if the competition actually supplies those stats

### Live (status `LIVE` or `HALFTIME`)

`onFootballEvent` runs when a unique provider event is stored.

| Trigger | Questions |
| --- | --- |
| Corner / shot | Will that team score before minute+5? Another corner in 5? |
| Goal / penalty / own goal | Another goal in 5? Another goal before FT? Trailing side scores next? |
| Yellow | Another yellow before 80? That team booked again? |
| Kickoff | Penalty before FT (when templated) |
| VAR / sub / foul | Follow-up before FT, including player-level shot/card templates when the feed names a player |

Evidence is re-checked on every sync (`observeOutcome`). When Panta reports the outcome, XP and squad ranks update.

The 73rd-minute corner → “does that team score before 78?” case is the golden test in `packages/market-engine`.

### What we will not generate

- Subjective questions (“will this be embarrassing?”)
- Markets after full-time
- Duplicate open copies of the same template for the same subject
- Tradable rows without Panta when the key is missing

## Matchroom (watch together)

A fixture upsert always opens a matchroom. The room is meant to feel like a gaming centre or a living room: one **big screen**, people talking over it, replies, crowd reactions.

- **Watch together:** live matches show **official “Watch on …” destinations** (Peacock, Sky, MLS Season Pass, etc.) plus ESPN broadcast names when the feed has them. Finished matches **auto-load highlights** (YouTube if `YOUTUBE_API_KEY` is set, else ESPN / TheSportsDB clips). Anyone who has joined can still put an official YouTube or Twitch URL on the wall so the whole room shares one picture. **No IPTV / M3U pirate feeds.**
- **Lineups:** starting XI and bench when ESPN (or football-data) sends the teamsheet.
- **Terrace chat:** chronological, named, timestamped. **Reply** quotes the line you’re answering (same as shouting down the sofa). Mentions notify. Crowd emoji sit on the bar.
- Socket.IO carries score, events, chat, reactions, and market updates.

## Stack and run

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

Web: http://localhost:3010  
API: http://localhost:4000/api/v1/health

Postgres and Redis must be up. `WEB_ORIGIN` must match the web origin or the session cookie is dropped.

Env is documented in `.env.example` and the short [README](./README.md). Football works without a paid key. Panta is optional until you want real USDC.

## Brand

See [brand.md](./brand.md). Night pitch, floodlight lime, Barlow Condensed for scores, Fraunces for titles.

## Status

Built and iterating: live feeds, worldwide league catalog, matchrooms, squads, XP table, deterministic market engine. Next tightening is richer live events from whichever feed actually sends corners/cards (ESPN is thinner than Sportmonks on that), and Panta wiring in production.
