import type { LineupPlayer } from "@/lib/types";

function lastName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

function band(position: string | null): "GK" | "DF" | "MF" | "FW" {
  const p = (position ?? "").toUpperCase();
  if (p.includes("GK") || p === "G" || p.includes("GOAL")) return "GK";
  if (p.includes("B") || p.includes("DF") || p === "D" || p.includes("DEF") || p.includes("BACK") || p.includes("CB") || p.includes("WB")) return "DF";
  if (p.includes("FW") || p.includes("ST") || p.includes("CF") || p.includes("OFF") || p.includes("ATT") || p.includes("WING") || p === "F") return "FW";
  return "MF";
}

function formationRows(value: string | null): number[] {
  const parts = (value ?? "4-3-3")
    .split(/[-–]/)
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!parts.length) return [1, 4, 3, 3];
  if (parts[0] !== 1) return [1, ...parts];
  return parts;
}

function placeOnPitch(players: LineupPlayer[], formation: string | null) {
  const xi = (players.some((row) => row.starter) ? players.filter((row) => row.starter) : players).slice(0, 11);
  const rows = formationRows(formation);
  const buckets: LineupPlayer[][] = rows.map(() => []);
  const gk = xi.filter((row) => band(row.position) === "GK");
  const df = xi.filter((row) => band(row.position) === "DF");
  const mf = xi.filter((row) => band(row.position) === "MF");
  const fw = xi.filter((row) => band(row.position) === "FW");
  const rest = [...gk, ...df, ...mf, ...fw].filter((row, index, all) => all.findIndex((item) => item.id === row.id) === index);
  const unused = xi.filter((row) => !rest.some((item) => item.id === row.id));
  const ordered = [...rest, ...unused];
  let i = 0;
  for (let r = 0; r < rows.length; r++) {
    const need = rows[r] ?? 0;
    buckets[r] = ordered.slice(i, i + need);
    i += need;
  }
  if (i < ordered.length && buckets.length) {
    buckets[buckets.length - 1] = [...(buckets[buckets.length - 1] ?? []), ...ordered.slice(i)];
  }
  return buckets;
}

function Shirt({ player }: { player: LineupPlayer }) {
  return (
    <div className="flex w-[4.6rem] flex-col items-center text-center sm:w-[5.4rem]">
      {player.imageUrl ? (
        <img
          src={player.imageUrl}
          alt=""
          className="h-10 w-10 rounded-full object-cover ring-2 ring-lime sm:h-11 sm:w-11"
          onError={(event) => {
            event.currentTarget.style.display = "none";
            const next = event.currentTarget.nextElementSibling;
            if (next instanceof HTMLElement) next.classList.remove("hidden");
          }}
        />
      ) : null}
      <span className={`grid h-10 w-10 place-items-center rounded-full bg-lime font-display text-sm tabular-nums text-ink shadow sm:h-11 sm:w-11 ${player.imageUrl ? "hidden" : ""}`}>{player.jersey ?? "–"}</span>
      <span className="mt-1 text-[0.7rem] font-medium leading-tight text-foreground sm:text-xs">{lastName(player.name)}</span>
      <span className="hidden max-w-full text-[0.65rem] text-flood sm:block">{player.name}</span>
    </div>
  );
}

function Half({
  name,
  formation,
  players,
  invert,
}: {
  name: string;
  formation: string | null;
  players: LineupPlayer[];
  invert?: boolean;
}) {
  const rows = placeOnPitch(players, formation);
  const display = invert ? [...rows].reverse() : rows;
  return (
    <div className="flex min-h-[14rem] flex-1 flex-col justify-evenly py-3">
      <p className={`px-3 font-display text-xs uppercase tracking-[0.16em] text-flood ${invert ? "order-last" : ""}`}>
        {name} {formation ? `· ${formation}` : ""}
      </p>
      {display.map((row, index) => (
        <div key={index} className="flex justify-evenly">
          {row.map((player) => (
            <Shirt key={player.id} player={player} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function LineupBoard({
  homeName,
  awayName,
  home,
  away,
  homeFormation,
  awayFormation,
}: {
  homeName: string;
  awayName: string;
  home: LineupPlayer[];
  away: LineupPlayer[];
  homeFormation: string | null;
  awayFormation: string | null;
}) {
  if (!home.length && !away.length) {
    return (
      <section className="bg-card/80 p-4 ring-1 ring-line">
        <p className="kicker">Teamsheets</p>
        <h2 className="font-serif text-2xl">On the pitch</h2>
        <p className="mt-2 text-sm text-muted">Lineups are not out yet. Names and numbers land here when ESPN or football-data.org send the XI.</p>
      </section>
    );
  }
  const homeBench = home.filter((row) => !row.starter);
  const awayBench = away.filter((row) => !row.starter);
  return (
    <section className="bg-card/80 ring-1 ring-line">
      <div className="border-b border-line px-4 py-3">
        <p className="kicker">Teamsheets</p>
        <h2 className="font-serif text-2xl">On the pitch</h2>
      </div>
      <div className="pitch-mark relative mx-3 my-4 overflow-hidden rounded-sm bg-pitch">
        <div className="pointer-events-none absolute inset-x-[12%] top-[12%] h-[76%] border border-white/25" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-white/25" />
        <div className="relative flex min-h-[32rem] flex-col">
          <Half name={awayName} formation={awayFormation} players={away} invert />
          <Half name={homeName} formation={homeFormation} players={home} />
        </div>
      </div>
      {(homeBench.length || awayBench.length) && (
        <div className="grid gap-6 border-t border-line px-4 py-4 md:grid-cols-2">
          <div>
            <p className="kicker">Bench · {homeName}</p>
            <ul className="mt-2 space-y-2">
              {homeBench.map((player) => (
                <li key={player.id} className="flex items-center gap-3 text-sm">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-turf font-display text-sm tabular-nums">{player.jersey ?? "–"}</span>
                  <span className="font-medium">{player.name}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="kicker">Bench · {awayName}</p>
            <ul className="mt-2 space-y-2">
              {awayBench.map((player) => (
                <li key={player.id} className="flex items-center gap-3 text-sm">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-turf font-display text-sm tabular-nums">{player.jersey ?? "–"}</span>
                  <span className="font-medium">{player.name}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
