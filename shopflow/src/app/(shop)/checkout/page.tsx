"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Smartphone, Building, Banknote, ShieldCheck, AlertCircle } from "lucide-react";

export default function CheckoutPage() {
  const router = useRouter();
  const [cart, setCart] = useState<{ items: any[]; total_minor: number } | null>(null);
  const [user, setUser] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<"UPI" | "CARD" | "NETBANKING" | "COD">("UPI");
  const [paymentIdentifier, setPaymentIdentifier] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [address, setAddress] = useState({
    street: "Flat 402, Lotus Residency, Hitech City",
    city: "Hyderabad",
    state: "Telangana",
    pincode: "500081",
  });

  useEffect(() => {
    fetch("/api/me")
      .then((res) => {
        if (!res.ok) router.push("/login?redirect=/checkout");
        return res.json();
      })
      .then((data) => setUser(data))
      .catch(() => router.push("/login?redirect=/checkout"));

    fetch("/api/cart")
      .then((res) => res.json())
      .then((data) => setCart(data))
      .catch(() => {});
  }, [router]);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_method: paymentMethod,
          payment_identifier: paymentIdentifier || undefined,
          shipping_address: address,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error?.message || "Checkout failed. Please check payment details.");
        return;
      }

      router.push(`/orders/${data.order_id}/confirmation`);
    } catch {
      setErrorMessage("Network error processing order.");
    } finally {
      setSubmitting(false);
    }
  };

  const totalRupees = ((cart?.total_minor || 0) / 100).toLocaleString("en-IN");

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Checkout</h1>
        <p className="text-sm text-slate-500">
          Review your shipping address and complete payment with mock provider.
        </p>
      </div>

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center space-x-3 text-rose-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleCheckout} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Shipping Address */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <h2 className="font-bold text-slate-900 text-base">Shipping Address</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-600 block mb-1">Street Address</label>
                <input
                  type="text"
                  required
                  value={address.street}
                  onChange={(e) => setAddress({ ...address, street: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">City</label>
                <input
                  type="text"
                  required
                  value={address.city}
                  onChange={(e) => setAddress({ ...address, city: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">State</label>
                <input
                  type="text"
                  required
                  value={address.state}
                  onChange={(e) => setAddress({ ...address, state: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Pincode</label>
                <input
                  type="text"
                  required
                  value={address.pincode}
                  onChange={(e) => setAddress({ ...address, pincode: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white"
                />
              </div>
            </div>
          </div>

          {/* Payment Method */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <h2 className="font-bold text-slate-900 text-base">Payment Method (Mock Provider)</h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { id: "UPI", label: "UPI", icon: Smartphone },
                { id: "CARD", label: "Card", icon: CreditCard },
                { id: "NETBANKING", label: "NetBanking", icon: Building },
                { id: "COD", label: "Cash on Delivery", icon: Banknote },
              ].map((m) => {
                const Icon = m.icon;
                const isSelected = paymentMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id as any)}
                    className={`p-3.5 rounded-xl border flex flex-col items-center justify-center text-center space-y-2 transition ${
                      isSelected
                        ? "border-indigo-600 bg-indigo-50/50 text-indigo-700"
                        : "border-slate-200 hover:bg-slate-50 text-slate-600"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-xs font-semibold">{m.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-2 pt-2">
              <label className="text-xs font-semibold text-slate-600 block">
                {paymentMethod === "UPI" ? "UPI ID" : paymentMethod === "CARD" ? "Card Number" : "Account ID"}
              </label>
              <input
                type="text"
                placeholder={paymentMethod === "UPI" ? "aarav@okhdfcbank" : "4111 2222 3333 4444"}
                value={paymentIdentifier}
                onChange={(e) => setPaymentIdentifier(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white"
              />
              <p className="text-[11px] text-slate-400">
                Tip: Enter <span className="font-mono text-rose-600 font-semibold">fail@mock</span> to simulate a payment decline.
              </p>
            </div>
          </div>
        </div>

        {/* Order Summary & Confirm Button */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5 h-fit">
          <h2 className="font-bold text-slate-900 text-base">Payment Summary</h2>

          <div className="space-y-2 text-xs text-slate-600 border-b border-slate-100 pb-3">
            <div className="flex justify-between">
              <span>Items</span>
              <span>{cart?.items?.length || 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>₹{totalRupees}</span>
            </div>
            <div className="flex justify-between">
              <span>Shipping Fee</span>
              <span className="text-emerald-600 font-medium">FREE</span>
            </div>
          </div>

          <div className="flex justify-between font-extrabold text-slate-900 text-lg">
            <span>Amount to Pay</span>
            <span>₹{totalRupees}</span>
          </div>

          <button
            type="submit"
            disabled={submitting || (cart?.items?.length || 0) === 0}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition shadow-sm disabled:opacity-50"
          >
            {submitting ? "Processing Payment..." : `Pay ₹${totalRupees}`}
          </button>

          <div className="flex items-center space-x-2 text-[11px] text-slate-400 justify-center">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>End-to-end ledger audit guaranteed</span>
          </div>
        </div>
      </form>
    </div>
  );
}
