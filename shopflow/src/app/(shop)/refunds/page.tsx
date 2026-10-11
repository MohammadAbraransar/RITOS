"use client";

import Link from "next/link";
import { RotateCcw, ArrowRight, Package } from "lucide-react";

export default function RefundsIndexPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <RotateCcw className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Customer Refund Claims</h1>
        <p className="text-slate-600 max-w-md mx-auto mb-6 text-sm">
          Refund tickets in ShopFlow are attached to individual orders and verified autonomously by RITOS.
        </p>
        <div className="flex justify-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition"
          >
            <Package className="w-4 h-4" /> Go to Demo Orders &amp; Claims <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
