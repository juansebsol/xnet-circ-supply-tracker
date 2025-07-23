import 'dotenv/config';
import { runJob } from './fetchSupply.js';

(async () => {
  try {
    const result = await runJob();
    console.log('✅ Circulating supply job OK');
    console.log(JSON.stringify(formatResult(result), null, 2));
    process.exit(0);
  } catch (err) {
    console.error('❌ Circulating supply job FAILED');
    console.error(err);
    process.exit(1);
  }
})();

function formatResult(r) {
  return {
    ts: r.ts,
    total: r.total.toString(),
    locked: r.locked.toString(),
    circ: r.circ.toString(),
    walletsChecked: r.walletsChecked,
    rpcCalls: r.rpcCalls,
    ms: r.ms,
  };
}

