import { createClient } from "@supabase/supabase-js";
import { handleApiError } from "@/lib/api-errors";
import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";

function getSupabaseForUser(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

// POST - Request vendor payout
export async function POST(request) {
  try {
    const { allowed } = await checkRateLimitAsync(`vendor-payout:${getClientIp(request)}`, {
      maxRequests: 5,
      windowMs: 60_000,
      failureMode: "fail_closed",
    });
    if (!allowed) {
      return Response.json(
        { success: false, message: "Too many payout requests. Please try again later." },
        { status: 429 }
      );
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return Response.json(
        { success: false, message: "Authorization required" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const SupabaseClient = getSupabaseForUser(token);
    const { data: { user }, error: authError } = await SupabaseClient.auth.getUser(token);
    if (authError || !user) {
      return Response.json(
        { success: false, message: "Invalid token" },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const amount = Number(body?.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json(
        { success: false, message: "A positive amount is required" },
        { status: 400 }
      );
    }

    // The store is derived from the authenticated user. The browser never picks
    // which store to withdraw from, and request_vendor_payout() still re-checks
    // owns_store() as a second gate.
    const { data: store, error: storeError } = await SupabaseClient
      .from("stores")
      .select("id")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (storeError) throw storeError;
    if (!store) {
      return Response.json(
        { success: false, message: "No store is linked to this account" },
        { status: 404 }
      );
    }

    const { data, error } = await SupabaseClient.rpc("request_vendor_payout", {
      p_store_id: store.id,
      p_amount: amount,
    });

    if (error) throw error;
    return Response.json({ success: true, payout: data });
  } catch (error) {
    return handleApiError(error, "Vendor Payout POST", "Failed to request payout");
  }
}

// GET - Fetch vendor payout requests
export async function GET(request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return Response.json(
        { success: false, message: "Authorization required" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const SupabaseClient = getSupabaseForUser(token);
    const { data: { user }, error: authError } = await SupabaseClient.auth.getUser(token);
    if (authError || !user) {
      return Response.json(
        { success: false, message: "Invalid token" },
        { status: 401 }
      );
    }

    const { data: store } = await SupabaseClient
      .from("stores")
      .select("id")
      .eq("owner_id", user.id)
      .single();

    if (!store) {
      return Response.json({
        success: true,
        payouts: [],
        summary: {
          available_balance: 0,
          withdrawable_balance: 0,
          pending_amount: 0,
          paid_amount: 0,
        },
      });
    }

    const { data, error } = await SupabaseClient
      .from("vendor_payout_requests")
      .select("*")
      .eq("store_id", store.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const { data: earnings, error: earningsError } = await SupabaseClient
      .from("vendor_earnings")
      .select("net_amount, status")
      .eq("store_id", store.id);

    if (earningsError) throw earningsError;

    const payouts = data || [];
    const sumRequests = (predicate) =>
      payouts
        .filter(predicate)
        .reduce((total, row) => total + Number(row.requested_amount ?? 0), 0);

    // Mirrors request_vendor_payout(): the withdrawable amount is the available
    // earnings minus anything already requested but not yet paid out.
    const availableBalance = (earnings || [])
      .filter((row) => row.status === "available")
      .reduce((total, row) => total + Number(row.net_amount ?? 0), 0);
    const pendingAmount = sumRequests(
      (payout) => payout.status === "pending" || payout.status === "approved"
    );
    const paidAmount = sumRequests(
      (payout) => payout.status === "paid" || payout.status === "completed"
    );

    return Response.json({
      success: true,
      payouts,
      summary: {
        available_balance: availableBalance,
        withdrawable_balance: Math.max(availableBalance - pendingAmount, 0),
        pending_amount: pendingAmount,
        paid_amount: paidAmount,
      },
    });
  } catch (error) {
    return handleApiError(error, "Vendor Payouts GET", "Failed to fetch payouts");
  }
}
