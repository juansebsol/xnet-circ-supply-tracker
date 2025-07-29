import { Connection, PublicKey } from '@solana/web3.js';
import { getLockedWallets } from './lockedWallets.js';
import { insertSupplySnapshot, upsertWalletBalances, logCircRun } from './upsert.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const envInt = (name, def) => (process.env[name] === undefined ? def : Number(process.env[name]));

export async function runJob() {
  const rpcUrl = process.env.RPC_URL;
  const mintAddr = process.env.TOKEN_MINT;
  if (!rpcUrl) throw new Error('Missing RPC_URL');
  if (!mintAddr) throw new Error('Missing TOKEN_MINT');

  const BATCH_SIZE = envInt('BATCH_SIZE', 5);
  const BATCH_DELAY_MS = envInt('BATCH_DELAY_MS', 1000);
  const MAX_RPC_RETRIES = envInt('MAX_RPC_RETRIES', 3);

  const connection = new Connection(rpcUrl, 'confirmed');
  const mintPk = new PublicKey(mintAddr);

  const start = Date.now();
  let rpcCalls = 0;
  let walletsChecked = 0;

  // total supply
  const supplyInfo = await connection.getTokenSupply(mintPk);
  rpcCalls++;
  const total = BigInt(supplyInfo.value.amount);
  const decimals = supplyInfo.value.decimals;

  const lockedWallets = await getLockedWallets();
  let locked = 0n;
  const walletEntries = [];

  for (let i = 0; i < lockedWallets.length; i += BATCH_SIZE) {
    const batch = lockedWallets.slice(i, i + BATCH_SIZE);

    const balances = await Promise.all(
      batch.map((addr) =>
        getAddressTokenBalanceWithRetry(connection, mintPk, addr, MAX_RPC_RETRIES, () => (rpcCalls += 1))
      )
    );

    batch.forEach((addr, idx) => {
      const bal = balances[idx];
      locked += bal;
      walletEntries.push({
        wallet: addr,
        balance: bal.toString(),
        last_updated: new Date().toISOString(),
      });
    });

    walletsChecked += batch.length;
    if (i + BATCH_SIZE < lockedWallets.length) await sleep(BATCH_DELAY_MS);
  }

  const circ = total - locked;
  const ts = new Date().toISOString();

  try {
    await insertSupplySnapshot({
      ts,
      total: total.toString(),
      locked: locked.toString(),
      circ: circ.toString(),
    });
    await upsertWalletBalances(walletEntries);
    await logCircRun({
      ts,
      status: 'success',
      total_supply: total.toString(),
      locked_balance: locked.toString(),
      circulating_supply: circ.toString(),
      wallets_checked: walletsChecked,
      rpc_calls: rpcCalls,
      error: null,
    });
  } catch (err) {
    await logCircRun({
      ts,
      status: 'error',
      total_supply: total.toString(),
      locked_balance: locked.toString(),
      circulating_supply: circ.toString(),
      wallets_checked: walletsChecked,
      rpc_calls: rpcCalls,
      error: String(err?.message || err),
    });
    throw err;
  }

  return {
    ts,
    total,
    locked,
    circ,
    decimals,
    walletsChecked,
    rpcCalls,
    ms: Date.now() - start,
  };
}

export async function getAddressTokenBalance(connection, mintPk, addr) {
  const addrPk = new PublicKey(addr);

  // First, try to treat the address as a token account
  try {
    const accountInfo = await connection.getParsedAccountInfo(addrPk);
    if (accountInfo?.value?.data?.program === 'spl-token' || accountInfo?.value?.data?.program === 'spl-token-2022') {
      const parsedData = accountInfo.value.data.parsed;
      if (parsedData && parsedData.info.mint === mintPk.toString()) {
        // This is a token account for our mint
        const amount = parsedData.info.tokenAmount.amount;
        return BigInt(amount);
      }
    }
  } catch {
    // Not a valid token account or not for our mint, continue to owner logic
  }

  // Fallback: treat as wallet owner and get all token accounts
  try {
    // Try parsed (1 RPC)
    const parsed = await connection.getParsedTokenAccountsByOwner(addrPk, { mint: mintPk });
    let amount = 0n;
    if (parsed?.value?.length) {
      for (const acc of parsed.value) {
        const uiAmt = acc.account.data.parsed?.info?.tokenAmount?.amount;
        if (uiAmt) amount += BigInt(uiAmt);
      }
      return amount;
    }
  } catch {
    // ignore, fallback
  }

  // Fallback: enumerate + get balances
  try {
    const tokenAccounts = await connection.getTokenAccountsByOwner(addrPk, { mint: mintPk });
    let amount = 0n;
    for (const t of tokenAccounts.value) {
      const bal = await connection.getTokenAccountBalance(t.pubkey);
      amount += BigInt(bal.value.amount);
    }
    return amount;
  } catch (err) {
    console.error(`Balance fetch failed for ${addr}:`, err);
    return 0n;
  }
}

async function getAddressTokenBalanceWithRetry(connection, mintPk, addr, maxRetries, bumpRpcCall) {
  let attempt = 0;
  let lastErr;
  while (attempt <= maxRetries) {
    try {
      bumpRpcCall();
      const bal = await getAddressTokenBalance(connection, mintPk, addr);
      return bal;
    } catch (err) {
      lastErr = err;
      attempt++;
      const backoff = Math.min(500 * attempt, 3000);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  console.error(`Retries exhausted for ${addr}:`, lastErr);
  return 0n;
}

