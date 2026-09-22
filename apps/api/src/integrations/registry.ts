import type { FootballDataProvider } from "@touchline/football-domain";
import { config } from "../config";
import { ApiFootballProvider } from "./api-football";
import { FootballDataProviderClient } from "./football-data";
import { OpenLigaDbProvider } from "./openligadb";
import { SportmonksProvider } from "./sportmonks";
import { TheSportsDbProvider } from "./thesportsdb";

export function footballProviders(): FootballDataProvider[] {
  const providers: FootballDataProvider[] = [new OpenLigaDbProvider(), new TheSportsDbProvider()];
  if (config.sportmonksToken) providers.unshift(new SportmonksProvider(config.sportmonksToken));
  if (config.footballDataToken) providers.push(new FootballDataProviderClient(config.footballDataToken));
  if (config.apiFootballKey) providers.push(new ApiFootballProvider(config.apiFootballKey));
  return providers;
}

export function providerNamed(name: string) {
  return footballProviders().find((provider) => provider.name === name);
}
