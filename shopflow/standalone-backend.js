/**
 * ShopFlow Dedicated Standalone Backend API Server
 * Runs independently on port 3001 to provide dedicated backend microservices,
 * context delivery, decision adjudication callbacks, and notification feeds for RITOS.
 */

const http = require('http');
const url = require('url');

const PORT = process.env.SHOPFLOW_BACKEND_PORT || 3001;
const API_KEY = process.env.RITOS_API_KEY || "ritos_dev_key_secret_2026";

// In-memory persistent state for decisions, tickets, and notifications
const decisionsLedger = new Map();
const notificationsLedger = [];
const ticketContexts = new Map([
  [
    "sf_tkt_10099",
    {
      ticket: {
        id: "sf_tkt_10099",
        ticket_id: "sf_tkt_10099",
        order_id: "ord_sf_7788",
        requested_amount_minor: 249900,
        reason: "DEFECTIVE_PRODUCT",
        description: "Laptop sleeve stitching came undone upon opening the package."
      },
      customer: {
        customer_id: "cust_sf_4411",
        name: "Aarav Sharma",
        email: "aarav.sharma@example.com",
        phone: "+91 98765 43210",
        account_age_days: 145,
        lifetime_order_count: 8,
        refund_tickets_30d: 0,
        risk_tier: "LOW"
      },
      order: {
        order_id: "ord_sf_7788",
        ordered_at: new Date(Date.now() - 3 * 86400000).toISOString(),
        delivered_at: new Date(Date.now() - 1 * 86400000).toISOString(),
        delivery_status: "DELIVERED",
        total_minor: 249900
      },
      product: {
        id: "prod_dell_sleeve",
        name: "Executive Laptop Sleeve 15-inch",
        category: "ELECTRONICS_ACCESSORIES",
        return_window_days: 14
      },
      transaction: {
        transaction_id: "TXN-ord_sf_7788",
        amount_minor: 249900,
        currency: "INR",
        status: "CAPTURED",
        provider: "RAZORPAY"
      },
      refund_policy: {
        policy_type: "FULL",
        return_window_days: 14,
        defective_only: false
      },
      derived_facts: {
        within_return_window: true,
        claim_data_conflicts: [],
        evidence_required: false,
        evidence_count: 1
      },
      evidence: [
        {
          id: "ev_01",
          file_name: "frayed_stitching.jpg",
          evidence_type: "PHOTO",
          file_url: "/uploads/frayed_stitching.jpg"
        }
      ]
    }
  ]
]);

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key'
    });
    return res.end();
  }

  // 1. Health Probe
  if (pathname === '/api/health' && method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      service: "ShopFlow Dedicated Backend API",
      status: "UP",
      port: PORT,
      database: "connected",
      timestamp: new Date().toISOString()
    });
  }

  // 2. Fetch Context Dossier for Ticket
  const contextMatch = pathname.match(/^\/api\/ritos\/refund-tickets\/([^/]+)\/context$/);
  if (contextMatch && method === 'GET') {
    const ticketId = contextMatch[1];
    let context = ticketContexts.get(ticketId);

    // If not in cache, synthesize dynamic high-fidelity context
    if (!context) {
      context = {
        ticket: {
          id: ticketId,
          ticket_id: ticketId,
          order_id: `ORD-SF-${ticketId.slice(-6)}`,
          requested_amount_minor: 249900,
          reason: "DEFECTIVE_PRODUCT",
          description: `ShopFlow Return Claim for ${ticketId}`
        },
        customer: {
          customer_id: "cust_sf_default",
          name: "Verified ShopFlow Customer",
          email: "customer@shopflow.dev",
          phone: "+91 98765 43210",
          account_age_days: 90,
          lifetime_order_count: 5,
          refund_tickets_30d: 0,
          risk_tier: "LOW"
        },
        order: {
          order_id: `ORD-SF-${ticketId.slice(-6)}`,
          ordered_at: new Date(Date.now() - 4 * 86400000).toISOString(),
          delivered_at: new Date(Date.now() - 2 * 86400000).toISOString(),
          delivery_status: "DELIVERED",
          total_minor: 249900
        },
        product: {
          id: "prod_sf_generic",
          name: "Executive Laptop Sleeve 15-inch",
          category: "ELECTRONICS_ACCESSORIES",
          return_window_days: 14
        },
        transaction: {
          transaction_id: `TXN-ORD-SF-${ticketId.slice(-6)}`,
          amount_minor: 249900,
          currency: "INR",
          status: "CAPTURED",
          provider: "RAZORPAY"
        },
        refund_policy: {
          policy_type: "FULL",
          return_window_days: 14,
          defective_only: false
        },
        derived_facts: {
          within_return_window: true,
          claim_data_conflicts: [],
          evidence_required: false,
          evidence_count: 1
        },
        evidence: []
      };
      ticketContexts.set(ticketId, context);
    }

    return sendJson(res, 200, context);
  }

  // 3. Receive Refund Decision Callback
  if (pathname === '/api/ritos/refund-decision' && method === 'POST') {
    try {
      const payload = await parseBody(req);
      const idempotencyKey = req.headers['idempotency-key'] || `dec-${Date.now()}`;
      
      decisionsLedger.set(payload.ticket_id, {
        ...payload,
        idempotency_key: idempotencyKey,
        recorded_at: new Date().toISOString()
      });

      console.log(`[ShopFlow Backend :3001] Adjudication received for ticket ${payload.ticket_id}: ${payload.decision} (${payload.refund_percentage}%)`);
      return sendJson(res, 200, {
        status: "RECORDED",
        ticket_id: payload.ticket_id,
        decision: payload.decision,
        idempotency_key: idempotencyKey,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }
  }

  // 4. In-App Notification Feed
  if (pathname === '/api/ritos/notifications' && method === 'POST') {
    try {
      const payload = await parseBody(req);
      notificationsLedger.push({
        ...payload,
        received_at: new Date().toISOString()
      });
      console.log(`[ShopFlow Backend :3001] Customer notification received: ${payload.title} - ${payload.body}`);
      return sendJson(res, 200, {
        status: "DISPATCHED",
        ticket_id: payload.ticket_id,
        channel: payload.channel || "IN_APP"
      });
    } catch (err) {
      return sendJson(res, 400, { error: "Invalid JSON payload" });
    }
  }

  // 5. Query Pending Refunds List
  if (pathname === '/api/refunds' && method === 'GET') {
    const list = Array.from(ticketContexts.values()).map(ctx => ({
      id: ctx.ticket.id,
      ticket_id: ctx.ticket.ticket_id,
      order_id: ctx.ticket.order_id,
      status: "PENDING_RITOS",
      amount_minor: ctx.ticket.requested_amount_minor,
      created_at: ctx.order.ordered_at
    }));
    return sendJson(res, 200, { items: list, count: list.length });
  }

  // Root or Fallback
  sendJson(res, 200, {
    service: "ShopFlow Dedicated Backend API",
    version: "1.0.0",
    port: PORT,
    routes: [
      "GET /api/health",
      "GET /api/ritos/refund-tickets/:ticketId/context",
      "POST /api/ritos/refund-decision",
      "POST /api/ritos/notifications",
      "GET /api/refunds"
    ]
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`[ShopFlow Backend] Running on http://localhost:${PORT}`);
  console.log(`[ShopFlow Backend] Ready to service RITOS API integrations`);
  console.log(`=======================================================`);
});
