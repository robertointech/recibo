import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { ExactHederaScheme } from '@x402/hedera/exact/server';
import { hold, proveDelivery, release, refund, getEscrow, getAllEscrows } from './escrow.js';

const ESCROW      = process.env.ESCROW_ACCOUNT_ID;
const RECEIVER    = process.env.RECEIVER_ACCOUNT_ID;
const NETWORK     = process.env.HEDERA_NETWORK ?? 'testnet';
const FACILITATOR = process.env.FACILITATOR_URL;
const PORT        = 3333;

if (!ESCROW || !RECEIVER || !FACILITATOR) {
  console.error('Missing ESCROW_ACCOUNT_ID, RECEIVER_ACCOUNT_ID, or FACILITATOR_URL in .env');
  process.exit(1);
}

// 0.001 HBAR = 100_000 tinybars
const HBAR_PRICE  = { asset: '0.0.0', amount: '100000' };
const HBAR_AMOUNT = 0.001; // numeric, for escrow.hold()

const facilitator    = new HTTPFacilitatorClient({ url: FACILITATOR });
const resourceServer = new x402ResourceServer(facilitator).register(
  `hedera:${NETWORK}`,
  new ExactHederaScheme({}),
);

const routeConfig = (description) => ({
  accepts: [{
    scheme:  'exact',
    price:   HBAR_PRICE,
    network: `hedera:${NETWORK}`,
    payTo:   ESCROW,           // ← payment goes to escrow, not directly to provider
  }],
  description,
  mimeType: 'application/json',
});

const TOPIC_ID = process.env.HCS_TOPIC_ID ?? '';

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(
  paymentMiddleware(
    {
      'POST /service':       routeConfig('Recibo — happy path (escrow → release)'),
      'POST /service-flaky': routeConfig('Recibo — flaky path (escrow → refund)'),
    },
    resourceServer,
  ),
);

// ── Happy path ────────────────────────────────────────────────────────────────
// Payment verified → hold → deliver → prove → release → respond.
app.post('/service', async (req, res) => {
  const payer    = req.body?.payer ?? 'unknown';
  const escrowId = randomUUID();

  try {
    await hold({ escrowId, payer, provider: RECEIVER, amount: HBAR_AMOUNT });

    const responseBody = {
      message:  'Payment received. Recibo.',
      ts:       new Date().toISOString(),
      escrowId,
    };

    await proveDelivery({ escrowId, responseBody: JSON.stringify(responseBody) });
    await release({ escrowId });

    res.json(responseBody);
  } catch (err) {
    console.error(`[/service] escrow error: ${err.message}`);
    res.status(500).json({ error: err.message, escrowId });
  }
});

// ── Flaky path ────────────────────────────────────────────────────────────────
// Payment verified → hold → provider "fails" → refund → respond with error.
// This is the video scenario: client pays, server takes money, then can't deliver.
// Escrow guarantees the payer gets their HBAR back automatically.
app.post('/service-flaky', async (req, res) => {
  const payer    = req.body?.payer ?? 'unknown';
  const escrowId = randomUUID();
  const reason   = 'provider failed to respond';

  try {
    await hold({ escrowId, payer, provider: RECEIVER, amount: HBAR_AMOUNT });

    // Simulate provider failure: no delivery, no release.
    await refund({ escrowId, reason });

    res.status(402).json({
      error:    'Service failed to deliver. Payment refunded to payer.',
      escrowId,
      reason,
    });
  } catch (err) {
    console.error(`[/service-flaky] escrow error: ${err.message}`);
    res.status(500).json({ error: err.message, escrowId });
  }
});

// ── Read-only endpoints for dashboard ────────────────────────────────────────
app.get('/status', (_req, res) => {
  res.json({ escrowAccount: ESCROW, topicId: TOPIC_ID, network: NETWORK, facilitator: FACILITATOR });
});

app.get('/escrows', (_req, res) => {
  res.json(getAllEscrows());
});

app.get('/escrow/:id', (req, res) => {
  try {
    res.json(getEscrow(req.params.id));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\nServer listening on http://localhost:${PORT}`);
  console.log(`  Escrow      : ${ESCROW}`);
  console.log(`  Provider    : ${RECEIVER}`);
  console.log(`  Facilitator : ${FACILITATOR}`);
  console.log(`  Network     : hedera:${NETWORK}`);
  console.log(`  Routes      : POST /service  POST /service-flaky  GET /escrow/:id\n`);
});
