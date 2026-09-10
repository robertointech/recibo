import 'dotenv/config';
import express from 'express';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { ExactHederaScheme } from '@x402/hedera/exact/server';

const RECEIVER    = process.env.RECEIVER_ACCOUNT_ID;
const NETWORK     = process.env.HEDERA_NETWORK ?? 'testnet';
const FACILITATOR = process.env.FACILITATOR_URL;
const PORT        = 3333;

if (!RECEIVER || !FACILITATOR) {
  console.error('Missing RECEIVER_ACCOUNT_ID or FACILITATOR_URL in .env');
  process.exit(1);
}

// 0.001 HBAR = 100_000 tinybars
const HBAR_PRICE = { asset: '0.0.0', amount: '100000' };

const facilitator    = new HTTPFacilitatorClient({ url: FACILITATOR });
const resourceServer = new x402ResourceServer(facilitator).register(
  `hedera:${NETWORK}`,
  new ExactHederaScheme({}),
);

const app = express();
app.use(express.json());

app.use(
  paymentMiddleware(
    {
      'POST /service': {
        accepts: [{
          scheme:  'exact',
          price:   HBAR_PRICE,
          network: `hedera:${NETWORK}`,
          payTo:   RECEIVER,
        }],
        description: 'Recibo demo — 0.001 HBAR',
        mimeType: 'application/json',
      },
    },
    resourceServer,
  ),
);

app.post('/service', (_req, res) => {
  res.json({
    message: 'Payment received. Recibo.',
    ts: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`\nServer listening on http://localhost:${PORT}`);
  console.log(`  Receiver    : ${RECEIVER}`);
  console.log(`  Facilitator : ${FACILITATOR}`);
  console.log(`  Network     : hedera:${NETWORK}`);
  console.log(`  Price       : 0.001 HBAR per POST /service\n`);
});
