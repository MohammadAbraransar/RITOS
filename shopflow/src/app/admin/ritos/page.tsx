"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Send, CheckCircle2, Clock, AlertTriangle } from "lucide-react";

export default function AdminRitosConsolePage() {
  const [data, setData] = useState<{ exchanges: any[]; outbox_events: any[] }>({
    exchanges: [],
    outbox_events: [],
  });
  const [loading, setLoading] = useState(true);
  const [resendingTicket, setResendingTicket] = useState("");
  const [resendStatus, setResendStatus] = useState<string | null>(null);

  const fetchData = () => {
    setLoading(true);
    fetch("/api/admin/ritos/exchanges")
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          window.location.href = "/login?redirect=/admin/ritos";
          return null;
        }
        return res.json();
      })
      .then((d) => {
        if (d && Array.isArray(d.outbox_events)) {
          setData(d);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleResend = async () => {
    if (!resendingTicket) return;
    try {
      const res = await fetch(`/api/admin/refunds/${resendingTicket}/resend-to-ritos`, {
        method: "POST",
      });
      const d = await res.json();
      if (res.ok) {
        setResendStatus(`Ticket ${resendingTicket} queued for resending (Event ID: ${d.event_id})`);
        setResendingTicket("");
        setTimeout(() => setResendStatus(null), 4000);
        fetchData();
      } else {
        alert(d.error?.message || "Failed to resend");
      }
    } catch {
      alert("Failed to resend");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-12">
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shadow">
        <div className="flex items-center space-x-3">
          <Link href="/admin" className="text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <span className="font-bold text-lg tracking-tight">RITOS Integration Console</span>
          <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded">
            Live Stream
          </span>
        </div>
        <button
          onClick={fetchData}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition text-xs flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        {resendStatus && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{resendStatus}</span>
          </div>
        )}

        {/* Resend Control */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">Resend Ticket to RITOS</h2>
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Enter Ticket ID (e.g. RIT-2026-000100)"
              value={resendingTicket}
              onChange={(e) => setResendingTicket(e.target.value)}
              className="p-2 border border-slate-200 rounded-lg text-xs w-72 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
            />
            <button
              onClick={handleResend}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Send className="w-3.5 h-3.5" /> Queue Resend Event
            </button>
          </div>
        </div>

        {/* Integration Outbox Events */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">Integration Outbox Events ({data?.outbox_events?.length || 0})</h2>
          {loading ? (
            <p className="text-xs text-slate-400">Loading outbox...</p>
          ) : (data?.outbox_events?.length || 0) === 0 ? (
            <p className="text-xs text-slate-400">No events logged.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold">
                    <th className="py-2.5 px-3">Event ID</th>
                    <th className="py-2.5 px-3">Event Type</th>
                    <th className="py-2.5 px-3">Ticket ID</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Attempts</th>
                    <th className="py-2.5 px-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {(data?.outbox_events || []).map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3">{ev.id}</td>
                      <td className="py-2.5 px-3 font-sans font-semibold text-indigo-700">{ev.event_type}</td>
                      <td className="py-2.5 px-3">{ev.ticket_id}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-sans font-semibold ${
                            ev.status === "SENT"
                              ? "bg-emerald-100 text-emerald-800"
                              : ev.status === "FAILED"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {ev.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">{ev.attempts}</td>
                      <td className="py-2.5 px-3 text-slate-500">{new Date(ev.created_at).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
