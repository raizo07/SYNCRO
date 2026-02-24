import axios, { AxiosInstance } from "axios";
import { EventEmitter } from "events";

export interface Subscription {
    id: string;
    name: string;
    price: number;
    billing_cycle: string;
    status: string;
    renewal_url?: string;
    cancellation_url?: string;
    [key: string]: any;
}

export interface CancellationResult {
    success: boolean;
    status: "cancelled" | "failed" | "partial";
    subscription: Subscription;
    redirectUrl?: string;
    blockchain?: {
        synced: boolean;
        transactionHash?: string;
        error?: string;
    };
}

export interface RenewalReceipt {
    transactionHash?: string;
    status?: string;
}

export interface RenewalApprovalResult {
    success: boolean;
    subscriptionId: string;
    maxAmount: number;
    expiry: number;
    receipt?: RenewalReceipt;
    error?: string;
}

export interface RenewalApprovalInput {
    subscriptionId: string;
    maxAmount: number;
    expiry: number;
}

export class SyncroSDK extends EventEmitter {
    private client: AxiosInstance;
    private apiKey: string;

    constructor(config: { apiKey: string; baseUrl?: string }) {
        super();
        this.apiKey = config.apiKey;
        this.client = axios.create({
            baseURL: config.baseUrl || "http://localhost:3001/api",
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
            },
        });
    }

    /**
     * Cancel a subscription programmatically
     * @param subscriptionId The ID of the subscription to cancel
     * @returns Cancellation result including status and optional redirect link
     */
    async cancelSubscription(
        subscriptionId: string,
    ): Promise<CancellationResult> {
        try {
            this.emit("cancelling", { subscriptionId });

            const response = await this.client.post(
                `/subscriptions/${subscriptionId}/cancel`,
            );
            const { data, blockchain } = response.data;

            const result: CancellationResult = {
                success: true,
                status: "cancelled",
                subscription: data,
                redirectUrl: data.cancellation_url || data.renewal_url,
                blockchain: blockchain,
            };

            this.emit("success", result);
            return result;
        } catch (error: any) {
            const errorMessage = error.response?.data?.error || error.message;

            const failedResult: any = {
                success: false,
                status: "failed",
                error: errorMessage,
            };

            this.emit("failure", { subscriptionId, error: errorMessage });
            throw new Error(`Cancellation failed: ${errorMessage}`);
        }
    }

    /**
     * Get subscription details
     */
    async getSubscription(subscriptionId: string): Promise<Subscription> {
        const response = await this.client.get(
            `/subscriptions/${subscriptionId}`,
        );
        return response.data.data;
    }

    /**
     * Approve renewal for a subscription and wait for on-chain acknowledgement.
     */
    async approveRenewal(
        subscriptionId: string,
        maxAmount: number,
        expiry: number,
    ): Promise<RenewalApprovalResult> {
        try {
            this.emit("renewalApproving", { subscriptionId, maxAmount, expiry });

            const response = await this.client.post(
                `/subscriptions/${subscriptionId}/approve-renewal`,
                { maxAmount, expiry },
            );
            const payload = response.data ?? {};

            const receipt = this.extractRenewalReceipt(payload);
            const isRecordedOnChain = this.isApprovalRecordedOnChain(payload, receipt);

            if (!isRecordedOnChain) {
                const errorMessage =
                    payload.blockchain?.error ||
                    payload.error ||
                    "Approval was not recorded on-chain";
                const failedResult: RenewalApprovalResult = {
                    success: false,
                    subscriptionId,
                    maxAmount,
                    expiry,
                    receipt,
                    error: errorMessage,
                };
                this.emit("renewalApprovalFailed", failedResult);
                return failedResult;
            }

            const successResult: RenewalApprovalResult = {
                success: true,
                subscriptionId,
                maxAmount,
                expiry,
                receipt,
            };
            this.emit("renewalApproved", successResult);
            return successResult;
        } catch (error: any) {
            const errorMessage = error.response?.data?.error || error.message;
            const failedResult: RenewalApprovalResult = {
                success: false,
                subscriptionId,
                maxAmount,
                expiry,
                error: errorMessage,
            };
            this.emit("renewalApprovalFailed", failedResult);
            return failedResult;
        }
    }

    /**
     * Approve multiple renewals and return per-subscription outcomes.
     */
    async approveRenewals(
        approvals: RenewalApprovalInput[],
    ): Promise<RenewalApprovalResult[]> {
        if (!approvals || approvals.length === 0) {
            return [];
        }

        return Promise.all(
            approvals.map((approval) =>
                this.approveRenewal(
                    approval.subscriptionId,
                    approval.maxAmount,
                    approval.expiry,
                ),
            ),
        );
    }

    private extractRenewalReceipt(payload: any): RenewalReceipt | undefined {
        const transactionHash =
            payload.receipt?.transactionHash ||
            payload.transactionHash ||
            payload.blockchain?.transactionHash;
        const status =
            payload.receipt?.status ||
            payload.status ||
            (payload.blockchain?.synced ? "confirmed" : undefined);

        if (!transactionHash && !status) {
            return undefined;
        }

        return {
            transactionHash,
            status,
        };
    }

    private isApprovalRecordedOnChain(
        payload: any,
        receipt?: RenewalReceipt,
    ): boolean {
        if (payload?.success === false) {
            return false;
        }

        if (payload?.blockchain?.synced === false) {
            return false;
        }

        if (payload?.blockchain?.synced === true) {
            return true;
        }

        const receiptStatus = receipt?.status?.toLowerCase();
        if (receiptStatus === "confirmed" || receiptStatus === "success") {
            return true;
        }

        return Boolean(receipt?.transactionHash);
    }
}

export default SyncroSDK;
