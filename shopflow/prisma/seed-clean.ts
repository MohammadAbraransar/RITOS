import { PrismaClient, UserRole, PolicyType, ReturnShipping, VerificationType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PRODUCTS_SEED_DATA } from "./seed-data/products";
import { USERS_SEED_DATA } from "./seed-data/customers";
import { ensureSeedAssets } from "../scripts/generate-seed-assets";

const prisma = new PrismaClient();

async function main() {
  console.log("Cleaning database to a blank slate (clean store mode)...");

  // Ensure assets directory exists
  ensureSeedAssets();

  // 1. Truncate all tables
  console.log("Truncating all mock data tables...");
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

  // 2. Reset ticket ID sequence so real tickets start at RIT-2026-000001
  console.log("Resetting refund ticket sequence to 0...");
  await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS refund_ticket_seq START WITH 1;`);
  await prisma.$executeRawUnsafe(`SELECT setval('refund_ticket_seq', 1, false);`);

  // 3. Seed Users (Base Login Accounts)
  console.log("Seeding base users...");
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
        createdAt: new Date(),
      },
    });
  }

  // 4. Seed Products and Policies
  console.log("Seeding products & policies catalog...");
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

  console.log("\n========================================================");
  console.log("ShopFlow Database is now CLEAN!");
  console.log("- Orders: 0 (Ready for fresh orders)");
  console.log("- Refund Tickets: 0 (Next ticket ID will be RIT-2026-000001)");
  console.log("- Products in Catalog: 15 active products");
  console.log("- Accounts: 10 customer accounts, 2 staff accounts");
  console.log("  Password for all accounts: Demo@1234");
  console.log("========================================================\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
