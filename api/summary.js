import { supa } from './_supabase.js';
import { send, bad, methodNotAllowed, formatUnits, pctLocked } from './_util.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res);

  const { limit = 30 } = req.query;
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return bad(res, 'Invalid limit');

  const decimals = Number(process.env.TOKEN_DECIMALS || 9);

  const { data, error } = await supa
    .from('circ_supply')
    .select('total_supply, locked_balance, circulating_supply, ts')
    .order('ts', { ascending: false })
    .limit(n);

  if (error) return send(res, 500, { error: 'Database error', details: error.message });
  if (!data?.length) return send(res, 200, { count: 0, data: [] });

  let totalSum = 0n,
    lockedSum = 0n,
    circSum = 0n;
  let minCirc = null,
    maxCirc = null;

  for (const r of data) {
    const tot = BigInt(r.total_supply);
    const loc = BigInt(r.locked_balance);
    const cir = BigInt(r.circulating_supply);
    totalSum += tot;
    lockedSum += loc;
    circSum += cir;
    if (minCirc === null || cir < minCirc) minCirc = cir;
    if (maxCirc === null || cir > maxCirc) maxCirc = cir;
  }

  const avgTotal = totalSum / BigInt(data.length);
  const avgLocked = lockedSum / BigInt(data.length);
  const avgCirc = circSum / BigInt(data.length);

  send(res, 200, {
    count: data.length,
    average: {
      total_supply: avgTotal.toString(),
      locked_balance: avgLocked.toString(),
      circulating_supply: avgCirc.toString(),
      totalFormatted: formatUnits(avgTotal.toString(), decimals),
      lockedFormatted: formatUnits(avgLocked.toString(), decimals),
      circFormatted: formatUnits(avgCirc.toString(), decimals),
      pctLocked: pctLocked(avgLocked.toString(), avgTotal.toString()),
    },
    min: {
      circulating_supply: minCirc?.toString(),
      circFormatted: minCirc ? formatUnits(minCirc.toString(), decimals) : null,
    },
    max: {
      circulating_supply: maxCirc?.toString(),
      circFormatted: maxCirc ? formatUnits(maxCirc.toString(), decimals) : null,
    },
  });
}

