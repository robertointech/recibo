import 'dotenv/config';
import {
  Client,
  PrivateKey,
  TopicCreateTransaction,
} from '@hiero-ledger/sdk';

const ACCOUNT_ID  = process.env.PAYER_ACCOUNT_ID;
const PRIVATE_KEY = process.env.PAYER_PRIVATE_KEY;
const NETWORK     = process.env.HEDERA_NETWORK ?? 'testnet';

if (!ACCOUNT_ID || !PRIVATE_KEY) {
  console.error('Missing PAYER_ACCOUNT_ID or PAYER_PRIVATE_KEY in .env');
  process.exit(1);
}

const client = Client.forName(NETWORK).setOperator(
  ACCOUNT_ID,
  PrivateKey.fromStringECDSA(PRIVATE_KEY),
);

const txResponse = await new TopicCreateTransaction({
  topicMemo: 'recibo audit trail',
}).execute(client);

const receipt = await txResponse.getReceipt(client);
const topicId = receipt.topicId.toString();

console.log(`\nTopic created on hedera:${NETWORK}`);
console.log(`  Topic ID : ${topicId}`);
console.log(`  HashScan : https://hashscan.io/${NETWORK}/topic/${topicId}`);
console.log(`\nAdd to .env:\n  HCS_TOPIC_ID=${topicId}\n`);

client.close();
