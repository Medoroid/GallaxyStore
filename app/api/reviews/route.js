import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { handleApiError } from "@/lib/api-errors";

const SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// GET - Fetch reviews for a product
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const product_id = searchParams.get("product_id");

    if (!product_id) {
      return Response.json(
        { success: false, message: "product_id is required" },
        { status: 400 }
      );
    }

    const { data: reviews, error } = await SupabaseClient
      .from("reviews")
      .select("*")
      .eq("product_id", product_id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Calculate stats
    const stats = reviews.reduce(
      (acc, r) => {
        acc.total += r.rating;
        acc.count += 1;
        return acc;
      },
      { total: 0, count: 0 }
    );

    return Response.json({
      success: true,
      reviews: reviews ?? [],
      stats: {
        avg_rating: stats.count > 0 ? Math.round((stats.total / stats.count) * 10) / 10 : 0,
        review_count: stats.count,
      },
    });
  } catch (error) {
    return handleApiError(error, "Reviews GET", "Failed to fetch reviews");
  }
}

// POST - Add or update a review
export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return Response.json(
        { success: false, message: "Authorization required" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await SupabaseClient.auth.getUser(token);

    if (authError || !user) {
      return Response.json(
        { success: false, message: "Invalid token" },
        { status: 401 }
      );
    }

    const { product_id, rating, comment } = await request.json();
    const body = comment || null;

    if (!product_id || !rating) {
      return Response.json(
        { success: false, message: "product_id and rating are required" },
        { status: 400 }
      );
    }

    if (rating < 1 || rating > 5) {
      return Response.json(
        { success: false, message: "Rating must be between 1 and 5" },
        { status: 400 }
      );
    }

    // Upsert review (insert or update if exists)
    const { data, error } = await SupabaseClient
      .from("reviews")
      .upsert(
        {
          user_id: user.id,
          product_id,
          rating,
          body,
        },
        { onConflict: "product_id,user_id" }
      )
      .select()
      .single();

    if (error) throw error;

    // Recalculate stats after insert
    const { data: allReviews } = await SupabaseClient
      .from("reviews")
      .select("rating")
      .eq("product_id", product_id);

    const statsData = (allReviews || []).reduce(
      (acc, r) => { acc.total += r.rating; acc.count += 1; return acc; },
      { total: 0, count: 0 }
    );

    return Response.json({
      success: true,
      review: data,
      stats: {
        avg_rating: statsData.count > 0 ? Math.round((statsData.total / statsData.count) * 10) / 10 : 0,
        review_count: statsData.count,
      },
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Reviews POST", "Failed to save review");
  }
}

// DELETE - Delete a review
export async function DELETE(request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return Response.json(
        { success: false, message: "Authorization required" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await SupabaseClient.auth.getUser(token);

    if (authError || !user) {
      return Response.json(
        { success: false, message: "Invalid token" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const product_id = searchParams.get("product_id");

    if (!product_id) {
      return Response.json(
        { success: false, message: "product_id is required" },
        { status: 400 }
      );
    }

    const { error } = await SupabaseClient
      .from("reviews")
      .delete()
      .eq("user_id", user.id)
      .eq("product_id", product_id);

    if (error) throw error;

    return Response.json({ success: true, product_id });
  } catch (error) {
    return handleApiError(error, "Reviews DELETE", "Failed to delete review");
  }
}
