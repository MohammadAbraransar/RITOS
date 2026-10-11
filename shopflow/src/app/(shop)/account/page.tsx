"use client";

import Link from "next/link";
import { User, Package, RotateCcw, ArrowRight } from "lucide-react";

export default function AccountIndexPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
        <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <User className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">My Account</h1>
        <p className="text-slate-600 max-w-md mx-auto mb-6 text-sm">
          Welcome to your ShopFlow customer account dashboard.
        </p>
        <div className="flex justify-center gap-4">
          <Link
            href="/account/orders"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-medium text-sm hover:bg-indigo-700 transition"
          >
            <Package className="w-4 h-4" /> View My Orders <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-medium text-sm hover:bg-slate-50 transition"
          >
            <RotateCcw className="w-4 h-4" /> Return to Storefront
          </Link>
        </div>
      </div>
    </div>
  );
}
