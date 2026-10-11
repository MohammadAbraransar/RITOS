import { PaymentMethod } from "@prisma/client";

export interface ProcessPaymentParams {
  amountMinor: number;
  method: PaymentMethod;
  paymentIdentifier?: string; // e.g. "fail@mock", "upi@okaxis"
}

export interface PaymentResult {
  success: boolean;
  transactionId: string;
  failureReason?: string;
}

export function processMockPayment(params: ProcessPaymentParams): PaymentResult {
  const transactionId = `TXN-${Math.floor(100000 + Math.random() * 900000)}`;

  // Magic failure trigger as specified in docs
  if (
    params.paymentIdentifier === "fail@mock" ||
    params.paymentIdentifier?.toLowerCase().includes("fail")
  ) {
    return {
      success: false,
      transactionId,
      failureReason: "Card or UPI declined by issuer simulation (fail@mock)",
    };
  }

  return {
    success: true,
    transactionId,
  };
}
