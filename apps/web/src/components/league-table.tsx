import { Kit, posTone } from "@/components/kit";
import { Empty } from "@/components/states";
import { formatXp } from "@/lib/format";

export function LeagueTable({
  title,
  kicker,
  rows,
}: {
  title: string;
  kicker: string;
  rows: { id: string; name: string; rank: number; xp: number; extra?: string; avatarUrl?: string | null; seed?: string; form?: string[] }[];
}) {
  const podium = rows.slice(0, 3);
  return (
    <section className="bg-card/80 ring-1 ring-line">
      <div className="border-b border-line px-4 py-4 md:px-5">
        <p className="kicker">{kicker}</p>
        <h2 className="font-serif text-3xl tracking-tight">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <div className="px-4">
          <Empty title="Table is empty" body="XP lands here after the first settled call." />
        </div>
      ) : (
        <>
          {podium.length >= 1 ? (
            <ol className="grid gap-3 border-b border-line px-4 py-4 sm:grid-cols-3">
              {podium.map((row) => (
                <li key={row.id} className="flex items-center gap-3">
                  <span className={`font-display text-3xl tabular-nums ${posTone(row.rank)}`}>{row.rank}</span>
                  <Kit name={row.name} imageUrl={row.avatarUrl} seed={row.seed} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.name}</p>
                    <p className="font-display tabular-nums text-sm text-muted">{formatXp(row.xp)} XP</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[20rem] text-left">
              <thead>
                <tr className="border-b border-line font-display text-xs uppercase tracking-[0.16em] text-muted">
                  <th className="px-4 py-2 font-normal md:px-5">Pos</th>
                  <th className="py-2 font-normal">Name</th>
                  <th className="py-2 font-normal">Form</th>
                  <th className="px-4 py-2 text-right font-normal md:px-5">XP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-line/60 last:border-0">
                    <td className={`px-4 py-3 font-display text-xl tabular-nums md:px-5 ${posTone(row.rank)}`}>{row.rank}</td>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-2">
                        <Kit name={row.name} imageUrl={row.avatarUrl} seed={row.seed} size="sm" />
                        <span>
                          <span className="font-medium">{row.name}</span>
                          {row.extra ? <span className="ml-2 text-sm text-muted">{row.extra}</span> : null}
                        </span>
                      </span>
                    </td>
                    <td className="py-3 font-display text-sm tracking-widest">
                      {(row.form ?? []).length
                        ? row.form!.map((ch, i) => (
                            <span key={i} className={ch === "W" ? "text-lime" : "text-muted"}>
                              {ch}
                            </span>
                          ))
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-display text-xl tabular-nums md:px-5">{formatXp(row.xp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
