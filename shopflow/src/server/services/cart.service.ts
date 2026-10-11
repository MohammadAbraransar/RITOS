import { getCurrentSession } from "@/server/auth/session";

export interface CartItem {
  productId: string;
  name: string;
  priceMinor: number;
  quantity: number;
  imageUrl: string;
}

// Session-based cart storage
export async function getCart(): Promise<CartItem[]> {
  const session = await getCurrentSession();
  return (session as any).cart || [];
}

export async function setCart(items: CartItem[]) {
  const session = await getCurrentSession();
  (session as any).cart = items;
  await session.save();
}

export async function clearCart() {
  const session = await getCurrentSession();
  (session as any).cart = [];
  await session.save();
}
