import { PublicKey } from '@solana/web3.js';

let cache = null; // { mint: string, decimals: number }

export async function getMintDecimals(connection, mintAddress) {
  if (cache && cache.mint === mintAddress) return cache.decimals;
  const mintPk = new PublicKey(mintAddress);
  const { value } = await connection.getTokenSupply(mintPk);
  cache = { mint: mintAddress, decimals: value.decimals };
  return value.decimals;
}

