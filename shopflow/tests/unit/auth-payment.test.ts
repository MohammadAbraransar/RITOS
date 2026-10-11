import { describe, it, expect, beforeAll } from "vitest";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { processMockPayment } from "@/server/mock-pay/payment-provider";

describe("Phase 2: Auth and Mock Payment Logic", () => {
  it("hashes and verifies password correctly", async () => {
    const raw = "Demo@1234";
    const hash = await hashPassword(raw);
    expect(await verifyPassword(raw, hash)).toBe(true);
    expect(await verifyPassword("WrongPassword", hash)).toBe(false);
  });

  it("handles mock payment success path", () => {
    const res = processMockPayment({
      amountMinor: 299900,
      method: "UPI",
      paymentIdentifier: "aarav@okhdfcbank",
    });
    expect(res.success).toBe(true);
    expect(res.transactionId).toMatch(/^TXN-\d{6}$/);
    expect(res.failureReason).toBeUndefined();
  });

  it("handles mock payment fail@mock simulation", () => {
    const res = processMockPayment({
      amountMinor: 299900,
      method: "UPI",
      paymentIdentifier: "fail@mock",
    });
    expect(res.success).toBe(false);
    expect(res.failureReason).toContain("fail@mock");
    expect(res.transactionId).toMatch(/^TXN-\d{6}$/);
  });
});
