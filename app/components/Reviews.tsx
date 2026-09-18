"use client";

import { useState } from "react";
import { Star, Loader2, Send, Trash2, ThumbsUp, ThumbsDown, Flag } from "lucide-react";
import { useAuth } from "@/app/lib/auth-context";

type Review = {
  id: string;
  user_id: string;
  product_id: string;
  rating: number;
  body: string | null;
  created_at: string;
};

type ReviewStats = {
  avg_rating: number;
  review_count: number;
};

export function ReviewStars({
  rating,
  size = "h-4 w-4",
  showNumber = true,
}: {
  rating: number;
  size?: string;
  showNumber?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`${size} ${
            star <= rating
              ? "text-yellow-400 fill-yellow-400"
              : "text-muted-foreground"
          }`}
        />
      ))}
      {showNumber && (
        <span className="text-sm font-semibold ml-1">{rating}</span>
      )}
    </div>
  );
}

export function ReviewStatsDisplay({ stats }: { stats: ReviewStats }) {
  return (
    <div className="flex items-center gap-2">
      <ReviewStars rating={Math.round(stats.avg_rating)} size="h-5 w-5" />
      <span className="text-sm text-muted-foreground">
        ({stats.review_count} {stats.review_count === 1 ? "review" : "reviews"})
      </span>
    </div>
  );
}

export function ReviewForm({
  productId,
  onReviewAdded,
}: {
  productId: string;
  onReviewAdded: (review: Review, stats: ReviewStats) => void;
}) {
  const { user, getToken } = useAuth();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) return;

    setLoading(true);
    setMessage(null);

    try {
      const token = await getToken();
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ product_id: productId, rating, comment: comment.trim() }),
      });

      const data = await res.json();

      if (data.success) {
        setMessage({ type: "success", text: "Review saved!" });
        setRating(0);
        setComment("");
        onReviewAdded(data.review, data.stats);
      } else {
        setMessage({ type: "error", text: data.message || "Failed to save review" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="glass rounded-xl p-4 text-center text-sm text-muted-foreground">
        Login to leave a review
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="glass rounded-xl p-4 space-y-3">
      <h4 className="font-semibold text-sm">Write a Review</h4>

      <div>
        <p className="text-xs text-muted-foreground mb-1">Rating *</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              className="p-0.5"
            >
              <Star
                className={`h-6 w-6 transition-colors ${
                  star <= (hoverRating || rating)
                    ? "text-yellow-400 fill-yellow-400"
                    : "text-muted-foreground"
                }`}
              />
            </button>
          ))}
        </div>
      </div>

      <div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="Share your experience (optional)..."
          className="w-full glass rounded-xl p-3 outline-none focus:pink-glow resize-none text-sm"
        />
      </div>

      {message && (
        <div
          className={`p-2 text-xs rounded-lg text-center ${
            message.type === "success"
              ? "text-green-400 bg-green-950/40"
              : "text-red-400 bg-red-950/40"
          }`}
        >
          {message.text}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || rating === 0}
        className="w-full h-10 rounded-xl bg-gradient-neon text-white font-semibold text-sm flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Send className="h-4 w-4" />
            Submit Review
          </>
        )}
      </button>
    </form>
  );
}

export function ReviewsList({
  reviews,
  productId,
  onReviewDeleted,
}: {
  reviews: Review[];
  productId: string;
  onReviewDeleted: (product_id: string) => void;
}) {
  const { user, getToken } = useAuth();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [voting, setVoting] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);

  const handleDelete = async (reviewId: string) => {
    setDeleting(reviewId);
    try {
      const token = await getToken();
      await fetch(`/api/reviews?product_id=${productId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      onReviewDeleted(productId);
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  };

  const handleVote = async (reviewId: string, voteType: "helpful" | "not_helpful") => {
    if (!user) return;
    setVoting(reviewId);
    try {
      const token = await getToken();
      await fetch(`/api/reviews/${reviewId}/vote`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ vote_type: voteType }),
      });
    } catch { /* ignore */ }
    finally { setVoting(null); }
  };

  const handleReport = async (reviewId: string) => {
    if (!user) return;
    setReporting(reviewId);
    try {
      const token = await getToken();
      await fetch(`/api/reviews/${reviewId}/report`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "inappropriate" }),
      });
    } catch { /* ignore */ }
    finally { setReporting(null); }
  };

  if (reviews.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No reviews yet. Be the first to review!
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {reviews.map((review) => (
        <div key={review.id} className="glass rounded-xl p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <ReviewStars rating={review.rating} size="h-3 w-3" showNumber={false} />
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(review.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {user && user.id === review.user_id && (
                <button
                  onClick={() => handleDelete(review.id)}
                  disabled={deleting === review.id}
                  className="text-red-400 hover:text-red-300 p-1 rounded transition-colors disabled:opacity-50"
                >
                  {deleting === review.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </button>
              )}
            </div>
          </div>
          {review.body && (
            <p className="text-sm">{review.body}</p>
          )}
          {/* Vote & Report buttons */}
          {user && user.id !== review.user_id && (
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/5">
              <button
                onClick={() => handleVote(review.id, "helpful")}
                disabled={voting === review.id}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-green-400 transition-colors"
              >
                <ThumbsUp className="h-3 w-3" /> Helpful
              </button>
              <button
                onClick={() => handleVote(review.id, "not_helpful")}
                disabled={voting === review.id}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-400 transition-colors"
              >
                <ThumbsDown className="h-3 w-3" />
              </button>
              <button
                onClick={() => handleReport(review.id)}
                disabled={reporting === review.id}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-yellow-400 transition-colors ml-auto"
              >
                <Flag className="h-3 w-3" /> Report
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
