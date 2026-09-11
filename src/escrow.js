import 'dotenv/config';
import { createHash } from 'node:crypto';
import {
  Client,
  PrivateKey,
  Hbar,
  TransferTransaction,
} from '@hiero-ledger/sdk';
import { anchor } from './hcs.js';

const ESCROW_ID  = process.env.ESCROW_ACCOUNT_ID;
const ESCROW_KEY = process.env.ESCROW_PRIVATE_KEY;
const NETWORK    = process.env.HEDERA_NETWORK ?? 'testnet';

if (!ESCROW_ID || !ESCROW_KEY) {
  throw new Error('Missing ESCROW_ACCOUNT_ID or ESCROW_PRIVATE_KEY in .env');
}

// Client that signs transfers FROM the escrow account.
const escrowClient = Client.forName(NETWORK).setOperator(
  ESCROW_ID,
  PrivateKey.fromStringECDSA(ESCROW_KEY),
);

// ── In-memory state ──────────────────────────────────────────────────────────
// Valid transitions: HELD → DELIVERED → RELEASED, HELD → REFUNDED.
const TRANSITIONS = {
  HELD:      ['DELIVERED', 'REFUNDED'],
  DELIVERED: ['RELEASED'],
  RELEASED:  [],
  REFUNDED:  [],
};

/** @type {Map<string, object>} */
const escrows = new Map();

function getOrThrow(escrowId) {
  const e = escrows.get(escrowId);
  if (!e) throw new Error(`Escrow not found: ${escrowId}`);
  return e;
}

function assertTransition(e, to) {
  if (!TRANSITIONS[e.state].includes(to)) {
    throw new Error(
      `Invalid transition ${e.state} → ${to} for escrow ${e.escrowId}`,
    );
  }
}

// ── Operations ───────────────────────────────────────────────────────────────

/**
 * Register a new escrow in state HELD and anchor the event in HCS.
 * The HBAR transfer (payer → escrow) is handled by the x402 layer (block C).
 *
 * @param {{ escrowId: string, payer: string, provider: string, amount: number }} params
 * amount is in HBAR.
 */
export async function hold({ escrowId, payer, provider, amount }) {
  if (escrows.has(escrowId)) {
    throw new Error(`Escrow already exists: ${escrowId}`);
  }

  const hcsResult = await anchor({
    type:     'HELD',
    escrowId,
    payer,
    provider,
    amount,
    ts:       new Date().toISOString(),
  });

  const entry = {
    escrowId,
    payer,
    provider,
    amount,
    state:        'HELD',
    responseHash: null,
    events:       [{ ...hcsResult, type: 'HELD' }],
  };

  escrows.set(escrowId, entry);
  return { ...entry };
}

/**
 * Record delivery proof: sha256 of the raw response body.
 * No interpretation of the content — hash only.
 *
 * @param {{ escrowId: string, responseBody: string }} params
 */
export async function proveDelivery({ escrowId, responseBody }) {
  const e = getOrThrow(escrowId);
  assertTransition(e, 'DELIVERED');

  const responseHash = createHash('sha256')
    .update(responseBody)
    .digest('hex');

  const hcsResult = await anchor({
    type:         'DELIVERED',
    escrowId,
    responseHash,
    ts:           new Date().toISOString(),
  });

  e.responseHash = responseHash;
  e.state        = 'DELIVERED';
  e.events.push({ ...hcsResult, type: 'DELIVERED' });

  return { ...e };
}

/**
 * Release: transfer HBAR from escrow → provider, then anchor in HCS.
 *
 * @param {{ escrowId: string }} params
 */
export async function release({ escrowId }) {
  const e = getOrThrow(escrowId);
  assertTransition(e, 'RELEASED');

  const txResponse = await new TransferTransaction()
    .addHbarTransfer(ESCROW_ID, new Hbar(-e.amount))
    .addHbarTransfer(e.provider, new Hbar(e.amount))
    .execute(escrowClient);

  const receipt = await txResponse.getReceipt(escrowClient);
  if (receipt.status.toString() !== 'SUCCESS') {
    throw new Error(`Transfer failed: ${receipt.status.toString()}`);
  }

  const transactionId = txResponse.transactionId.toString();

  const hcsResult = await anchor({
    type:          'RELEASED',
    escrowId,
    transactionId,
    ts:            new Date().toISOString(),
  });

  e.state = 'RELEASED';
  e.events.push({ ...hcsResult, type: 'RELEASED', transactionId });

  return { ...e };
}

/**
 * Refund: transfer HBAR from escrow → payer, then anchor in HCS.
 *
 * @param {{ escrowId: string, reason: string }} params
 */
export async function refund({ escrowId, reason }) {
  const e = getOrThrow(escrowId);
  assertTransition(e, 'REFUNDED');

  const txResponse = await new TransferTransaction()
    .addHbarTransfer(ESCROW_ID, new Hbar(-e.amount))
    .addHbarTransfer(e.payer, new Hbar(e.amount))
    .execute(escrowClient);

  const receipt = await txResponse.getReceipt(escrowClient);
  if (receipt.status.toString() !== 'SUCCESS') {
    throw new Error(`Transfer failed: ${receipt.status.toString()}`);
  }

  const transactionId = txResponse.transactionId.toString();

  const hcsResult = await anchor({
    type:          'REFUNDED',
    escrowId,
    reason,
    transactionId,
    ts:            new Date().toISOString(),
  });

  e.state = 'REFUNDED';
  e.events.push({ ...hcsResult, type: 'REFUNDED', transactionId });

  return { ...e };
}

/**
 * Return current escrow state and full event history.
 *
 * @param {string} escrowId
 */
export function getEscrow(escrowId) {
  return getOrThrow(escrowId);
}

/** Return all escrows as an array (newest event first per entry). */
export function getAllEscrows() {
  return Array.from(escrows.values());
}
