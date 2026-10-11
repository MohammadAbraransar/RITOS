import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShopFlow - System of Record for RITOS",
  description: "NextGen E-Commerce Platform & Source System for Refund Intelligence & Orchestration System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
