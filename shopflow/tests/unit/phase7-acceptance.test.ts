import { describe, it, expect } from "vitest";
import { buildRefundContext } from "../../src/server/ritos/context-builder";
import { mockDecide } from "../../src/server/mock-ritos/mock-decide";

describe("Phase 7 Acceptance Verification: Mock RITOS 10 Scenarios", () => {
  it("All 10 scenarios produce expected decisions per docs/03 §3 & §4", async () => {
    const expectations: Record<string, { decision: string; minConfidence?: number }> = {
      // 1. PROD-001 damaged with image -> APPROVED
      "RIT-2026-000100": { decision: "APPROVED", minConfidence: 0.95 },
      // 2. PROD-005 90% policy -> PARTIALLY_APPROVED
      "RIT-2026-000102": { decision: "PARTIALLY_APPROVED" },
      // 3. PROD-008 personalized backpack non-refundable -> REJECTED
      "RIT-2026-000104": { decision: "REJECTED" },
      // 4. PROD-004 outside 30d window -> REJECTED
      "RIT-2026-000106": { decision: "REJECTED" },
      // 5. PROD-003 high value ₹68,999 -> HUMAN_REVIEW
      "RIT-2026-000108": { decision: "HUMAN_REVIEW" },
      // 6. PROD-002 damaged with NO evidence -> HUMAN_REVIEW
      "RIT-2026-000110": { decision: "HUMAN_REVIEW" },
      // 7. Duplicate ticket where 000111 was refunded -> REJECTED
      "RIT-2026-000112": { decision: "REJECTED" },
      // 8. ORDER_NEVER_ARRIVED but delivered -> HUMAN_REVIEW (conflict)
      "RIT-2026-000114": { decision: "HUMAN_REVIEW" },
      // 9. Suspicious pattern (new customer, high ticket velocity) -> HUMAN_REVIEW
      "RIT-2026-000116": { decision: "HUMAN_REVIEW" },
      // 10. WRONG_PRODUCT with image -> APPROVED
      "RIT-2026-000118": { decision: "APPROVED", minConfidence: 0.95 },
    };

    for (const [ticketId, expected] of Object.entries(expectations)) {
      const context = await buildRefundContext(ticketId);
      expect(context).not.toBeNull();
      const decision = mockDecide(context);

      expect(decision.decision, `Ticket ${ticketId} expected ${expected.decision} but got ${decision.decision}`).toBe(
        expected.decision
      );

      if (expected.minConfidence) {
        expect(decision.confidence_score).toBeGreaterThanOrEqual(expected.minConfidence);
      }
    }
  });
});
