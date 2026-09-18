import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// GET - Get shipping options for a country
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const country = searchParams.get("country");
    const subtotal = parseFloat(searchParams.get("subtotal") || "0");

    if (!country) {
      return Response.json(
        { success: false, message: "Country is required" },
        { status: 400 }
      );
    }

    const SupabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const { data: options, error } = await SupabaseClient
      .rpc("get_shipping_options", {
        p_country: country,
        p_order_subtotal: subtotal,
        p_weight_grams: 0,
      });

    if (error) {
      logger.error("[Shipping GET Error]", error);
      return Response.json(
        { success: false, message: "Failed to fetch shipping options" },
        { status: 500 }
      );
    }

    return Response.json({ success: true, options: options ?? [] });
  } catch (error) {
    logger.error("[Shipping GET Error]", error);
    return Response.json(
      { success: false, message: "Failed to fetch shipping options" },
      { status: 500 }
    );
  }
}
