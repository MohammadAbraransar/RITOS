"use client";

import Link from "next/link";
import { Star, ShieldCheck } from "lucide-react";

export function ProductCard({ product }: { product: any }) {
  const priceRupees = (product.price_minor / 100).toLocaleString("en-IN");

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition flex flex-col group">
      <Link href={`/products/${product.product_id}`} className="relative aspect-4/3 bg-slate-100 flex items-center justify-center overflow-hidden">
        {/* Placeholder gradient / image */}
        <div className="w-full h-full bg-gradient-to-tr from-slate-200 to-slate-100 flex items-center justify-center p-6 text-slate-400 group-hover:scale-105 transition duration-300">
          <span className="text-sm font-semibold tracking-wide text-slate-500 uppercase text-center">
            {product.name}
          </span>
        </div>

        {product.is_clearance && (
          <span className="absolute top-3 left-3 bg-rose-600 text-white text-[11px] font-bold px-2 py-0.5 rounded shadow-xs uppercase tracking-wider">
            Clearance
          </span>
        )}
      </Link>

      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div>
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>{product.category}</span>
            <div className="flex items-center space-x-1 text-amber-500">
              <Star className="w-3.5 h-3.5 fill-current" />
              <span className="font-semibold text-slate-700">{product.rating}</span>
            </div>
          </div>

          <Link href={`/products/${product.product_id}`}>
            <h3 className="font-semibold text-slate-900 group-hover:text-indigo-600 transition line-clamp-1">
              {product.name}
            </h3>
          </Link>
          <p className="text-xs text-slate-500 line-clamp-2 mt-1">
            {product.description}
          </p>
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 block">Price</span>
            <span className="text-lg font-bold text-slate-900">₹{priceRupees}</span>
          </div>

          <Link
            href={`/products/${product.product_id}`}
            className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg transition"
          >
            View Details
          </Link>
        </div>
      </div>
    </div>
  );
}
