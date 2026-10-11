"use client";

import { useEffect, useState } from "react";
import { PolicyPanel } from "@/components/shop/PolicyPanel";
import { Star, ShoppingBag, Check, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ProductDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [addingToCart, setAddingToCart] = useState(false);
  const [addedSuccess, setAddedSuccess] = useState(false);

  useEffect(() => {
    fetch(`/api/products/${params.id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Product not found");
        return res.json();
      })
      .then((data) => {
        setProduct(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [params.id]);

  const handleAddToCart = async () => {
    if (!product) return;
    setAddingToCart(true);
    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.product_id, quantity: 1 }),
      });
      if (res.ok) {
        setAddedSuccess(true);
        setTimeout(() => setAddedSuccess(false), 2500);
      }
    } finally {
      setAddingToCart(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-slate-400">Loading product details...</div>;
  }

  if (!product) {
    return (
      <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
        <p className="text-slate-600 font-medium">Product not found.</p>
      </div>
    );
  }

  const priceRupees = (product.price_minor / 100).toLocaleString("en-IN");

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Product Image Placeholder */}
        <div className="bg-white rounded-2xl border border-slate-200 p-8 flex items-center justify-center min-h-[380px] bg-gradient-to-tr from-slate-100 to-slate-50">
          <div className="text-center space-y-2">
            <span className="text-6xl font-black text-slate-300 block">
              {product.category[0]}
            </span>
            <span className="text-sm font-semibold text-slate-600 block uppercase tracking-wider">
              {product.name}
            </span>
            <span className="text-xs text-slate-400 font-mono block">
              SKU: {product.sku}
            </span>
          </div>
        </div>

        {/* Product Meta & Actions */}
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between text-sm text-slate-500 mb-1">
              <span className="font-semibold text-indigo-600 uppercase tracking-wider text-xs">
                {product.brand} • {product.category}
              </span>
              <div className="flex items-center space-x-1 text-amber-500">
                <Star className="w-4 h-4 fill-current" />
                <span className="font-bold text-slate-700">{product.rating}</span>
              </div>
            </div>

            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {product.name}
            </h1>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              {product.description}
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-baseline justify-between">
            <div>
              <span className="text-xs text-slate-500 block">Total Price (incl. GST)</span>
              <span className="text-3xl font-extrabold text-slate-900">₹{priceRupees}</span>
            </div>
            <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              {product.stock > 0 ? `In Stock (${product.stock} units)` : "Out of Stock"}
            </span>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={handleAddToCart}
              disabled={addingToCart || product.stock <= 0}
              className={`flex-1 py-3 px-6 rounded-xl font-semibold text-sm flex items-center justify-center space-x-2 transition shadow-sm ${
                addedSuccess
                  ? "bg-emerald-600 text-white"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white"
              }`}
            >
              {addedSuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Added to Cart!</span>
                </>
              ) : (
                <>
                  <ShoppingBag className="w-4 h-4" />
                  <span>{addingToCart ? "Adding..." : "Add to Cart"}</span>
                </>
              )}
            </button>

            <button
              onClick={async () => {
                await handleAddToCart();
                router.push("/cart");
              }}
              className="py-3 px-6 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-sm transition"
            >
              Buy Now
            </button>
          </div>

          {/* Technical Specifications */}
          {product.specs && Object.keys(product.specs).length > 0 && (
            <div className="border-t border-slate-200 pt-5 space-y-2">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Specifications
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(product.specs).map(([key, val]) => (
                  <div key={key} className="bg-white p-2.5 rounded-lg border border-slate-100">
                    <span className="text-slate-400 capitalize block">{key}</span>
                    <span className="font-medium text-slate-700">{String(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Prominent Structured Policy Panel */}
          <PolicyPanel policy={product.refund_policy} />
        </div>
      </div>
    </div>
  );
}
