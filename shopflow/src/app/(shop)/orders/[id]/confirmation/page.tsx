"use client";

import Link from "next/link";
import { CheckCircle2, Package, ArrowRight } from "lucide-react";

export default function OrderConfirmationPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <div className="max-w-md mx-auto text-center py-16 bg-white rounded-2xl border border-slate-200 p-8 space-y-6">
      <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-10 h-10" />
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Order Confirmed!</h1>
        <p className="text-sm text-slate-500">
          Thank you for your order. We have recorded your purchase in ShopFlow.
        </p>
      </div>

      <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-left text-xs font-mono space-y-1">
        <div className="flex justify-between">
          <span className="text-slate-500">Order ID:</span>
          <span className="font-bold text-slate-800">{params.id}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Status:</span>
          <span className="text-indigo-600 font-semibold">CONFIRMED</span>
        </div>
      </div>

      <div className="space-y-3 pt-2">
        <Link
          href={`/account/orders/${params.id}`}
          className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-sm flex items-center justify-center space-x-2 transition"
        >
          <span>Track Order</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
        <Link
          href="/products"
          className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-sm block transition"
        >
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}
