"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  ShoppingBag, 
  Package, 
  RotateCcw, 
  ShieldCheck, 
  Zap, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  ExternalLink, 
  Clock, 
  Search, 
  User, 
  Check, 
  ArrowRight,
  Sparkles
} from "lucide-react";

interface OrderItem {
  orderId: string;
  itemName: string;
  amount: number;
  category: string;
  scenario: "CS_1" | "CS_2" | "CS_3";
  scenarioLabel: string;
  scenarioColor: string;
  deliveredDaysAgo: number;
  imageUrl: string;
  defaultReason: string;
  defaultDesc: string;
}

const DEMO_ORDERS: OrderItem[] = [
  {
    orderId: "ORD-88201",
    itemName: "Executive Laptop Sleeve 15-inch",
    amount: 2499,
    category: "DEFECTIVE_PRODUCT",
    scenario: "CS_1",
    scenarioLabel: "Fast-Track Auto-Approval (CS-1)",
    scenarioColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    deliveredDaysAgo: 2,
    imageUrl: "https://images.unsplash.com/photo-1544816155-12df9643f363?w=300&q=80",
    defaultReason: "DEFECTIVE_PRODUCT",
    defaultDesc: "Main zipper stitching came loose on first use; packaging fully intact."
  },
  {
    orderId: "ORD-88202",
    itemName: "Nimbus Wireless ANC Headphones",
    amount: 2999,
    category: "EXCEPTIONAL_PROOF_NEEDED",
    scenario: "CS_2",
    scenarioLabel: "High-Value Dual-Custody Exception (CS-2)",
    scenarioColor: "bg-amber-50 text-amber-700 border-amber-200",
    deliveredDaysAgo: 5,
    imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300&q=80",
    defaultReason: "PRODUCT_DAMAGED",
    defaultDesc: "Left ear cushion torn inside box. Requires human inspection of return serial number."
  },
  {
    orderId: "ORD-88203",
    itemName: "Aura Mechanical RGB Gaming Keyboard",
    amount: 3499,
    category: "OUTSIDE_RETURN_WINDOW",
    scenario: "CS_3",
    scenarioLabel: "Policy Denial: Expired Window (CS-3)",
    scenarioColor: "bg-rose-50 text-rose-700 border-rose-200",
    deliveredDaysAgo: 26,
    imageUrl: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=300&q=80",
    defaultReason: "CHANGED_MIND",
    defaultDesc: "Decided I do not like tactile switches. Delivered 26 days ago (14-day policy expired)."
  },
  {
    orderId: "ORD-88204",
    itemName: "Precision Stylus Pen Pro",
    amount: 1499,
    category: "DEFECTIVE_PRODUCT",
    scenario: "CS_1",
    scenarioLabel: "Multi-Item Order: Item #1 (CS-1)",
    scenarioColor: "bg-indigo-50 text-indigo-700 border-indigo-200",
    deliveredDaysAgo: 2,
    imageUrl: "https://images.unsplash.com/photo-1585336261026-620ca631d8c1?w=300&q=80",
    defaultReason: "DEFECTIVE_PRODUCT",
    defaultDesc: "Stylus pressure tip erratic out of the box."
  },
  {
    orderId: "ORD-88204",
    itemName: "MagSafe Fast Wireless Stand",
    amount: 1999,
    category: "DEFECTIVE_PRODUCT",
    scenario: "CS_1",
    scenarioLabel: "Multi-Item Order: Item #2 (Same Order, Different Model)",
    scenarioColor: "bg-cyan-50 text-cyan-700 border-cyan-200",
    deliveredDaysAgo: 2,
    imageUrl: "https://images.unsplash.com/photo-1622445262464-84b1456045b6?w=300&q=80",
    defaultReason: "DEFECTIVE_PRODUCT",
    defaultDesc: "Magnetic alignment coil overheats during fast charging."
  }
];

const CATALOG_ITEMS = [
  { id: "CAT-1", name: "Ergonomic Vertical Mouse", price: 1299, image: "https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=300&q=80", cat: "ACCESSORIES" },
  { id: "CAT-2", name: "Ultra-Fast 65W GaN Charger", price: 1899, image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=300&q=80", cat: "ELECTRONICS" },
  { id: "CAT-3", name: "Waterproof Travel Duffle Bag", price: 2199, image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=300&q=80", cat: "LUGGAGE" },
  { id: "CAT-4", name: "Smart Fitness Tracker Band", price: 2799, image: "https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?w=300&q=80", cat: "WEARABLES" }
];

export default function DummyShopPage() {
  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ticketResult, setTicketResult] = useState<any | null>(null);
  const [recentClaims, setRecentClaims] = useState<any[]>([]);

  // Form states inside modal
  const [claimCategory, setClaimCategory] = useState("DEFECTIVE_PRODUCT");
  const [claimDesc, setClaimDesc] = useState("");
  const [claimAmount, setClaimAmount] = useState<number>(2499);

  const openClaimModal = (order: OrderItem) => {
    setSelectedOrder(order);
    setClaimCategory(order.defaultReason);
    setClaimDesc(order.defaultDesc);
    setClaimAmount(order.amount);
    setTicketResult(null);
  };

  const handleInstantBuyAndClaim = (catalogItem: any) => {
    const dummyOrder: OrderItem = {
      orderId: `ORD-${Math.floor(10000 + Math.random() * 90000)}`,
      itemName: catalogItem.name,
      amount: catalogItem.price,
      category: "DEFECTIVE_PRODUCT",
      scenario: "CS_1",
      scenarioLabel: "Instant Order Claim (CS-1)",
      scenarioColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
      deliveredDaysAgo: 1,
      imageUrl: catalogItem.image,
      defaultReason: "DEFECTIVE_PRODUCT",
      defaultDesc: `Received ${catalogItem.name} with cosmetic blemish.`
    };
    openClaimModal(dummyOrder);
  };

  const handleDispatchTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;

    setSubmitting(true);
    setTicketResult(null);

    try {
      const res = await fetch("/api/create-test-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: selectedOrder.orderId,
          item_name: selectedOrder.itemName,
          claimed_amount: claimAmount,
          category: claimCategory,
          description: claimDesc,
          customer_name: "Aarav Mehta",
          customer_email: "aarav@example.com",
          customer_phone: "+91 98765 43210"
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "RITOS ingestion failed");
      }

      setTicketResult(data);
      setRecentClaims(prev => [data, ...prev]);
    } catch (err: any) {
      alert(`Error submitting claim to RITOS: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* 1. TOP ANNOUNCEMENT BANNER */}
      <div className="bg-slate-900 text-white text-xs py-2 px-4 border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="font-semibold text-emerald-400">ShopFlow eCommerce Demo:</span>
            <span className="text-slate-300">RITOS Multi-Agent Integration Sandbox (Port 3000 ⇄ Port 8000)</span>
          </div>
          <div className="flex items-center gap-4 text-slate-300">
            <Link 
              href="http://localhost:5173" 
              target="_blank" 
              className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              Open RITOS Desk Portal <ExternalLink size={12} />
            </Link>
          </div>
        </div>
      </div>

      {/* 2. STORE HEADER */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xl shadow-md">
              S
            </div>
            <div>
              <span className="font-bold text-xl tracking-tight text-slate-900">ShopFlow</span>
              <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium ml-2 border border-indigo-200">
                Demo Store
              </span>
            </div>
          </div>

          <div className="hidden md:flex flex-1 max-w-md mx-4">
            <div className="relative w-full">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Search orders, items, or refund policies..." 
                className="w-full pl-9 pr-4 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                defaultValue="Executive Laptop Sleeve"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 transition">
              <User size={14} className="text-indigo-600" />
              <span>Aarav Mehta</span>
            </div>
            <Link 
              href="http://localhost:5173" 
              target="_blank"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
            >
              <Zap size={13} /> Check RITOS Console
            </Link>
          </div>
        </div>
      </header>

      {/* 3. HERO & INSTRUCTIONS */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 rounded-2xl text-white p-6 sm:p-8 shadow-md relative overflow-hidden">
          <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 pointer-events-none bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]"></div>
          
          <div className="max-w-2xl space-y-3 relative z-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
              <Sparkles size={12} /> Test Multi-Agent Orchestration
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Test ShopFlow Claims against RITOS AI
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Every ticket submitted below transmits directly to RITOS’s webhook (<code className="bg-slate-800 px-1.5 py-0.5 rounded text-indigo-300">:8000/webhook/refund-tickets</code>). Watch RITOS’s 8 specialist agents adjudicate, calculate confidence, and assign the ticket to CS-1, CS-2, or CS-3 in real time.
            </p>
          </div>
        </div>
      </div>

      {/* 4. ORDERS READY FOR REFUND (CORE TEST SECTION) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Package size={18} className="text-indigo-600" />
              Recent Purchases (Select to Raise Ticket)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Click &quot;Raise Refund Ticket&quot; on any order to trigger RITOS triage:
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {DEMO_ORDERS.map((order) => (
            <div 
              key={order.orderId}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition flex flex-col justify-between"
            >
              <div>
                <div className="h-40 w-full overflow-hidden relative bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src={order.imageUrl} 
                    alt={order.itemName}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 left-2">
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border shadow-xs ${order.scenarioColor}`}>
                      {order.scenarioLabel}
                    </span>
                  </div>
                  <div className="absolute bottom-2 right-2 bg-slate-900/80 backdrop-blur text-white text-[10px] px-2 py-0.5 rounded">
                    Delivered {order.deliveredDaysAgo}d ago
                  </div>
                </div>

                <div className="p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[11px] font-mono font-medium text-slate-400">{order.orderId}</span>
                      <h3 className="font-bold text-sm text-slate-900">{order.itemName}</h3>
                    </div>
                    <span className="font-extrabold text-sm text-slate-900">
                      ₹{order.amount.toLocaleString()}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-2">
                    {order.defaultDesc}
                  </p>
                </div>
              </div>

              <div className="p-4 pt-0">
                <button
                  onClick={() => openClaimModal(order)}
                  className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition"
                >
                  <RotateCcw size={14} /> Raise Refund Ticket
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. 1-CLICK CATALOG SECTION */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ShoppingBag size={18} className="text-indigo-600" />
            Product Catalog (Buy &amp; Claim Simulator)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Test custom products with dynamic ticket generation:
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {CATALOG_ITEMS.map((item) => (
            <div key={item.id} className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs space-y-3">
              <div className="h-32 w-full rounded-lg overflow-hidden bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
              </div>
              <div>
                <span className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider">{item.cat}</span>
                <h4 className="font-semibold text-xs text-slate-900 truncate">{item.name}</h4>
                <div className="font-bold text-xs text-slate-900 mt-0.5">₹{item.price.toLocaleString()}</div>
              </div>
              <button
                onClick={() => handleInstantBuyAndClaim(item)}
                className="w-full py-1.5 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 rounded-lg text-[11px] font-semibold transition border border-slate-200"
              >
                1-Click Buy &amp; Claim
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 6. RECENT CLAIMS DISPATCHED LEDGER */}
      {recentClaims.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600" />
                Live Tickets Dispatched this Session ({recentClaims.length})
              </h3>
              <Link 
                href="http://localhost:5173" 
                target="_blank"
                className="text-xs font-semibold text-indigo-600 hover:underline flex items-center gap-1"
              >
                Inspect in RITOS Queues <ArrowRight size={12} />
              </Link>
            </div>

            <div className="divide-y divide-slate-100">
              {recentClaims.map((claim, idx) => (
                <div key={idx} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div>
                    <strong className="text-indigo-600 font-mono">{claim.ticket_id}</strong>
                    <span className="text-slate-400 mx-1.5">•</span>
                    <span className="font-medium text-slate-800">{claim.payload_sent?.item_name}</span>
                    <span className="text-slate-400 mx-1.5">•</span>
                    <span className="text-slate-500">₹{claim.payload_sent?.claimed_amount}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-bold">
                      {claim.ritos_response?.data?.assigned_desk || "CS_1"} ({claim.ritos_response?.data?.decision || "APPROVED"})
                    </span>
                    <Link 
                      href="http://localhost:5173" 
                      target="_blank"
                      className="text-indigo-600 hover:underline text-[11px] font-semibold"
                    >
                      View Ticket →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 7. REFUND SUBMISSION MODAL */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-semibold text-indigo-600">Raise Claim to RITOS</span>
                <h3 className="font-extrabold text-lg text-slate-900">{selectedOrder.itemName}</h3>
                <span className="text-xs text-slate-500 font-mono">{selectedOrder.orderId} • Claim: ₹{selectedOrder.amount}</span>
              </div>
              <button 
                onClick={() => setSelectedOrder(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg text-sm"
              >
                ✕
              </button>
            </div>

            {ticketResult ? (
              /* SUCCESS STATE FROM RITOS */
              <div className="space-y-4 pt-2">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                    <CheckCircle2 size={18} className="text-emerald-600" />
                    Ticket Successfully Ingested &amp; Triaged by RITOS!
                  </div>
                  <p className="text-xs text-emerald-700">
                    The 8-agent pipeline evaluated this ticket and assigned it to the appropriate resolution desk.
                  </p>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 font-mono text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Ticket Number:</span>
                    <strong className="text-indigo-600">{ticketResult.ticket_id}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Assigned Desk:</span>
                    <span className="font-bold text-slate-900">{ticketResult.ritos_response?.data?.assigned_desk || "CS_1"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Adjudication:</span>
                    <span className="font-bold text-emerald-700">{ticketResult.ritos_response?.data?.decision || "APPROVED"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Approved Amount:</span>
                    <span className="font-bold text-slate-900">₹{(ticketResult.ritos_response?.data?.refund_amount_minor / 100).toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Link
                    href="http://localhost:5173"
                    target="_blank"
                    className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs text-center shadow-sm flex items-center justify-center gap-1.5 transition"
                  >
                    Open Ticket in RITOS Console <ExternalLink size={13} />
                  </Link>
                  <button
                    onClick={() => setSelectedOrder(null)}
                    className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              /* CLAIM FORM */
              <form onSubmit={handleDispatchTicket} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Refund Reason
                  </label>
                  <select
                    value={claimCategory}
                    onChange={(e) => setClaimCategory(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="DEFECTIVE_PRODUCT">Defective / Damaged on Arrival (Fast-Track CS-1)</option>
                    <option value="WRONG_ITEM">Wrong Item Received</option>
                    <option value="SIZE_FIT_ISSUE">Size or Fitting Discrepancy</option>
                    <option value="EXCEPTIONAL_PROOF_NEEDED">High-Value Inspection Needed (CS-2)</option>
                    <option value="CHANGED_MIND">Customer Changed Mind / Outside Window (CS-3)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Claimed Refund Amount (INR)
                  </label>
                  <input
                    type="number"
                    value={claimAmount}
                    onChange={(e) => setClaimAmount(Number(e.target.value))}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Customer Statement / Evidence Details
                  </label>
                  <textarea
                    rows={3}
                    value={claimDesc}
                    onChange={(e) => setClaimDesc(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    placeholder="Describe the defect or reason for requesting refund..."
                    required
                  />
                </div>

                <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-800 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-indigo-600" />
                    Simulated RITOS Target:
                  </div>
                  <p className="text-[11px] text-indigo-700">
                    Dispatches webhook payload to <code className="font-mono font-bold">http://localhost:8000/webhook/refund-tickets</code> with Bearer API Key authentication.
                  </p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedOrder(null)}
                    className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs text-center shadow-sm flex items-center justify-center gap-2 transition disabled:opacity-50"
                  >
                    {submitting ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        Transmitting to RITOS...
                      </>
                    ) : (
                      <>
                        <Zap size={14} /> Submit Claim to RITOS
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
