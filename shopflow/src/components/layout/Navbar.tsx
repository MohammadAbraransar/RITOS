"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ShoppingBag, User as UserIcon, LogOut, ShieldCheck, Menu, X } from "lucide-react";

import { getStoredAuthUser, setStoredAuthUser, clearStoredAuth } from "@/client/auth";

const NAV_LINKS = [
  { href: "/products", label: "Products" },
  { href: "/orders", label: "My Orders" },
  { href: "/refunds", label: "Refunds" },
];

export function Navbar() {
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [cartCount, setCartCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // 1. Instant hydration from sessionStorage
    const cached = getStoredAuthUser();
    if (cached) {
      setUser(cached);
    }

    // 2. Authoritative sync with backend /api/me
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.name) {
          setUser(data);
          setStoredAuthUser(data);
        } else {
          setUser(null);
          clearStoredAuth();
        }
      })
      .catch(() => {});

    fetch("/api/cart")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setCartCount(data?.item_count || 0))
      .catch(() => {});
  }, []);

  // Close the mobile menu after navigating
  useEffect(() => setMenuOpen(false), [pathname]);

  const handleLogout = async () => {
    clearStoredAuth();
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-6 min-w-0">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              S
            </span>
            <span className="font-bold text-xl tracking-tight text-slate-900">
              ShopFlow
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-sm font-medium text-slate-600">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-2 rounded-lg hover:text-indigo-600 hover:bg-slate-50 transition ${
                  isActive(link.href) ? "text-indigo-600" : ""
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <Link
            href="/cart"
            className="relative inline-flex items-center justify-center w-10 h-10 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-slate-50 transition"
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
            <div className="hidden md:flex items-center gap-2 text-sm">
              {user.role === "ADMIN" && (
                <Link
                  href="/admin"
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Admin</span>
                </Link>
              )}
              <span className="text-slate-700 font-medium max-w-[10rem] truncate">{user.name}</span>
              <button
                onClick={handleLogout}
                className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition"
                title="Logout"
                aria-label="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 sm:gap-2">
              <Link
                href="/login"
                className="hidden sm:inline-flex items-center px-3.5 py-2 text-sm font-medium text-slate-700 hover:text-indigo-600 transition"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center px-3.5 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition shadow-sm"
              >
                Sign up
              </Link>
            </div>
          )}

          <button
            type="button"
            data-mobile-nav-toggle
            onClick={() => setMenuOpen((open) => !open)}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav
          id="mobile-nav"
          data-mobile-nav
          className="md:hidden border-t border-slate-200 bg-white px-4 sm:px-6 py-3 space-y-1 shadow-sm"
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center px-3 py-3 rounded-lg text-sm font-medium transition ${
                isActive(link.href) ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {link.label}
            </Link>
          ))}

          <div className="pt-2 mt-2 border-t border-slate-100 space-y-1">
            {user ? (
              <>
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500">
                  <UserIcon className="w-4 h-4 shrink-0" />
                  <span className="font-medium text-slate-800 truncate">{user.name}</span>
                </div>
                {user.role === "ADMIN" && (
                  <Link
                    href="/admin"
                    className="flex items-center gap-2 px-3 py-3 rounded-lg text-sm font-medium text-amber-700 hover:bg-amber-50 transition"
                  >
                    <ShieldCheck className="w-4 h-4" /> Admin Console
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-3 rounded-lg text-sm font-medium text-rose-600 hover:bg-rose-50 transition"
                >
                  <LogOut className="w-4 h-4" /> Log out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="flex items-center px-3 py-3 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                Log in
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
