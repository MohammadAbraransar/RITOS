import { PrismaClient, UserRole, PolicyType, ReturnShipping, VerificationType, OrderStatus, PaymentMethod, PaymentStatus, TicketReason, RequestedAction, TicketStatus, ApprovalSource, EvidenceType, DecisionType, RefundTxStatus, NotificationChannel } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { PRODUCTS_SEED_DATA } from "./seed-data/products";
import { USERS_SEED_DATA } from "./seed-data/customers";
import { ensureSeedAssets } from "../scripts/generate-seed-assets";

const prisma = new PrismaClient();

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function fileSha256(filePath: string): string {
  try {
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(buffer).digest("hex");
  } catch {
    return crypto.createHash("sha256").update(filePath).digest("hex");
  }
}

async function main() {
  console.log("Starting ShopFlow database seed...");

  // 1. Ensure seed asset files exist
  ensureSeedAssets();

  // 2. Clean existing records in reverse dependency order
  console.log("Cleaning database tables...");
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE 
      audit_events,
      integration_events,
      ritos_exchanges,
      idempotency_keys,
      notifications,
      refund_transactions,
      refund_decisions,
      refund_evidence,
      refund_tickets,
      order_items,
      payments,
      orders,
      refund_policies,
      products,
      sessions,
      users
    CASCADE;
  `);

  // Ensure PostgreSQL sequence for ticket IDs exists and set to 122
  console.log("Configuring refund ticket sequence...");
  await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS refund_ticket_seq START WITH 1;`);
  await prisma.$executeRawUnsafe(`SELECT setval('refund_ticket_seq', 122, true);`);

  // 3. Seed Users
  console.log("Seeding users...");
  const passwordHash = await bcrypt.hash("Demo@1234", 10);
  for (const u of USERS_SEED_DATA) {
    await prisma.user.create({
      data: {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role as UserRole,
        passwordHash,
        riskMetadata: u.riskMetadata,
        createdAt: daysAgo(u.accountAgeDays),
      },
    });
  }

  // 4. Seed Products and Policies
  console.log("Seeding products & policies...");
  for (const p of PRODUCTS_SEED_DATA) {
    const product = await prisma.product.create({
      data: {
        id: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        brand: p.brand,
        description: p.description,
        specs: p.specs,
        priceMinor: p.priceMinor,
        stock: p.stock,
        imageUrl: p.imageUrl,
        rating: p.rating,
        isDigital: p.isDigital,
        isPersonalized: p.isPersonalized,
        isClearance: p.isClearance,
      },
    });

    await prisma.refundPolicy.create({
      data: {
        productId: product.id,
        version: 1,
        policyType: p.policy.policyType as PolicyType,
        refundPercentage: p.policy.refundPercentage,
        returnWindowDays: p.policy.returnWindowDays,
        openedAllowed: p.policy.openedAllowed,
        requiresUnused: p.policy.requiresUnused,
        defectiveOnly: p.policy.defectiveOnly,
        exchangeOnly: p.policy.exchangeOnly,
        replacementAllowed: p.policy.replacementAllowed,
        returnRequired: p.policy.returnRequired,
        evidenceRequiredReasons: p.policy.evidenceRequiredReasons,
        humanApprovalThresholdMinor: p.policy.humanApprovalThresholdMinor,
        exceptions: p.policy.exceptions,
        returnShipping: p.policy.returnShipping as ReturnShipping,
        verificationRequired: p.policy.verificationRequired as VerificationType,
        notes: p.policy.notes,
      },
    });
  }

  // Pre-fetch product & policy maps for easy lookup
  const policies = await prisma.refundPolicy.findMany({ include: { product: true } });
  const policyMap = new Map(policies.map((p) => [p.productId, p]));

  // Helper to create policy snapshot JSON matching contract 02
  function makeSnapshot(productId: string, takenAt: Date) {
    const pol = policyMap.get(productId)!;
    return {
      policy_version: pol.version,
      policy_type: pol.policyType,
      refund_percentage: pol.refundPercentage,
      return_window_days: pol.returnWindowDays,
      opened_allowed: pol.openedAllowed,
      requires_unused: pol.requiresUnused,
      defective_only: pol.defectiveOnly,
      exchangeOnly: pol.exchangeOnly,
      replacement_allowed: pol.replacementAllowed,
      return_required: pol.returnRequired,
      return_shipping: pol.returnShipping,
      verification_required: pol.verificationRequired,
      evidence_required_reasons: pol.evidenceRequiredReasons,
      human_approval_threshold_minor: pol.humanApprovalThresholdMinor,
      exceptions: pol.exceptions,
      snapshot_taken_at: takenAt.toISOString(),
    };
  }

  console.log("Seeding orders, payments, tickets, decisions, and history...");

  // -------------------------------------------------------------
  // Order Seed Helper
  // -------------------------------------------------------------
  async function createOrderWithItem({
    orderId,
    customerId,
    productId,
    quantity,
    status,
    deliveryStatus,
    orderedDaysAgo,
    deliveredDaysAgo,
    transactionId,
    paymentMethod = "UPI" as PaymentMethod,
    unitSerial = null as string | null,
  }: {
    orderId: string;
    customerId: string;
    productId: string;
    quantity: number;
    status: OrderStatus;
    deliveryStatus: string;
    orderedDaysAgo: number;
    deliveredDaysAgo?: number;
    transactionId: string;
    paymentMethod?: PaymentMethod;
    unitSerial?: string | null;
  }) {
    const user = USERS_SEED_DATA.find((u) => u.id === customerId)!;
    const prod = PRODUCTS_SEED_DATA.find((p) => p.id === productId)!;
    const totalMinor = prod.priceMinor * quantity;
    const orderedAt = daysAgo(orderedDaysAgo);
    const deliveredAt = deliveredDaysAgo !== undefined ? daysAgo(deliveredDaysAgo) : null;

    const order = await prisma.order.create({
      data: {
        id: orderId,
        customerId,
        status,
        totalMinor,
        currency: "INR",
        shippingAddress: user.address,
        orderedAt,
        deliveredAt,
        deliveryStatus,
      },
    });

    const item = await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId,
        quantity,
        unitPriceMinor: prod.priceMinor,
        unitSerial,
      },
    });

    const payment = await prisma.payment.create({
      data: {
        id: `PAY-${transactionId.replace("TXN-", "")}`,
        orderId: order.id,
        transactionId,
        method: paymentMethod,
        status: PaymentStatus.PAID,
        amountMinor: totalMinor,
        paidAt: orderedAt,
      },
    });

    return { order, item, payment };
  }

  // -------------------------------------------------------------
  // Ticket Seed Helper
  // -------------------------------------------------------------
  async function createTicketWithArtifacts({
    ticketId,
    customerId,
    orderId,
    orderItemId,
    productId,
    transactionId,
    reason,
    description,
    requestedAction,
    requestedAmountMinor,
    status,
    approvalSource = null as ApprovalSource | null,
    createdDaysAgo,
    evidenceFile = null as string | null,
    decision = null as {
      type: DecisionType;
      percentage: number;
      amountMinor: number;
      reason: string;
      confidence: number;
      processedBy: string;
      requiresHumanReview: boolean;
      agentTrace?: any;
    } | null,
    refundTx = null as {
      refundId: string;
      amountMinor: number;
      status: RefundTxStatus;
      idempotencyKey: string;
    } | null,
  }: {
    ticketId: string;
    customerId: string;
    orderId: string;
    orderItemId: string;
    productId: string;
    transactionId: string;
    reason: TicketReason;
    description: string;
    requestedAction: RequestedAction;
    requestedAmountMinor: number;
    status: TicketStatus;
    approvalSource?: ApprovalSource | null;
    createdDaysAgo: number;
    evidenceFile?: string | null;
    decision?: {
      type: DecisionType;
      percentage: number;
      amountMinor: number;
      reason: string;
      confidence: number;
      processedBy: string;
      requiresHumanReview: boolean;
      agentTrace?: any;
    } | null;
    refundTx?: {
      refundId: string;
      amountMinor: number;
      status: RefundTxStatus;
      idempotencyKey: string;
    } | null;
  }) {
    const createdAt = daysAgo(createdDaysAgo);
    const snapshot = makeSnapshot(productId, createdAt);

    const ticket = await prisma.refundTicket.create({
      data: {
        id: ticketId,
        customerId,
        orderId,
        orderItemId,
        productId,
        transactionId,
        reason,
        description,
        requestedAction,
        requestedAmountMinor,
        status,
        approvalSource,
        policySnapshot: snapshot,
        createdAt,
        updatedAt: createdAt,
      },
    });

    // Evidence
    if (evidenceFile) {
      const fullPath = path.join(process.cwd(), "uploads", "seed", evidenceFile);
      const sha = fileSha256(fullPath);
      await prisma.refundEvidence.create({
        data: {
          id: `EVD-${ticketId.replace("RIT-2026-", "")}`,
          ticketId: ticket.id,
          type: EvidenceType.IMAGE,
          filename: evidenceFile,
          storedPath: fullPath,
          mime: "image/jpeg",
          sizeBytes: 184233,
          sha256: sha,
          uploadedAt: createdAt,
        },
      });
    }

    // Audit Event: Creation
    await prisma.auditEvent.create({
      data: {
        entityType: "REFUND_TICKET",
        entityId: ticket.id,
        event: "TICKET_CREATED",
        actor: customerId,
        payload: {
          reason,
          requested_action: requestedAction,
          amount_minor: requestedAmountMinor,
          evidence_present: !!evidenceFile,
        },
        createdAt,
      },
    });

    // Decision
    if (decision) {
      const decTime = new Date(createdAt.getTime() + 60 * 1000); // 1 min after creation
      await prisma.refundDecision.create({
        data: {
          id: `DEC-${ticketId.replace("RIT-2026-", "")}`,
          ticketId: ticket.id,
          decision: decision.type,
          refundPercentage: decision.percentage,
          refundAmountMinor: decision.amountMinor,
          reason: decision.reason,
          confidenceScore: decision.confidence,
          processedBy: decision.processedBy,
          requiresHumanReview: decision.requiresHumanReview,
          agentTrace: decision.agentTrace || {},
          createdAt: decTime,
        },
      });

      await prisma.auditEvent.create({
        data: {
          entityType: "REFUND_TICKET",
          entityId: ticket.id,
          event: "DECISION_RECORDED",
          actor: decision.processedBy,
          payload: {
            decision: decision.type,
            amount_minor: decision.amountMinor,
            confidence: decision.confidence,
            reason: decision.reason,
          },
          createdAt: decTime,
        },
      });
    }

    // Refund Transaction
    if (refundTx) {
      const txTime = new Date(createdAt.getTime() + 120 * 1000); // 2 mins after creation
      await prisma.refundTransaction.create({
        data: {
          id: refundTx.refundId,
          ticketId: ticket.id,
          transactionId,
          amountMinor: refundTx.amountMinor,
          status: refundTx.status,
          idempotencyKey: refundTx.idempotencyKey,
          settleAt: txTime,
          createdAt: txTime,
        },
      });

      await prisma.auditEvent.create({
        data: {
          entityType: "REFUND_TICKET",
          entityId: ticket.id,
          event: "REFUND_EXECUTED",
          actor: "PAYMENT_GATEWAY",
          payload: {
            refund_id: refundTx.refundId,
            amount_minor: refundTx.amountMinor,
            status: refundTx.status,
          },
          createdAt: txTime,
        },
      });

      // Customer Notification
      await prisma.notification.create({
        data: {
          userId: customerId,
          ticketId: ticket.id,
          channel: NotificationChannel.IN_APP,
          title: "Refund Processed",
          body: `₹${(refundTx.amountMinor / 100).toLocaleString("en-IN")} refund completed successfully for ticket ${ticket.id}.`,
          createdAt: txTime,
        },
      });
    }

    // Outbox Event for Pending Tickets
    if (status === TicketStatus.PENDING_RITOS) {
      await prisma.integrationEvent.create({
        data: {
          eventType: "refund.ticket.created",
          ticketId: ticket.id,
          payload: {
            ticket_id: ticket.id,
            customer_id: customerId,
            occurred_at: createdAt.toISOString(),
          },
          status: "PENDING",
          createdAt,
        },
      });
    }

    return ticket;
  }

  // =============================================================
  // Historical Completed & Rejected Tickets (000090 - 000099)
  // =============================================================

  // 000090: CUS-10001, PROD-013, ₹2,299, REFUNDED (70d ago)
  const o90 = await createOrderWithItem({
    orderId: "ORD-10100",
    customerId: "CUS-10001",
    productId: "PROD-013",
    quantity: 1,
    status: OrderStatus.DELIVERED,
    deliveryStatus: "DELIVERED",
    orderedDaysAgo: 75,
    deliveredDaysAgo: 72,
    transactionId: "TXN-884090",
  });
  await createTicketWithArtifacts({
    ticketId: "RIT-2026-000090",
    customerId: "CUS-10001",
    orderId: o90.order.id,
    orderItemId: o90.item.id,
    productId: "PROD-013",
    transactionId: o90.payment.transactionId,
    reason: TicketReason.PRODUCT_DAMAGED,
    description: "Gaming mouse scroll wheel arrived unaligned.",
    requestedAction: RequestedAction.FULL_REFUND,
    requestedAmountMinor: 229900,
    status: TicketStatus.REFUNDED,
    approvalSource: ApprovalSource.AUTO,
    createdDaysAgo: 70,
    evidenceFile: "damage-headphones.jpg",
    decision: {
      type: DecisionType.APPROVED,
      percentage: 100,
      amountMinor: 229900,
      reason: "Damaged item within return window with valid evidence.",
      confidence: 0.96,
      processedBy: "RITOS",
      requiresHumanReview: false,
    },
    refundTx: {
      refundId: "REF-90001",
      amountMinor: 229900,
      status: RefundTxStatus.SUCCESS,
      idempotencyKey: "idem-hist-000090",
    },
  });

  // 000091: CUS-10004, PROD-001, ₹2,999, REFUNDED (120d ago)
  const o91 = await createOrderWithItem({
    orderId: "ORD-10101",
    customerId: "CUS-10004",
    productId: "PROD-001",
    quantity: 1,
    status: OrderStatus.DELIVERED,
    deliveryStatus: "DELIVERED",
    orderedDaysAgo: 130,
    deliveredDaysAgo: 125,
    transactionId: "TXN-884091",
  });
  await createTicketWithArtifacts({
    ticketId: "RIT-2026-000091",
    customerId: "CUS-10004",
    orderId: o91.order.id,
    orderItemId: o91.item.id,
    productId: "PROD-001",
    transactionId: o91.payment.transactionId,
    reason: TicketReason.WRONG_PRODUCT,
    description: "Received black headphones instead of white.",
    requestedAction: RequestedAction.FULL_REFUND,
    requestedAmountMinor: 299900,
    status: TicketStatus.REFUNDED,
    approvalSource: ApprovalSource.AUTO,
    createdDaysAgo: 120,
    evidenceFile: "damage-headphones.jpg",
    decision: {
      type: DecisionType.APPROVED,
      percentage: 100,
      amountMinor: 299900,
      reason: "Wrong product received with image proof.",
      confidence: 0.97,
      processedBy: "RITOS",
      requiresHumanReview: false,
    },
    refundTx: {
      refundId: "REF-90002",
      amountMinor: 299900,
      status: RefundTxStatus.SUCCESS,
      idempotencyKey: "idem-hist-000091",
    },
  });

  // 000092: CUS-10004, PROD-006, ₹1,299, REFUNDED (50d ago)
  const o92 = await createOrderWithItem({
    orderId: "ORD-10102",
    customerId: "CUS-10004",
    productId: "PROD-006",
    quantity: 1,
    status: OrderStatus.DELIVERED,
    deliveryStatus: "DELIVERED",
    orderedDaysAgo: 60,
    deliveredDaysAgo: 55,
    transactionId: "TXN-884092",
  });
  await createTicketWithArtifacts({
    ticketId: "RIT-2026-000092",
    customerId: "CUS-10004",
    orderId: o92.order.id,
    orderItemId: o92.item.id,
    productId: "PROD-006",
    transactionId: o92.payment.transactionId,
    reason: TicketReason.PRODUCT_DEFECTIVE,
    description: "One bulb does not power on.",
    requestedAction: RequestedAction.FULL_REFUND,
    requestedAmountMinor: 129900,
    status: TicketStatus.REFUNDED,
    approvalSource: ApprovalSource.AUTO,
    createdDaysAgo: 50,
    decision: {
      type: DecisionType.APPROVED,
      percentage: 100,
      amountMinor: 129900,
      reason: "Smart bulb policy covers defects without mandatory evidence.",
      confidence: 0.95,
      processedBy: "RITOS",
      requiresHumanReview: false,
    },
    refundTx: {
      refundId: "REF-90003",
      amountMinor: 129900,
      status: RefundTxStatus.SUCCESS,
      idempotencyKey: "idem-hist-000092",
    },
  });

  // 000093: CUS-10002, PROD-005, ₹3,599 (90% partial), REFUNDED (80d ago)
  const o93 = await createOrderWithItem({
    orderId: "ORD-10103",
    customerId: "CUS-10002",
    productId: "PROD-005",
    quantity: 1,
    status: OrderStatus.DELIVERED,
    deliveryStatus: "DELIVERED",
    orderedDaysAgo: 90,
    deliveredDaysAgo: 85,
    transactionId: "TXN-884093",
  });
  await createTicketWithArtifacts({
    ticketId: "RIT-2026-000093",
    customerId: "CUS-10002",
    orderId: o93.order.id,
    orderItemId: o93.item.id,
    productId: "PROD-005",
    transactionId: o93.payment.transactionId,
    reason: TicketReason.PRODUCT_DEFECTIVE,
    description: "Carafe heating element stopped working.",
    requestedAction: RequestedAction.FULL_REFUND,
    requestedAmountMinor: 399900,
    status: TicketStatus.REFUNDED,
    approvalSource: ApprovalSource.AUTO,
    createdDaysAgo: 80,
    evidenceFile: "coffee-maker-crack.jpg",
    decision: {
      type: DecisionType.PARTIALLY_APPROVED,
      percentage: 90,
      amountMinor: 359900,
      reason: "Standard 90% refund policy applied for home appliances.",
      confidence: 0.93,
      processedBy: "RITOS",
      requiresHumanReview: false,
    },
    refundTx: {
      refundId: "REF-90004",
      amountMinor: 359900,
      status: RefundTxStatus.SUCCESS,
      idempotencyKey: "idem-hist-000093",
    },
  });

  // 000094: CUS-10009, PROD-007, ₹1,799, REFUNDED (8d ago)
  const o94 = await createOrderWithItem({
    orderId: "ORD-10104",
    customerId: "CUS-10009",
    productId: "PROD-007",
    quantity: 1,
    status: OrderStatus.DELIVERED,
    deliveryStatus: "DELIVERED",
    orderedDaysAgo: 11,
    deliveredDaysAgo: 9,
    transactionId: "TXN-884094",
  });
  await createTicketWithArtifacts({
    ticketId: "RIT-2026-000094",
    customerId: "CUS-10009",
    orderId: o94.order.id,
    orderItemId: o94.item.id,
    productId: "PROD-007",
    transactionId: o94.payment.transactionId,
    reason: TicketReason.PRODUCT_DEFECTIVE,
    description: "Power bank not holding charge.",
    requestedAction: RequestedAction.FULL_REFUND,
    requestedAmountMinor: 179900,
    status: TicketStatus.REFUNDED,
    approvalSource: ApprovalSource.AUTO,
    createdDaysAgo: 8,
    decision: {
      type: DecisionType.APPROVED,
      percentage: 100,
      amountMinor: 179900,
      reason: "DOA exception honored.",
      confidence: 0.92,
      processedBy: "RITOS",
      requiresHumanReview: false,
    },
    refundTx: {
      refundId: "REF-90005",
      amountMinor: 179900,
      status: RefundTxStatus.SUCCESS,
      idempotencyKey: "idem-hist-000094",
    },
  });

  // 000095: CUS-10009, PROD-010, ₹1,499, REFUNDED (6d ago)
  const o95 = await createOrderWithItem({
    orderId: "ORD-10105",
    customerId: "CUS-10009",
    productId: "PROD-010",
    quantity: 1,
    status: OrderStatus.DELIVERED,
    deliveryStatus: "DELIVERED",
    orderedDaysAgo: 10,
    deliveredDaysAgo: 7,
    transactionId: "TXN-884095",
  });
  await createTicketWithArtifacts({
    ticketId: "RIT-2026-000095",
    customerId: "CUS-10009",
    orderId: o95.order.id,
    orderItemId: o95.item.id,
    productId: "PROD-010",
    transactionId: o95.payment.transactionId,
    reason: TicketReason.PRODUCT_DEFECTIVE,
    description: "Clearance speaker speaker cone distorted.",
    requestedAction: RequestedAction.FULL_REFUND,
    requestedAmountMinor: 149900,
    status: TicketStatus.REFUNDED,
    approvalSource: ApprovalSource.HUMAN,
    createdDaysAgo: 6,
    evidenceFile: "broken-box.jpg",
    decision: {
      type: DecisionType.APPROVED,
      percentage: 100,
      amountMinor: 149900,
      reason: "Support analyst approved refund on verified defective clearance item.",
      confidence: 0.88,
      processedBy: "HUMAN:STF-SUPPORT-01",
      requiresHumanReview: true,
    },
    refundTx: {
      refundId: "REF-90006",
      amountMinor: 149900,
      status: RefundTxStatus.SUCCESS,
      idempotencyKey: "idem-hist-000095",
    },
  });

  // 000096: CUS-10003, PROD-008, ₹2,499, REJECTED (40d ago)
  const o96 = await createOrderWithItem({
    orderId: "ORD-10106",
    customerId: "CUS-10003",
    productId: "PROD-008",
    quantity: 1,
    status: OrderStatus.DELIVERED,
    deliveryStatus: "DELIVERED",
    orderedDaysAgo: 45,
    deliveredDaysAgo: 42,
    transactionId: "TXN-884096",
  });
  await createTicketWithArtifacts({
    ticketId: "RIT-2026-000096",
    customerId: "CUS-10003",
    orderId: o96.order.id,
    orderItemId: o96.item.id,
    productId: "PROD-008",
    transactionId: o96.payment.transactionId,
    reason: TicketReason.CHANGED_MIND,
    description: "I prefer a different color.",
    requestedAction: RequestedAction.FULL_REFUND,
    requestedAmountMinor: 249900,
    status: TicketStatus.REJECTED,
    createdDaysAgo: 40,
    decision: {
      type: DecisionType.REJECTED,
      percentage: 0,
      amountMinor: 0,
      reason: "Custom personalized item cannot be returned for change of mind.",
      confidence: 0.98,
      processedBy: "RITOS",
      requiresHumanReview: false,
    },
  });

  // 000097: CUS-10007, PROD-014, ₹18,999, REFUNDED (12d ago, duplicate scenario sibling of 000120)
  const o97 = await createOrderWithItem({
    orderId: "ORD-10260",
    customerId: "CUS-10007",
    productId: "PROD-014",
    quantity: 1,
    status: OrderStatus.DELIVERED,
    deliveryStatus: "DELIVERED",
    orderedDaysAgo: 16,
    deliveredDaysAgo: 14,
    transactionId: "TXN-884097",
  });
  await createTicketWithArtifacts({
    ticketId: "RIT-2026-000097",
    customerId: "CUS-10007",
    orderId: o97.order.id,
    orderItemId: o97.item.id,
    productId: "PROD-014",
    transactionId: o97.payment.transactionId,
    reason: TicketReason.PRODUCT_DAMAGED,
    description: "Display panel has cracked corner.",
    requestedAction: RequestedAction.FULL_REFUND,
    requestedAmountMinor: 1899900,
    status: TicketStatus.REFUNDED,
    approvalSource: ApprovalSource.AUTO,
    createdDaysAgo: 12,
    evidenceFile: "dead-pixels.jpg",
    decision: {
      type: DecisionType.APPROVED,
      percentage: 100,
      amountMinor: 1899900,
      reason: "Damaged monitor verified via photo within 10d return window.",
      confidence: 0.94,
      processedBy: "RITOS",
      requiresHumanReview: false,
    },
    refundTx: {
      refundId: "REF-90007",
      amountMinor: 1899900,
      status: RefundTxStatus.SUCCESS,
      idempotencyKey: "idem-hist-000097",
    },
  });

  // 000098: CUS-10005, PROD-011, ₹8,999, REJECTED (30d ago)
  const o98 = await createOrderWithItem({
    orderId: "ORD-10108",
    customerId: "CUS-10005",
    productId: "PROD-011",
    quantity: 1,
    status: OrderStatus.DELIVERED,
    deliveryStatus: "DELIVERED",
    orderedDaysAgo: 45,
    deliveredDaysAgo: 40,
    transactionId: "TXN-884098",
  });
  await createTicketWithArtifacts({
    ticketId: "RIT-2026-000098",
    customerId: "CUS-10005",
    orderId: o98.order.id,
    orderItemId: o98.item.id,
    productId: "PROD-011",
    transactionId: o98.payment.transactionId,
    reason: TicketReason.CHANGED_MIND,
    description: "Did not like the watch straps.",
    requestedAction: RequestedAction.FULL_REFUND,
    requestedAmountMinor: 899900,
    status: TicketStatus.REJECTED,
    createdDaysAgo: 30,
    decision: {
      type: DecisionType.REJECTED,
      percentage: 0,
      amountMinor: 0,
      reason: "Claim filed 10 days after delivery; exceeds 7-day return window.",
      confidence: 0.99,
      processedBy: "RITOS",
      requiresHumanReview: false,
    },
  });

  // 000099: CUS-10009, PROD-004, ₹4,499, REJECTED (4d ago)
  const o99 = await createOrderWithItem({
    orderId: "ORD-10109",
    customerId: "CUS-10009",
    productId: "PROD-004",
    quantity: 1,
    status: OrderStatus.DELIVERED,
    deliveryStatus: "DELIVERED",
    orderedDaysAgo: 8,
    deliveredDaysAgo: 6,
    transactionId: "TXN-884099",
  });
  await createTicketWithArtifacts({
    ticketId: "RIT-2026-000099",
    customerId: "CUS-10009",
    orderId: o99.order.id,
    orderItemId: o99.item.id,
    productId: "PROD-004",
    transactionId: o99.payment.transactionId,
    reason: TicketReason.CHANGED_MIND,
    description: "Shoes worn once outdoors.",
    requestedAction: RequestedAction.FULL_REFUND,
    requestedAmountMinor: 449900,
    status: TicketStatus.REJECTED,
    createdDaysAgo: 4,
    decision: {
      type: DecisionType.REJECTED,
      percentage: 0,
      amountMinor: 0,
      reason: "Footwear policy explicitly requires unused condition.",
      confidence: 0.97,
      processedBy: "RITOS",
      requiresHumanReview: false,
    },
  });

  // 000101: CUS-10001, PROD-001, REFUNDED (matches 02 primary context related_tickets example)
  // Belongs to ORD-10099
  const o101 = await createOrderWithItem({
    orderId: "ORD-10099",
    customerId: "CUS-10001",
    productId: "PROD-001",
    quantity: 1,
    status: OrderStatus.DELIVERED,
    deliveryStatus: "DELIVERED",
    orderedDaysAgo: 30,
    deliveredDaysAgo: 26,
    transactionId: "TXN-884101",
  });
  await createTicketWithArtifacts({
    ticketId: "RIT-2026-000101",
    customerId: "CUS-10001",
    orderId: o101.order.id,
    orderItemId: o101.item.id,
    productId: "PROD-001",
    transactionId: o101.payment.transactionId,
    reason: TicketReason.PRODUCT_DEFECTIVE,
    description: "Bluetooth pairing issues.",
    requestedAction: RequestedAction.FULL_REFUND,
    requestedAmountMinor: 299900,
    status: TicketStatus.REFUNDED,
    approvalSource: ApprovalSource.AUTO,
    createdDaysAgo: 25,
    decision: {
      type: DecisionType.APPROVED,
      percentage: 100,
      amountMinor: 299900,
      reason: "Approved within 30-day window.",
      confidence: 0.96,
      processedBy: "RITOS",
      requiresHumanReview: false,
    },
    refundTx: {
      refundId: "REF-90101",
      amountMinor: 299900,
      status: RefundTxStatus.SUCCESS,
      idempotencyKey: "idem-hist-000101",
    },
  });

  // 000111: Sibling of Scenario 7, REFUNDED (8d ago, same transaction TXN-884111)
  const o111 = await createOrderWithItem({
    orderId: "ORD-10250",
    customerId: "CUS-10006",
    productId: "PROD-013",
    quantity: 1,
    status: OrderStatus.DELIVERED,
    deliveryStatus: "DELIVERED",
    orderedDaysAgo: 12,
    deliveredDaysAgo: 8,
    transactionId: "TXN-884111",
  });
  await createTicketWithArtifacts({
    ticketId: "RIT-2026-000111",
    customerId: "CUS-10006",
    orderId: o111.order.id,
    orderItemId: o111.item.id,
    productId: "PROD-013",
    transactionId: o111.payment.transactionId,
    reason: TicketReason.PRODUCT_DEFECTIVE,
    description: "Mouse sensor skipping.",
    requestedAction: RequestedAction.FULL_REFUND,
    requestedAmountMinor: 229900,
    status: TicketStatus.REFUNDED,
    approvalSource: ApprovalSource.AUTO,
    createdDaysAgo: 7,
    evidenceFile: "broken-box.jpg",
    decision: {
      type: DecisionType.APPROVED,
      percentage: 100,
      amountMinor: 229900,
      reason: "First claim approved under warranty.",
      confidence: 0.95,
      processedBy: "RITOS",
      requiresHumanReview: false,
    },
    refundTx: {
      refundId: "REF-90111",
      amountMinor: 229900,
      status: RefundTxStatus.SUCCESS,
      idempotencyKey: "idem-hist-000111",
    },
  });

  // 000117: CUS-10009, 5th ticket in 14 days, HUMAN_REVIEW (1d ago)
  const o117 = await createOrderWithItem({
    orderId: "ORD-10117",
    customerId: "CUS-10009",
    productId: "PROD-006",
    quantity: 1,
    status: OrderStatus.DELIVERED,
    deliveryStatus: "DELIVERED",
    orderedDaysAgo: 3,
    deliveredDaysAgo: 2,
    transactionId: "TXN-884117",
  });
  await createTicketWithArtifacts({
    ticketId: "RIT-2026-000117",
    customerId: "CUS-10009",
    orderId: o117.order.id,
    orderItemId: o117.item.id,
    productId: "PROD-006",
    transactionId: o117.payment.transactionId,
    reason: TicketReason.PRODUCT_DAMAGED,
    description: "Bulb broken.",
    requestedAction: RequestedAction.FULL_REFUND,
    requestedAmountMinor: 129900,
    status: TicketStatus.HUMAN_REVIEW,
    createdDaysAgo: 1,
    decision: {
      type: DecisionType.HUMAN_REVIEW,
      percentage: 0,
      amountMinor: 0,
      reason: "High refund velocity customer flagged for manual review.",
      confidence: 0.40,
      processedBy: "RITOS",
      requiresHumanReview: true,
    },
  });

  // 000120: Sibling of 000097, PENDING_RITOS on same transaction TXN-884097
  await createTicketWithArtifacts({
    ticketId: "RIT-2026-000120",
    customerId: "CUS-10007",
    orderId: o97.order.id,
    orderItemId: o97.item.id,
    productId: "PROD-014",
    transactionId: o97.payment.transactionId,
    reason: TicketReason.PRODUCT_DEFECTIVE,
    description: "Duplicate request for same monitor replacement.",
    requestedAction: RequestedAction.FULL_REFUND,
    requestedAmountMinor: 1899900,
    status: TicketStatus.PENDING_RITOS,
    createdDaysAgo: 1,
  });

  // =============================================================
  // The 10 Primary Required Scenarios (000100 through 000118)
  // All seeded as PENDING_RITOS as inputs for evaluation
  // =============================================================

  // Scenario 1: RIT-2026-000100 (CUS-10001, PROD-001, delivered 4d ago, 299900 paise)
  // Matches Primary Context Example in doc 02! ORD-10291, TXN-884321
  const s1 = await createOrderWithItem({
    orderId: "ORD-10291",
    customerId: "CUS-10001",
    productId: "PROD-001",
    quantity: 1,
    status: OrderStatus.DELIVERED,
    deliveryStatus: "DELIVERED",
    orderedDaysAgo: 10,
    deliveredDaysAgo: 4,
    transactionId: "TXN-884321",
  });
  await createTicketWithArtifacts({
    ticketId: "RIT-2026-000100",
    customerId: "CUS-10001",
    orderId: s1.order.id,
    orderItemId: s1.item.id,
    productId: "PROD-001",
    transactionId: s1.payment.transactionId,
    reason: TicketReason.PRODUCT_DAMAGED,
    description: "The left ear cup arrived cracked.",
    requestedAction: RequestedAction.FULL_REFUND,
    requestedAmountMinor: 299900,
    status: TicketStatus.PENDING_RITOS,
    createdDaysAgo: 0,
    evidenceFile: "damage-headphones.jpg",
  });

  // Scenario 2: RIT-2026-000102 (CUS-10002, PROD-005, delivered 6d ago, 399900 paise)
  const s2 = await createOrderWithItem({
    orderId: "ORD-10202",
    customerId: "CUS-10002",
    productId: "PROD-005",
    quantity: 1,
    status: OrderStatus.DELIVERED,
    deliveryStatus: "DELIVERED",
    orderedDaysAgo: 10,
    deliveredDaysAgo: 6,
    transactionId: "TXN-884202",
  });
  await createTicketWithArtifacts({
    ticketId: "RIT-2026-000102",
    customerId: "CUS-10002",
    orderId: s2.order.id,
    orderItemId: s2.item.id,
    productId: "PROD-005",
    transactionId: s2.payment.transactionId,
    reason: TicketReason.PRODUCT_DEFECTIVE,
    description: "Brewing element does not heat water properly.",
    requestedAction: RequestedAction.FULL_REFUND,
    requestedAmountMinor: 399900,
    status: TicketStatus.PENDING_RITOS,
    createdDaysAgo: 0,
    evidenceFile: "coffee-maker-crack.jpg",
  });

  // Scenario 3: RIT-2026-000104 (CUS-10003, PROD-008, delivered 5d ago, 249900 paise)
  const s3 = await createOrderWithItem({
    orderId: "ORD-10203",
    customerId: "CUS-10003",
    productId: "PROD-008",
    quantity: 1,
    status: OrderStatus.DELIVERED,
    deliveryStatus: "DELIVERED",
    orderedDaysAgo: 8,
    deliveredDaysAgo: 5,
    transactionId: "TXN-884203",
  });
  await createTicketWithArtifacts({
    ticketId: "RIT-2026-000104",
    customerId: "CUS-10003",
    orderId: s3.order.id,
    orderItemId: s3.item.id,
    productId: "PROD-008",
    transactionId: s3.payment.transactionId,
    reason: TicketReason.CHANGED_MIND,
    description: "Decided I do not want personalized initials anymore.",
    requestedAction: RequestedAction.FULL_REFUND,
    requestedAmountMinor: 249900,
    status: TicketStatus.PENDING_RITOS,
    createdDaysAgo: 0,
  });

  // Scenario 4: RIT-2026-000106 (CUS-10004, PROD-004, delivered 45d ago, 449900 paise)
  const s4 = await createOrderWithItem({
    orderId: "ORD-10204",
    customerId: "CUS-10004",
    productId: "PROD-004",
    quantity: 1,
    status: OrderStatus.DELIVERED,
    deliveryStatus: "DELIVERED",
    orderedDaysAgo: 50,
    deliveredDaysAgo: 45,
    transactionId: "TXN-884204",
  });
  await createTicketWithArtifacts({
    ticketId: "RIT-2026-000106",
    customerId: "CUS-10004",
    orderId: s4.order.id,
    orderItemId: s4.item.id,
    productId: "PROD-004",
    transactionId: s4.payment.transactionId,
    reason: TicketReason.CHANGED_MIND,
    description: "Changed my mind about these running shoes.",
    requestedAction: RequestedAction.FULL_REFUND,
    requestedAmountMinor: 449900,
    status: TicketStatus.PENDING_RITOS,
    createdDaysAgo: 0,
  });

  // Scenario 5: RIT-2026-000108 (CUS-10007, PROD-003, delivered 3d ago, ₹68,999)
  const s5 = await createOrderWithItem({
    orderId: "ORD-10205",
    customerId: "CUS-10007",
    productId: "PROD-003",
    quantity: 1,
    status: OrderStatus.DELIVERED,
    deliveryStatus: "DELIVERED",
    orderedDaysAgo: 6,
    deliveredDaysAgo: 3,
    transactionId: "TXN-884205",
    unitSerial: "ATLAS-SN-998822",
  });
  await createTicketWithArtifacts({
    ticketId: "RIT-2026-000108",
    customerId: "CUS-10007",
    orderId: s5.order.id,
    orderItemId: s5.item.id,
    productId: "PROD-003",
    transactionId: s5.payment.transactionId,
    reason: TicketReason.PRODUCT_DEFECTIVE,
    description: "Internal screen flickering intermittently.",
    requestedAction: RequestedAction.FULL_REFUND,
    requestedAmountMinor: 6899900,
    status: TicketStatus.PENDING_RITOS,
    createdDaysAgo: 0,
    evidenceFile: "laptop-screen.jpg",
  });

  // Scenario 6: RIT-2026-000110 (CUS-10005, PROD-002, delivered 5d ago, ₹32,999, NO EVIDENCE)
  const s6 = await createOrderWithItem({
    orderId: "ORD-10206",
    customerId: "CUS-10005",
    productId: "PROD-002",
    quantity: 1,
    status: OrderStatus.DELIVERED,
    deliveryStatus: "DELIVERED",
    orderedDaysAgo: 8,
    deliveredDaysAgo: 5,
    transactionId: "TXN-884206",
    unitSerial: "IMEI-358912049182301",
  });
  await createTicketWithArtifacts({
    ticketId: "RIT-2026-000110",
    customerId: "CUS-10005",
    orderId: s6.order.id,
    orderItemId: s6.item.id,
    productId: "PROD-002",
    transactionId: s6.payment.transactionId,
    reason: TicketReason.PRODUCT_DAMAGED,
    description: "Phone body arrived with severe dent.",
    requestedAction: RequestedAction.FULL_REFUND,
    requestedAmountMinor: 3299900,
    status: TicketStatus.PENDING_RITOS,
    createdDaysAgo: 0,
    evidenceFile: null, // Intentionally no evidence!
  });

  // Scenario 7: RIT-2026-000112 (CUS-10006, PROD-013, same transaction TXN-884111 as 000111)
  await createTicketWithArtifacts({
    ticketId: "RIT-2026-000112",
    customerId: "CUS-10006",
    orderId: o111.order.id,
    orderItemId: o111.item.id,
    productId: "PROD-013",
    transactionId: o111.payment.transactionId,
    reason: TicketReason.PRODUCT_DEFECTIVE,
    description: "Mouse still defective, raising second ticket.",
    requestedAction: RequestedAction.FULL_REFUND,
    requestedAmountMinor: 229900,
    status: TicketStatus.PENDING_RITOS,
    createdDaysAgo: 0,
  });

  // Scenario 8: RIT-2026-000114 (CUS-10008, PROD-006, DELIVERED order, reason ORDER_NEVER_ARRIVED)
  const s8 = await createOrderWithItem({
    orderId: "ORD-10208",
    customerId: "CUS-10008",
    productId: "PROD-006",
    quantity: 1,
    status: OrderStatus.DELIVERED,
    deliveryStatus: "DELIVERED",
    orderedDaysAgo: 5,
    deliveredDaysAgo: 2,
    transactionId: "TXN-884208",
  });
  await createTicketWithArtifacts({
    ticketId: "RIT-2026-000114",
    customerId: "CUS-10008",
    orderId: s8.order.id,
    orderItemId: s8.item.id,
    productId: "PROD-006",
    transactionId: s8.payment.transactionId,
    reason: TicketReason.ORDER_NEVER_ARRIVED,
    description: "Package was not received at my address.",
    requestedAction: RequestedAction.FULL_REFUND,
    requestedAmountMinor: 129900,
    status: TicketStatus.PENDING_RITOS,
    createdDaysAgo: 0,
  });

  // Scenario 9: RIT-2026-000116 (CUS-10009, PROD-011, delivered 2d ago, account 12d old, no evidence)
  const s9 = await createOrderWithItem({
    orderId: "ORD-10209",
    customerId: "CUS-10009",
    productId: "PROD-011",
    quantity: 1,
    status: OrderStatus.DELIVERED,
    deliveryStatus: "DELIVERED",
    orderedDaysAgo: 4,
    deliveredDaysAgo: 2,
    transactionId: "TXN-884209",
  });
  await createTicketWithArtifacts({
    ticketId: "RIT-2026-000116",
    customerId: "CUS-10009",
    orderId: s9.order.id,
    orderItemId: s9.item.id,
    productId: "PROD-011",
    transactionId: s9.payment.transactionId,
    reason: TicketReason.PRODUCT_DEFECTIVE,
    description: "Watch screen does not wake up.",
    requestedAction: RequestedAction.FULL_REFUND,
    requestedAmountMinor: 899900,
    status: TicketStatus.PENDING_RITOS,
    createdDaysAgo: 0,
    evidenceFile: null,
  });

  // Scenario 10: RIT-2026-000118 (CUS-10010, PROD-012, delivered 3d ago, WRONG_PRODUCT, image)
  const s10 = await createOrderWithItem({
    orderId: "ORD-10210",
    customerId: "CUS-10010",
    productId: "PROD-012",
    quantity: 1,
    status: OrderStatus.DELIVERED,
    deliveryStatus: "DELIVERED",
    orderedDaysAgo: 5,
    deliveredDaysAgo: 3,
    transactionId: "TXN-884210",
  });
  await createTicketWithArtifacts({
    ticketId: "RIT-2026-000118",
    customerId: "CUS-10010",
    orderId: s10.order.id,
    orderItemId: s10.item.id,
    productId: "PROD-012",
    transactionId: s10.payment.transactionId,
    reason: TicketReason.WRONG_PRODUCT,
    description: "Received red switches instead of tactile brown switches.",
    requestedAction: RequestedAction.FULL_REFUND,
    requestedAmountMinor: 549900,
    status: TicketStatus.PENDING_RITOS,
    createdDaysAgo: 0,
    evidenceFile: "wrong-keyboard.jpg",
  });

  // =============================================================
  // Additional Orders for Variety (Reach >= 25 orders, spread of statuses)
  // =============================================================
  const extraOrders = [
    { id: "ORD-10301", cus: "CUS-10001", prod: "PROD-007", q: 1, status: OrderStatus.SHIPPED, deliv: "SHIPPED", days: 2, tx: "TXN-885301" },
    { id: "ORD-10302", cus: "CUS-10002", prod: "PROD-013", q: 2, status: OrderStatus.PROCESSING, deliv: "PROCESSING", days: 1, tx: "TXN-885302" },
    { id: "ORD-10303", cus: "CUS-10003", prod: "PROD-006", q: 3, status: OrderStatus.CONFIRMED, deliv: "CONFIRMED", days: 1, tx: "TXN-885303" },
    { id: "ORD-10304", cus: "CUS-10005", prod: "PROD-009", q: 1, status: OrderStatus.DELIVERED, deliv: "DELIVERED", days: 15, delivDays: 15, tx: "TXN-885304" },
    { id: "ORD-10305", cus: "CUS-10007", prod: "PROD-015", q: 1, status: OrderStatus.DELIVERED, deliv: "DELIVERED", days: 20, delivDays: 17, tx: "TXN-885305", serial: "SLATE-SN-554411" },
    { id: "ORD-10306", cus: "CUS-10008", prod: "PROD-010", q: 1, status: OrderStatus.CANCELLED, deliv: "CANCELLED", days: 5, tx: "TXN-885306" },
    { id: "ORD-10307", cus: "CUS-10010", prod: "PROD-004", q: 1, status: OrderStatus.OUT_FOR_DELIVERY, deliv: "OUT_FOR_DELIVERY", days: 3, tx: "TXN-885307" },
  ];

  for (const eo of extraOrders) {
    await createOrderWithItem({
      orderId: eo.id,
      customerId: eo.cus,
      productId: eo.prod,
      quantity: eo.q,
      status: eo.status,
      deliveryStatus: eo.deliv,
      orderedDaysAgo: eo.days,
      deliveredDaysAgo: eo.delivDays,
      transactionId: eo.tx,
      unitSerial: eo.serial || null,
    });
  }

  // Double check sequence state
  const seqRes = await prisma.$queryRawUnsafe<{ next_preview: string }[]>(
    `SELECT 'RIT-2026-' || LPAD((last_value + 1)::text, 6, '0') as next_preview FROM refund_ticket_seq;`
  );
  console.log("Seeding complete!");
  console.log(`Next ticket sequence preview: ${seqRes[0]?.next_preview}`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
