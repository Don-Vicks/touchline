# Touchline

A social second screen for live football worldwide. Fans join a matchroom, form a squad, talk through the match, and take YES/NO sides on what happens next. [Panta](https://docs.panta.market) is the prediction-market rail. ESPN’s public soccer scoreboard is the default football feed (no API key). Touchline does not invent scores, events, prices, or settlements.

The long-form description of coverage, architecture, and **how in-match markets are generated** is in [PROJECT.md](./PROJECT.md).

## Layout

```text
apps/web     Next.js matchroom
apps/api     Express, Prisma, Socket.IO, BullMQ workers
packages/football-domain
packages/market-engine
packages/validation
```

PostgreSQL is the source of truth. Redis is presence, rate limits, queues, and the socket bridge.

## Run

Postgres and Redis need to be up. This machine’s defaults are in `.env`.

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

Web: http://localhost:3010  
API: http://localhost:4000/api/v1/health

Port 3000 is already taken on this machine, so the web app uses 3010. `WEB_ORIGIN` has to match that origin or the browser will drop the session cookie.

## Keys

| Variable | What it unlocks |
| --- | --- |
| *(none)* | ESPN public scoreboard: big-five Europe, Championship, Eredivisie, Primeira, Scotland, Belgium, Turkey, Denmark, MLS, Liga MX, Brasileirão, Liga Profesional, Saudi Pro League, J1, A-League, Libertadores, Sudamericana, UEFA cups, Nations League. |
| `THESPORTSDB_API_KEY` | Optional. Defaults to the free test key `3` and fills upcoming/past dates for those same leagues. |
| `YOUTUBE_API_KEY` | Optional free Google Cloud key. Auto-embeds post-match highlights and rare official YouTube lives. |
| `FOOTBALL_DATA_TOKEN` | Optional free [football-data.org](https://www.football-data.org/) token (register, no paid plan required) for the same competitions. |
| `API_FOOTBALL_KEY` | Optional [API-Football](https://www.api-football.com/) key if you already have one. |
| `SPORTMONKS_API_TOKEN` | Optional extra feed. Only needed if you want leagues that sit on that key. |
| `PANTA_API_KEY` | Quote, build, and register real USDC markets. |
| `PANTA_MARKET_IMAGE_URL` | Public https catalog image Panta requires on create. |
| `PANTA_CREATOR_KEYPAIR_PATH` | Optional operator keypair that signs market-creation transactions. Leave empty and sign them from Desk. User trades are never signed with this key. |

ESPN is the live source. TheSportsDB and OpenLigaDB fill the calendar without a paid plan. Optional tokens merge on top. The same match from two feeds is stored once. Fixtures sort by kickoff across every tracked league.

Without a Panta key, matchrooms, squads, and chat still run, and markets stay non-tradable with “Markets temporarily unavailable.” No fake prices are shown.

## Golden path

1. Sign up and create a squad.
2. A live fixture arrives from the football feeds and opens a matchroom.
3. People join and chat over Socket.IO.
4. A corner or goal is stored once (provider event id). The market engine proposes a binary question.
5. Panta quote → build → wallet sign → broadcast → register. The market id on the row is Panta’s.
6. Fans take YES/NO the same way. Panta is the settlement authority.
7. When Panta reports the outcome, XP and squad / global ranks update. A wrong call scores 0. Stake size does not change XP.

`pnpm test` covers the market engine, including the 73rd-minute corner that asks whether that team scores before the 78th minute.
