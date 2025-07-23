import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadFromFile(relOrAbs) {
  const p = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(__dirname, '..', relOrAbs);
  const raw = await fs.readFile(p, 'utf8');
  return JSON.parse(raw);
}

async function loadFromUrl(u) {
  const res = await fetch(u);
  if (!res.ok) throw new Error(`Failed locked wallets fetch: ${res.status}`);
  return res.json();
}

function validate(list) {
  if (!Array.isArray(list)) throw new Error('Locked wallets JSON must be an array');
  return Array.from(new Set(list.map((s) => String(s).trim()).filter(Boolean)));
}

export async function getLockedWallets() {
  const src = process.env.LOCKED_WALLETS_JSON;
  let wallets;
  if (src) {
    if (/^https?:/i.test(src)) wallets = await loadFromUrl(src);
    else wallets = await loadFromFile(src);
  } else {
    wallets = await loadFromFile('../data/locked-wallets.json');
  }
  return validate(wallets);
}

