import { supa } from './supabase.js';

export async function insertSupplySnapshot({ ts, total, locked, circ }) {
  const { error } = await supa.from('circ_supply').insert([
    {
      ts,
      total_supply: total,
      locked_balance: locked,
      circulating_supply: circ,
    },
  ]);
  if (error) throw error;
}

export async function upsertWalletBalances(entries) {
  if (!entries?.length) return;
  const { error } = await supa
    .from('circ_wallet_balances')
    .upsert(entries, { onConflict: 'wallet' });
  if (error) throw error;
}

export async function logCircRun(meta) {
  const { error } = await supa.from('circ_log').insert([meta]);
  if (error) console.error('logCircRun error', error);
}

