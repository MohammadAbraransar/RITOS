"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ShoppingBag, User as UserIcon, LogOut, ShieldCheck } from "lucide-react";

export function Navbar() {
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setUser(data))
      .catch(() => {});

    fetch("/api/cart")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setCartCount(data?.item_count || 0))
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <Link href="/" className="flex items-center space-x-2">
            <span className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              S
            </span>
            <span className="font-bold text-xl tracking-tight text-slate-900">
              ShopFlow
            </span>
          </Link>

          <nav className="hidden md:flex space-x-6 text-sm font-medium text-slate-600">
            <Link href="/products" className="hover:text-indigo-600 transition">
              Products
            </Link>
            <Link href="/account/orders" className="hover:text-indigo-600 transition">
              My Orders
            </Link>
            <Link href="/account/refunds" className="hover:text-indigo-600 transition">
              Refunds
            </Link>
          </nav>
        </div>

        <div className="flex items-center space-x-4">
          <Link
            href="/cart"
            className="relative p-2 text-slate-600 hover:text-indigo-600 transition"
            aria-label="View Cart"
          >
            <ShoppingBag className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-indigo-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </Link>

          {user ? (
            <div className="flex items-center space-x-3 text-sm">
              {user.role === "ADMIN" && (
                <Link
                  href="/admin"
                  className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Admin</span>
                </Link>
              )}
              <span className="text-slate-700 font-medium hidden sm:inline">
                {user.name}
              </span>
              <button
                onClick={handleLogout}
                className="p-1.5 text-slate-500 hover:text-rose-600 transition"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <Link
                href="/login"
                className="px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:text-indigo-600 transition"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="px-3.5 py-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition shadow-sm"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
