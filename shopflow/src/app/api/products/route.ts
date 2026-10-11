import { NextResponse } from "next/server";
import { getProducts } from "@/server/services/product.service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") || undefined;
  const search = searchParams.get("search") || undefined;
  const sort = (searchParams.get("sort") as any) || undefined;

  const products = await getProducts({ category, search, sort });

  const sanitized = products.map((p) => ({
    product_id: p.id,
    sku: p.sku,
    name: p.name,
    category: p.category,
    brand: p.brand,
    description: p.description,
    specs: p.specs,
    price_minor: p.priceMinor,
    currency: "INR",
    stock: p.stock,
    image_url: p.imageUrl,
    rating: p.rating,
    is_digital: p.isDigital,
    is_personalized: p.isPersonalized,
    is_clearance: p.isClearance,
    refund_policy: p.policy
      ? {
          policy_type: p.policy.policyType,
          refund_percentage: p.policy.refundPercentage,
          return_window_days: p.policy.returnWindowDays,
          return_required: p.policy.returnRequired,
          return_shipping: p.policy.returnShipping,
          opened_allowed: p.policy.openedAllowed,
          requires_unused: p.policy.requiresUnused,
        }
      : null,
  }));

  return NextResponse.json({ products: sanitized });
}
