"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trash2, Plus, Minus, ArrowRight, ShoppingBag } from "lucide-react";

export default function CartPage() {
  const [cart, setCart] = useState<{ items: any[]; total_minor: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCart = () => {
    fetch("/api/cart")
      .then((res) => res.json())
      .then((data) => {
        setCart(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchCart();
  }, []);

  const updateQuantity = async (productId: string, quantity: number) => {
    await fetch("/api/cart", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, quantity }),
    });
    fetchCart();
  };

  const clearAll = async () => {
    await fetch("/api/cart", { method: "DELETE" });
    fetchCart();
  };

  if (loading) {
    return <div className="p-12 text-center text-slate-400">Loading your cart...</div>;
  }

  const items = cart?.items || [];
  const totalRupees = ((cart?.total_minor || 0) / 100).toLocaleString("en-IN");

  if (items.length === 0) {
    return (
      <div className="max-w-md mx-auto text-center py-16 bg-white rounded-2xl border border-slate-200 p-8 space-y-4">
        <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto">
          <ShoppingBag className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Your Cart is Empty</h2>
        <p className="text-sm text-slate-500">
          Looks like you haven&apos;t added anything to your cart yet.
        </p>
        <Link
          href="/products"
          className="inline-flex items-center justify-center px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-sm transition"
        >
          Explore Catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Shopping Cart</h1>
        <button
          onClick={clearAll}
          className="text-xs text-rose-600 hover:text-rose-700 font-medium"
        >
          Clear Cart
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => (
            <div
              key={item.productId}
              className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-4"
            >
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 bg-slate-100 rounded-lg flex items-center justify-center font-bold text-slate-400 text-xs uppercase">
                  {item.name.substring(0, 4)}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm">{item.name}</h3>
                  <span className="text-xs text-slate-500">
                    ₹{(item.priceMinor / 100).toLocaleString("en-IN")} each
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50">
                  <button
                    onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                    className="p-1.5 text-slate-600 hover:text-slate-900"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="px-2 text-xs font-bold text-slate-800">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                    className="p-1.5 text-slate-600 hover:text-slate-900"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  onClick={() => updateQuantity(item.productId, 0)}
                  className="p-2 text-slate-400 hover:text-rose-600 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Cart Summary */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4 h-fit">
          <h2 className="text-base font-bold text-slate-900">Order Summary</h2>
          <div className="space-y-2 text-xs text-slate-600">
            <div className="flex justify-between">
              <span>Items Total ({items.length})</span>
              <span>₹{totalRupees}</span>
            </div>
            <div className="flex justify-between">
              <span>Estimated Shipping</span>
              <span className="text-emerald-600 font-medium">FREE</span>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3 flex justify-between font-bold text-slate-900 text-base">
            <span>Total</span>
            <span>₹{totalRupees}</span>
          </div>

          <Link
            href="/checkout"
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm flex items-center justify-center space-x-2 transition shadow-sm"
          >
            <span>Proceed to Checkout</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
