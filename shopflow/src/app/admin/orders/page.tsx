"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  ArrowLeft, 
  Package, 
  Sliders, 
  CheckCircle, 
  Truck, 
  Calendar, 
  Search, 
  Clock, 
  RefreshCw 
} from "lucide-react";

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [simulatingOrderId, setSimulatingOrderId] = useState<string | null>(null);
  const [simDays, setSimDays] = useState(4);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchOrders = () => {
    setLoading(true);
    fetch("/api/admin/orders")
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          window.location.href = "/login?redirect=/admin/orders";
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.orders) setOrders(data.orders);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleUpdateStatus = async (orderId: string, status: string) => {
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setActionSuccess(`Order ${orderId} updated to ${status}`);
        setTimeout(() => setActionSuccess(null), 4000);
        fetchOrders();
      }
    } catch (err) {
      alert("Failed to update status");
    }
  };

  const handleSimulateDelivery = async (orderId: string, daysAgo: number) => {
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/simulate-delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days_ago: daysAgo }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionSuccess(data.message || `Simulated delivery ${daysAgo} days ago`);
        setSimulatingOrderId(null);
        setTimeout(() => setActionSuccess(null), 5000);
        fetchOrders();
      } else {
        alert(data.message || "Failed to simulate delivery");
      }
    } catch (err) {
      alert("Failed to simulate delivery");
    }
  };

  const formatPrice = (minor: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(minor / 100);
  };

  const filteredOrders = orders.filter((o) => {
    const q = search.toLowerCase();
    return (
      o.id.toLowerCase().includes(q) ||
      o.customer?.email?.toLowerCase().includes(q) ||
      o.customer?.name?.toLowerCase().includes(q) ||
      o.items_summary?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shadow">
        <div className="flex items-center space-x-3">
          <Link href="/admin" className="text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <span className="font-bold text-lg tracking-tight">Admin Orders & Delivery Simulator</span>
          <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded">
            Phase 3
          </span>
        </div>
        <button
          onClick={fetchOrders}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition text-xs flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {actionSuccess && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-sm font-medium flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
            <div>
              <h1 className="text-xl font-bold text-slate-900">Orders Roster</h1>
              <p className="text-xs text-slate-500 mt-1">
                Manage order lifecycles and simulate fulfillment milestones to test customer refund eligibility.
              </p>
            </div>

            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search by order ID, customer, item..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-500">Loading orders...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold">
                    <th className="py-3 px-4">Order ID</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Items</th>
                    <th className="py-3 px-4">Total</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Delivery Milestone</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-mono font-medium text-slate-800">
                        {order.id}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800">{order.customer?.name}</div>
                        <div className="text-slate-400 font-mono text-[11px]">{order.customer?.email}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                        {order.items_summary}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {formatPrice(order.total_minor)}
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={order.status}
                          onChange={(e) => handleUpdateStatus(order.id, e.target.value)}
                          className="bg-white border border-slate-200 rounded px-2 py-1 text-xs font-medium focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="CONFIRMED">CONFIRMED</option>
                          <option value="PROCESSING">PROCESSING</option>
                          <option value="SHIPPED">SHIPPED</option>
                          <option value="OUT_FOR_DELIVERY">OUT_FOR_DELIVERY</option>
                          <option value="DELIVERED">DELIVERED</option>
                          <option value="CANCELLED">CANCELLED</option>
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        {order.status === "DELIVERED" ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                              <CheckCircle className="w-3.5 h-3.5" />
                              {order.delivered_at
                                ? new Date(order.delivered_at).toLocaleDateString()
                                : "Delivered"}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">Not Delivered</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        {simulatingOrderId === order.id ? (
                          <div className="inline-flex items-center gap-2 bg-indigo-50 p-1.5 rounded-lg border border-indigo-200">
                            <input
                              type="number"
                              min="0"
                              max="90"
                              value={simDays}
                              onChange={(e) => setSimDays(parseInt(e.target.value) || 0)}
                              className="w-14 px-2 py-0.5 text-xs border border-indigo-300 rounded"
                            />
                            <span className="text-[11px] text-indigo-700">days ago</span>
                            <button
                              onClick={() => handleSimulateDelivery(order.id, simDays)}
                              className="px-2 py-0.5 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700 font-medium"
                            >
                              Apply
                            </button>
                            <button
                              onClick={() => setSimulatingOrderId(null)}
                              className="px-1.5 py-0.5 text-slate-500 hover:text-slate-700 text-xs"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setSimulatingOrderId(order.id);
                              setSimDays(4); // default 4 days ago as required by Phase 3 check
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition"
                          >
                            <Truck className="w-3.5 h-3.5" /> Simulate Delivery
                          </button>
                        )}
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
