"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle, XCircle, Edit3, ShieldAlert, FileText, User, ShoppingBag } from "lucide-react";

export default function AdminReviewDetailPage({ params }: { params: { id: string } }) {
  const [context, setContext] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [modifyAmount, setModifyAmount] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/ritos/refund-tickets/${params.id}/context`)
      .then((res) => res.json())
      .then((data) => {
        setContext(data);
        if (data?.ticket?.requested_amount_minor) {
          setModifyAmount(data.ticket.requested_amount_minor);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [params.id]);

  const handleDecision = async (action: "APPROVE" | "REJECT" | "MODIFY") => {
    if (!note) {
      alert("Please enter a review note explaining your rationale.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/refunds/${params.id}/human-decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          refund_amount_minor: action === "MODIFY" ? modifyAmount : undefined,
          note,
        }),
      });

      const resData = await res.json();
      if (res.ok) {
        setSuccessMsg(`Decision applied: ${action} (${resData.status})`);
      } else {
        alert(resData.error?.message || "Failed to submit decision");
      }
    } catch {
      alert("Failed to submit decision");
    } finally {
      setSubmitting(false);
    }
  };

  const formatPrice = (minor: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(minor / 100);
  };

  if (loading || !context || !context.ticket) {
    return (
      <div className="p-8 text-center text-slate-500">
        {loading ? "Loading ticket dossier..." : "Failed to load ticket dossier or ticket not found."}
      </div>
    );
  }

  const { ticket, customer, order, product, refund_policy, evidence, refund_ledger, derived_facts } = context;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-12">
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shadow">
        <div className="flex items-center space-x-3">
          <Link href="/admin/review" className="text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <span className="font-bold text-lg tracking-tight">Review Dossier: {ticket.ticket_id}</span>
          <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded">
            {ticket.status}
          </span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        {successMsg && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-sm font-semibold flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main Dossier */}
          <div className="md:col-span-2 space-y-6">
            {/* Ticket & Claim */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" /> Claim Details
              </h2>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block">Reason</span>
                  <span className="font-semibold text-slate-800">{ticket.reason}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Requested Amount</span>
                  <span className="font-semibold text-slate-800">{formatPrice(ticket.requested_amount_minor)}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500 block">Customer Description</span>
                  <p className="mt-1 p-2 bg-slate-50 rounded border border-slate-100 text-slate-700 font-mono text-[11px]">
                    {ticket.description || "No description provided."}
                  </p>
                </div>
              </div>
            </div>

            {/* Derived Facts & Conflict Analysis */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-600" /> RITOS Orchestration Analysis
              </h2>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Days Since Delivery</span>
                  <span className="font-semibold">{derived_facts.days_since_delivery ?? "N/A"} days</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Within Return Window</span>
                  <span className={derived_facts.within_return_window ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold"}>
                    {derived_facts.within_return_window ? "YES" : "NO"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Evidence Required / Provided</span>
                  <span className="font-semibold">{derived_facts.evidence_required ? "YES" : "NO"} / {derived_facts.evidence_count} files</span>
                </div>

                {derived_facts.claim_data_conflicts.length > 0 && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg">
                    <strong className="block mb-1">Identified Claim Conflicts:</strong>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {derived_facts.claim_data_conflicts.map((c: string, idx: number) => (
                        <li key={idx}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Evidence Viewer */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">Evidence Attachments ({evidence.length})</h2>
              {evidence.length === 0 ? (
                <p className="text-xs text-slate-400">No evidence attached to this ticket.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {evidence.map((ev: any) => (
                    <div key={ev.evidence_id} className="p-2 border border-slate-200 rounded-lg space-y-1 text-xs">
                      <span className="font-medium text-slate-800 truncate block">{ev.filename}</span>
                      <a href={ev.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline text-[11px] block">
                        Open File ({ev.mime})
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Actions */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">Adjudication Controls</h2>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Analyst Review Note *</label>
                  <textarea
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Enter decision rationale or customer communication note..."
                    className="w-full p-2 border border-slate-200 rounded text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Modify Amount (Minor Paise)</label>
                  <input
                    type="number"
                    value={modifyAmount}
                    onChange={(e) => setModifyAmount(parseInt(e.target.value) || 0)}
                    className="w-full p-2 border border-slate-200 rounded text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    Equivalent to {formatPrice(modifyAmount)}
                  </span>
                </div>

                <div className="pt-2 space-y-2">
                  <button
                    disabled={submitting}
                    onClick={() => handleDecision("APPROVE")}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold transition flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Approve Full ({formatPrice(ticket.requested_amount_minor)})
                  </button>

                  <button
                    disabled={submitting}
                    onClick={() => handleDecision("MODIFY")}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-bold transition flex items-center justify-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Approve Modified ({formatPrice(modifyAmount)})
                  </button>

                  <button
                    disabled={submitting}
                    onClick={() => handleDecision("REJECT")}
                    className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold transition flex items-center justify-center gap-1.5"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject Request
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
