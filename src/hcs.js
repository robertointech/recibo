import 'dotenv/config';
import {
  Client,
  PrivateKey,
  TopicMessageSubmitTransaction,
} from '@hiero-ledger/sdk';

const ACCOUNT_ID  = process.env.PAYER_ACCOUNT_ID;
const PRIVATE_KEY = process.env.PAYER_PRIVATE_KEY;
const NETWORK     = process.env.HEDERA_NETWORK ?? 'testnet';
const TOPIC_ID    = process.env.HCS_TOPIC_ID;

if (!ACCOUNT_ID || !PRIVATE_KEY) {
  throw new Error('Missing PAYER_ACCOUNT_ID or PAYER_PRIVATE_KEY in .env');
}
if (!TOPIC_ID) {
  throw new Error('Missing HCS_TOPIC_ID in .env — run: npm run create-topic');
}

const client = Client.forName(NETWORK).setOperator(
  ACCOUNT_ID,
  PrivateKey.fromStringECDSA(PRIVATE_KEY),
);

/**
 * Publish a JSON payload to HCS and return the anchor metadata.
 *
 * @param {object} payload  Any serializable object.
 * @returns {Promise<{
 *   topicId: string,
 *   sequenceNumber: string,
 *   consensusTimestamp: string,
 *   transactionId: string,
 * }>}
 */
export async function anchor(payload) {
  const message = JSON.stringify(payload);

  const txResponse = await new TopicMessageSubmitTransaction({
    topicId: TOPIC_ID,
    message,
  }).execute(client);

  // getRecord includes consensusTimestamp; getReceipt does not.
  const record = await txResponse.getRecord(client);
  const receipt = record.receipt;

  return {
    topicId:            TOPIC_ID,
    sequenceNumber:     receipt.topicSequenceNumber.toString(),
    consensusTimestamp: record.consensusTimestamp.toDate().toISOString(),
    transactionId:      txResponse.transactionId.toString(),
  };
}
