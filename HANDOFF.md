# HANDOFF — Recibo (ETHOnline 2026)

## Qué es Recibo

Capa de escrow y prueba de entrega para pagos x402 entre agentes. El agente paga a una cuenta de escrow (no al proveedor directo), el proveedor entrega, el hash del body prueba la entrega, y recién ahí se libera el dinero. Si no entrega, se reembolsa. Todo el rastro de auditoría queda anclado en HCS (Hedera Consensus Service).

---

## Arquitectura — qué hace cada archivo

| Archivo | Rol |
|---|---|
| `src/server.js` | Express. Expone `POST /service` (happy path), `POST /service-flaky` (demo de reembolso), `GET /escrow/:id`, `GET /escrows`, `GET /status`. paymentMiddleware de x402 apunta a ESCROW como payTo. |
| `src/pay.js` | Cliente CLI. Acepta ruta por arg (`npm run pay -- /service-flaky`). Maneja 402, firma con PAYER, imprime requirements decodificados, settlement header, escrowId, y llama GET /escrow/:id para imprimir historial. |
| `src/escrow.js` | Núcleo. Map en memoria con 5 operaciones: `hold`, `proveDelivery`, `release`, `refund`, `getEscrow`, `getAllEscrows`. Transiciones de estado validadas. `release`/`refund` hacen TransferTransaction HBAR desde escrowClient. Cada operación llama `anchor()`. |
| `src/hcs.js` | Una sola función exportada: `anchor(payload)`. Publica JSON en HCS_TOPIC_ID y devuelve `{ topicId, sequenceNumber, consensusTimestamp, transactionId }`. Usa `getRecord()` (no `getReceipt()`) porque `consensusTimestamp` solo está en el record. |
| `scripts/create-topic.js` | Crea topic HCS en testnet con credenciales PAYER. Imprime ID para pegar en .env. |
| `scripts/create-escrow-account.js` | Genera par ECDSA nuevo, crea cuenta con 20 HBAR desde PAYER. Imprime ESCROW_ACCOUNT_ID y ESCROW_PRIVATE_KEY para .env. |
| `scripts/test-hcs.js` | Smoke test de `anchor()`. |
| `scripts/test-escrow.js` | Ejercita happy path y sad path completos por consola, con links a HashScan. |
| `web/` | App Next.js 15 + Tailwind 4. Una sola página (`app/page.tsx`), cliente puro (`'use client'`). Polling `GET /status` y `GET /escrows` cada 3s. Read-only, sin botones de acción. |

---

## Variables de .env (nunca los valores)

| Variable | Para qué |
|---|---|
| `HEDERA_NETWORK` | `testnet` o `mainnet` |
| `FACILITATOR_URL` | URL del facilitador x402. Testnet: `https://api.testnet.blocky402.com` |
| `PAYER_ACCOUNT_ID` | Cuenta ECDSA que paga el servicio (agente comprador) |
| `PAYER_PRIVATE_KEY` | Llave ECDSA del payer, formato `0x...` hex raw |
| `RECEIVER_ACCOUNT_ID` | Cuenta ECDSA del proveedor (recibe en release) |
| `RECEIVER_PRIVATE_KEY` | Solo necesaria para el script de asociación de USDC (no se usa en runtime) |
| `ESCROW_ACCOUNT_ID` | Cuenta ECDSA de escrow. x402 apunta aquí como `payTo` |
| `ESCROW_PRIVATE_KEY` | Llave ECDSA del escrow, firma TransferTransactions en release/refund |
| `HCS_TOPIC_ID` | Topic de HCS donde se anclan todos los eventos de escrow |

---

## IDs en uso (testnet)

| Rol | Account ID |
|---|---|
| PAYER | `0.0.10448866` |
| RECEIVER | `0.0.10448873` |
| ESCROW | (en .env, creado con `npm run create-escrow-account`) |
| HCS Topic | `0.0.10485281` |

HashScan topic: https://hashscan.io/testnet/topic/0.0.10485281

---

## Decisiones de diseño

**Escrow en memoria (Map):**
Se pierde al reiniciar el servidor. Decisión consciente para día 1-2 del hackathon. No es un bug. Día 3+ agregaría persistencia (Postgres o un Map serializado en disco). No tocar sin entender esto.

**"Entrega verificable" = sha256 del body, nada más:**
Sin arbitraje, sin LLM, sin votación. El hash del body de la respuesta es la prueba. Si el servidor devuelve algo, hubo entrega. `proveDelivery({ escrowId, responseBody })` calcula el hash con `crypto.createHash('sha256')`. Esta decisión es intencionada y es parte del pitch.

**MEMO de la transacción vacío:**
El campo MEMO de la TransferTransaction de Hedera se deja vacío. El escrowId viaja como campo JSON en el mensaje de HCS. Esta fue la decisión del día 2 después de leer el source — el MEMO tiene límite de 100 bytes y no hay API limpia para setearlo en el signer de x402. El trail de auditoría completo está en HCS, no en el MEMO.

**spendControls con allowedAssets explícito:**
HBAR (`0.0.0`) NO está en `DEFAULT_ASSETS` de `@x402/hedera` (solo hay USDC). Sin configuración, el guardrail rechaza HBAR. Se agrega `allowedAssets: [{ asset: '0.0.0', network: 'hedera:testnet' }]` en el cliente. **Deuda**: falta `maxAmountPerPayment` en tinybars para limitar monto. Sin él, el activo está allowlisted pero sin cap.

---

## Hallazgos técnicos que costaron tiempo

| Hallazgo | Detalle |
|---|---|
| `@hiero-ledger/sdk` | El SDK de Hedera se rebrandeó de `@hashgraph/sdk`. Misma API, distinto nombre de paquete. Toda la documentación vieja apunta al nombre antiguo. |
| Header `payment-response` | El header de settlement se llama `payment-response`, NO `x-payment-response`. El 402 challenge está en el header `PAYMENT-REQUIRED` (base64 JSON), no en el body (el body es `{}`). |
| `DEFAULT_ASSETS` solo USDC | `@x402/hedera` define USDC como el único default asset para Hedera testnet/mainnet. HBAR nativo requiere entrada explícita en `allowedAssets`. |
| `Client.forName('testnet')` | La forma correcta en esta versión del SDK. `Client.forTestnet()` existe pero `forName` es más uniforme para testnet/mainnet. |
| `consensusTimestamp` en record | `TransactionReceipt` no tiene `consensusTimestamp`. Está en `TransactionRecord`. Usar `txResponse.getRecord(client)` en vez de `getReceipt`. Cuesta una query extra pero da el timestamp real. |
| feePayer patrocinado por Blocky402 | El `feePayer` del 402 challenge es `0.0.7162784` (cuenta de Blocky402). El agente paga el monto del servicio pero NO necesita HBAR para gas de la tx de liquidación — el facilitador lo patrocina. Confirmado en HashScan tx `0.0.7162784@1788998786.365152317`. **Punto fuerte para el pitch.** |

---

## Deuda técnica — qué NO hacer

- **No hay timeout automático de escrow.** Si el proveedor recibe el pago pero no llama `proveDelivery` ni `release`, el HBAR queda bloqueado. Decidimos no agregar el timeout en el hackathon. No lo implementes sin discutir primero.
- **No hay cap de monto en allowedAssets.** El agente acepta cualquier cantidad de HBAR. Agregar `maxAmountPerPayment` en tinybars en día 4 si hay tiempo.
- **Escrow en memoria.** No persistente. Al reiniciar el servidor se pierden todos los escrows en estado HELD o DELIVERED. No agregar base de datos sin acordar el modelo primero.

---

## Pendiente para cerrar el hackathon

- [ ] **README** con diagrama de arquitectura (texto o ASCII) — explica el flujo x402 → escrow → HCS
- [ ] **Documentación de uso de IA** con los spec files de GSD (el jurado de ETHOnline lo pide)
- [ ] **Gateway y recipe en Bazantic** (si aplica al track)
- [ ] **PR al Hedera Harness** — contribución al ecosistema como parte del submission
- [ ] **Grabar video** — el escenario del video es `npm run pay -- /service-flaky`: agente paga, proveedor falla, HBAR vuelve al payer automáticamente, todo visible en el dashboard y en HashScan
