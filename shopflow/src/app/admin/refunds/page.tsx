"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, AlertOctagon, CheckCircle2 } from "lucide-react";

export default function AdminRefundsPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const fetchTickets = () => {
    setLoading(true);
    fetch("/api/refunds?limit=100")
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          window.location.href = "/login?redirect=/admin/refunds";
          return null;
        }
        return res.json();
      })
      .then((d) => {
        if (d?.tickets) setTickets(d.tickets);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const handleToggleFailure = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/tickets/${id}/simulate-refund-failure`, {
        method: "POST",
      });
      const d = await res.json();
      if (res.ok) {
        setMsg(`Ticket ${id}: simulate failure toggled to ${d.simulate_refund_failure}`);
        setTimeout(() => setMsg(null), 4000);
        fetchTickets();
      }
    } catch {
      alert("Failed to toggle failure simulation");
    }
  };

  const formatPrice = (minor: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(minor / 100);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-12">
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shadow">
        <div className="flex items-center space-x-3">
          <Link href="/admin" className="text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <span className="font-bold text-lg tracking-tight">Refund Tickets Roster</span>
        </div>
        <button
          onClick={fetchTickets}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition text-xs flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        {msg && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{msg}</span>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">All Refund Tickets ({tickets.length})</h2>

          {loading ? (
            <p className="text-xs text-slate-400">Loading tickets...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold">
                    <th className="py-2.5 px-3">Ticket ID</th>
                    <th className="py-2.5 px-3">Reason</th>
                    <th className="py-2.5 px-3">Requested</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Failure Injection</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {tickets.map((t) => (
                    <tr key={t.ticket_id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{t.ticket_id}</td>
                      <td className="py-2.5 px-3 font-sans">{t.reason}</td>
                      <td className="py-2.5 px-3 font-sans font-semibold">{formatPrice(t.requested_amount_minor)}</td>
                      <td className="py-2.5 px-3 font-sans">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 font-medium">
                          {t.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-sans">
                        <button
                          onClick={() => handleToggleFailure(t.ticket_id)}
                          className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded text-xs transition"
                        >
                          Simulate Failure
                        </button>
                      </td>
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
