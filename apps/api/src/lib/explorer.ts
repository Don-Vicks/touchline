import { config } from "../config";

export function explorerTxUrl(signature: string) {
  const cluster = config.solanaNetwork === "mainnet-beta" ? "" : `?cluster=${config.solanaNetwork}`;
  return `https://explorer.solana.com/tx/${signature}${cluster}`;
}
