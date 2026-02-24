import axios from "axios";
import { SyncroSDK } from "./index";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("SyncroSDK", () => {
  let sdk: SyncroSDK;
  const apiKey = "test-api-key";

  beforeEach(() => {
    mockedAxios.create.mockReturnValue(mockedAxios as any);
    sdk = new SyncroSDK({ apiKey });
    jest.clearAllMocks();
  });

  describe("cancelSubscription", () => {
    it("should successfully cancel a subscription and emit events", async () => {
      const subId = "sub-123";
      const mockResponse = {
        data: {
          success: true,
          data: {
            id: subId,
            name: "Netflix",
            status: "cancelled",
            renewal_url: "https://netflix.com/account",
          },
          blockchain: {
            synced: true,
            transactionHash: "0x123",
          },
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const successSpy = jest.fn();
      const cancellingSpy = jest.fn();
      sdk.on("success", successSpy);
      sdk.on("cancelling", cancellingSpy);

      const result = await sdk.cancelSubscription(subId);

      expect(result.success).toBe(true);
      expect(result.status).toBe("cancelled");
      expect(result.redirectUrl).toBe("https://netflix.com/account");
      expect(result.blockchain?.synced).toBe(true);

      expect(cancellingSpy).toHaveBeenCalledWith({ subscriptionId: subId });
      expect(successSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          status: "cancelled",
        }),
      );

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `/subscriptions/${subId}/cancel`,
      );
    });

    it("should handle cancellation error and emit failure event", async () => {
      const subId = "sub-456";
      const errorMessage = "Subscription not found";

      mockedAxios.post.mockRejectedValueOnce({
        response: {
          data: { error: errorMessage },
        },
      });

      const failureSpy = jest.fn();
      sdk.on("failure", failureSpy);

      await expect(sdk.cancelSubscription(subId)).rejects.toThrow(
        `Cancellation failed: ${errorMessage}`,
      );

      expect(failureSpy).toHaveBeenCalledWith({
        subscriptionId: subId,
        error: errorMessage,
      });
    });
  });

  describe("approveRenewal", () => {
    it("should return success with receipt when approval is recorded on-chain", async () => {
      const subscriptionId = "sub-789";
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          success: true,
          blockchain: {
            synced: true,
            transactionHash: "0xrenewal123",
          },
        },
      });

      const result = await sdk.approveRenewal(subscriptionId, 2500, 123456);

      expect(result).toEqual({
        success: true,
        subscriptionId,
        maxAmount: 2500,
        expiry: 123456,
        receipt: {
          transactionHash: "0xrenewal123",
          status: "confirmed",
        },
      });
      expect(mockedAxios.post).toHaveBeenCalledWith(
        `/subscriptions/${subscriptionId}/approve-renewal`,
        { maxAmount: 2500, expiry: 123456 },
      );
    });

    it("should return failure when blockchain sync is not confirmed", async () => {
      const subscriptionId = "sub-790";
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          success: true,
          blockchain: {
            synced: false,
            error: "Sync failed",
          },
        },
      });

      const result = await sdk.approveRenewal(subscriptionId, 3000, 123457);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Sync failed");
      expect(result.subscriptionId).toBe(subscriptionId);
    });
  });

  describe("approveRenewals", () => {
    it("should return per-subscription results for batch approvals", async () => {
      mockedAxios.post
        .mockResolvedValueOnce({
          data: {
            success: true,
            receipt: {
              transactionHash: "0xbatch1",
              status: "success",
            },
          },
        })
        .mockRejectedValueOnce({
          response: {
            data: { error: "Approval denied" },
          },
        });

      const results = await sdk.approveRenewals([
        { subscriptionId: "sub-a", maxAmount: 1500, expiry: 50001 },
        { subscriptionId: "sub-b", maxAmount: 2000, expiry: 50002 },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        success: true,
        subscriptionId: "sub-a",
        maxAmount: 1500,
        expiry: 50001,
        receipt: {
          transactionHash: "0xbatch1",
          status: "success",
        },
      });
      expect(results[1]).toEqual({
        success: false,
        subscriptionId: "sub-b",
        maxAmount: 2000,
        expiry: 50002,
        error: "Approval denied",
      });
    });
  });
});
