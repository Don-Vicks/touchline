/** Tracked competitions worldwide. Sort weight is only a display hint; kickoff time still wins on the fixture list. */
export const FEATURED_COMPETITIONS = [
  { id: "epl", label: "Premier League", region: "europe", match: /premier league|english premier/i, token: "Premier" },
  { id: "laliga", label: "La Liga", region: "europe", match: /la liga|laliga|primera division/i, token: "La Liga" },
  { id: "seriea", label: "Serie A", region: "europe", match: /italian serie a|^serie a$/i, token: "Serie A" },
  { id: "bundesliga", label: "Bundesliga", region: "europe", match: /^(?!.*2\.).*bundesliga/i, token: "Bundesliga" },
  { id: "ligue1", label: "Ligue 1", region: "europe", match: /ligue 1/i, token: "Ligue 1" },
  { id: "championship", label: "Championship", region: "europe", match: /championship/i, token: "Championship" },
  { id: "eredivisie", label: "Eredivisie", region: "europe", match: /eredivisie/i, token: "Eredivisie" },
  { id: "primeira", label: "Primeira Liga", region: "europe", match: /primeira|liga portugal/i, token: "Primeira" },
  { id: "spl", label: "Scottish Premiership", region: "europe", match: /scottish|^premiership$/i, token: "Scottish" },
  { id: "proleague", label: "Belgian Pro League", region: "europe", match: /pro league|jupiler/i, token: "Pro League" },
  { id: "superlig", label: "Süper Lig", region: "europe", match: /süper lig|super lig/i, token: "Süper Lig" },
  { id: "superliga", label: "Superliga", region: "europe", match: /superliga/i, token: "Superliga" },
  { id: "ucl", label: "Champions League", region: "europe", match: /champions league/i, token: "Champions" },
  { id: "uel", label: "Europa League", region: "europe", match: /europa league/i, token: "Europa" },
  { id: "uecl", label: "Conference League", region: "europe", match: /conference league/i, token: "Conference" },
  { id: "nations", label: "Nations League", region: "international", match: /nations league/i, token: "Nations" },
  { id: "worldcup", label: "World Cup", region: "international", match: /world cup/i, token: "World Cup" },
  { id: "libertadores", label: "Libertadores", region: "americas", match: /libertadores/i, token: "Libertadores" },
  { id: "sudamericana", label: "Sudamericana", region: "americas", match: /sudamericana/i, token: "Sudamericana" },
  { id: "mls", label: "MLS", region: "americas", match: /\bmls\b|major league soccer/i, token: "MLS" },
  { id: "ligamx", label: "Liga MX", region: "americas", match: /liga mx|liga bbva/i, token: "Liga MX" },
  { id: "brasileirao", label: "Brasileirão", region: "americas", match: /brasileir|brazilian serie|serie a brazil/i, token: "Brasileirão" },
  { id: "ligaarg", label: "Liga Profesional", region: "americas", match: /liga profesional|argentine|primera división/i, token: "Liga Profesional" },
  { id: "saudi", label: "Saudi Pro League", region: "asia", match: /saudi/i, token: "Saudi" },
  { id: "jleague", label: "J1 League", region: "asia", match: /j1 league|j-league|j league/i, token: "J1" },
  { id: "aleague", label: "A-League", region: "asia", match: /a-league|a league/i, token: "A-League" },
  { id: "facup", label: "FA Cup", region: "europe", match: /fa cup/i, token: "FA Cup" },
  { id: "carabao", label: "Carabao Cup", region: "europe", match: /carabao|efl cup|league cup/i, token: "Carabao" },
] as const;

export function competitionWeight(name: string) {
  const index = FEATURED_COMPETITIONS.findIndex((row) => row.match.test(name));
  if (index === -1) return 80;
  return index;
}

export function isFeaturedCompetition(name: string) {
  if (/2\.\s*(fußball-)?bundesliga/i.test(name)) return false;
  return FEATURED_COMPETITIONS.some((row) => row.match.test(name));
}

export function displayCompetition(name: string) {
  const featured = FEATURED_COMPETITIONS.find((row) => row.match.test(name));
  if (featured) return featured.label;
  return name.replace(/\s+\d{4}\/\d{4}$/g, "").replace(/^\d+\.\s*/u, "").trim();
}

const ISO2: Record<string, string> = {
  ALB: "al", AND: "ad", ARM: "am", AUT: "at", AZE: "az", BEL: "be", BIH: "ba", BLR: "by", BUL: "bg",
  CRO: "hr", CYP: "cy", CZE: "cz", DEN: "dk", ENG: "gb-eng", ESP: "es", EST: "ee", FIN: "fi", FRA: "fr",
  FRO: "fo", GEO: "ge", GER: "de", GIB: "gi", GRE: "gr", HUN: "hu", IRL: "ie", ISL: "is", ISR: "il",
  ITA: "it", KAZ: "kz", KOS: "xk", LIE: "li", LTU: "lt", LUX: "lu", LVA: "lv", MDA: "md", MKD: "mk",
  MLT: "mt", MNE: "me", NED: "nl", NIR: "gb-nir", NOR: "no", POL: "pl", POR: "pt", ROU: "ro", RUS: "ru",
  SCO: "gb-sct", SRB: "rs", SVK: "sk", SVN: "si", SWE: "se", SUI: "ch", TUR: "tr", UKR: "ua", WAL: "gb-wls",
  USA: "us", MEX: "mx", CAN: "ca", BRA: "br", ARG: "ar",
};

export function flagUrl(abbreviation: string | null | undefined) {
  if (!abbreviation) return null;
  const iso = ISO2[abbreviation.toUpperCase()];
  return iso ? `https://flagcdn.com/w80/${iso}.png` : null;
}

export function soccerCrestUrl(providerId: string | null | undefined) {
  if (!providerId || !/^\d+$/.test(providerId)) return null;
  return `https://a.espncdn.com/i/teamlogos/soccer/500/${providerId}.png`;
}

export function playerHeadshotUrl(providerId: string | null | undefined) {
  if (!providerId || !/^\d+$/.test(providerId)) return null;
  return `https://a.espncdn.com/i/headshots/soccer/players/full/${providerId}.png`;
}

export function currentSoccerSeason(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const start = month >= 7 ? year : year - 1;
  return `${start}-${start + 1}`;
}
