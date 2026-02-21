/**
 * Syncro SDK - Subscription CRUD Wrapper
 *
 * Provides createSubscription, updateSubscription, getSubscription, cancelSubscription
 * with validation, backend + on-chain sync, and lifecycle events.
 * Works with manual and gift-card subscriptions.
 */

import { EventEmitter } from 'node:events';

const GIFT_CARD_HASH_REGEX = /^[a-fA-F0-9]{32,64}$/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncroSDKOptions {
  /** Base URL of the Syncro backend API */
  baseUrl: string;
  /** Auth: Bearer token, or use credentials: 'include' for cookie auth */
  getAuth?: () => Promise<string | null>;
  /** Use fetch with credentials (cookies) when true and no getAuth */
  credentials?: RequestCredentials;
}

export type BillingCycle = 'monthly' | 'yearly' | 'quarterly';
export type SubscriptionStatus = 'active' | 'cancelled' | 'paused' | 'trial';
export type SubscriptionSource = 'manual' | 'gift_card';

export interface SubscriptionCreateInput {
  name: string;
  price: number;
  billing_cycle: BillingCycle;
  provider?: string;
  status?: SubscriptionStatus;
  next_billing_date?: string;
  category?: string;
  logo_url?: string;
  website_url?: string;
  renewal_url?: string;
  notes?: string;
  tags?: string[];
  email_account_id?: string;
  /** Use 'manual' or 'gift_card' for subscription source */
  source?: SubscriptionSource;
}

export interface SubscriptionUpdateInput {
  name?: string;
  provider?: string;
  price?: number;
  billing_cycle?: BillingCycle;
  status?: SubscriptionStatus;
  next_billing_date?: string | null;
  category?: string | null;
  logo_url?: string | null;
  website_url?: string | null;
  renewal_url?: string | null;
  notes?: string | null;
  tags?: string[];
}

export interface Subscription {
  id: string;
  user_id: string;
  name: string;
  provider: string;
  price: number;
  billing_cycle: BillingCycle;
  status: SubscriptionStatus;
  next_billing_date: string | null;
  category: string | null;
  logo_url?: string | null;
  website_url?: string | null;
  renewal_url?: string | null;
  notes?: string | null;
  tags: string[];
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface SubscriptionResult<T = Subscription> {
  success: boolean;
  data?: T;
  error?: string;
  blockchain?: {
    synced: boolean;
    transactionHash?: string | null;
    error?: string | null;
  };
}

export type SubscriptionEventType =
  | 'created'
  | 'updated'
  | 'cancelled'
  | 'deleted'
  | 'failed';

export interface SubscriptionLifecycleEvent {
  type: SubscriptionEventType;
  subscriptionId: string;
  data?: Subscription | null;
  error?: string;
  blockchain?: { synced: boolean; transactionHash?: string; error?: string };
}

// Gift card types (existing)
export interface AttachGiftCardResult {
  success: boolean;
  data?: {
    id: string;
    subscriptionId: string;
    giftCardHash: string;
    provider: string;
    transactionHash?: string;
    status: string;
  };
  error?: string;
  blockchain?: { transactionHash?: string; error?: string };
}

export type GiftCardEventType = 'attached' | 'failed';

export interface GiftCardEvent {
  type: GiftCardEventType;
  subscriptionId: string;
  giftCardHash?: string;
  provider?: string;
  data?: AttachGiftCardResult['data'];
  error?: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export function validateSubscriptionCreateInput(
  input: SubscriptionCreateInput
): ValidationResult {
  const errors: Record<string, string> = {};

  if (!input.name || String(input.name).trim().length === 0) {
    errors.name = 'Subscription name is required';
  } else if (String(input.name).length > 100) {
    errors.name = 'Subscription name must be less than 100 characters';
  }

  const price = Number(input.price);
  if (isNaN(price) || price < 0) {
    errors.price = 'Price must be 0 or greater';
  } else if (price > 100000) {
    errors.price = 'Price must be less than $100,000';
  }

  const validBillingCycles: BillingCycle[] = ['monthly', 'yearly', 'quarterly'];
  if (!input.billing_cycle || !validBillingCycles.includes(input.billing_cycle)) {
    errors.billing_cycle = 'billing_cycle must be monthly, yearly, or quarterly';
  }

  if (input.source && !['manual', 'gift_card'].includes(input.source)) {
    errors.source = "source must be 'manual' or 'gift_card'";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateSubscriptionUpdateInput(
  input: SubscriptionUpdateInput
): ValidationResult {
  const errors: Record<string, string> = {};

  if (input.name !== undefined) {
    if (!String(input.name).trim()) {
      errors.name = 'Subscription name cannot be empty';
    } else if (String(input.name).length > 100) {
      errors.name = 'Subscription name must be less than 100 characters';
    }
  }

  if (input.price !== undefined) {
    const price = Number(input.price);
    if (isNaN(price) || price < 0) {
      errors.price = 'Price must be 0 or greater';
    } else if (price > 100000) {
      errors.price = 'Price must be less than $100,000';
    }
  }

  if (input.billing_cycle !== undefined) {
    const valid: BillingCycle[] = ['monthly', 'yearly', 'quarterly'];
    if (!valid.includes(input.billing_cycle)) {
      errors.billing_cycle = 'billing_cycle must be monthly, yearly, or quarterly';
    }
  }

  if (input.status !== undefined) {
    const valid: SubscriptionStatus[] = ['active', 'cancelled', 'paused', 'trial'];
    if (!valid.includes(input.status)) {
      errors.status = 'status must be active, cancelled, paused, or trial';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateGiftCardHash(hash: string): boolean {
  if (typeof hash !== 'string' || hash.length < 32 || hash.length > 64) {
    return false;
  }
  return GIFT_CARD_HASH_REGEX.test(hash);
}

// ---------------------------------------------------------------------------
// SyncroSDK
// ---------------------------------------------------------------------------

export class SyncroSDK extends EventEmitter {
  private baseUrl: string;
  private getAuth?: () => Promise<string | null>;
  private credentials: RequestCredentials;

  constructor(options: SyncroSDKOptions) {
    super();
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.getAuth = options.getAuth;
    this.credentials = options.credentials ?? 'include';
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.getAuth) {
      const token = await this.getAuth();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
    return headers;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>
  ): Promise<{ ok: boolean; status: number; data: T }> {
    const headers = { ...(await this.getHeaders()), ...extraHeaders };
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      credentials: this.credentials,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok, status: res.status, data };
  }

  /**
   * Create a new subscription.
   * - Validates input
   * - Syncs backend + on-chain
   * - Emits 'subscription' event with type 'created'
   */
  async createSubscription(
    input: SubscriptionCreateInput,
    options?: { idempotencyKey?: string }
  ): Promise<SubscriptionResult> {
    const validation = validateSubscriptionCreateInput(input);
    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0];
      const err: SubscriptionResult = { success: false, error: firstError };
      this.emit('subscription', {
        type: 'failed',
        subscriptionId: '',
        error: firstError,
      } as SubscriptionLifecycleEvent);
      return err;
    }

    const payload = {
      name: input.name,
      price: Number(input.price),
      billing_cycle: input.billing_cycle,
      provider: input.provider ?? input.name,
      status: input.status ?? 'active',
      next_billing_date: input.next_billing_date ?? null,
      category: input.category ?? null,
      logo_url: input.logo_url ?? null,
      website_url: input.website_url ?? null,
      renewal_url: input.renewal_url ?? null,
      notes: input.notes ?? null,
      tags: input.tags ?? [],
      email_account_id: input.email_account_id ?? null,
    };

    const extraHeaders: Record<string, string> = {};
    if (options?.idempotencyKey) {
      extraHeaders['Idempotency-Key'] = options.idempotencyKey;
    }

    const { ok, status, data } = await this.request<{
      success: boolean;
      data?: Subscription;
      error?: string;
      blockchain?: { synced: boolean; transactionHash?: string; error?: string };
    }>('POST', '/api/subscriptions', payload, extraHeaders);

    if (!ok) {
      const error = (data as { error?: string })?.error ?? `Request failed with status ${status}`;
      this.emit('subscription', {
        type: 'failed',
        subscriptionId: '',
        error,
      } as SubscriptionLifecycleEvent);
      return { success: false, error };
    }

    const body = data as { success: boolean; data?: Subscription; blockchain?: unknown };
    const sub = body.data;
    this.emit('subscription', {
      type: 'created',
      subscriptionId: sub?.id ?? '',
      data: sub ?? null,
      blockchain: body.blockchain as { synced: boolean; transactionHash?: string; error?: string },
    } as SubscriptionLifecycleEvent);

    return {
      success: true,
      data: sub,
      blockchain: body.blockchain as { synced: boolean; transactionHash?: string; error?: string },
    };
  }

  /**
   * Get a subscription by ID.
   */
  async getSubscription(subscriptionId: string): Promise<SubscriptionResult> {
    if (!subscriptionId || String(subscriptionId).trim().length === 0) {
      return { success: false, error: 'Subscription ID is required' };
    }

    const { ok, data } = await this.request<{
      success: boolean;
      data?: Subscription;
      error?: string;
    }>('GET', `/api/subscriptions/${encodeURIComponent(subscriptionId)}`);

    if (!ok) {
      const error = (data as { error?: string })?.error ?? 'Failed to fetch subscription';
      return { success: false, error };
    }

    const body = data as { success: boolean; data?: Subscription };
    return {
      success: true,
      data: body.data,
    };
  }

  /**
   * Update an existing subscription.
   * - Validates input
   * - Syncs backend + on-chain
   * - Emits 'subscription' event with type 'updated'
   */
  async updateSubscription(
    subscriptionId: string,
    input: SubscriptionUpdateInput,
    options?: { idempotencyKey?: string; ifMatch?: number }
  ): Promise<SubscriptionResult> {
    if (!subscriptionId || String(subscriptionId).trim().length === 0) {
      return { success: false, error: 'Subscription ID is required' };
    }

    const validation = validateSubscriptionUpdateInput(input);
    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0];
      const err: SubscriptionResult = { success: false, error: firstError };
      this.emit('subscription', {
        type: 'failed',
        subscriptionId,
        error: firstError,
      } as SubscriptionLifecycleEvent);
      return err;
    }

    const extraHeaders: Record<string, string> = {};
    if (options?.idempotencyKey) extraHeaders['Idempotency-Key'] = options.idempotencyKey;
    if (options?.ifMatch !== undefined) extraHeaders['If-Match'] = String(options.ifMatch);

    const { ok, status, data } = await this.request<{
      success: boolean;
      data?: Subscription;
      error?: string;
      blockchain?: { synced: boolean; transactionHash?: string; error?: string };
    }>(
      'PATCH',
      `/api/subscriptions/${encodeURIComponent(subscriptionId)}`,
      input,
      extraHeaders
    );

    if (!ok) {
      const error = (data as { error?: string })?.error ?? `Request failed with status ${status}`;
      this.emit('subscription', {
        type: 'failed',
        subscriptionId,
        error,
      } as SubscriptionLifecycleEvent);
      return { success: false, error };
    }

    const body = data as { success: boolean; data?: Subscription; blockchain?: unknown };
    const sub = body.data;
    this.emit('subscription', {
      type: 'updated',
      subscriptionId,
      data: sub ?? null,
      blockchain: body.blockchain as { synced: boolean; transactionHash?: string; error?: string },
    } as SubscriptionLifecycleEvent);

    return {
      success: true,
      data: sub,
      blockchain: body.blockchain as { synced: boolean; transactionHash?: string; error?: string },
    };
  }

  /**
   * Cancel a subscription (soft cancel: sets status to 'cancelled').
   * - Syncs backend + on-chain
   * - Emits 'subscription' event with type 'cancelled'
   */
  async cancelSubscription(subscriptionId: string): Promise<SubscriptionResult> {
    if (!subscriptionId || String(subscriptionId).trim().length === 0) {
      return { success: false, error: 'Subscription ID is required' };
    }

    const { ok, status, data } = await this.request<{
      success: boolean;
      data?: Subscription;
      error?: string;
      blockchain?: { synced: boolean; transactionHash?: string; error?: string };
    }>(
      'PATCH',
      `/api/subscriptions/${encodeURIComponent(subscriptionId)}`,
      { status: 'cancelled' as const }
    );

    if (!ok) {
      const error = (data as { error?: string })?.error ?? `Request failed with status ${status}`;
      this.emit('subscription', {
        type: 'failed',
        subscriptionId,
        error,
      } as SubscriptionLifecycleEvent);
      return { success: false, error };
    }

    const body = data as { success: boolean; data?: Subscription; blockchain?: unknown };
    const sub = body.data;
    this.emit('subscription', {
      type: 'cancelled',
      subscriptionId,
      data: sub ?? null,
      blockchain: body.blockchain as { synced: boolean; transactionHash?: string; error?: string },
    } as SubscriptionLifecycleEvent);

    return {
      success: true,
      data: sub,
      blockchain: body.blockchain as { synced: boolean; transactionHash?: string; error?: string },
    };
  }

  /**
   * Delete a subscription permanently.
   * - Syncs backend + on-chain
   * - Emits 'subscription' event with type 'deleted'
   */
  async deleteSubscription(subscriptionId: string): Promise<SubscriptionResult> {
    if (!subscriptionId || String(subscriptionId).trim().length === 0) {
      return { success: false, error: 'Subscription ID is required' };
    }

    const { ok, status, data } = await this.request<{
      success: boolean;
      message?: string;
      error?: string;
      blockchain?: { synced: boolean; transactionHash?: string; error?: string };
    }>('DELETE', `/api/subscriptions/${encodeURIComponent(subscriptionId)}`);

    if (!ok) {
      const error = (data as { error?: string })?.error ?? `Request failed with status ${status}`;
      this.emit('subscription', {
        type: 'failed',
        subscriptionId,
        error,
      } as SubscriptionLifecycleEvent);
      return { success: false, error };
    }

    const body = data as { blockchain?: unknown };
    this.emit('subscription', {
      type: 'deleted',
      subscriptionId,
      data: null,
      blockchain: body.blockchain as { synced: boolean; transactionHash?: string; error?: string },
    } as SubscriptionLifecycleEvent);

    return {
      success: true,
      blockchain: body.blockchain as { synced: boolean; transactionHash?: string; error?: string },
    };
  }

  /**
   * Attach gift card info to a subscription.
   * - Validates gift card format
   * - Updates backend + on-chain reference
   * - Emits 'giftCard' events
   */
  async attachGiftCard(
    subscriptionId: string,
    giftCardHash: string,
    provider: string
  ): Promise<AttachGiftCardResult> {
    if (!validateGiftCardHash(giftCardHash)) {
      const err: AttachGiftCardResult = {
        success: false,
        error: 'Invalid gift card format. Hash must be 32-64 hex characters.',
      };
      this.emit('giftCard', {
        type: 'failed',
        subscriptionId,
        giftCardHash,
        provider,
        error: err.error,
      } as GiftCardEvent);
      return err;
    }
    const trimmedProvider = String(provider ?? '').trim();
    if (!trimmedProvider) {
      const err: AttachGiftCardResult = { success: false, error: 'Provider is required' };
      this.emit('giftCard', {
        type: 'failed',
        subscriptionId,
        giftCardHash,
        provider: trimmedProvider,
        error: err.error,
      } as GiftCardEvent);
      return err;
    }

    const headers = await this.getHeaders();
    try {
      const res = await fetch(
        `${this.baseUrl}/api/subscriptions/${encodeURIComponent(subscriptionId)}/attach-gift-card`,
        {
          method: 'POST',
          credentials: this.credentials,
          headers,
          body: JSON.stringify({ giftCardHash, provider: trimmedProvider }),
        }
      );
      const body = (await res.json().catch(() => ({}))) as {
        data?: AttachGiftCardResult['data'];
        error?: string;
        blockchain?: { transactionHash?: string; error?: string };
      };
      if (!res.ok) {
        const err: AttachGiftCardResult = {
          success: false,
          error: body.error ?? `Request failed with status ${res.status}`,
        };
        this.emit('giftCard', {
          type: 'failed',
          subscriptionId,
          giftCardHash,
          provider: trimmedProvider,
          error: err.error,
        } as GiftCardEvent);
        return err;
      }
      const result: AttachGiftCardResult = {
        success: true,
        data: body.data,
        blockchain: body.blockchain,
      };
      this.emit('giftCard', {
        type: 'attached',
        subscriptionId,
        giftCardHash,
        provider: trimmedProvider,
        data: body.data,
      } as GiftCardEvent);
      return result;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      const err: AttachGiftCardResult = { success: false, error: errorMessage };
      this.emit('giftCard', {
        type: 'failed',
        subscriptionId,
        giftCardHash,
        provider: trimmedProvider,
        error: errorMessage,
      } as GiftCardEvent);
      return err;
    }
  }
}

export function createSyncroSDK(options: SyncroSDKOptions): SyncroSDK {
  return new SyncroSDK(options);
}
