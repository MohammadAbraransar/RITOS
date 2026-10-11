import { NextResponse } from "next/server";
import { getProductById } from "@/server/services/product.service";
import { errorResponse } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const product = await getProductById(params.id);
  if (!product) {
    return errorResponse("NOT_FOUND", `Product ${params.id} not found`, 404);
  }

  return NextResponse.json({
    product_id: product.id,
    sku: product.sku,
    name: product.name,
    category: product.category,
    brand: product.brand,
    description: product.description,
    specs: product.specs,
    price_minor: product.priceMinor,
    currency: "INR",
    stock: product.stock,
    image_url: product.imageUrl,
    rating: product.rating,
    is_digital: product.isDigital,
    is_personalized: product.isPersonalized,
    is_clearance: product.isClearance,
    refund_policy: product.policy
      ? {
          policy_version: product.policy.version,
          policy_type: product.policy.policyType,
          refund_percentage: product.policy.refundPercentage,
          return_window_days: product.policy.returnWindowDays,
          opened_allowed: product.policy.openedAllowed,
          requires_unused: product.policy.requiresUnused,
          defective_only: product.policy.defectiveOnly,
          exchange_only: product.policy.exchangeOnly,
          replacement_allowed: product.policy.replacementAllowed,
          return_required: product.policy.returnRequired,
          return_shipping: product.policy.returnShipping,
          verification_required: product.policy.verificationRequired,
          evidence_required_reasons: product.policy.evidenceRequiredReasons,
          exceptions: product.policy.exceptions,
          notes: product.policy.notes,
        }
      : null,
  });
}
