import type { FootballDataProvider } from "@touchline/football-domain";
import { config } from "../config";
import { ApiFootballProvider } from "./api-football";
import { EspnProvider } from "./espn";
import { FootballDataProviderClient } from "./football-data";
import { OpenLigaDbProvider } from "./openligadb";
import { SportmonksProvider } from "./sportmonks";
import { TheSportsDbProvider } from "./thesportsdb";

export function footballProviders(): FootballDataProvider[] {
  const providers: FootballDataProvider[] = [new EspnProvider(), new TheSportsDbProvider(), new OpenLigaDbProvider()];
  if (config.footballDataToken) providers.push(new FootballDataProviderClient(config.footballDataToken));
  if (config.apiFootballKey) providers.push(new ApiFootballProvider(config.apiFootballKey));
  if (config.sportmonksToken) providers.push(new SportmonksProvider(config.sportmonksToken));
  return providers;
}

export function providerNamed(name: string) {
  return footballProviders().find((provider) => provider.name === name);
}
