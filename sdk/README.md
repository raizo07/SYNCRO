# Syncro Backend SDK

## Batch Operations

Batch methods reduce gas and improve UX by operating on multiple items in one call. All batch methods:

- Return an array of individual results (success/failure per item)
- Handle partial failure gracefully—failed items don't block successful ones

### Batch Cancel

```ts
const { results, successCount, failureCount } = await sdk.batchCancelSubscriptions([
  'sub-1',
  'sub-2',
  'sub-3',
]);

results.forEach((r) => {
  if (r.success) console.log(`Cancelled ${r.id}`, r.data);
  else console.error(`Failed ${r.id}:`, r.error);
});
```

### Batch Fetch Subscriptions

```ts
const { results, successCount, failureCount } = await sdk.batchGetSubscriptions([
  'sub-1',
  'sub-2',
]);

results.forEach((r) => {
  if (r.success) console.log(r.id, r.data);
  else console.error(`${r.id}:`, r.error);
});
```

### Batch Approval

```ts
const { results } = await sdk.batchApproveRenewals([
  { subscriptionId: 'sub-1', maxSpend: '100', expiresAt: 12345 },
  { subscriptionId: 'sub-2', maxSpend: '200', expiresAt: 12346 },
]);
// Supports snake_case: subscription_id, max_spend, expires_at
```

**Note:** Batch approval requires the backend to implement `POST /api/subscriptions/:id/approve-renewal`. Until then, each call will return failure per item; partial failure handling still applies.
