import { createClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { normaliseCountryCode } from "@/lib/shippingCountry";
import {
  isShippingWeightEnabled,
  parseShippingItemsParam,
  fetchWeightGramsForItems,
} from "@/lib/shippingWeight";

// GET - Get shipping options for a country.
//
// B6 — the destination is normalised to an ISO code (the checkout form
// stores names like "Egypt" while shipping_zones.countries holds "EG"), and
// the package weight is resolved server-side from the database when
// `SHIPPING_CALCULATE_WEIGHT` is enabled. The client only supplies item ids
// and quantities; it never supplies a weight.
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

    // B6 — resolve the real package weight (gated until checkout() validates
    // weight-adjusted fees; see supabase/manual-review/05_*.sql).
    let weightGrams = 0;
    if (isShippingWeightEnabled()) {
      const items = parseShippingItemsParam(searchParams.get("items"));
      if (items === null) {
        return Response.json(
          {
            success: false,
            message:
              "items must be a JSON array of { product_id?, variant_id?, quantity }",
          },
          { status: 400 }
        );
      }

      try {
        weightGrams = await fetchWeightGramsForItems(SupabaseClient, items);
      } catch (weightError) {
        logger.error("[Shipping GET Error] weight lookup failed", {
          route: "/api/shipping",
          operation: "shipping.weight_lookup",
          errorCode: "SHIPPING_WEIGHT_LOOKUP_FAILED",
          message: weightError instanceof Error ? weightError.message : "unknown error",
        });
        return Response.json(
          { success: false, message: "Could not calculate shipping weight" },
          { status: 503 }
        );
      }
    }

    const { data: options, error } = await SupabaseClient
      .rpc("get_shipping_options", {
        p_country: normaliseCountryCode(country),
        p_order_subtotal: subtotal,
        p_weight_grams: weightGrams,
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
