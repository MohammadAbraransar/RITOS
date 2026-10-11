import { NextResponse } from "next/server";
import { z } from "zod";
import { getCart, setCart, clearCart } from "@/server/services/cart.service";
import { getProductById } from "@/server/services/product.service";
import { errorResponse } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

const AddItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().min(1).default(1),
});

export async function GET() {
  const items = await getCart();
  const totalMinor = items.reduce((sum, item) => sum + item.priceMinor * item.quantity, 0);
  return NextResponse.json({
    items,
    total_minor: totalMinor,
    currency: "INR",
    item_count: items.reduce((sum, item) => sum + item.quantity, 0),
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = AddItemSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid item", 422, parsed.error.format());
  }

  const { productId, quantity } = parsed.data;
  const product = await getProductById(productId);
  if (!product) {
    return errorResponse("NOT_FOUND", "Product not found", 404);
  }

  const items = await getCart();
  const existing = items.find((i) => i.productId === productId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    items.push({
      productId: product.id,
      name: product.name,
      priceMinor: product.priceMinor,
      quantity,
      imageUrl: product.imageUrl,
    });
  }

  await setCart(items);
  const totalMinor = items.reduce((sum, item) => sum + item.priceMinor * item.quantity, 0);

  return NextResponse.json({
    items,
    total_minor: totalMinor,
    currency: "INR",
  });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const { productId, quantity } = body;
  if (!productId || typeof quantity !== "number") {
    return errorResponse("VALIDATION_ERROR", "productId and quantity required", 422);
  }

  let items = await getCart();
  if (quantity <= 0) {
    items = items.filter((i) => i.productId !== productId);
  } else {
    const item = items.find((i) => i.productId === productId);
    if (item) item.quantity = quantity;
  }

  await setCart(items);
  const totalMinor = items.reduce((sum, item) => sum + item.priceMinor * item.quantity, 0);

  return NextResponse.json({
    items,
    total_minor: totalMinor,
    currency: "INR",
  });
}

export async function DELETE() {
  await clearCart();
  return NextResponse.json({ items: [], total_minor: 0, currency: "INR" });
}
