import { prisma } from "@/server/db";
import { PRODUCTS_SEED_DATA } from "../../../prisma/seed-data/products";

export async function getProducts(options: {
  category?: string;
  search?: string;
  sort?: "price_asc" | "price_desc" | "rating" | "newest";
} = {}) {
  try {
    const where: any = {};
    if (options.category && options.category !== "All") {
      where.category = options.category;
    }
    if (options.search) {
      where.OR = [
        { name: { contains: options.search, mode: "insensitive" } },
        { description: { contains: options.search, mode: "insensitive" } },
        { brand: { contains: options.search, mode: "insensitive" } },
      ];
    }

    let orderBy: any = { id: "asc" };
    if (options.sort === "price_asc") orderBy = { priceMinor: "asc" };
    if (options.sort === "price_desc") orderBy = { priceMinor: "desc" };
    if (options.sort === "rating") orderBy = { rating: "desc" };

    return await prisma.product.findMany({
      where,
      orderBy,
      include: {
        policy: true,
      },
    });
  } catch (err) {
    let list: any[] = PRODUCTS_SEED_DATA.map((p) => ({
      ...p,
      policy: {
        ...p.policy,
        policyType: p.policy.policyType,
        refundPercentage: p.policy.refundPercentage,
        returnWindowDays: p.policy.returnWindowDays,
      },
    }));

    if (options.category && options.category !== "All") {
      list = list.filter((p) => p.category.toLowerCase() === options.category?.toLowerCase());
    }
    if (options.search) {
      const q = options.search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
    }
    if (options.sort === "price_asc") list.sort((a, b) => a.priceMinor - b.priceMinor);
    if (options.sort === "price_desc") list.sort((a, b) => b.priceMinor - a.priceMinor);
    if (options.sort === "rating") list.sort((a, b) => b.rating - a.rating);

    return list;
  }
}

export async function getProductById(id: string) {
  try {
    return await prisma.product.findUnique({
      where: { id },
      include: {
        policy: true,
      },
    });
  } catch (err) {
    const p = PRODUCTS_SEED_DATA.find((item) => item.id === id);
    if (!p) return null;
    return {
      ...p,
      policy: {
        ...p.policy,
        policyType: p.policy.policyType,
        refundPercentage: p.policy.refundPercentage,
        returnWindowDays: p.policy.returnWindowDays,
      },
    };
  }
}
