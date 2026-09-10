import 'dotenv/config';
import { wrapFetchWithPayment, x402Client, decodePaymentResponseHeader } from '@x402/fetch';
import { ExactHederaScheme } from '@x402/hedera/exact/client';
import { createClientHederaSigner, PrivateKey } from '@x402/hedera';

const PAYER_ID  = process.env.PAYER_ACCOUNT_ID;
const PAYER_KEY = process.env.PAYER_PRIVATE_KEY;
const NETWORK   = process.env.HEDERA_NETWORK ?? 'testnet';
const TARGET    = 'http://localhost:3333/service';

if (!PAYER_ID || !PAYER_KEY) {
  console.error('Missing PAYER_ACCOUNT_ID or PAYER_PRIVATE_KEY in .env');
  process.exit(1);
}

// Instrument fetch to capture and print the 402 challenge
const loggingFetch = async (input, init) => {
  const res = await globalThis.fetch(input, init);
  if (res.status === 402) {
    const body = await res.clone().json().catch(() => null);
    console.log('\n── 402 Payment Required ──────────────────────────────');
    if (body) console.log(JSON.stringify(body, null, 2));
    console.log('──────────────────────────────────────────────────────\n');
  }
  return res;
};

const signer = createClientHederaSigner(
  PAYER_ID,
  PrivateKey.fromStringECDSA(PAYER_KEY),
  { network: `hedera:${NETWORK}` },
);

const client = new x402Client()
  .register(`hedera:${NETWORK}`, new ExactHederaScheme(signer));

const paidFetch = wrapFetchWithPayment(loggingFetch, client);

console.log(`Calling ${TARGET}`);
console.log(`  Payer   : ${PAYER_ID}`);
console.log(`  Network : hedera:${NETWORK}\n`);

const res = await paidFetch(TARGET, {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body:    JSON.stringify({ hello: 'recibo' }),
});

const body = await res.json();

console.log('── Final response ────────────────────────────────────');
console.log(JSON.stringify(body, null, 2));
console.log('──────────────────────────────────────────────────────\n');

// Decode settlement header (contains tx hash, amount, etc.)
const settlementHeader = res.headers.get('x-payment-response');
if (settlementHeader) {
  const settlement = decodePaymentResponseHeader(settlementHeader);
  console.log('── Settlement ────────────────────────────────────────');
  console.log(JSON.stringify(settlement, null, 2));
  console.log('──────────────────────────────────────────────────────\n');
} else {
  console.log('(no x-payment-response header — settlement may be async)');
  // Dump all x- headers for debugging
  for (const [k, v] of res.headers) {
    if (k.startsWith('x-') || k.includes('payment')) {
      console.log(`  ${k}: ${v}`);
    }
  }
}
