import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireAuth, errorResponse } from "@/server/auth/guards";
import { storage } from "@/server/storage/evidence-storage";
import { emitOutboxEvent } from "@/server/outbox/outbox-dispatcher";
import { getNextTicketId } from "@/server/services/ticket-sequence";
import { 
  TicketReason, 
  RequestedAction, 
  TicketStatus, 
  EvidenceType 
} from "@prisma/client";

export const dynamic = "force-dynamic";

const ALLOWED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_FILES = 5;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(["CUSTOMER", "ADMIN", "SUPPORT_ANALYST"]);
  if (error || !user) return error;

  try {
    const formData = await req.formData();
    const orderItemId = formData.get("order_item_id") as string;
    const reason = formData.get("reason") as TicketReason;
    const requestedAction = formData.get("requested_action") as RequestedAction;
    const description = (formData.get("description") as string) || "";
    const requestedAmountMinorStr = formData.get("requested_amount_minor") as string;

    if (!orderItemId || !reason || !requestedAction) {
      return errorResponse("VALIDATION_ERROR", "Missing required fields: order_item_id, reason, requested_action", 422);
    }

    // Verify order ownership
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: {
        payment: true,
        items: {
          include: {
            product: { include: { policy: true } },
          },
        },
        tickets: true,
      },
    });

    if (!order) {
      return errorResponse("NOT_FOUND", "Order not found", 404);
    }

    if (user.role === "CUSTOMER" && order.customerId !== user.id) {
      return errorResponse("FORBIDDEN", "You do not own this order", 403);
    }

    const item = order.items.find((it) => it.id === orderItemId);
    if (!item) {
      return errorResponse("NOT_FOUND", "Order item does not belong to this order", 404);
    }

    const requestedAmountMinor = requestedAmountMinorStr
      ? parseInt(requestedAmountMinorStr, 10)
      : item.unitPriceMinor * item.quantity;

    if (isNaN(requestedAmountMinor) || requestedAmountMinor <= 0 || requestedAmountMinor > (item.unitPriceMinor * item.quantity)) {
      return errorResponse("VALIDATION_ERROR", "Requested amount must be between 1 and item total", 422);
    }

    // Check duplicate-ticket guard for UI creation:
    // "no ticket if the item already has an active (non-REJECTED, non-FAILED) ticket whose amounts exhaust the ledger"
    const activeItemTicket = order.tickets.find(
      (t) => t.orderItemId === item.id && !["REJECTED", "FAILED"].includes(t.status)
    );
    if (activeItemTicket && user.role === "CUSTOMER") {
      return errorResponse(
        "DUPLICATE_TICKET",
        `Item already has an active ticket (${activeItemTicket.id})`,
        409,
        { existing_ticket_id: activeItemTicket.id }
      );
    }

    // Process file uploads
    const files = formData.getAll("files") as File[];
    if (files.length > MAX_FILES) {
      return errorResponse("VALIDATION_ERROR", `Maximum ${MAX_FILES} evidence files allowed`, 422);
    }

    const savedFiles: Array<{
      storedPath: string;
      sha256: string;
      sizeBytes: number;
      mime: string;
      filename: string;
      type: EvidenceType;
    }> = [];

    for (const file of files) {
      if (typeof file === "string" || !file.name) continue;

      if (!ALLOWED_MIMES.includes(file.type)) {
        return errorResponse(
          "INVALID_FILE_TYPE",
          `File type ${file.type} is not allowed. Only JPEG, PNG, WEBP, and PDF are supported.`,
          422
        );
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        return errorResponse(
          "FILE_TOO_LARGE",
          `File ${file.name} exceeds maximum limit of 5 MB`,
          422
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const saved = await storage.save(buffer, file.name, file.type);
      savedFiles.push({
        ...saved,
        type: file.type === "application/pdf" ? EvidenceType.DOCUMENT : EvidenceType.IMAGE,
      });
    }

    // Generate atomic ticket number
    const result = await prisma.$transaction(async (tx) => {
      const ticketId = await getNextTicketId(tx);

      const policySnapshot = item.product.policy ? {
        policy_id: item.product.policy.id,
        policy_type: item.product.policy.policyType,
        refund_percentage: item.product.policy.refundPercentage,
        return_window_days: item.product.policy.returnWindowDays,
        opened_allowed: item.product.policy.openedAllowed,
        requires_unused: item.product.policy.requiresUnused,
        replacement_allowed: item.product.policy.replacementAllowed,
        return_required: item.product.policy.returnRequired,
        evidence_required_reasons: item.product.policy.evidenceRequiredReasons,
        return_shipping: item.product.policy.returnShipping,
      } : {};

      const createdTicket = await tx.refundTicket.create({
        data: {
          id: ticketId,
          customerId: order.customerId,
          orderId: order.id,
          orderItemId: item.id,
          productId: item.productId,
          transactionId: order.payment?.transactionId || `TXN-ORD-${order.id}`,
          reason,
          description,
          requestedAction,
          requestedAmountMinor,
          status: TicketStatus.PENDING_RITOS,
          policySnapshot,
          evidence: {
            create: savedFiles.map((f) => ({
              id: `EVD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              type: f.type,
              filename: f.filename,
              storedPath: f.storedPath,
              mime: f.mime,
              sizeBytes: f.sizeBytes,
              sha256: f.sha256,
            })),
          },
        },
      });

      // Audit event
      await tx.auditEvent.create({
        data: {
          entityType: "REFUND_TICKET",
          entityId: ticketId,
          event: "TICKET_CREATED",
          actor: `CUSTOMER:${user.id}`,
          payload: {
            reason,
            requested_action: requestedAction,
            requested_amount_minor: requestedAmountMinor,
            evidence_count: savedFiles.length,
          },
        },
      });

      // Emit outbox event
      await emitOutboxEvent(tx, "refund.ticket.created", ticketId);

      return createdTicket;
    });

    return NextResponse.json({
      success: true,
      ticket_id: result.id,
      status: result.status,
      message: "Refund ticket created successfully and submitted to RITOS",
    }, { status: 201 });
  } catch (err: any) {
    return errorResponse("SERVER_ERROR", err.message || "Failed to create refund ticket", 500);
  }
}
