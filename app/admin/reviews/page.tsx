"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/app/lib/auth-context";
import { Star, Check, X, AlertTriangle } from "lucide-react";

type Review = {
  id: string;
  rating: number;
  title: string;
  body: string;
  status: string;
  author_name: string;
  product_name: string;
  created_at: string;
};

export default function AdminReviewsPage() {
  const { getToken } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");

  useEffect(() => {
    fetchReviews();
  }, []);

  const fetchReviews = async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/reviews/moderate", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setReviews(data.reviews || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const moderateReview = async (reviewId: string, status: string) => {
    try {
      const token = await getToken();
      await fetch("/api/admin/reviews/moderate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ review_id: reviewId, new_status: status }),
      });
      setReviews((prev) => prev.filter((r) => r.id !== reviewId));
    } catch {
      // ignore
    }
  };

  const filtered = reviews.filter((r) =>
    filter === "all" ? true : r.status === filter
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Reviews Moderation</h1>
        <p className="text-gray-400 mt-1">Approve or reject customer reviews</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {["pending", "approved", "rejected", "all"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === f
                ? "bg-gradient-to-r from-[#FF4FD8] to-[#A855F7] text-white"
                : "bg-white/[0.05] text-gray-400 hover:text-white"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass rounded-2xl p-6 animate-pulse">
              <div className="h-4 bg-white/[0.05] rounded w-1/3 mb-4" />
              <div className="h-3 bg-white/[0.05] rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center">
          <Star className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No {filter} reviews</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((review) => (
            <div key={review.id} className="glass rounded-2xl p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex gap-0.5 text-[#FFD166]">
                      {Array.from({ length: review.rating }).map((_, i) => (
                        <Star key={i} className="h-3 w-3 fill-current" />
                      ))}
                    </div>
                    <span className="text-xs text-gray-500">by {review.author_name}</span>
                    <span className="text-xs text-gray-500">•</span>
                    <span className="text-xs text-gray-500">{review.product_name}</span>
                  </div>
                  {review.title && (
                    <h3 className="text-white font-semibold mb-1">{review.title}</h3>
                  )}
                  <p className="text-gray-400 text-sm">{review.body}</p>
                  <p className="text-xs text-gray-600 mt-2">
                    {new Date(review.created_at).toLocaleDateString()}
                  </p>
                </div>

                {review.status === "pending" && (
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => moderateReview(review.id, "approved")}
                      className="p-2 rounded-xl bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
                      title="Approve"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => moderateReview(review.id, "rejected")}
                      className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                      title="Reject"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {review.status !== "pending" && (
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      review.status === "approved"
                        ? "bg-green-500/10 text-green-400"
                        : "bg-red-500/10 text-red-400"
                    }`}
                  >
                    {review.status}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
