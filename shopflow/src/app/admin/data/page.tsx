"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, RotateCcw } from "lucide-react";

export default function AdminDataPage() {
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  const handleReset = async () => {
    if (!confirm("Are you sure you want to reset all database records and reseed?")) return;
    setResetting(true);
    try {
      const res = await fetch("/api/admin/demo/reset-and-seed", { method: "POST" });
      const d = await res.json();
      if (res.ok) {
        setResetMsg(d.message);
      } else {
        alert(d.error?.message || "Failed to reset");
      }
    } catch {
      alert("Failed to reset database");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-12">
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shadow">
        <div className="flex items-center space-x-3">
          <Link href="/admin" className="text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <span className="font-bold text-lg tracking-tight">Data Management & Reset</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {resetMsg && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-sm">
            {resetMsg}
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">Demo Re-seed Control</h2>
          <p className="text-xs text-slate-500">
            Resets all database tables, reloads the 15 products with policies, 10 customers, 29 orders, and the 24 historical tickets, resetting the ticket sequence preview to RIT-2026-000123.
          </p>

          <button
            disabled={resetting}
            onClick={handleReset}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" /> {resetting ? "Resetting Database..." : "Reset and Seed Database"}
          </button>
        </div>
      </main>
    </div>
  );
}
