import { NextResponse } from "next/server";
import { z } from "zod";
import { config } from "@/server/config";
import { requireAuth } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

// Storefront demo panel: sends a claim for a demo order that is not in the store DB straight to RITOS.
// Disabled unless DEMO_CLAIMS_ENABLED=true (RITOS must enable demo claims too). The result shown is always
// RITOS's own answer; nothing is invented when RITOS is slow or unreachable.
const DemoClaimSchema = z.object({
  ticket_id: z.string().min(1).optional(),
  order_id: z.string().min(1),
  item_name: z.string().min(1),
  item_category: z.string().min(1),
  claimed_amount: z.coerce.number().positive(),
  category: z.string().min(1),
  description: z.string().min(8),
  purchase_date: z.string().datetime({ offset: true }).optional(),
  evidence_images: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  if (!config.demoClaimsEnabled) {
    return NextResponse.json({ success: false, error: "Demo claims are disabled (DEMO_CLAIMS_ENABLED)" }, { status: 404 });
  }
  const { user, error } = await requireAuth();
  if (error) return error;

  const parsed = DemoClaimSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid claim", details: parsed.error.format() }, { status: 422 });
  }
  const body = parsed.data;
  const ticketId = body.ticket_id || `sf_tkt_${Date.now()}`;

  const webhookPayload = {
    event_id: `evt_sf_${ticketId}`,
    event_type: "refund.ticket.created",
    ticket_id: ticketId,
    status: "PENDING_RITOS",
    order_id: body.order_id,
    transaction_id: `TXN-${body.order_id}`,
    // The claimant is the signed-in customer, never a fixed demo identity.
    customer_id: user!.id,
    customer_name: user!.name,
    customer_email: user!.email,
    customer_phone: user!.phone ?? null,
    claimed_amount: body.claimed_amount,
    claimed_amount_minor: Math.round(body.claimed_amount * 100),
    category: body.category,
    description: body.description,
    item_name: body.item_name,
    item_category: body.item_category,
    purchase_date: body.purchase_date ?? null,
    evidence_images: body.evidence_images,
    created_at: new Date().toISOString(),
  };

  try {
    const res = await fetch(`${config.ritosBaseUrl}/webhook/refund-tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.ritosApiKey}` },
      body: JSON.stringify(webhookPayload),
      signal: AbortSignal.timeout(config.ritosRequestTimeoutMs),
    });
    const text = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: text.slice(0, 500) };
    }
    if (!res.ok) {
      return NextResponse.json(
        { success: false, ticket_id: ticketId, error: `RITOS rejected the claim (HTTP ${res.status})`, details: data },
        { status: 502 }
      );
    }
    return NextResponse.json({ success: true, ticket_id: ticketId, payload_sent: webhookPayload, ritos_response: data });
  } catch (err: any) {
    if (err?.name === "TimeoutError") {
      // RITOS keeps processing after we stop waiting; the decision appears in the RITOS console.
      return NextResponse.json(
        {
          success: true,
          status: "PROCESSING",
          ticket_id: ticketId,
          payload_sent: webhookPayload,
          ritos_response: null,
          message: `RITOS is still adjudicating after ${config.ritosRequestTimeoutMs} ms; the decision will appear in the RITOS console.`,
        },
        { status: 202 }
      );
    }
    return NextResponse.json(
      { success: false, ticket_id: ticketId, error: `RITOS is unreachable: ${err?.message || err}` },
      { status: 502 }
    );
  }
}
