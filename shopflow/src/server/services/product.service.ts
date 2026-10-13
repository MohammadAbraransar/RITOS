import { prisma } from "@/server/db";

// The catalog and its refund policies come only from the database. On a database error the caller gets the
// error: serving seed products would show prices and policies that may not match the store.
export async function getProducts(options: {
  category?: string;
  search?: string;
  sort?: "price_asc" | "price_desc" | "rating" | "newest";
} = {}) {
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

  return prisma.product.findMany({
    where,
    orderBy,
    include: {
      policy: true,
    },
  });
}

export async function getProductById(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: {
      policy: true,
    },
  });
}
