import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireAuth, errorResponse } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(["CUSTOMER", "ADMIN", "SUPPORT_ANALYST"]);
  if (error || !user) return error;

  try {
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: {
        customer: {
          select: { id: true, name: true, email: true },
        },
        items: {
          include: {
            product: {
              include: {
                policy: true,
              },
            },
          },
        },
        payment: {
          include: {
            refundTransactions: true,
          },
        },
        tickets: {
          include: {
            decisions: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!order) {
      return errorResponse("NOT_FOUND", "Order not found", 404);
    }

    // Authorization: customer can only read their own order
    if (user.role === "CUSTOMER" && order.customerId !== user.id) {
      return errorResponse("FORBIDDEN", "You do not have access to this order", 403);
    }

    // Derive eligibility details for refund
    const isDelivered = order.status === "DELIVERED";
    let daysSinceDelivery: number | null = null;
    if (order.deliveredAt) {
      const diffMs = Date.now() - new Date(order.deliveredAt).getTime();
      daysSinceDelivery = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }

    return NextResponse.json({
      order: {
        id: order.id,
        order_number: order.id,
        status: order.status,
        delivery_status: order.deliveryStatus,
        ordered_at: order.orderedAt.toISOString(),
        delivered_at: order.deliveredAt ? order.deliveredAt.toISOString() : null,
        days_since_delivery: daysSinceDelivery,
        is_eligible_for_refund: isDelivered && order.tickets.length === 0,
        total_minor: order.totalMinor,
        currency: order.currency,
        shipping_address: order.shippingAddress,
        items: order.items.map((it) => ({
          id: it.id,
          product_id: it.productId,
          product_name: it.product.name,
          product_sku: it.product.sku,
          image_url: it.product.imageUrl,
          quantity: it.quantity,
          unit_price_minor: it.unitPriceMinor,
          policy: it.product.policy
            ? {
                id: it.product.policy.id,
                policy_type: it.product.policy.policyType,
                refund_percentage: it.product.policy.refundPercentage,
                return_window_days: it.product.policy.returnWindowDays,
                opened_allowed: it.product.policy.openedAllowed,
                requires_unused: it.product.policy.requiresUnused,
                replacement_allowed: it.product.policy.replacementAllowed,
                return_required: it.product.policy.returnRequired,
                evidence_required_reasons: it.product.policy.evidenceRequiredReasons,
                return_shipping: it.product.policy.returnShipping,
              }
            : null,
        })),
        payment: order.payment
          ? {
              transaction_id: order.payment.transactionId,
              method: order.payment.method,
              status: order.payment.status,
              amount_minor: order.payment.amountMinor,
              paid_at: order.payment.paidAt ? order.payment.paidAt.toISOString() : null,
              refund_transactions: order.payment.refundTransactions.map((rt) => ({
                id: rt.id,
                gateway_ref: rt.transactionId,
                amount_minor: rt.amountMinor,
                status: rt.status,
                settled_at: rt.settleAt ? rt.settleAt.toISOString() : null,
              })),
            }
          : null,
        tickets: order.tickets.map((t) => ({
          id: t.id,
          ticket_number: t.id,
          status: t.status,
          reason: t.reason,
          requested_action: t.requestedAction,
          requested_amount_minor: t.requestedAmountMinor,
          created_at: t.createdAt.toISOString(),
        })),
      },
    });
  } catch (err: any) {
    return errorResponse("SERVER_ERROR", err.message || "Failed to load order details", 500);
  }
}
