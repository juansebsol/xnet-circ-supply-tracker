import { supa } from './_supabase.js';
import { send, notFound, methodNotAllowed, formatUnits, pctLocked } from './_util.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res);

  const { data, error } = await supa
    .from('circ_supply')
    .select('*')
    .order('ts', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return send(res, 500, { error: 'Database error', details: error.message });
  if (!data) return notFound(res, 'No data');

  const decimals = Number(process.env.TOKEN_DECIMALS || 9);

  send(res, 200, {
    ts: data.ts,
    total_supply: data.total_supply,
    locked_balance: data.locked_balance,
    circulating_supply: data.circulating_supply,
    totalFormatted: formatUnits(data.total_supply, decimals),
    lockedFormatted: formatUnits(data.locked_balance, decimals),
    circFormatted: formatUnits(data.circulating_supply, decimals),
    pctLocked: pctLocked(data.locked_balance, data.total_supply),
  });
}

