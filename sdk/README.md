# Syncro Backend SDK

SDK for Syncro subscription management, including the Gift Card Redemption Helper.

## Gift Card Redemption Helper

Attach gift card info to a subscription with validation, backend persistence, and on-chain reference logging.

### Installation

```bash
npm install @syncro/sdk
# or from monorepo
cd sdk && npm install && npm run build
```

### Usage

```ts
import { createSyncroSDK, validateGiftCardHash } from '@syncro/sdk';

const sdk = createSyncroSDK({
  baseUrl: 'https://your-backend.example.com',
  credentials: 'include', // for cookie auth
  // OR for Bearer token:
  // getAuth: async () => (await getSession())?.access_token ?? null,
});

// Listen for gift card events
sdk.on('giftCard', (event) => {
  if (event.type === 'attached') {
    console.log('Gift card attached:', event.data);
  } else {
    console.error('Gift card failed:', event.error);
  }
});

// Attach gift card to subscription
const result = await sdk.attachGiftCard(
  subscriptionId,
  giftCardHash,
  provider
);

if (result.success) {
  console.log('Attached:', result.data);
  console.log('Transaction hash:', result.blockchain?.transactionHash);
} else {
  console.error('Failed:', result.error);
}

// Validate format before calling (optional)
if (validateGiftCardHash(giftCardHash)) {
  await sdk.attachGiftCard(subscriptionId, giftCardHash, provider);
}
```

### Gift Card Hash Format

- 32–64 hexadecimal characters (e.g. SHA-256 hash)
- Regex: `/^[a-fA-F0-9]{32,64}$/`

### API

- `attachGiftCard(subscriptionId, giftCardHash, provider)` – Attach gift card; returns `{ success, data?, error?, blockchain? }`
- `validateGiftCardHash(hash)` – Validate hash format
- Events: `giftCard` with payload `{ type: 'attached' | 'failed', subscriptionId, data?, error? }`
