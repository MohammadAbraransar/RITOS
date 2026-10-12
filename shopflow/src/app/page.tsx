"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  ShoppingBag, 
  Package, 
  RotateCcw, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  ExternalLink, 
  Clock, 
  Search, 
  User, 
  ArrowRight,
  Sparkles,
  Camera,
  Bot,
  FileCheck2,
  Cpu,
  UploadCloud,
  Layers,
  Eye,
  Trash2,
  GitFork,
  ArrowDown
} from "lucide-react";

interface OrderItem {
  orderId: string;
  itemName: string;
  amount: number;
  category: string;
  orderDate: string;
  deliveryStatus: string;
  deliveredDaysAgo: number;
  imageUrl: string;
  defaultReason: string;
  defaultDesc: string;
  suggestedProofImage?: string;
}

const DEMO_ORDERS: OrderItem[] = [
  {
    orderId: "ORD-88201",
    itemName: "Executive Laptop Sleeve 15-inch",
    amount: 2499,
    category: "APPAREL",
    orderDate: "October 10, 2026",
    deliveryStatus: "Delivered (2 days ago)",
    deliveredDaysAgo: 2,
    imageUrl: "https://images.unsplash.com/photo-1544816155-12df9643f363?w=300&q=80",
    defaultReason: "DEFECTIVE_PRODUCT",
    defaultDesc: "Main zipper stitching came loose on first use; packaging fully intact.",
    suggestedProofImage: "stitching_loose_zipper.jpg"
  },
  {
    orderId: "ORD-88202",
    itemName: "Nimbus Wireless ANC Headphones",
    amount: 2999,
    category: "ELECTRONICS",
    orderDate: "October 7, 2026",
    deliveryStatus: "Delivered (5 days ago)",
    deliveredDaysAgo: 5,
    imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300&q=80",
    defaultReason: "PRODUCT_DAMAGED",
    defaultDesc: "Left ear cushion torn inside box. Serial tag intact.",
    suggestedProofImage: "earcup_cushion_tear.jpg"
  },
  {
    orderId: "ORD-88203",
    itemName: "Aura Mechanical RGB Gaming Keyboard",
    amount: 3499,
    category: "ELECTRONICS",
    orderDate: "September 16, 2026",
    deliveryStatus: "Delivered (26 days ago)",
    deliveredDaysAgo: 26,
    imageUrl: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=300&q=80",
    defaultReason: "CHANGED_MIND",
    defaultDesc: "Decided I do not like tactile switches. Item is unopened.",
    suggestedProofImage: "unopened_box_keyboard.jpg"
  },
  {
    orderId: "ORD-88204",
    itemName: "Precision Stylus Pen Pro",
    amount: 1499,
    category: "ELECTRONICS",
    orderDate: "October 10, 2026",
    deliveryStatus: "Delivered (2 days ago) • Multi-Item Order",
    deliveredDaysAgo: 2,
    imageUrl: "https://images.unsplash.com/photo-1585336261026-620ca631d8c1?w=300&q=80",
    defaultReason: "DEFECTIVE_PRODUCT",
    defaultDesc: "Stylus pressure tip erratic out of the box.",
    suggestedProofImage: "stylus_pressure_sensor_defect.jpg"
  },
  {
    orderId: "ORD-88204",
    itemName: "MagSafe Fast Wireless Stand",
    amount: 1999,
    category: "ELECTRONICS",
    orderDate: "October 10, 2026",
    deliveryStatus: "Delivered (2 days ago) • Multi-Item Order",
    deliveredDaysAgo: 2,
    imageUrl: "https://images.unsplash.com/photo-1622445262464-84b1456045b6?w=300&q=80",
    defaultReason: "DEFECTIVE_PRODUCT",
    defaultDesc: "Magnetic alignment coil overheats during fast charging.",
    suggestedProofImage: "magsafe_overheating_coil.jpg"
  }
];

const CATALOG_ITEMS = [
  { id: "CAT-1", name: "Ergonomic Vertical Mouse", price: 1299, image: "https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=300&q=80", cat: "ACCESSORIES" },
  { id: "CAT-2", name: "Ultra-Fast 65W GaN Charger", price: 1899, image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=300&q=80", cat: "ELECTRONICS" },
  { id: "CAT-3", name: "Waterproof Travel Duffle Bag", price: 2199, image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=300&q=80", cat: "APPAREL" },
  { id: "CAT-4", name: "Smart Fitness Tracker Band", price: 2799, image: "https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?w=300&q=80", cat: "ELECTRONICS" }
];

export default function ShopFlowStorePage() {
  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ticketResult, setTicketResult] = useState<any | null>(null);
  const [recentClaims, setRecentClaims] = useState<any[]>([]);

  // Form states inside modal
  const [claimCategory, setClaimCategory] = useState("DEFECTIVE_PRODUCT");
  const [claimDesc, setClaimDesc] = useState("");
  const [claimAmount, setClaimAmount] = useState<number>(2499);
  const [attachPhoto, setAttachPhoto] = useState(true);
  const [photoName, setPhotoName] = useState("damage_defect_photo.jpg");
  const [customPhotoBase64, setCustomPhotoBase64] = useState<string | null>(null);
  const [customPhotoName, setCustomPhotoName] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCustomPhotoName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        const b64 = event.target?.result as string;
        setCustomPhotoBase64(b64);
        setAttachPhoto(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const openClaimModal = (order: OrderItem) => {
    setSelectedOrder(order);
    setClaimCategory(order.defaultReason);
    setClaimDesc(order.defaultDesc);
    setClaimAmount(order.amount);
    setPhotoName(order.suggestedProofImage || "stitching_loose_zipper.jpg");
    setCustomPhotoBase64(null);
    setCustomPhotoName(null);
    setAttachPhoto(true);
    setTicketResult(null);
    setSubmitError(null);
  };

  const handleInstantBuyAndClaim = (catalogItem: any) => {
    const dummyOrder: OrderItem = {
      orderId: `ORD-${Math.floor(10000 + Math.random() * 90000)}`,
      itemName: catalogItem.name,
      amount: catalogItem.price,
      category: catalogItem.cat,
      orderDate: "Today",
      deliveryStatus: "Delivered (1 day ago)",
      deliveredDaysAgo: 1,
      imageUrl: catalogItem.image,
      defaultReason: "DEFECTIVE_PRODUCT",
      defaultDesc: `Received ${catalogItem.name} with manufacturing blemish out of the box.`,
      suggestedProofImage: "hardware_defect_photo.jpg"
    };
    openClaimModal(dummyOrder);
  };

  const handleDispatchTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;

    setSubmitting(true);
    setTicketResult(null);
    setSubmitError(null);

    const purchaseDate = new Date(Date.now() - selectedOrder.deliveredDaysAgo * 86400000).toISOString();
    const evidenceImages = attachPhoto ? [customPhotoBase64 || photoName] : [];

    try {
      const res = await fetch("/api/create-test-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: selectedOrder.orderId,
          item_name: selectedOrder.itemName,
          item_category: selectedOrder.category,
          claimed_amount: claimAmount,
          category: claimCategory,
          description: claimDesc,
          purchase_date: purchaseDate,
          evidence_images: evidenceImages,
          customer_name: "Aarav Mehta",
          customer_email: "aarav@example.com",
          customer_phone: "+91 98765 43210"
        })
      });

      const data = await res.json();
      if (!res.ok && !data.success) {
        throw new Error(data.error || "RITOS ingestion failed");
      }

      setTicketResult(data);
      setRecentClaims(prev => [data, ...prev]);
    } catch (err: any) {
      setSubmitError(err.message || "Failed to submit return request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* 1. TOP ANNOUNCEMENT BANNER */}
      <div className="bg-slate-900 text-white text-xs py-2.5 px-4 border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="font-semibold text-emerald-400">ShopFlow eCommerce Store:</span>
            <span className="text-slate-300">Live Integrated with RITOS 8-Agent Orchestrator</span>
          </div>
          <div className="flex items-center gap-4 text-slate-300">
            <Link 
              href="http://localhost:5173" 
              target="_blank" 
              className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              Open RITOS Desk Console <ExternalLink size={12} />
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
              <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium ml-2 border border-slate-200">
                Official Store
              </span>
            </div>
          </div>

          <div className="hidden md:flex flex-1 max-w-md mx-4">
            <div className="relative w-full">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Search products, orders, or return policies..." 
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
              RITOS Agent Portal <ExternalLink size={12} />
            </Link>
          </div>
        </div>
      </header>

      {/* 3. HERO BANNER */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl text-white p-6 sm:p-8 shadow-md relative overflow-hidden">
          <div className="max-w-3xl space-y-3 relative z-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
              <Sparkles size={12} /> End-to-End Autonomous Adjudication
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Customer Orders &amp; Return Center
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Select any delivered item below and submit a return request. RITOS’s 8 specialist agents 
              autonomously verify the financial ledger, inspect photo evidence, enforce category return policies, 
              assess risk signals, and route the case dynamically in real time.
            </p>
          </div>
        </div>
      </div>

      {/* 4. ORDERS SECTION (CLEAN ECOMMERCE DESIGN) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Package size={18} className="text-indigo-600" />
              My Delivered Purchases
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select an item to request a replacement or refund:
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {DEMO_ORDERS.map((order) => (
            <div 
              key={`${order.orderId}-${order.itemName}`}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition flex flex-col justify-between"
            >
              <div>
                <div className="h-44 w-full overflow-hidden relative bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src={order.imageUrl} 
                    alt={order.itemName}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 left-2">
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-900/75 backdrop-blur-xs text-white border border-white/20 shadow-xs">
                      {order.category}
                    </span>
                  </div>
                  <div className="absolute bottom-2 right-2 bg-slate-900/80 backdrop-blur text-white text-[10px] px-2.5 py-1 rounded-md font-medium">
                    {order.deliveryStatus}
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
                  <RotateCcw size={14} /> Request Return / Refund
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. PRODUCT CATALOG */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ShoppingBag size={18} className="text-indigo-600" />
            Buy New Product (Live Intake Simulator)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Place an order for a new catalog item to generate a fresh order transaction:
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
                Buy &amp; Request Return
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
                Live Customer Claims Dispatched ({recentClaims.length})
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
                    <span className="bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 rounded text-[11px] font-bold">
                      Desk: {claim.ritos_response?.data?.assigned_desk || "CS_1"} ({claim.ritos_response?.data?.decision || "APPROVED"})
                    </span>
                    <Link 
                      href="http://localhost:5173" 
                      target="_blank" 
                      className="text-indigo-600 hover:underline text-[11px] font-semibold"
                    >
                      View in RITOS Console →
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150 my-8">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-semibold text-indigo-600">Customer Return Request</span>
                <h3 className="font-extrabold text-lg text-slate-900">{selectedOrder.itemName}</h3>
                <span className="text-xs text-slate-500 font-mono">
                  Order: {selectedOrder.orderId} • Claim Amount: ₹{selectedOrder.amount.toLocaleString()}
                </span>
              </div>
              <button 
                onClick={() => setSelectedOrder(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg text-sm"
              >
                ✕
              </button>
            </div>

            {ticketResult ? (
              /* REAL-TIME 8-AGENT ADJUDICATION RESULTS */
              <div className="space-y-4 pt-1 max-h-[75vh] overflow-y-auto pr-1">
                {/* Result Status Banner */}
                <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                  ticketResult.ritos_response?.data?.assigned_desk === "CS_1"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                    : ticketResult.ritos_response?.data?.assigned_desk === "CS_2"
                    ? "bg-amber-50 border-amber-200 text-amber-900"
                    : "bg-rose-50 border-rose-200 text-rose-900"
                }`}>
                  {ticketResult.ritos_response?.data?.assigned_desk === "CS_1" ? (
                    <CheckCircle2 size={24} className="text-emerald-600 shrink-0 mt-0.5" />
                  ) : ticketResult.ritos_response?.data?.assigned_desk === "CS_2" ? (
                    <AlertTriangle size={24} className="text-amber-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle size={24} className="text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm">
                        {ticketResult.ritos_response?.data?.assigned_desk === "CS_1" && "CS-1: Fast-Track Auto-Approval"}
                        {ticketResult.ritos_response?.data?.assigned_desk === "CS_2" && "CS-2: Exceptions & Proof Inspection Needed"}
                        {ticketResult.ritos_response?.data?.assigned_desk === "CS_3" && "CS-3: Non-Refundable / Policy Denial"}
                      </h4>
                      <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-white/80 border border-current shadow-2xs">
                        Desk: {ticketResult.ritos_response?.data?.assigned_desk || "CS_2"}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed opacity-90">
                      {ticketResult.ritos_response?.data?.policy_evaluation_reason}
                    </p>
                  </div>
                </div>

                {/* 3-STEP ROUTING DECISION TREE (RITOS ARCHITECTURE) */}
                <div className="bg-slate-900 text-white rounded-xl p-4 space-y-3 shadow-md border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1.5 text-indigo-300">
                      <GitFork size={14} className="text-indigo-400" />
                      RITOS Autonomous Decision Tree Routing
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Engine v2.6 • 3-Stage Verification
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                    {/* Step 1: Ledger Verification */}
                    <div className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                      ticketResult.ritos_response?.data?.routing_steps?.step_1?.status === "PASSED"
                        ? "bg-emerald-950/40 border-emerald-600/40 text-emerald-200"
                        : "bg-rose-950/40 border-rose-600/40 text-rose-200"
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[11px] flex items-center gap-1">
                          <span className="w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center text-[10px] text-white">1</span>
                          Ledger Verification
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                          ticketResult.ritos_response?.data?.routing_steps?.step_1?.status === "PASSED"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                        }`}>
                          {ticketResult.ritos_response?.data?.routing_steps?.step_1?.status || "PASSED"}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-snug">
                        {ticketResult.ritos_response?.data?.routing_steps?.step_1?.summary || "Transaction 100% verified in gateway; unrefunded balance exists."}
                      </p>
                    </div>

                    {/* Step 2: Policy Window */}
                    <div className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                      ticketResult.ritos_response?.data?.routing_steps?.step_2?.status === "WITHIN_WINDOW"
                        ? "bg-emerald-950/40 border-emerald-600/40 text-emerald-200"
                        : "bg-rose-950/40 border-rose-600/40 text-rose-200"
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[11px] flex items-center gap-1">
                          <span className="w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center text-[10px] text-white">2</span>
                          Policy Window
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                          ticketResult.ritos_response?.data?.routing_steps?.step_2?.status === "WITHIN_WINDOW"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                        }`}>
                          {ticketResult.ritos_response?.data?.routing_steps?.step_2?.status || "WITHIN WINDOW"}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-snug">
                        {ticketResult.ritos_response?.data?.routing_steps?.step_2?.summary || "Filing date is within return policy window (<= 14-30 days)."}
                      </p>
                    </div>

                    {/* Step 3: Risk & Evidence Check */}
                    <div className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                      ticketResult.ritos_response?.data?.routing_steps?.step_3?.status === "ALL_CLEAR"
                        ? "bg-emerald-950/40 border-emerald-600/40 text-emerald-200"
                        : ticketResult.ritos_response?.data?.routing_steps?.step_3?.status === "FLAGGED"
                        ? "bg-amber-950/40 border-amber-600/40 text-amber-200"
                        : "bg-rose-950/40 border-rose-600/40 text-rose-200"
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[11px] flex items-center gap-1">
                          <span className="w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center text-[10px] text-white">3</span>
                          Risk &amp; Proof Check
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                          ticketResult.ritos_response?.data?.routing_steps?.step_3?.status === "ALL_CLEAR"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        }`}>
                          {ticketResult.ritos_response?.data?.routing_steps?.step_3?.status || "EVALUATED"}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-snug">
                        {ticketResult.ritos_response?.data?.routing_steps?.step_3?.summary || "Visual proof verified and zero risk signals detected."}
                      </p>
                    </div>
                  </div>
                </div>

                {/* REAL COMPUTER VISION PROOF READING CARD */}
                {(ticketResult.ritos_response?.data?.visual_evidence?.has_visual_proof || customPhotoBase64) && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Camera size={14} className="text-indigo-600" />
                        Real-Time Visual Proof Telemetry (Pillow Vision Engine)
                      </span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-semibold">
                        {ticketResult.ritos_response?.data?.proof_status || "PROOF_INSPECTED"}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 items-start">
                      {/* Image Preview */}
                      {(ticketResult.ritos_response?.data?.visual_evidence?.image_preview_url || customPhotoBase64) && (
                        <div className="w-28 h-28 rounded-lg overflow-hidden border border-slate-300 shrink-0 bg-slate-200 relative shadow-inner">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img 
                            src={ticketResult.ritos_response?.data?.visual_evidence?.image_preview_url || customPhotoBase64 || ""} 
                            alt="Visual Evidence Proof"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] text-white text-center py-0.5 font-mono">
                            Vision Read
                          </div>
                        </div>
                      )}

                      {/* Vision Metrics */}
                      <div className="flex-1 space-y-1.5 text-xs">
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div className="p-2 bg-white rounded border border-slate-200">
                            <span className="text-slate-500 block text-[10px]">Tamper / Authenticity</span>
                            <span className="font-bold text-slate-800">
                              {ticketResult.ritos_response?.data?.visual_evidence?.tamper_detected ? "⚠️ Suspicious" : "✓ Authenticated"}
                            </span>
                          </div>
                          <div className="p-2 bg-white rounded border border-slate-200">
                            <span className="text-slate-500 block text-[10px]">Physical Defect Detection</span>
                            <span className="font-bold text-slate-800">
                              {ticketResult.ritos_response?.data?.visual_evidence?.damage_detected ? "✓ Physical Defect Confirmed" : "Normal / Undetected"}
                            </span>
                          </div>
                        </div>

                        {ticketResult.ritos_response?.data?.visual_evidence?.findings && (
                          <p className="text-[11px] text-slate-600 bg-white p-2 rounded border border-slate-200 leading-relaxed font-mono">
                            {ticketResult.ritos_response?.data?.visual_evidence?.findings}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 8-Agent Execution Telemetry Grid */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Cpu size={14} className="text-indigo-600" />
                      RITOS 8 Specialist Agents Live Trace
                    </span>
                    <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-mono font-semibold">
                      Ticket #{ticketResult.ticket_id}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {ticketResult.ritos_response?.data?.agents_trace?.map((ag: any, idx: number) => (
                      <div key={idx} className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[11px] text-slate-800 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Agent {idx + 1}: {ag.agent_name}
                          </span>
                          <span className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-600">
                            {ag.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-snug">
                          {ag.findings}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Customer Notification Draft Generated by Agent 8 */}
                {ticketResult.ritos_response?.data?.customer_message_draft && (
                  <div className="p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-1.5 text-xs">
                    <span className="font-bold text-indigo-900 flex items-center gap-1 text-[11px]">
                      <FileCheck2 size={13} className="text-indigo-600" />
                      Agent 8 Generated Customer Resolution Notice:
                    </span>
                    <p className="text-slate-700 text-xs italic bg-white p-2.5 rounded border border-indigo-100 leading-relaxed">
                      &quot;{ticketResult.ritos_response?.data?.customer_message_draft}&quot;
                    </p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <Link
                    href="http://localhost:5173"
                    target="_blank"
                    className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs text-center shadow-sm flex items-center justify-center gap-1.5 transition"
                  >
                    Inspect in RITOS Console <ExternalLink size={13} />
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
              /* CLEAN ECOMMERCE RETURN FORM */
              <form onSubmit={handleDispatchTicket} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Reason for Return
                  </label>
                  <select
                    value={claimCategory}
                    onChange={(e) => setClaimCategory(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="DEFECTIVE_PRODUCT">Defective or Malfunctioning Product</option>
                    <option value="PRODUCT_DAMAGED">Damaged in Transit / Broken Packaging</option>
                    <option value="WRONG_ITEM">Received Incorrect Item</option>
                    <option value="SIZE_FIT_ISSUE">Size or Fitting Discrepancy</option>
                    <option value="CHANGED_MIND">No Longer Needed / Changed Mind</option>
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
                    Customer Statement &amp; Issue Details
                  </label>
                  <textarea
                    rows={3}
                    value={claimDesc}
                    onChange={(e) => setClaimDesc(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    placeholder="Please explain the issue you experienced with the product..."
                    required
                  />
                </div>

                {/* Photo Evidence & Image Extraction Uploader */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                      <Camera size={14} className="text-indigo-600" />
                      Attach Photo Proof (Visual Evidence AI)
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={attachPhoto} 
                        onChange={(e) => setAttachPhoto(e.target.checked)}
                        className="rounded text-indigo-600"
                      />
                      Include Proof
                    </label>
                  </div>

                  {attachPhoto && (
                    <div className="space-y-3 pt-1">
                      {/* Real Image File Upload Dropzone */}
                      <div className="border-2 border-dashed border-indigo-200 bg-white rounded-xl p-3 text-center hover:border-indigo-400 transition cursor-pointer relative">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileUpload}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                          title="Upload damage or defect photo"
                        />
                        {customPhotoBase64 ? (
                          <div className="flex items-center justify-between gap-3 text-left">
                            <div className="flex items-center gap-3">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img 
                                src={customPhotoBase64} 
                                alt="Uploaded Proof Preview" 
                                className="w-12 h-12 rounded object-cover border border-slate-200"
                              />
                              <div>
                                <span className="font-bold text-xs text-slate-800 block truncate max-w-[200px]">
                                  {customPhotoName || "custom_uploaded_photo.jpg"}
                                </span>
                                <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                                  ✓ Live File Ready for Computer Vision AI
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setCustomPhotoBase64(null);
                                setCustomPhotoName(null);
                              }}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition"
                              title="Remove uploaded photo"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ) : (
                          <div className="py-2 space-y-1">
                            <UploadCloud className="mx-auto text-indigo-500" size={24} />
                            <p className="text-xs font-semibold text-slate-700">
                              Click or drag real product photo here
                            </p>
                            <p className="text-[10px] text-slate-400">
                              PNG, JPG, or WEBP • Will be read by Pillow Computer Vision Engine
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Or choose from defect presets */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-600 block">
                          Or Select Defect Sample Preset:
                        </label>
                        <select
                          value={photoName}
                          onChange={(e) => {
                            setPhotoName(e.target.value);
                            setCustomPhotoBase64(null);
                            setCustomPhotoName(null);
                          }}
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-700"
                        >
                          <option value="stitching_loose_zipper.jpg">📸 stitching_loose_zipper.jpg (Hardware/Seam Defect)</option>
                          <option value="earcup_cushion_tear.jpg">📸 earcup_cushion_tear.jpg (Acoustic Hardware Tear)</option>
                          <option value="damage_broken_box.jpg">📦 damage_broken_box.jpg (Transit Package Damage)</option>
                          <option value="shipping_label_barcode.jpg">🏷️ shipping_label_barcode.jpg (Serial/Box Label Proof)</option>
                          <option value="clean_unopened_package.jpg">📦 clean_unopened_package.jpg (Unopened Product Photo)</option>
                        </select>
                      </div>

                      <p className="text-[11px] text-slate-500">
                        RITOS Agent 7 applies Pillow edge-detection, fracture asymmetry, and token OCR verification in real-time.
                      </p>
                    </div>
                  )}
                </div>

                {submitError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
                    <AlertTriangle size={15} className="shrink-0 text-rose-600" />
                    <span>{submitError}</span>
                  </div>
                )}

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
                        Transmitting to RITOS 8 Agents...
                      </>
                    ) : (
                      <>
                        <Bot size={14} /> Submit Return Request
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
