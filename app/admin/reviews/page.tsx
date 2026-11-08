"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/app/lib/auth-context";
import { Star, Check, X, EyeOff } from "lucide-react";

type Review = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  status: string;
  reviewer_name: string | null;
  author_name: string | null;
  product_name: string | null;
  is_verified_purchase: boolean;
  created_at: string;
};

export default function AdminReviewsPage() {
  const { getToken } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("pending");

  const fetchReviews = useCallback(async () => {
    setError("");
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/reviews/moderate", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.message || "Could not load reviews.");
        return;
      }
      setReviews(data.reviews || []);
    } catch {
      setError("Network error while loading reviews.");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const moderateReview = async (reviewId: string, status: string) => {
    setActingId(reviewId);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/reviews/moderate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ review_id: reviewId, new_status: status }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.message || "Could not moderate this review.");
        return;
      }
      setReviews((prev) =>
        prev.map((review) => (review.id === reviewId ? { ...review, status } : review))
      );
    } catch {
      setError("Network error while moderating the review.");
    } finally {
      setActingId(null);
    }
  };

  const filtered = reviews.filter((r) => (filter === "all" ? true : r.status === filter));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Reviews Moderation</h1>
        <p className="text-gray-400 mt-1">Approve, reject or hide customer reviews</p>
      </div>

      {error && (
        <div className="glass rounded-2xl p-4 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {["pending", "approved", "rejected", "hidden", "all"].map((f) => (
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
          <p className="text-gray-400">No {filter === "all" ? "" : filter} reviews</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((review) => (
            <div key={review.id} className="glass rounded-2xl p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <div className="flex gap-0.5 text-[#FFD166]">
                      {Array.from({ length: Math.max(0, Math.min(5, review.rating)) }).map((_, i) => (
                        <Star key={i} className="h-3 w-3 fill-current" />
                      ))}
                    </div>
                    <span className="text-xs text-gray-500">
                      by {review.reviewer_name || review.author_name || "Anonymous"}
                    </span>
                    {review.is_verified_purchase && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">
                        Verified purchase
                      </span>
                    )}
                    <span className="text-xs text-gray-500">•</span>
                    <span className="text-xs text-gray-500">
                      {review.product_name || "Unknown product"}
                    </span>
                  </div>
                  {review.title && <h3 className="text-white font-semibold mb-1">{review.title}</h3>}
                  <p className="text-gray-400 text-sm whitespace-pre-line">{review.body}</p>
                  <p className="text-xs text-gray-600 mt-2">
                    {new Date(review.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex gap-2 shrink-0">
                  {review.status !== "approved" && (
                    <button
                      disabled={actingId === review.id}
                      onClick={() => moderateReview(review.id, "approved")}
                      className="p-2 rounded-xl bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                      title="Approve"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                  {review.status !== "rejected" && (
                    <button
                      disabled={actingId === review.id}
                      onClick={() => moderateReview(review.id, "rejected")}
                      className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                      title="Reject"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {review.status !== "hidden" && (
                    <button
                      disabled={actingId === review.id}
                      onClick={() => moderateReview(review.id, "hidden")}
                      className="p-2 rounded-xl bg-gray-500/10 text-gray-400 hover:bg-gray-500/20 transition-colors disabled:opacity-50"
                      title="Hide"
                    >
                      <EyeOff className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <span
                  className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                    review.status === "approved"
                      ? "bg-green-500/10 text-green-400"
                      : review.status === "pending"
                        ? "bg-yellow-500/10 text-yellow-400"
                        : "bg-red-500/10 text-red-400"
                  }`}
                >
                  {review.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
