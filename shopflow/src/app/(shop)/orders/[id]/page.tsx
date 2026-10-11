"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  ArrowLeft, 
  Package, 
  Truck, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  RotateCcw, 
  CreditCard, 
  MapPin, 
  ShieldCheck 
} from "lucide-react";

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/orders/${params.id}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || "Failed to load order");
        }
        return res.json();
      })
      .then((data) => {
        setOrder(data.order);
        setLoading(false);
      })
      .catch((err) => {
        setErrorMsg(err.message);
        setLoading(false);
      });
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
        <p>Loading order details...</p>
      </div>
    );
  }

  if (errorMsg || !order) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-4">
        <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center mx-auto text-rose-600">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Order Not Found</h2>
        <p className="text-sm text-slate-500">{errorMsg || "Unable to display this order."}</p>
        <Link
          href="/orders"
          className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
        >
          Back to My Orders
        </Link>
      </div>
    );
  }

  const isDelivered = order.status === "DELIVERED";
  const hasActiveTicket = order.tickets && order.tickets.length > 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/orders"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition"
        >
          <ArrowLeft className="w-4 h-4" /> Back to My Orders
        </Link>
        <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2.5 py-1 rounded">
          {order.id}
        </span>
      </div>

      {/* Status Progress Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Order {isDelivered ? "Delivered" : order.status}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Placed on {new Date(order.ordered_at).toLocaleString("en-IN")}
              {order.delivered_at && ` · Delivered on ${new Date(order.delivered_at).toLocaleDateString("en-IN")}`}
            </p>
          </div>

          {/* Refund Trigger Button / State */}
          {isDelivered && !hasActiveTicket && (
            <div className="flex flex-col sm:flex-row items-end gap-2">
              <Link
                href={`/orders/${order.id}/refund`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold shadow-sm transition"
              >
                <RotateCcw className="w-4 h-4" /> Request Refund
              </Link>
              <span className="text-[11px] text-slate-500">
                {order.days_since_delivery !== null
                  ? `Delivered ${order.days_since_delivery} days ago`
                  : "Policy window active"}
              </span>
            </div>
          )}

          {!isDelivered && (
            <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <span>Refund option unlocks upon delivery</span>
            </div>
          )}
        </div>

        {/* Existing Refund Notice */}
        {hasActiveTicket && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                Refund Ticket: {order.tickets[0].ticket_number}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-200 text-amber-900">
                {order.tickets[0].status}
              </span>
            </div>
            <p className="text-xs text-amber-800">
              Your refund request for reason &quot;{order.tickets[0].reason}&quot; is currently undergoing orchestration.
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Items */}
        <div className="md:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
              Items Ordered ({order.items.length})
            </h2>

            <div className="divide-y divide-slate-100">
              {order.items.map((item: any) => (
                <div key={item.id} className="py-4 first:pt-0 last:pb-0 flex items-start gap-4">
                  <img
                    src={item.image_url}
                    alt={item.product_name}
                    className="w-16 h-16 object-cover rounded-lg border border-slate-200 bg-slate-50 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/products/${item.product_id}`}
                      className="text-sm font-semibold text-slate-900 hover:text-indigo-600 transition block truncate"
                    >
                      {item.product_name}
                    </Link>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">SKU: {item.product_sku}</p>
                    <p className="text-xs text-slate-600 mt-1">
                      Qty: {item.quantity} × {formatPrice(item.unit_price_minor)}
                    </p>

                    {item.policy && (
                      <div className="mt-2 p-2 bg-slate-50 border border-slate-100 rounded text-[11px] text-slate-600 space-y-0.5">
                        <div className="flex items-center gap-1 font-medium text-slate-800">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{item.policy.return_window_days}-Day {item.policy.policy_type} Policy</span>
                        </div>
                        <div>
                          Return Shipping: {item.policy.return_shipping} · Replacement: {item.policy.replacement_allowed ? "Allowed" : "No"}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="text-right text-sm font-bold text-slate-900">
                    {formatPrice(item.unit_price_minor * item.quantity)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Payment & Shipping Info */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-indigo-600" /> Payment Summary
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Method</span>
                <span className="font-medium text-slate-800">{order.payment?.method || "UPI"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status</span>
                <span className="font-medium text-emerald-600">{order.payment?.status || "PAID"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Txn Ref</span>
                <span className="font-mono text-slate-700 text-[11px] truncate max-w-[140px]">
                  {order.payment?.transaction_id}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-100 flex justify-between text-sm font-bold text-slate-900">
                <span>Total Paid</span>
                <span>{formatPrice(order.total_minor)}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-indigo-600" /> Delivery Address
            </h3>
            <div className="text-xs text-slate-600 space-y-0.5">
              <p className="font-medium text-slate-800">{order.shipping_address?.street}</p>
              <p>{order.shipping_address?.city}, {order.shipping_address?.state}</p>
              <p className="font-mono text-slate-500">{order.shipping_address?.pincode}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
