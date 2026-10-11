import { prisma } from "@/server/db";
import { transitionTicket } from "@/server/state-machine/ticket-state-machine";
import { emitOutboxEvent } from "@/server/outbox/outbox-dispatcher";
import { TicketStatus, RefundTxStatus, PaymentStatus } from "@prisma/client";

export interface RefundExecutionParams {
  transaction_id: string;
  amount_minor: number;
  ticket_id: string;
  idempotency_key: string;
}

export async function executeRefundTransaction(params: RefundExecutionParams) {
  const { transaction_id, amount_minor, ticket_id, idempotency_key } = params;

  return prisma.$transaction(async (tx) => {
    // 1. Concurrency-safe lock on the payment row using raw query FOR UPDATE
    const paymentRows = await tx.$queryRawUnsafe<any[]>(
      `SELECT * FROM payments WHERE transaction_id = $1 FOR UPDATE;`,
      transaction_id
    );

    if (!paymentRows || paymentRows.length === 0) {
      throw { status: 404, code: "NOT_FOUND", message: `Transaction ${transaction_id} not found` };
    }

    const payment = paymentRows[0];

    // Check payment status: must be PAID or PARTIALLY_REFUNDED
    if (!["PAID", "PARTIALLY_REFUNDED"].includes(payment.status)) {
      throw { status: 422, code: "PAYMENT_NOT_PAID", message: "Payment is not in PAID or PARTIALLY_REFUNDED status" };
    }

    // 2. Compute existing refunds and remaining refundable
    const existingRefunds = await tx.refundTransaction.findMany({
      where: { transactionId: transaction_id },
    });

    // Check idempotency on same key
    const sameKeyTx = existingRefunds.find((r) => r.idempotencyKey === idempotency_key);
    if (sameKeyTx) {
      return {
        isReplay: true,
        refund: {
          refund_id: sameKeyTx.id,
          status: sameKeyTx.status === "PENDING" ? "SUCCESS" : sameKeyTx.status,
          transaction_id,
          amount_minor: sameKeyTx.amountMinor,
          currency: "INR",
          estimated_credit_time: "2-5 business days",
        },
      };
    }

    // Check duplicate refund: same ticket, different key, while one is SUCCESS or PENDING
    const activeSameTicketRefund = existingRefunds.find(
      (r) => r.ticketId === ticket_id && ["SUCCESS", "PENDING", "PROCESSING"].includes(r.status)
    );
    if (activeSameTicketRefund) {
      throw {
        status: 409,
        code: "DUPLICATE_REFUND",
        message: "A refund has already been issued or is active for this ticket",
        details: { refund_id: activeSameTicketRefund.id },
      };
    }

    const alreadyRefunded = existingRefunds
      .filter((r) => r.status === "SUCCESS")
      .reduce((s, r) => s + r.amountMinor, 0);

    const inFlight = existingRefunds
      .filter((r) => ["PENDING", "PROCESSING"].includes(r.status))
      .reduce((s, r) => s + r.amountMinor, 0);

    const remainingRefundable = Math.max(0, payment.amount_minor - alreadyRefunded - inFlight);

    if (amount_minor > remainingRefundable) {
      throw {
        status: 422,
        code: "AMOUNT_EXCEEDS_REFUNDABLE",
        message: `Requested refund amount ${amount_minor} exceeds remaining refundable balance ${remainingRefundable}`,
        details: { remaining_refundable_minor: remainingRefundable },
      };
    }

    // 3. Check failure simulation flag
    const ticket = await tx.refundTicket.findUnique({ where: { id: ticket_id } });
    if (!ticket) {
      throw { status: 404, code: "NOT_FOUND", message: `Ticket ${ticket_id} not found` };
    }

    if (ticket.simulateRefundFailure) {
      // Record failed transaction attempt and mark ticket FAILED
      const failedRefundId = `REF-${Math.floor(10000 + Math.random() * 90000)}`;
      await tx.refundTransaction.create({
        data: {
          id: failedRefundId,
          ticketId: ticket_id,
          transactionId: transaction_id,
          amountMinor: amount_minor,
          status: RefundTxStatus.FAILED,
          idempotencyKey: idempotency_key,
          failureReason: "Simulated payment provider gateway failure",
        },
      });

      await transitionTicket(
        tx,
        ticket_id,
        TicketStatus.FAILED,
        "PAYMENT_GATEWAY",
        "REFUND_EXECUTION_FAILED",
        { failure_reason: "Simulated payment provider gateway failure" }
      );

      await emitOutboxEvent(tx, "refund.execution.failed", ticket_id, {
        refund_id: failedRefundId,
      });

      throw {
        status: 502,
        code: "FAILED",
        message: "Payment gateway declined refund transaction (simulated failure)",
        details: { refund_id: failedRefundId },
      };
    }

    // 4. Success path: create refund transaction
    const refundId = `REF-${Math.floor(10000 + Math.random() * 90000)}`;
    const mockSettleMs = process.env.MOCK_SETTLE_MS ? parseInt(process.env.MOCK_SETTLE_MS, 10) : 3000;
    const settleAt = new Date(Date.now() + mockSettleMs);

    const createdRefund = await tx.refundTransaction.create({
      data: {
        id: refundId,
        ticketId: ticket_id,
        transactionId: transaction_id,
        amountMinor: amount_minor,
        status: mockSettleMs === 0 ? RefundTxStatus.SUCCESS : RefundTxStatus.PENDING,
        idempotencyKey: idempotency_key,
        settleAt: settleAt,
      },
    });

    // Update payment status (PARTIALLY_REFUNDED vs REFUNDED)
    const newTotalRefunded = alreadyRefunded + amount_minor;
    const newPaymentStatus =
      newTotalRefunded >= payment.amount_minor ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED;

    await tx.payment.update({
      where: { transactionId: transaction_id },
      data: { status: newPaymentStatus },
    });

    // Advance ticket state: to REFUND_INITIATED, then to REFUND_PROCESSING, and if settleMs === 0 to REFUNDED
    await transitionTicket(
      tx,
      ticket_id,
      TicketStatus.REFUND_INITIATED,
      "PAYMENTS_SERVICE",
      "REFUND_INITIATED",
      { refund_id: refundId, amount_minor }
    );

    if (mockSettleMs === 0) {
      await transitionTicket(
        tx,
        ticket_id,
        TicketStatus.REFUND_PROCESSING,
        "PAYMENTS_SERVICE",
        "REFUND_PROCESSING"
      );
      await transitionTicket(
        tx,
        ticket_id,
        TicketStatus.REFUNDED,
        "PAYMENTS_SERVICE",
        "REFUND_COMPLETED",
        { refund_id: refundId, amount_minor }
      );
    }

    // Customer Notification
    const amountRupees = (amount_minor / 100).toLocaleString("en-IN");
    await tx.notification.create({
      data: {
        userId: ticket.customerId,
        ticketId: ticket.id,
        title: "Refund approved",
        body: `₹${amountRupees} refund initiated. Expected credit: 2-5 business days.`,
        channel: "IN_APP",
      },
    });

    // Integration Outbox Event
    await emitOutboxEvent(tx, "refund.execution.completed", ticket_id, {
      refund_id: refundId,
      amount_minor,
      transaction_id,
    });

    return {
      isReplay: false,
      refund: {
        refund_id: refundId,
        status: "SUCCESS",
        transaction_id,
        amount_minor,
        currency: "INR",
        estimated_credit_time: "2-5 business days",
      },
    };
  });
}
