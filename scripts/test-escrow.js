import 'dotenv/config';
import { hold, proveDelivery, release, refund, getEscrow } from '../src/escrow.js';

const TOPIC_ID = process.env.HCS_TOPIC_ID;
const NETWORK  = process.env.HEDERA_NETWORK ?? 'testnet';

function hashScanTx(txId) {
  return `https://hashscan.io/${NETWORK}/transaction/${txId}`;
}
function hashScanTopic() {
  return `https://hashscan.io/${NETWORK}/topic/${TOPIC_ID}`;
}

function printEscrow(label, e) {
  console.log(`\n── ${label} ${'─'.repeat(Math.max(0, 50 - label.length))}`);
  console.log(`  escrowId  : ${e.escrowId}`);
  console.log(`  state     : ${e.state}`);
  if (e.responseHash) console.log(`  sha256    : ${e.responseHash}`);
  const last = e.events.at(-1);
  if (last?.transactionId) {
    console.log(`  tx        : ${hashScanTx(last.transactionId)}`);
  }
  if (last?.sequenceNumber) {
    console.log(`  HCS seq   : ${last.sequenceNumber}  → ${hashScanTopic()}`);
  }
}

// ── Happy path: hold → proveDelivery → release ────────────────────────────
console.log('\n══════════════════════════════════════════════════════');
console.log('  HAPPY PATH  (hold → proveDelivery → release)');
console.log('══════════════════════════════════════════════════════');

const PAYER    = process.env.PAYER_ACCOUNT_ID;
const PROVIDER = process.env.RECEIVER_ACCOUNT_ID;
const AMOUNT   = 0.001; // HBAR — tiny for testing

const happyId = `escrow-happy-${Date.now()}`;

let e = await hold({ escrowId: happyId, payer: PAYER, provider: PROVIDER, amount: AMOUNT });
printEscrow('HELD', e);

e = await proveDelivery({
  escrowId:     happyId,
  responseBody: JSON.stringify({ message: 'Payment received. Recibo.', ts: new Date().toISOString() }),
});
printEscrow('DELIVERED', e);

e = await release({ escrowId: happyId });
printEscrow('RELEASED', e);

// ── Sad path: hold → refund ───────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════');
console.log('  SAD PATH  (hold → refund)');
console.log('══════════════════════════════════════════════════════');

const sadId = `escrow-sad-${Date.now()}`;

e = await hold({ escrowId: sadId, payer: PAYER, provider: PROVIDER, amount: AMOUNT });
printEscrow('HELD', e);

e = await refund({ escrowId: sadId, reason: 'provider did not respond within timeout' });
printEscrow('REFUNDED', e);

// ── Final state check ─────────────────────────────────────────────────────
console.log('\n── Final getEscrow() check ────────────────────────────');
const happy = getEscrow(happyId);
const sad   = getEscrow(sadId);
console.log(`  ${happyId} → ${happy.state}`);
console.log(`  ${sadId} → ${sad.state}`);

console.log('\n── Invalid transition check ───────────────────────────');
try {
  await release({ escrowId: sadId }); // REFUNDED → RELEASED should throw
  console.log('  ERROR: should have thrown');
} catch (err) {
  console.log(`  Caught expected error: ${err.message}`);
}

console.log('\n── All HCS messages on topic ──────────────────────────');
console.log(`  ${hashScanTopic()}\n`);
