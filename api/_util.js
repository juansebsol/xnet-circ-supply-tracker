// Helper: send JSON response
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

// ✅ BigInt/string/number → decimal string with formatting
export function formatUnits(raw, decimals = 9) {
  if (raw === undefined || raw === null || raw === '') return '0';

  const rawStr = typeof raw === 'bigint' ? raw.toString() : String(raw);

  if (!/^\d+$/.test(rawStr)) throw new TypeError('Input must be a non-negative integer string or bigint');
  if (rawStr.startsWith('-')) throw new Error('Negative values not supported.');

  if (decimals === 0) return rawStr;

  const padded = rawStr.padStart(decimals + 1, '0');
  const intPart = padded.slice(0, -decimals);
  const fracPart = padded.slice(-decimals).replace(/0+$/, '');

  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

// % locked = locked / total (rounded to 2 decimals)
export function pctLocked(lockedStr, totalStr) {
  const locked = BigInt(lockedStr);
  const total = BigInt(totalStr);
  if (total === 0n) return null;
  const pct = Number((locked * 10000n) / total) / 100;
  return pct;
}
