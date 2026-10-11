"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Package, ArrowRight, Clock, CheckCircle2, AlertCircle, ShoppingBag } from "lucide-react";

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/orders")
      .then((res) => {
        if (res.status === 401) {
          window.location.href = "/login?redirect=/orders";
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.orders) setOrders(data.orders);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const formatPrice = (minor: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(minor / 100);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DELIVERED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="w-3 h-3" /> Delivered
          </span>
        );
      case "CONFIRMED":
      case "PROCESSING":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            <Clock className="w-3 h-3" /> Processing
          </span>
        );
      case "SHIPPED":
      case "OUT_FOR_DELIVERY":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
            <Package className="w-3 h-3" /> In Transit
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800">
            <AlertCircle className="w-3 h-3" /> Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
            {status}
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-slate-500">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent mb-2"></div>
        <p>Loading your orders...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Orders</h1>
        <p className="text-sm text-slate-500 mt-1">
          Track fulfillment status, view details, and initiate policy refunds.
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-medium text-slate-800">No orders placed yet</h2>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            Explore our curated catalog and place your first order with instant policy guarantee.
          </p>
          <Link
            href="/products"
            className="inline-flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm transition"
          >
            Explore Catalog
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:border-slate-300 transition"
            >
              <div className="bg-slate-50/70 px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-6">
                  <div>
                    <span className="text-slate-500 block">Order Placed</span>
                    <span className="font-medium text-slate-800">
                      {new Date(order.ordered_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Total</span>
                    <span className="font-medium text-slate-800">
                      {formatPrice(order.total_minor)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Order ID</span>
                    <span className="font-mono font-medium text-slate-800">{order.id}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {getStatusBadge(order.status)}
                  <Link
                    href={`/orders/${order.id}`}
                    className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:text-indigo-800 transition"
                  >
                    View Details <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {order.items.map((item: any) => (
                  <div key={item.id} className="flex items-center gap-4">
                    <img
                      src={item.image_url}
                      alt={item.product_name}
                      className="w-16 h-16 object-cover rounded-lg border border-slate-200 bg-slate-50 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/products/${item.product_id}`}
                        className="text-sm font-semibold text-slate-800 hover:text-indigo-600 transition truncate block"
                      >
                        {item.product_name}
                      </Link>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Quantity: {item.quantity} · Price: {formatPrice(item.unit_price_minor)}
                      </p>
                      {item.policy && (
                        <span className="inline-block text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded mt-1">
                          {item.policy.return_window_days}-Day {item.policy.policy_type} Policy
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {/* Refund Ticket Banner if already exists */}
                {order.tickets && order.tickets.length > 0 && (
                  <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between text-xs text-amber-900">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Refund Ticket Active:</span>
                      <span className="font-mono">{order.tickets[0].ticket_number}</span>
                      <span className="px-2 py-0.5 bg-amber-200/60 rounded text-[11px] font-medium">
                        {order.tickets[0].status}
                      </span>
                    </div>
                    <Link
                      href={`/orders/${order.id}`}
                      className="text-amber-800 hover:underline font-medium"
                    >
                      Track Refund Timeline →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
