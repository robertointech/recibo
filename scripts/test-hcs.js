import { anchor } from '../src/hcs.js';

const result = await anchor({
  event:   'hcs_smoke_test',
  project: 'recibo',
  ts:      new Date().toISOString(),
});

console.log('\n── HCS anchor result ─────────────────────────────────');
console.log(JSON.stringify(result, null, 2));
console.log(`\n  HashScan : https://hashscan.io/testnet/topic/${result.topicId}`);
console.log('──────────────────────────────────────────────────────\n');
