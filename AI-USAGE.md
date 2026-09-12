# AI Usage — Recibo

This document describes how AI tools were used during this project, per ETHGlobal submission requirements.

---

## Tools Used

**Claude Code (Sonnet 4.6)** — implementation. Every file in `src/`, `scripts/`, and `web/` was written by Claude Code operating in the terminal under direct supervision. Commands executed, files read, and edits made are tracked in the session tool call history.

**Claude (chat)** — session strategy and planning. Before each coding session, a chat conversation defined the scope of the next block of work, wrote the prompt that would drive Claude Code, and set explicit constraints on what not to build. The implementation prompts were written there, not improvised.

The workflow was: chat defines scope + writes prompt → Claude Code implements → human verifies on-chain before continuing.

---

## How the AI Was Directed

This section describes the actual method used, which is what ETHGlobal judges are asking to see.

### Infrastructure verification before writing a single line of product code

Day 1 started with a structured verification session. The prompt explicitly required each item to be marked CONFIRMADO / PARCIAL / BLOQUEADO with real evidence, not assumptions or recalled training data. The output is in [`VERIFY.md`](./VERIFY.md).

This found two things that would have caused bugs otherwise: the Hedera SDK had been rebranded from `@hashgraph/sdk` to `@hiero-ledger/sdk` (same code, different package name — all existing docs pointed to the old name), and the correct facilitator header is `payment-response` not `x-payment-response`. Both of these were discovered by reading actual source files, not from Claude Code's training data.

### Closed-scope blocks with explicit exclusion lists

Work was divided into three blocks (A: HCS, B: escrow core, C: x402 integration) with hard boundaries. Each block prompt named what was in scope and what was explicitly excluded. For example, Block B said: "this block is only escrow. Do not touch server.js, do not touch pay.js, do not touch HCS beyond calling anchor()."

This prevented the AI from expanding scope or building abstractions that weren't needed. Every feature in the codebase was explicitly requested; nothing was added opportunistically.

### Non-negotiable design constraints imposed by the human

The core design decision — what counts as proof of delivery — was stated as a constraint, not a question. The prompt said:

> "Delivery proof = sha256 of the response body, nothing else. No LLM judge, no voting, no arbitration. If the server returned a body, that is delivery. This is intentional and is part of the pitch."

Claude Code implemented it that way and was not asked to evaluate whether it was a good idea. Architectural decisions and their tradeoffs were made by the human before the session opened.

Similarly, the decision to use an in-memory Map instead of a database was stated up front as a deliberate hackathon choice, with instructions not to introduce persistence or suggest it.

### SDK source reading, not training data

Claude Code was explicitly instructed to read the actual installed packages in `node_modules` when there was any uncertainty about an API signature. This caught:

- `Client.forName('testnet')` is the correct call in this version; `Client.forTestnet()` exists but `forName` is the uniform pattern.
- `consensusTimestamp` is only available in `TransactionRecord`, not `TransactionReceipt`. Using `txResponse.getRecord(client)` instead of `getReceipt()` costs one extra network call but returns the real consensus timestamp. The VERIFY.md's initial code sample had this wrong; reading the SDK fixed it.
- `DEFAULT_ASSETS` in `@x402/hedera` only includes USDC. Native HBAR requires an explicit `allowedAssets` entry — it is not included by default and the guard silently rejects it if missing.

### Human verification on-chain before advancing to the next block

Each block was accepted only after verifying results on HashScan, not by reading console output. Block A was accepted when the HCS message appeared at [hashscan.io/testnet/topic/0.0.10485281](https://hashscan.io/testnet/topic/0.0.10485281) with a real consensus timestamp. Block B was accepted when both the happy path (HBAR transferred to provider) and sad path (HBAR returned to payer) showed correct balance changes on-chain. Block C was accepted when the full x402 → escrow → HCS flow completed in a single `npm run pay` call.

---

## What the AI Wrote vs. What It Did Not

**Written by AI:**

| File | Notes |
|---|---|
| `src/server.js` | Express routes, payment middleware wiring, CORS |
| `src/escrow.js` | State machine, in-memory Map, HBAR transfers, HCS anchoring |
| `src/hcs.js` | `anchor()` function, topic submission, record retrieval |
| `src/pay.js` | CLI client, 402 handling, spend controls |
| `scripts/create-topic.js` | One-time HCS topic creation |
| `scripts/create-escrow-account.js` | ECDSA keypair generation, account funding |
| `scripts/test-escrow.js` | End-to-end console test runner |
| `web/app/page.tsx` | Next.js dashboard, polling, escrow cards, HCS links |
| `VERIFY.md` | Infrastructure verification report |
| `HANDOFF.md` | Session handoff document |
| `README.md` | This project's README |
| `AI-USAGE.md` | This document |

**Not written by AI:**

- The product idea and the framing of the problem (x402 has no receipt, no reversal path, no audit trail).
- The choice to make refund a first-class feature instead of an edge case — the flaky path (`/service-flaky`) is the main demo scenario, not a footnote.
- The decision that delivery proof should be a hash and nothing more, with no subjective evaluation layer.
- The decision to use Hedera specifically because the economics of reversal only work on a low-fee chain.
- The scope of what to build for the hackathon versus what to defer.
- The acceptance criteria for each block before it was considered done.
- The identification of Blocky402's gas sponsorship as a pitch argument (discovered in transaction data, then elevated to a design point).

---

## Included Artifacts

**[`VERIFY.md`](./VERIFY.md)** — Day 1 infrastructure verification. API signatures, SDK names, facilitator endpoints, and transaction confirmation, all checked against real sources before implementation started. Contains the first confirmed testnet transaction.

**[`HANDOFF.md`](./HANDOFF.md)** — Written at the end of the coding session to transfer context between sessions without losing decisions that were made during implementation. Includes architecture notes, env var documentation, known technical debt, and what remains open.

**Git history** — The commit log reflects the block-by-block progression:

```
a9683a7  feat: block A — HCS create-topic, anchor(), test-hcs scripts
e5870b9  feat: block B — escrow hold/proveDelivery/release/refund + create-escrow-account script
9ef7cfd  feat: block C — escrow-backed x402 flow, /service-flaky, GET /escrow/:id, pay.js route arg
a3a2987  feat: dashboard — Next.js read-only escrow monitor with 3s polling
18008e0  docs: HANDOFF.md — context for next session
```

Each commit corresponds to a scoped block with defined inputs and acceptance criteria. The history was not curated after the fact — this is the order in which things were built.
