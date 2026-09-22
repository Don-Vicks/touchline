# Touchline

A social second screen for live football. Fans join a matchroom, form a squad, talk through the match, and take YES/NO sides on what happens next. [Panta](https://docs.panta.market) is the prediction-market rail. Sportmonks is the football feed. Touchline does not invent scores, events, prices, or settlements.

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
| `SPORTMONKS_API_TOKEN` | Sportmonks fixtures for the leagues on that key. This key covers Superliga (`271`) and the Scottish Premiership (`501`). |
| `FOOTBALL_DATA_TOKEN` | Optional [football-data.org](https://www.football-data.org/) feed for Premier League, La Liga, Bundesliga, Serie A, Ligue 1, and Europe. |
| `API_FOOTBALL_KEY` | Optional [API-Football](https://www.api-football.com/) feed for the same major leagues. |
| `PANTA_API_KEY` | Quote, build, and register real USDC markets. |
| `PANTA_MARKET_IMAGE_URL` | Public https catalog image Panta requires on create. |
| `PANTA_CREATOR_KEYPAIR_PATH` | Optional operator keypair that signs market-creation transactions. Leave empty and sign them from Desk. User trades are never signed with this key. |

OpenLigaDB covers the Bundesliga and 2. Bundesliga. TheSportsDB adds the next fixture in the Premier League, La Liga, Serie A, Ligue 1, and Europe. Sportmonks adds whatever leagues the token includes. The same match from two feeds is stored once.

Without a Panta key, matchrooms, squads, and chat still run, and markets stay non-tradable with “Markets temporarily unavailable.” No fake prices are shown.

## Golden path

1. Sign up and create a squad.
2. A live fixture arrives from Sportmonks and opens a matchroom.
3. People join and chat over Socket.IO.
4. A corner or goal is stored once (provider event id). The market engine proposes a binary question.
5. Panta quote → build → wallet sign → broadcast → register. The market id on the row is Panta’s.
6. Fans take YES/NO the same way. Panta is the settlement authority.
7. When Panta reports the outcome, XP and squad / global ranks update. A wrong call scores 0. Stake size does not change XP.

`pnpm test` covers the market engine, including the 73rd-minute corner that asks whether that team scores before the 78th minute.
