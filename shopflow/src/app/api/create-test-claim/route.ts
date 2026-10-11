import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const ticketId = body.ticket_id || `sf_tkt_${Date.now().toString().slice(-6)}`;
    const eventId = `evt_sf_${Date.now()}`;
    const amount = parseFloat(body.claimed_amount || "2499.00");

    const webhookPayload = {
      event_id: eventId,
      event_type: "refund.ticket.created",
      ticket_id: ticketId,
      status: "PENDING_RITOS",
      order_id: body.order_id || `ORD-SF-${ticketId.slice(-4)}`,
      transaction_id: `TXN-${body.order_id || ticketId}`,
      customer_id: body.customer_id || "CUS-10001",
      customer_name: body.customer_name || "Aarav Mehta",
      customer_email: body.customer_email || "aarav@example.com",
      customer_phone: body.customer_phone || "+91 98765 43210",
      claimed_amount: amount,
      claimed_amount_minor: Math.round(amount * 100),
      currency: "INR",
      category: body.category || "DEFECTIVE_PRODUCT",
      description: body.description || "Stitching came undone upon unboxing the package.",
      item_name: body.item_name || "Executive Laptop Sleeve 15-inch",
      item_category: body.item_category || "GENERAL",
      purchase_date: body.purchase_date || null,
      evidence_images: body.evidence_images || [],
      merchant_id: "merch_dell_in",
      created_at: new Date().toISOString()
    };

    const ritosUrl = process.env.RITOS_BASE_URL 
      ? `${process.env.RITOS_BASE_URL}/webhook/refund-tickets` 
      : "http://localhost:8000/webhook/refund-tickets";
    const apiKey = process.env.RITOS_API_KEY || "ritos_dev_key_secret_2026";

    const res = await fetch(ritosUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(webhookPayload)
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({
        success: false,
        ticket_id: ticketId,
        error: `RITOS Webhook responded with status ${res.status}: ${errText}`
      }, { status: res.status });
    }

    const ritosData = await res.json();

    return NextResponse.json({
      success: true,
      ticket_id: ticketId,
      payload_sent: webhookPayload,
      ritos_response: ritosData
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message || "Failed to dispatch ticket to RITOS"
    }, { status: 500 });
  }
}
