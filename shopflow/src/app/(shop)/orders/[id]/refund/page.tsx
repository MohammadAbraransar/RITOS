"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  ArrowLeft, 
  Upload, 
  AlertCircle, 
  CheckCircle, 
  RotateCcw,
  ShieldCheck,
  FileText
} from "lucide-react";

export default function OrderRefundPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [reason, setReason] = useState<string>("PRODUCT_DAMAGED");
  const [requestedAction, setRequestedAction] = useState<string>("FULL_REFUND");
  const [description, setDescription] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/orders/${params.id}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || "Failed to load order");
        }
        return res.json();
      })
      .then((data) => {
        setOrder(data.order);
        if (data.order.items?.length > 0) {
          setSelectedItemId(data.order.items[0].id);
        }
        setLoading(false);
      })
      .catch((err) => {
        setErrorMsg(err.message);
        setLoading(false);
      });
  }, [params.id]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("order_item_id", selectedItemId);
      formData.append("reason", reason);
      formData.append("requested_action", requestedAction);
      formData.append("description", description);

      const selectedItem = order.items.find((it: any) => it.id === selectedItemId);
      if (selectedItem) {
        formData.append("requested_amount_minor", String(selectedItem.unit_price_minor * selectedItem.quantity));
      }

      for (const file of files) {
        formData.append("files", file);
      }

      const res = await fetch(`/api/me/orders/${params.id}/refund-tickets`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to create refund ticket");
      }

      const ticketId = data.ticket_id || data.ticket?.id || data.id;
      router.push(`/refunds/${ticketId}`);
    } catch (err: any) {
      setErrorMsg(err.message);
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-slate-500">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent mb-2"></div>
        <p>Loading refund options...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-slate-800">Order Not Found</h2>
        <Link href="/orders" className="text-indigo-600 hover:underline text-sm">
          Back to Orders
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link
        href={`/orders/${params.id}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Order {params.id}
      </Link>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-indigo-600" /> Request a Refund
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Submit a refund claim for order <span className="font-mono">{order.id}</span>
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Item Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Select Item
            </label>
            <div className="space-y-2">
              {order.items.map((item: any) => (
                <label
                  key={item.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                    selectedItemId === item.id
                      ? "border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-600"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="orderItem"
                    value={item.id}
                    checked={selectedItemId === item.id}
                    onChange={() => setSelectedItemId(item.id)}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <img
                    src={item.image_url}
                    alt={item.product_name}
                    className="w-12 h-12 object-cover rounded border border-slate-200 bg-slate-50"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {item.product_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      Qty: {item.quantity} · ₹{(item.unit_price_minor * item.quantity / 100).toLocaleString("en-IN")}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Reason Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="refund-reason" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Reason for Refund
              </label>
              <select
                id="refund-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="PRODUCT_DAMAGED">Product Damaged</option>
                <option value="PRODUCT_DEFECTIVE">Product Defective</option>
                <option value="WRONG_PRODUCT">Wrong Product Received</option>
                <option value="MISSING_ITEM">Missing Item</option>
                <option value="NOT_AS_DESCRIBED">Not as Described</option>
                <option value="CHANGED_MIND">Changed Mind</option>
              </select>
            </div>

            <div>
              <label htmlFor="refund-action" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Requested Resolution
              </label>
              <select
                id="refund-action"
                value={requestedAction}
                onChange={(e) => setRequestedAction(e.target.value)}
                className="w-full text-sm border border-slate-300 rounded-lg p-2.5 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="FULL_REFUND">Full Refund</option>
                <option value="PARTIAL_REFUND">Partial Refund</option>
                <option value="REPLACEMENT">Replacement</option>
                <option value="EXCHANGE">Exchange</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="refund-description" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Description of Issue
            </label>
            <textarea
              id="refund-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Please describe why you are requesting a refund..."
              className="w-full text-sm border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Upload Evidence (Photos/PDF)
            </label>
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:bg-slate-50 transition">
              <input
                id="evidence-upload"
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleFileChange}
                className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
              />
              <p className="text-[11px] text-slate-400 mt-2">
                Supported formats: JPG, PNG, WEBP, PDF (Up to 5 files, 5MB each)
              </p>
            </div>
            {files.length > 0 && (
              <div className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <div key={i} className="text-xs text-slate-600 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{f.name} ({(f.size / 1024).toFixed(1)} KB)</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <div className="pt-3">
            <button
              id="submit-refund-btn"
              type="submit"
              disabled={submitting || !selectedItemId}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold text-sm rounded-lg shadow-sm transition"
            >
              {submitting ? "Submitting Request..." : "Submit Refund Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
