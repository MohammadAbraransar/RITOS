import { GET as getContextHandler } from "@/app/api/ritos/refund-tickets/[ticketId]/context/route";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { ticketId: string } }) {
  return getContextHandler(req, { params });
}
