"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldAlert, CheckCircle, Clock, Eye, AlertCircle, RefreshCw } from "lucide-react";

export default function AdminReviewQueuePage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchQueue = () => {
    setLoading(true);
    fetch("/api/refunds?status=HUMAN_REVIEW&limit=50")
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          window.location.href = "/login?redirect=/admin/review";
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.tickets) setTickets(data.tickets);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const formatPrice = (minor: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(minor / 100);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shadow">
        <div className="flex items-center space-x-3">
          <Link href="/admin" className="text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <span className="font-bold text-lg tracking-tight">Support Analyst Review Queue</span>
          <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded">
            HUMAN_REVIEW
          </span>
        </div>
        <button
          onClick={fetchQueue}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition text-xs flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Escalated Tickets</h1>
            <p className="text-xs text-slate-500 mt-1">
              Review tickets flagged by RITOS orchestration requiring human adjudication.
            </p>
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-500">Loading review queue...</div>
          ) : tickets.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-slate-500 text-sm">
              No tickets currently awaiting human review.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {tickets.map((t) => (
                <div key={t.ticket_id} className="py-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-slate-900">{t.ticket_id}</span>
                      <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-800 rounded font-medium">
                        {t.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Reason: <strong className="text-slate-700">{t.reason}</strong> · Requested:{" "}
                      <strong className="text-slate-700">{formatPrice(t.requested_amount_minor)}</strong>
                    </p>
                  </div>

                  <Link
                    href={`/admin/review/${t.ticket_id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition"
                  >
                    <Eye className="w-3.5 h-3.5" /> Adjudicate Ticket
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
