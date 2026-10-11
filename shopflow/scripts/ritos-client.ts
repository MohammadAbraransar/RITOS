/**
 * Dev helper: tiny RITOS client script per docs 03 §5
 * Usage: npx tsx scripts/ritos-client.ts <ticketId> [--decide]
 */

const ticketId = process.argv[2] || "RIT-2026-000100";
const shouldDecide = process.argv.includes("--decide");
const baseUrl = process.env.SHOPFLOW_BASE_URL || "http://localhost:3000";
const apiKey = process.env.RITOS_API_KEY || "test-ritos-api-key";

async function run() {
  console.log(`\n=== Fetching RITOS context for ${ticketId} ===`);
  const contextRes = await fetch(`${baseUrl}/api/ritos/refund-tickets/${ticketId}/context`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!contextRes.ok) {
    const err = await contextRes.text();
    console.error(`Failed to fetch context: ${contextRes.status}`, err);
    process.exit(1);
  }

  const context = await contextRes.json();
  console.log("Context fetched successfully:");
  console.log(JSON.stringify(context, null, 2));

  if (!shouldDecide) {
    console.log("\nDone. Use --decide flag to execute decision and refund.");
    return;
  }

  console.log(`\n=== Submitting RITOS decision for ${ticketId} ===`);
  const decisionPayload = {
    ticket_id: ticketId,
    decision: "APPROVED",
    refund_percentage: 100,
    refund_amount_minor: context.ticket.requested_amount_minor,
    reason: "Auto-approved by dev helper script",
    confidence_score: 0.98,
    processed_by: "DEV_SCRIPT",
    requires_human_review: false,
    agent_trace: [{ agent: "dev_client", ms: 50 }],
  };

  const decisionRes = await fetch(`${baseUrl}/api/ritos/refund-decision`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": `dev-decide-${Date.now()}`,
    },
    body: JSON.stringify(decisionPayload),
  });

  console.log(`Decision Status: ${decisionRes.status}`);
  console.log(await decisionRes.text());
}

run().catch(console.error);
