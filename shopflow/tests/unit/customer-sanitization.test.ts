import { describe, it, expect, vi } from "vitest";
import { prisma } from "@/server/db";
import { GET as getCustomerTicketHandler } from "@/app/api/me/refund-tickets/[id]/route";
import * as guards from "@/server/auth/guards";
import fs from "fs";
import path from "path";

describe("Phase 9: Customer Endpoint Response Sanitization & Safety", () => {
  it("never includes risk_metadata, confidence_score, agent_trace, or derived_facts in customer ticket response", async () => {
    // Pick an existing seeded scenario ticket (e.g. RIT-2026-000100)
    const ticket = await prisma.refundTicket.findFirst({
      where: { customer: { email: "aarav@example.com" } },
      include: { customer: true },
    });
    expect(ticket).not.toBeNull();

    // Mock authenticated customer Aarav
    vi.spyOn(guards, "requireAuth").mockResolvedValue({
      user: ticket!.customer as any,
      error: null,
    });

    const req = new Request(`http://localhost:3000/api/me/refund-tickets/${ticket!.id}`);
    const res = await getCustomerTicketHandler(req, { params: { id: ticket!.id } });
    expect(res.status).toBe(200);

    const body = await res.json();
    const rawJson = JSON.stringify(body);

    // Assert that sensitive fields are completely absent from customer payload
    const forbiddenPatterns = [
      "risk_metadata",
      "confidence_score",
      "agent_trace",
      "derived_facts",
      "risk_score",
      "risk_level",
      "risk_signals",
    ];

    for (const pattern of forbiddenPatterns) {
      expect(rawJson).not.toContain(pattern);
    }

    // Assert safe fields ARE present
    expect(body.ticket).toBeDefined();
    expect(body.ticket.id).toBe(ticket!.id);
    expect(body.ticket.status).toBeDefined();
    expect(body.ticket.timeline).toBeDefined();
    expect(Array.isArray(body.ticket.timeline)).toBe(true);

    vi.restoreAllMocks();
  });

  it("codebase scan: customer-facing routes do not export or serialize risk/trace fields", () => {
    const customerRouteDirs = [
      path.join(process.cwd(), "src/app/api/me"),
      path.join(process.cwd(), "src/app/api/orders"),
      path.join(process.cwd(), "src/app/api/cart"),
      path.join(process.cwd(), "src/app/api/checkout"),
    ];

    const forbiddenTerms = [
      "risk_metadata",
      "confidence_score",
      "agent_trace",
    ];

    function scanDir(dir: string): string[] {
      let files: string[] = [];
      if (!fs.existsSync(dir)) return files;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files = files.concat(scanDir(fullPath));
        } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
          files.push(fullPath);
        }
      }
      return files;
    }

    const allFiles = customerRouteDirs.flatMap(scanDir);
    expect(allFiles.length).toBeGreaterThan(0);

    for (const file of allFiles) {
      const content = fs.readFileSync(file, "utf8");
      for (const term of forbiddenTerms) {
        // Look for occurrences in response json bodies
        const lines = content.split("\n");
        lines.forEach((line, idx) => {
          if (line.includes(term) && !line.includes("//")) {
            throw new Error(`Forbidden term '${term}' found in customer file ${file} at line ${idx + 1}: ${line}`);
          }
        });
      }
    }
  });
});
