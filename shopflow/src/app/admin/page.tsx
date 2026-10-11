import Link from "next/link";
import { ArrowLeft, Shield, Sliders, RefreshCw, Database, FileText, Send, AlertOctagon } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 pb-12">
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shadow">
        <div className="flex items-center space-x-3">
          <Shield className="w-6 h-6 text-indigo-400" />
          <span className="font-bold text-lg tracking-tight">ShopFlow Admin & Support Console</span>
          <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded">
            RITOS Integration
          </span>
        </div>
        <Link href="/" className="text-xs text-slate-400 hover:text-white flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Store
        </Link>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">Console Hub</h1>
          <p className="text-sm text-slate-500 mt-1">
            System of Record operations, order delivery simulation, RITOS human review queue, and refund execution status.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <Link
              href="/admin/orders"
              className="p-4 rounded-lg border border-indigo-200 bg-indigo-50/30 hover:border-indigo-400 transition block group"
            >
              <div className="flex items-center gap-2 font-semibold text-slate-800 mb-2 group-hover:text-indigo-600 transition">
                <Sliders className="w-4 h-4 text-indigo-600" />
                <span>Orders & Fulfillment</span>
              </div>
              <p className="text-xs text-slate-600 mb-3">
                Simulate order fulfillment, mark as DELIVERED N days ago, and view transaction records.
              </p>
              <span className="text-xs font-medium px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                Live & Ready →
              </span>
            </Link>

            <Link
              href="/admin/review"
              className="p-4 rounded-lg border border-amber-200 bg-amber-50/30 hover:border-amber-400 transition block group"
            >
              <div className="flex items-center gap-2 font-semibold text-slate-800 mb-2 group-hover:text-amber-600 transition">
                <RefreshCw className="w-4 h-4 text-amber-600" />
                <span>Human Review Queue</span>
              </div>
              <p className="text-xs text-slate-600 mb-3">
                Manage tickets escalated by RITOS with confidence, explanation, and action controls.
              </p>
              <span className="text-xs font-medium px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded">
                Live Queue →
              </span>
            </Link>

            <Link
              href="/admin/ritos"
              className="p-4 rounded-lg border border-purple-200 bg-purple-50/30 hover:border-purple-400 transition block group"
            >
              <div className="flex items-center gap-2 font-semibold text-slate-800 mb-2 group-hover:text-purple-600 transition">
                <Send className="w-4 h-4 text-purple-600" />
                <span>RITOS Integration Console</span>
              </div>
              <p className="text-xs text-slate-600 mb-3">
                Live exchange inspection, payload contract verification, and test event replay.
              </p>
              <span className="text-xs font-medium px-2 py-0.5 bg-purple-100 text-purple-800 border border-purple-300 rounded">
                Live Console →
              </span>
            </Link>

            <Link
              href="/admin/refunds"
              className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 hover:border-slate-400 transition block group"
            >
              <div className="flex items-center gap-2 font-semibold text-slate-800 mb-2 group-hover:text-slate-900 transition">
                <AlertOctagon className="w-4 h-4 text-rose-600" />
                <span>Refund Tickets & Failure Injection</span>
              </div>
              <p className="text-xs text-slate-600 mb-3">
                Roster of all tickets with failure simulation toggles for resilience testing.
              </p>
              <span className="text-xs font-medium px-2 py-0.5 bg-slate-100 text-slate-700 rounded">
                Manage →
              </span>
            </Link>

            <Link
              href="/admin/data"
              className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 hover:border-slate-400 transition block group"
            >
              <div className="flex items-center gap-2 font-semibold text-slate-800 mb-2 group-hover:text-slate-900 transition">
                <Database className="w-4 h-4 text-blue-600" />
                <span>Demo Data & Reseed</span>
              </div>
              <p className="text-xs text-slate-600 mb-3">
                Instant database wipe and re-seed to clean demo state.
              </p>
              <span className="text-xs font-medium px-2 py-0.5 bg-slate-100 text-slate-700 rounded">
                Manage →
              </span>
            </Link>

            <Link
              href="/admin/api-docs"
              className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 hover:border-slate-400 transition block group"
            >
              <div className="flex items-center gap-2 font-semibold text-slate-800 mb-2 group-hover:text-slate-900 transition">
                <FileText className="w-4 h-4 text-emerald-600" />
                <span>API Contract Specification</span>
              </div>
              <p className="text-xs text-slate-600 mb-3">
                Embedded docs/02 specification reader for developers and analysts.
              </p>
              <span className="text-xs font-medium px-2 py-0.5 bg-slate-100 text-slate-700 rounded">
                View Spec →
              </span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
