import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRitosOrSession, errorResponse } from "@/server/auth/ritos-guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { error } = await authenticateRitosOrSession(req, ["ADMIN", "SUPPORT_ANALYST", "CUSTOMER"]);
  if (error) return error;

  try {
    const policy = await prisma.refundPolicy.findUnique({
      where: { productId: params.id },
    });

    if (!policy) {
      return errorResponse("NOT_FOUND", "Refund policy not found", 404);
    }

    return NextResponse.json({
      product_id: policy.productId,
      version: policy.version,
      policy_type: policy.policyType,
      refund_percentage: policy.refundPercentage,
      return_window_days: policy.returnWindowDays,
      opened_allowed: policy.openedAllowed,
      requires_unused: policy.requiresUnused,
      defective_only: policy.defectiveOnly,
      exchange_only: policy.exchangeOnly,
      replacement_allowed: policy.replacementAllowed,
      return_required: policy.returnRequired,
      return_shipping: policy.returnShipping,
      verification_required: policy.verificationRequired,
      evidence_required_reasons: policy.evidenceRequiredReasons,
      human_approval_threshold_minor: policy.humanApprovalThresholdMinor,
      exceptions: policy.exceptions,
      notes: policy.notes,
    });
  } catch (err: any) {
    return errorResponse("INTERNAL", err.message, 500);
  }
}
