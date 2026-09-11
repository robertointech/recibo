import 'dotenv/config';
import { wrapFetchWithPayment, x402Client, decodePaymentResponseHeader } from '@x402/fetch';
import { decodePaymentRequiredHeader } from '@x402/core/http';
import { ExactHederaScheme } from '@x402/hedera/exact/client';
import { createClientHederaSigner, PrivateKey } from '@x402/hedera';

const PAYER_ID  = process.env.PAYER_ACCOUNT_ID;
const PAYER_KEY = process.env.PAYER_PRIVATE_KEY;
const NETWORK   = process.env.HEDERA_NETWORK ?? 'testnet';
const BASE_URL  = 'http://localhost:3333';

// Accept route as CLI arg: npm run pay -- /service-flaky
// Defaults to /service.
const route  = process.argv[2] ?? '/service';
const TARGET = `${BASE_URL}${route}`;

if (!PAYER_ID || !PAYER_KEY) {
  console.error('Missing PAYER_ACCOUNT_ID or PAYER_PRIVATE_KEY in .env');
  process.exit(1);
}

// Instrument fetch to capture and print the 402 challenge.
// Requirements live in the PAYMENT-REQUIRED header (base64 JSON), not the body.
const loggingFetch = async (input, init) => {
  const res = await globalThis.fetch(input, init);
  if (res.status === 402) {
    const header = res.headers.get('PAYMENT-REQUIRED');
    if (header) {
      const requirements = decodePaymentRequiredHeader(header);
      console.log('\n── 402 Payment Required ──────────────────────────────');
      console.log(JSON.stringify(requirements, null, 2));
      console.log('──────────────────────────────────────────────────────\n');
    }
  }
  return res;
};

const signer = createClientHederaSigner(
  PAYER_ID,
  PrivateKey.fromStringECDSA(PAYER_KEY),
  { network: `hedera:${NETWORK}` },
);

// HBAR (0.0.0) is not in @x402/hedera DEFAULT_ASSETS (only USDC is).
// Declared explicitly so spendControls allows it.
const client = new x402Client()
  .register(`hedera:${NETWORK}`, new ExactHederaScheme(signer))
  .setSpendControls({
    allowedAssets: [{ asset: '0.0.0', network: `hedera:${NETWORK}` }],
  });

const paidFetch = wrapFetchWithPayment(loggingFetch, client);

console.log(`\nCalling ${TARGET}`);
console.log(`  Payer   : ${PAYER_ID}`);
console.log(`  Network : hedera:${NETWORK}\n`);

const res = await paidFetch(TARGET, {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body:    JSON.stringify({ payer: PAYER_ID }),
});

const body = await res.json();

console.log('── Server response ───────────────────────────────────');
console.log(JSON.stringify(body, null, 2));
console.log('──────────────────────────────────────────────────────\n');

// Settlement header
const settlementHeader = res.headers.get('payment-response');
if (settlementHeader) {
  const settlement = decodePaymentResponseHeader(settlementHeader);
  const txId = settlement.transaction ?? settlement.txId ?? settlement.transactionId ?? JSON.stringify(settlement);
  console.log('── x402 Settlement ───────────────────────────────────');
  console.log(`  Transaction ID : ${txId}`);
  console.log(`  HashScan       : https://hashscan.io/testnet/transaction/${txId}`);
  console.log('──────────────────────────────────────────────────────\n');
}

// Fetch and print full escrow history if server returned an escrowId
const escrowId = body.escrowId;
if (escrowId) {
  const escrowRes = await fetch(`${BASE_URL}/escrow/${escrowId}`);
  const escrow    = await escrowRes.json();

  console.log('── Escrow history ────────────────────────────────────');
  console.log(`  escrowId : ${escrow.escrowId}`);
  console.log(`  state    : ${escrow.state}`);
  if (escrow.responseHash) {
    console.log(`  sha256   : ${escrow.responseHash}`);
  }
  console.log('  events:');
  for (const ev of escrow.events) {
    console.log(`    [seq ${ev.sequenceNumber}] ${ev.type} — ${ev.consensusTimestamp}`);
    if (ev.transactionId) {
      console.log(`      tx: https://hashscan.io/testnet/transaction/${ev.transactionId}`);
    }
  }
  console.log('──────────────────────────────────────────────────────\n');
}
