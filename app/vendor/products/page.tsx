"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/app/lib/auth-context";
import { formatCurrency } from "@/lib/formatCurrency";
import { Package, Plus, Search, Eye, Edit, Trash2 } from "lucide-react";
import Link from "next/link";

type Product = {
  id: string;
  name: string;
  base_price: number;
  avg_rating: number;
  total_sold: number;
  stock_quantity: number;
  is_active: boolean;
  created_at: string;
  categories: { name: string } | null;
};

export default function VendorProductsPage() {
  const { getToken } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/vendor/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setProducts(data.dashboard?.products || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.categories?.name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass rounded-2xl p-6 animate-pulse">
            <div className="h-4 bg-white/[0.05] rounded w-1/3 mb-4" />
            <div className="h-8 bg-white/[0.05] rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Products</h1>
          <p className="text-gray-400 mt-1">Manage your product listings</p>
        </div>
        <Link
          href="/admin/products"
          className="flex items-center gap-2 px-5 h-10 rounded-xl bg-gradient-neon text-white font-medium text-sm hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" /> Add Product
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products..."
          className="w-full glass rounded-2xl h-12 pl-11 pr-4 outline-none focus:pink-glow transition-all placeholder:text-gray-500"
        />
      </div>

      {/* Products Table */}
      {filtered.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Package className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No products found</p>
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider p-4">Product</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider p-4">Category</th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider p-4">Price</th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider p-4">Sold</th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider p-4">Stock</th>
                  <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider p-4">Status</th>
                  <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wider p-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filtered.map((product) => (
                  <tr key={product.id} className="hover:bg-white/[0.02]">
                    <td className="p-4">
                      <div>
                        <span className="text-sm font-medium text-white">{product.name}</span>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-xs text-yellow-400">★</span>
                          <span className="text-xs text-gray-400">{(product.avg_rating || 0).toFixed(1)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="text-sm text-gray-400">{product.categories?.name || "—"}</span>
                    </td>
                    <td className="p-4 text-right">
                      <span className="text-sm font-semibold text-white">{formatCurrency(product.base_price)}</span>
                    </td>
                    <td className="p-4 text-right">
                      <span className="text-sm text-gray-400">{product.total_sold || 0}</span>
                    </td>
                    <td className="p-4 text-right">
                      <span className={`text-sm font-medium ${(product.stock_quantity || 0) < 10 ? "text-yellow-400" : "text-gray-400"}`}>
                        {product.stock_quantity || 0}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${product.is_active ? "bg-green-400/10 text-green-400" : "bg-gray-400/10 text-gray-400"}`}>
                        {product.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/product-details/${product.id}`} className="p-2 rounded-lg hover:bg-white/[0.05] text-gray-400 hover:text-white transition-colors">
                          <Eye className="w-4 h-4" />
                        </Link>
                        <button className="p-2 rounded-lg hover:bg-white/[0.05] text-gray-400 hover:text-white transition-colors">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button className="p-2 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
