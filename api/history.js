import { supa } from './_supabase.js';
import { send, bad, methodNotAllowed, formatUnits, pctLocked } from './_util.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res);

  const { start, end, limit } = req.query;
  const decimals = Number(process.env.TOKEN_DECIMALS || 9);
  let q = supa.from('circ_supply').select('*');

  if (start || end) {
    if (!start || !end) return bad(res, 'Both start and end required');
    q = q.gte('ts', start).lte('ts', end).order('ts', { ascending: false });
  } else if (limit) {
    const n = Number(limit);
    if (!Number.isFinite(n) || n <= 0) return bad(res, 'Invalid limit');
    q = q.order('ts', { ascending: false }).limit(n);
  } else {
    q = q.order('ts', { ascending: false });
  }

  const { data, error } = await q;
  if (error) return send(res, 500, { error: 'Database error', details: error.message });

  send(res, 200, {
    count: data.length,
    data: data.map((d) => ({
      ts: d.ts,
      total_supply: d.total_supply,
      locked_balance: d.locked_balance,
      circulating_supply: d.circulating_supply,
      totalFormatted: formatUnits(d.total_supply, decimals),
      lockedFormatted: formatUnits(d.locked_balance, decimals),
      circFormatted: formatUnits(d.circulating_supply, decimals),
      pctLocked: pctLocked(d.locked_balance, d.total_supply),
    })),
  });
}

