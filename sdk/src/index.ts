/**
 * Syncro SDK - Gift Card Redemption Helper
 *
 * Provides attachGiftCard() to attach gift card info to a subscription,
 * with validation, backend update, and on-chain reference logging.
 */

import { EventEmitter } from 'events';

/** Gift card hash must be 32-64 hex characters */
const GIFT_CARD_HASH_REGEX = /^[a-fA-F0-9]{32,64}$/;

export interface AttachGiftCardOptions {
  /** Base URL of the Syncro backend API */
  baseUrl: string;
  /** Auth: Bearer token, or use credentials: 'include' for cookie auth */
  getAuth?: () => Promise<string | null>;
  /** Use fetch with credentials (cookies) when true and no getAuth */
  credentials?: RequestCredentials;
}

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
  blockchain?: {
    transactionHash?: string;
    error?: string;
  };
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


/**
 * Validates gift card hash format (32-64 hex characters)
 */
export function validateGiftCardHash(hash: string): boolean {
  if (typeof hash !== 'string' || hash.length < 32 || hash.length > 64) {
    return false;
  }
  return GIFT_CARD_HASH_REGEX.test(hash);
}

/**
 * Syncro SDK client
 */
export class SyncroSDK extends EventEmitter {
  private baseUrl: string;
  private getAuth?: () => Promise<string | null>;
  private credentials: RequestCredentials;

  constructor(options: AttachGiftCardOptions) {
    super();
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.getAuth = options.getAuth;
    this.credentials = options.credentials ?? 'include';
  }

  /**
   * Attach gift card info to a subscription.
   * - Validates gift card format
   * - Updates backend
   * - Logs on-chain reference
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

    const trimmedProvider = String(provider || '').trim();
    if (!trimmedProvider) {
      const err: AttachGiftCardResult = {
        success: false,
        error: 'Provider is required',
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

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.getAuth) {
      const token = await this.getAuth();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    try {
      const res = await fetch(
        `${this.baseUrl}/api/subscriptions/${encodeURIComponent(subscriptionId)}/attach-gift-card`,
        {
          method: 'POST',
          credentials: this.credentials,
          headers,
          body: JSON.stringify({
            giftCardHash,
            provider: trimmedProvider,
          }),
        }
      );

      const body = (await res.json().catch(() => ({}))) as {
        data?: AttachGiftCardResult['data'];
        error?: string;
        blockchain?: AttachGiftCardResult['blockchain'];
      };

      if (!res.ok) {
        const err: AttachGiftCardResult = {
          success: false,
          error: body.error || `Request failed with status ${res.status}`,
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
      const err: AttachGiftCardResult = {
        success: false,
        error: errorMessage,
      };
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

/**
 * Create a Syncro SDK instance
 */
export function createSyncroSDK(options: AttachGiftCardOptions): SyncroSDK {
  return new SyncroSDK(options);
}
