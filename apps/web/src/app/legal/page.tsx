export default function LegalPage() {
  return (
    <article className="max-w-xl space-y-6">
      <p className="kicker">House rules</p>
      <h1 className="font-serif text-5xl tracking-tight">How we watch</h1>
      <p className="text-sm text-muted">Touchline is a social second screen. Scores and events come from football feeds. We do not invent results.</p>
      <section>
        <h2 className="font-serif text-2xl">Video</h2>
        <p className="mt-2 text-sm text-muted">
          Live 90 minutes sit on licensed broadcasters (Watch on …). The room can share a YouTube, Twitch, or HLS (.m3u8) link you already have rights to — the same picture for everyone in the room. We do not scrape public IPTV directories. Highlights after full time come from official league and SuperSport YouTube channels.
        </p>
      </section>
      <section>
        <h2 className="font-serif text-2xl">Calls</h2>
        <p className="mt-2 text-sm text-muted">
          YES/NO questions come from match events. USDC, when live, is quoted and settled by Panta on Solana. Until then, sides are XP only. Stake size does not change XP.
        </p>
      </section>
      <section>
        <h2 className="font-serif text-2xl">Where you are</h2>
        <p className="mt-2 text-sm text-muted">
          Broadcaster buttons are a guide, not a rights map for your country. Follow local law and your subscription. Football data is for the matchroom, not for official records.
        </p>
      </section>
    </article>
  );
}
