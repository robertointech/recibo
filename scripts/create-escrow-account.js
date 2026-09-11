import 'dotenv/config';
import {
  Client,
  PrivateKey,
  Hbar,
  AccountCreateTransaction,
} from '@hiero-ledger/sdk';

const PAYER_ID  = process.env.PAYER_ACCOUNT_ID;
const PAYER_KEY = process.env.PAYER_PRIVATE_KEY;
const NETWORK   = process.env.HEDERA_NETWORK ?? 'testnet';

if (!PAYER_ID || !PAYER_KEY) {
  console.error('Missing PAYER_ACCOUNT_ID or PAYER_PRIVATE_KEY in .env');
  process.exit(1);
}

const client = Client.forName(NETWORK).setOperator(
  PAYER_ID,
  PrivateKey.fromStringECDSA(PAYER_KEY),
);

// Generate fresh ECDSA key pair for the escrow account.
const escrowKey = PrivateKey.generateECDSA();

const txResponse = await new AccountCreateTransaction({
  key:            escrowKey.publicKey,
  initialBalance: new Hbar(20),
  accountMemo:    'recibo escrow',
}).execute(client);

const receipt = await txResponse.getReceipt(client);
const accountId = receipt.accountId.toString();
// Use 0x-prefixed raw hex to match the format of existing .env keys.
const privateKeyHex = '0x' + escrowKey.toStringRaw();

console.log(`\nEscrow account created on hedera:${NETWORK}`);
console.log(`  Account ID  : ${accountId}`);
console.log(`  HashScan    : https://hashscan.io/${NETWORK}/account/${accountId}`);
console.log('\nAdd to .env:');
console.log(`  ESCROW_ACCOUNT_ID=${accountId}`);
console.log(`  ESCROW_PRIVATE_KEY=${privateKeyHex}\n`);

client.close();
