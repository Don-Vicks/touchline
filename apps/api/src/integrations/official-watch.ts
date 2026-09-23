/** Honest official destinations — outbound links, not pirate embeds. */
export const OFFICIAL_WATCH: { match: RegExp; options: { name: string; url: string }[] }[] = [
  { match: /premier league/i, options: [{ name: "Peacock", url: "https://www.peacocktv.com/" }, { name: "Sky Sports", url: "https://www.skysports.com/watch" }] },
  { match: /la liga/i, options: [{ name: "ESPN", url: "https://www.espn.com/watch/" }, { name: "LaLiga TV", url: "https://www.laliga.com/" }] },
  { match: /^serie a$/i, options: [{ name: "Paramount+", url: "https://www.paramountplus.com/" }] },
  { match: /bundesliga/i, options: [{ name: "ESPN+", url: "https://plus.espn.com/" }, { name: "Sky", url: "https://www.skysports.com/watch" }] },
  { match: /ligue 1/i, options: [{ name: "beIN", url: "https://www.beinsports.com/" }] },
  { match: /\bmls\b/i, options: [{ name: "MLS Season Pass", url: "https://tv.apple.com/channel/mls-season-pass" }] },
  { match: /liga mx/i, options: [{ name: "ViX", url: "https://www.vix.com/" }, { name: "TUDN", url: "https://www.tudn.com/" }] },
  { match: /brasileir/i, options: [{ name: "YouTube (CazéTV / official)", url: "https://www.youtube.com/results?search_query=brasileirao+ao+vivo" }] },
  { match: /liga profesional/i, options: [{ name: "ESPN", url: "https://www.espn.com/watch/" }] },
  { match: /champions league/i, options: [{ name: "Paramount+", url: "https://www.paramountplus.com/" }, { name: "TNT Sports", url: "https://www.tntsports.co.uk/" }] },
  { match: /europa league|conference league/i, options: [{ name: "TNT Sports", url: "https://www.tntsports.co.uk/" }] },
  { match: /nations league/i, options: [{ name: "YouTube official", url: "https://www.youtube.com/results?search_query=nations+league+live+official" }] },
  { match: /libertadores|sudamericana/i, options: [{ name: "Fanatiz", url: "https://www.fanatiz.com/" }, { name: "ESPN", url: "https://www.espn.com/watch/" }] },
  { match: /saudi/i, options: [{ name: "YouTube (SPL)", url: "https://www.youtube.com/results?search_query=saudi+pro+league+live" }] },
  { match: /j1 league/i, options: [{ name: "DAZN", url: "https://www.dazn.com/" }] },
  { match: /a-league/i, options: [{ name: "Paramount+", url: "https://www.paramountplus.com/" }] },
];

export function officialWatchFor(competition: string) {
  const row = OFFICIAL_WATCH.find((item) => item.match.test(competition));
  return row?.options ?? [];
}
