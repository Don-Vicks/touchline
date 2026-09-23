import { Buffer } from "buffer";
import { Connection, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";

const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

export async function signAndSendInstructions(input: {
  publicKey: PublicKey;
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
  recentBlockhash: string;
  lastValidBlockHeight: number;
  instructions: { programId: string; data: string; accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[] }[];
}) {
  const instructions = input.instructions.map(
    (ix) =>
      new TransactionInstruction({
        programId: new PublicKey(ix.programId),
        data: Buffer.from(ix.data, "base64"),
        keys: ix.accounts.map((account) => ({
          pubkey: new PublicKey(account.pubkey),
          isSigner: account.isSigner,
          isWritable: account.isWritable,
        })),
      }),
  );
  const message = new TransactionMessage({
    payerKey: input.publicKey,
    recentBlockhash: input.recentBlockhash,
    instructions,
  }).compileToV0Message();
  const signed = await input.signTransaction(new VersionedTransaction(message));
  const connection = new Connection(rpc, "confirmed");
  const signature = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(
    { signature, blockhash: input.recentBlockhash, lastValidBlockHeight: input.lastValidBlockHeight },
    "confirmed",
  );
  return signature;
}
