export function send(res, status, body) {
  res.status(status).json(body);
}
export function bad(res, msg) {
  send(res, 400, { error: msg });
}
export function notFound(res, msg = 'Not found') {
  send(res, 404, { error: msg });
}
export function methodNotAllowed(res) {
  send(res, 405, { error: 'Method not allowed' });
}

// BigInt string -> decimal string
export function formatUnits(rawStr, decimals) {
  if (rawStr == null) return null;
  const neg = rawStr.startsWith('-');
  const s = neg ? rawStr.slice(1) : rawStr;
  const pad = s.padStart(decimals + 1, '0');
  const int = pad.slice(0, -decimals) || '0';
  let frac = pad.slice(-decimals);
  frac = frac.replace(/0+$/, '');
  const out = frac ? `${int}.${frac}` : int;
  return neg ? `-${out}` : out;
}

export function pctLocked(lockedStr, totalStr) {
  const locked = BigInt(lockedStr);
  const total = BigInt(totalStr);
  if (total === 0n) return null;
  const pct = Number((locked * 10000n) / total) / 100; // 2 dec
  return pct;
}

