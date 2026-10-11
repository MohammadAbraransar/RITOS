"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  ArrowLeft, 
  RotateCcw, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  FileText, 
  Info,
  Calendar,
  CreditCard
} from "lucide-react";

export default function CustomerRefundTicketPage({ params }: { params: { id: string } }) {
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchTicket = () => {
    fetch(`/api/me/refund-tickets/${params.id}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || "Failed to load refund ticket");
        }
        return res.json();
      })
      .then((data) => {
        setTicket(data.ticket);
        setLoading(false);
      })
      .catch((err) => {
        setErrorMsg(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchTicket();

    // Poll periodically while active
    const timer = setInterval(() => {
      fetchTicket();
    }, 2500);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const formatPrice = (minor: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(minor / 100);
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-slate-500">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent mb-2"></div>
        <p>Loading ticket status...</p>
      </div>
    );
  }

  if (errorMsg || !ticket) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-slate-800">Refund Ticket Not Found</h2>
        <p className="text-sm text-slate-500">{errorMsg || "Unable to display this ticket."}</p>
        <Link href="/orders" className="text-indigo-600 hover:underline text-sm font-medium">
          Back to Orders
        </Link>
      </div>
    );
  }

  const isApprovedOrRefunded = ["APPROVED", "REFUND_INITIATED", "REFUND_PROCESSING", "REFUNDED"].includes(ticket.status);
  const isRefunded = ticket.status === "REFUNDED";
  const isPending = ["PENDING_RITOS", "PROCESSING"].includes(ticket.status);
  const isHumanReview = ticket.status === "HUMAN_REVIEW";
  const isRejected = ticket.status === "REJECTED";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition"
      >
        <ArrowLeft className="w-4 h-4" /> Back to My Orders
      </Link>

      {/* Main Banner / Status Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-slate-900">
                Refund Ticket
              </h1>
              <span className="font-mono text-sm px-2.5 py-0.5 rounded bg-slate-100 text-slate-800 font-semibold">
                {ticket.ticket_number}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Submitted on {new Date(ticket.created_at).toLocaleString("en-IN")}
            </p>
          </div>

          <div>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
              isRefunded ? "bg-emerald-100 text-emerald-800" :
              isApprovedOrRefunded ? "bg-indigo-100 text-indigo-800" :
              isHumanReview ? "bg-amber-100 text-amber-800" :
              isRejected ? "bg-rose-100 text-rose-800" :
              "bg-slate-100 text-slate-800"
            }`}>
              {isRefunded ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
              {ticket.status}
            </span>
          </div>
        </div>

        {/* Highlight Banner on Approval / Refund */}
        {isApprovedOrRefunded && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Refund approved</span>
            </div>
            <p className="text-sm font-semibold text-emerald-950">
              {formatPrice(ticket.requested_amount_minor)} refund initiated
            </p>
            <p className="text-xs text-emerald-800">
              Expected credit: 2-5 business days to your original payment method.
            </p>
          </div>
        )}

        {isHumanReview && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-1 text-xs text-amber-900">
            <p className="font-bold">Additional Verification Underway</p>
            <p>Your refund request has been escalated to our senior customer support team for detailed review.</p>
          </div>
        )}

        {isRejected && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-1 text-xs text-rose-900">
            <p className="font-bold">Refund Request Not Approved</p>
            <p>Your request did not meet our standard return eligibility criteria.</p>
          </div>
        )}

        {/* Product and Claim Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Claim Summary
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Reason</span>
                <span className="font-semibold text-slate-800">{ticket.reason}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Requested Action</span>
                <span className="font-semibold text-slate-800">{ticket.requested_action}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Amount Requested</span>
                <span className="font-bold text-slate-900">{formatPrice(ticket.requested_amount_minor)}</span>
              </div>
              {ticket.description && (
                <div className="pt-2 border-t border-slate-100">
                  <span className="text-slate-500 block mb-1">Customer Note:</span>
                  <p className="text-slate-700 bg-slate-50 p-2 rounded text-xs italic">
                    &quot;{ticket.description}&quot;
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Product Details
            </h3>
            <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
              {ticket.product?.imageUrl && (
                <img
                  src={ticket.product.imageUrl}
                  alt={ticket.product.name}
                  className="w-12 h-12 object-cover rounded bg-white border border-slate-200"
                />
              )}
              <div className="text-xs space-y-0.5">
                <p className="font-semibold text-slate-900">{ticket.product?.name}</p>
                <p className="text-slate-500 font-mono">SKU: {ticket.product?.sku}</p>
              </div>
            </div>

            {ticket.evidence?.length > 0 && (
              <div className="pt-2">
                <h4 className="text-[11px] font-semibold text-slate-600 mb-1">Uploaded Evidence:</h4>
                <div className="space-y-1">
                  {ticket.evidence.map((ev: any) => (
                    <div key={ev.id} className="text-xs text-slate-600 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-indigo-500" />
                      <span>{ev.filename}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Customer Timeline */}
        <div className="pt-6 border-t border-slate-100 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Status Timeline
          </h3>

          <div className="relative border-l-2 border-slate-200 ml-3 space-y-6 pl-5 py-2">
            {ticket.timeline?.map((item: any, idx: number) => (
              <div key={idx} className="relative">
                <div className="absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full border-2 border-white bg-indigo-600 ring-2 ring-indigo-100"></div>
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-900">{item.title}</p>
                    <span className="text-[10px] text-slate-400">
                      {new Date(item.occurred_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
