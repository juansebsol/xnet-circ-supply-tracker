# XNET Circulating Supply Scraper

Automated on‑chain fetcher that:
- Pulls XNET token **total supply** from the mint.
- Sums balances across a maintained list of **locked wallets**.
- Computes **circulating supply = total – locked**.
- Stores timestamped snapshots in **Supabase**.
- Logs each job run for audit/debug.
- (Optional) Exposes a **public read‑only API** on Vercel (latest, history, summary) — same DX style as the Offload Data Scraper project.

---

## ⚙️ How It Works

1. **Connect to Solana RPC**
   - Use your Helius (or other) endpoint; configurable via `RPC_URL`.
2. **Fetch Token Mint Supply**
   - One call to `getTokenSupply(mint)` returns raw amount + decimals.
3. **Load Locked Wallet List**
   - From repo JSON (`/data/locked-wallets.json`) or override via `LOCKED_WALLETS_JSON` env (path or URL).
4. **Batch Wallet Balance Checks (Rate‑Limited)**
   - Configurable `BATCH_SIZE`, `BATCH_DELAY_MS`, retry w/ backoff.
5. **Compute Circulating Supply**
   - `circulating = total - locked`.
6. **Write Results to Supabase**
   - Snapshot row → `circ_supply`.
   - Per‑wallet current balance cache → `circ_wallet_balances`.
   - Run log (success/error, RPC count) → `circ_log`.
   - This mirrors the *parse → upsert → log* flow pattern you used in the Offload Scraper.
7. **Schedule via GitHub Actions**
   - Hourly cron + manual dispatch; secrets injected in workflow. Same ops model as Offload Scraper.
8. **Optional Vercel API**
   - Lightweight Node serverless endpoints for latest / range / summary; Supabase service role envs set in Vercel, just like Offload API.

---

## 🗂️ Project Structure

```
xnet-circ-supply-scraper/
├── src/
│   ├── runOnce.js           # Entry point for local + CI one-shot
│   ├── fetchSupply.js       # Fetch total, locked, compute circ
│   ├── upsert.js            # Supabase writes + run logging
│   ├── supabase.js          # Supabase admin client (server-only)
│   ├── lockedWallets.js     # Load + validate locked wallet list
│   └── mintInfo.js          # Mint decimals helper (optional cache)
│
├── data/
│   └── locked-wallets.json  # Versioned locked wallet list
│
├── .github/
│   └── workflows/
│       └── circ-supply.yml  # GitHub Action cron + manual run
│
├── api/                     # Optional public read API (Vercel)
│   ├── _supabase.js         # Admin client (read-only queries)
│   ├── _util.js             # Format helpers (units, % locked)
│   ├── latest.js            # Most recent snapshot
│   ├── history.js           # Range / limit query
│   ├── summary.js           # Avg circ, min/max, % locked
│   └── vercel.json          # Vercel runtime config
│
├── utils/
│   ├── supa-sql-migrate.txt     # Safe create/alter tables
│   └── supa-sql-destructive.txt # Drop + recreate (dev reset)
│
├── .env.sample
├── package.json
├── README.md
└── jsconfig.json               # Or tsconfig if using TypeScript
```

The structure intentionally mirrors the clean layout from **xnet‑offload‑scraper** (src scraper logic, Supabase client, upsert + log module, GitHub workflow, optional API).

---

## 🔐 Environment Variables

Create a `.env` at repo root (never commit). These same Supabase + runtime env patterns are used in the Offload Scraper project, so this will feel familiar.

```bash
# Supabase
SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Solana RPC + Token
RPC_URL="https://mainnet.helius-rpc.com/?api-key=YOURKEY"
TOKEN_MINT="xNETbUB7cRb3AAu2pNG2pUwQcJ2BHcktfvSB8x1Pq6L"

# Locked wallets (path or URL)
LOCKED_WALLETS_JSON="./data/locked-wallets.json"

# Rate-limit tuning
BATCH_SIZE=5
BATCH_DELAY_MS=1000
MAX_RPC_RETRIES=3

# Logging
LOG_LEVEL=info
```

| Var                     | Required | What it’s for                | Notes                                              |
|-------------------------|----------|------------------------------|----------------------------------------------------|
| SUPABASE_URL            | ✅       | Supabase instance URL        | Server‑only. Same usage pattern in Offload Scraper. |
| SUPABASE_SERVICE_ROLE_KEY| ✅      | Admin key (insert/update)    | Store in GitHub & Vercel env; never client‑side.    |
| RPC_URL                 | ✅       | Solana RPC endpoint          | Use Helius or other high‑limit RPC.                 |
| TOKEN_MINT              | ✅       | XNET SPL token mint address  | Raw base units pulled from chain.                   |
| LOCKED_WALLETS_JSON     | ➖       | Override path/URL            | If unset, uses repo file.                           |
| BATCH_SIZE              | ➖       | Wallets per RPC batch        | Helps avoid rate limits.                            |
| BATCH_DELAY_MS          | ➖       | Wait between batches         | Increase if 429 errors.                             |
| MAX_RPC_RETRIES         | ➖       | Retry attempts               | Exponential backoff.                                |
| LOG_LEVEL               | ➖       | debug/info/warn/error        | Local verbosity.                                    |

---

## 🧪 Run Locally

Runs full process once locally `npm run circ:once`

```bash
npm install        # first time; or npm ci in CI
cp .env.sample .env
# edit .env with Supabase + RPC + mint
node -e "console.log('env loaded ok')"   # (optional sanity)

# Run once
npm run circ:once
```

Expected console output:

```json
✅ Circulating supply job OK
{
  "ts": "2025-07-23T17:00:00.000Z",
  "total": "250000000000000",
  "locked": "120000000000000",
  "circ": "130000000000000",
  "walletsChecked": 37,
  "rpcCalls": 52,
  "ms": 3200
}
```
If it fails, see Troubleshooting below.

---

## 🧾 Supabase Schema (SQL)

Run the safe create script first: open `utils/supa-sql-migrate.txt` in the Supabase SQL editor and execute. This pattern (bundled SQL file, paste into Supabase UI) is the same flow used in the Offload Scraper README.

**Safe Create / Migrate**

```sql
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

create table if not exists public.circ_supply (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  total_supply numeric not null,
  locked_balance numeric not null,
  circulating_supply numeric not null,
  pct_locked numeric generated always as (
    case when total_supply > 0 then locked_balance / total_supply * 100 else null end
  ) stored
);
create index if not exists circ_supply_ts_idx on public.circ_supply (ts desc);

create table if not exists public.circ_wallet_balances (
  wallet text primary key,
  balance numeric not null,
  last_updated timestamptz not null default now()
);

create table if not exists public.circ_log (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  status text,
  total_supply numeric,
  locked_balance numeric,
  circulating_supply numeric,
  wallets_checked int,
  rpc_calls int,
  error text
);
```

**Destructive Reset (Dev Only!)**

Drops all circulating‑supply tables. Only use when rebuilding from scratch — same warning style as Offload Scraper destructive schema note.

```sql
begin;
  drop table if exists public.circ_log cascade;
  drop table if exists public.circ_wallet_balances cascade;
  drop table if exists public.circ_supply cascade;
commit;
-- then run the migrate SQL above
```

---

## 🧠 Logic Summary

**runJob()** (from `src/fetchSupply.js`)
- Load env/config.
- Fetch total token supply.
- Load locked wallet list.
- Batch fetch each wallet balance (parsed token accounts first; fallback path).
- Sum locked; calc circ.
- Insert snapshot row.
- Upsert per‑wallet balances.
- Log run metrics (`circ_log`).

**insertSupplySnapshot() / upsertWalletBalances() / logCircRun()** (from `src/upsert.js`)
- Direct Supabase writes.
- Log status + counts for audit (mirrors the upsertDaily() + logScrape() approach in Offload Scraper).

---

## ✅ Usage Summary

| Action                | Command / Method         |
|-----------------------|-------------------------|
| Local one‑shot        | npm run circ:once       |
| GitHub hourly cron    | Auto via Actions (circ-supply.yml) |
| Setup Supabase schema | Paste migrate SQL into Supabase |
| Update locked wallets | Edit /data/locked-wallets.json or provide URL in env |
| Public read API       | Deploy repo to Vercel (optional) |

---

## ⏱ GitHub Actions (Scheduled Job)

A workflow in `.github/workflows/circ-supply.yml` runs the job hourly (top of hour UTC) and can be triggered manually in the Actions tab. This mirrors the Offload project’s CI scheduling pattern.

**circ-supply.yml**

```yaml
name: Circulating Supply Hourly

on:
  schedule:
    - cron: '0 * * * *'   # top of every hour UTC
  workflow_dispatch:

jobs:
  circ-supply:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    concurrency:
      group: circ-supply
      cancel-in-progress: false

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install deps
        run: npm ci

      - name: Run circulating supply fetch
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          RPC_URL: ${{ secrets.RPC_URL }}
          TOKEN_MINT: ${{ secrets.TOKEN_MINT }}
          LOCKED_WALLETS_JSON: ${{ secrets.LOCKED_WALLETS_JSON }} # optional URL override
          BATCH_SIZE: 5
          BATCH_DELAY_MS: 1000
          MAX_RPC_RETRIES: 3
          LOG_LEVEL: info
        run: npm run circ:once

      # Optional debug artifact
      - name: Upload run artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: circ-supply-run
          path: run-output/**
          if-no-files-found: ignore
          retention-days: 7
```

Add Secrets: GitHub → Repo → Settings → Secrets & Variables → Actions. Same flow as the Offload Scraper GitHub Action env setup.

---

## 🌐 Public Read API (Optional / Vercel)

This project includes an optional public JSON API, deployable via Vercel.

---

🔗 **Base URL**

Once deployed, your API will be accessible at:

```
https://your-vercel-deployment.vercel.app/api
```

> **Tip:** You can test locally by hitting `http://localhost:3000/api/*` if using `vercel dev`.

---

🗂️ **API Source Layout**

```
api/
├── _supabase.js     # Shared Supabase admin client
├── _util.js         # Format helpers (units, %)
├── latest.js        # Latest supply snapshot
├── history.js       # Supply snapshots by limit or range
├── summary.js       # Summary (avg, min, max)
└── vercel.json      # Runtime config
```

---

🔐 **Required Environment Variables (Vercel)**

Only Supabase keys are needed for read access — no RPC or GitHub secrets.

| Variable                   | Required | Description                        |
|---------------------------|----------|------------------------------------|
| SUPABASE_URL              | ✅       | Your Supabase project URL          |
| SUPABASE_SERVICE_ROLE_KEY | ✅       | Service role key (read-only use)   |
| TOKEN_DECIMALS            | ➖       | Optional override for formatting   |

Add these in the Vercel dashboard: **Project → Settings → Environment Variables**

---

🚀 **Deployment Steps (Vercel)**

1. Commit the `api/` folder and `vercel.json` to your repo.
2. Push to GitHub (or connect Git repo to Vercel).
3. Import the project in Vercel.
4. Set the required environment variables.
5. Deploy.

---

📡 **Endpoints**

| Endpoint                                    | Description                        | Example                                      |
|---------------------------------------------|------------------------------------|----------------------------------------------|
| `/api/latest`                               | Most recent supply snapshot        | `/api/latest`                                |
| `/api/history?limit=10`                     | Last N rows (descending)           | `/api/history?limit=10`                      |
| `/api/history?start=YYYY-MM-DD&end=YYYY-MM-DD` | Date range snapshot (inclusive) | `/api/history?start=2025-07-01&end=2025-07-22` |
| `/api/summary?limit=30`                     | Summary stats over N rows (avg, min, max) | `/api/summary?limit=30`              |

---

📦 **Response Examples**

**/api/latest**
```json
{
  "ts": "2025-07-23T17:00:00.000Z",
  "total_supply": "250000000000000",
  "locked_balance": "120000000000000",
  "circulating_supply": "130000000000000",
  "totalFormatted": "250,000,000",
  "lockedFormatted": "120,000,000",
  "circFormatted": "130,000,000",
  "pctLocked": 48
}
```

**/api/history?limit=3**
```json
{
  "count": 3,
  "data": [
    {
      "ts": "2025-07-23T17:00:00.000Z",
      "circulating_supply": "130000000000000",
      "circFormatted": "130,000,000",
      "pctLocked": 48
    },
    {
      "ts": "2025-07-22T17:00:00.000Z",
      "circulating_supply": "129500000000000",
      "circFormatted": "129,500,000",
      "pctLocked": 48.2
    }
  ]
}
```

**/api/summary?limit=30**
```json
{
  "count": 30,
  "average": {
    "circulating_supply": "129750000000000",
    "circFormatted": "129,750,000",
    "pctLocked": 48.1
  },
  "min": {
    "circulating_supply": "128000000000000",
    "circFormatted": "128,000,000"
  },
  "max": {
    "circulating_supply": "130000000000000",
    "circFormatted": "130,000,000"
  }
}
```

---

⚠️ **Error Responses**

| Code | Message                   | Example Body                        |
|------|---------------------------|-------------------------------------|
| 400  | Bad or missing parameters | {"error":"Invalid limit param"}     |
| 404  | No data (e.g. /latest)    | {"error":"No data"}                 |
| 405  | Unsupported method        | {"error":"Method not allowed"}      |
| 500  | Internal / Supabase error | {"error":"Database error"}          |

---

🧪 **Quick Testing**

```bash
# All history
curl https://your-vercel-url.vercel.app/api/history

# Last 7 snapshots
curl "https://your-vercel-url.vercel.app/api/history?limit=7"

# Specific date range
curl "https://your-vercel-url.vercel.app/api/history?start=2025-07-01&end=2025-07-22"

# Most recent
curl https://your-vercel-url.vercel.app/api/latest

# Summary of 30 snapshots
curl "https://your-vercel-url.vercel.app/api/summary?limit=30"
```

---

- Service role key lives only in GitHub & Vercel server envs (never in client bundles).
- API is read‑only; no writes exposed publicly.

---

## 🧯 Troubleshooting

- **RPC 429 / timeouts**
  - Increase `BATCH_DELAY_MS`, reduce `BATCH_SIZE`, rotate RPC key.
- **Supabase error: relation circ_supply does not exist**
  - Run the migrate SQL in Supabase — same class of setup error flagged in Offload README (`offload_daily` not found).
- **GitHub Action failing (env undefined)**
  - Confirm secrets are added in repo settings; Offload workflow requires Supabase + login envs in exactly this way.
- **API returns 500**
  - Likely Supabase connection/env issue; verify Vercel environment variables — same root cause documented in Offload API troubleshooting.

---

## 📦 Dependencies

Core:
- [@solana/web3.js](https://www.npmjs.com/package/@solana/web3.js)
- [@supabase/supabase-js](https://www.npmjs.com/package/@supabase/supabase-js)
- [dotenv](https://www.npmjs.com/package/dotenv)
