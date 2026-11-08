import { Truck, Clock, Globe, Package, Calculator } from "lucide-react";
import { getPublicServerClient } from "@/lib/supabase/public-server";
import { getPublicStoreSettings } from "@/lib/storeSettings";
import { formatCurrency } from "@/lib/formatCurrency";

export const metadata = {
  title: "Shipping Policy",
  description: "Learn about our shipping options, delivery times, and costs.",
};

/**
 * B4 — this page renders the live shipping configuration from
 * shipping_zones / shipping_rates / shipping_methods (the exact tables the
 * checkout RPC validates against). No hardcoded fees, thresholds or delivery
 * windows remain; anything the owner has not configured stays hidden.
 */
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

function countryName(code: string): string {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

type ZoneRow = { id: string; name: string; countries: string[] | null; is_default: boolean };
type RateRow = {
  zone_id: string;
  method_id: string;
  base_fee: number;
  per_kg_fee: number;
  free_shipping_threshold: number | null;
};
type MethodRow = {
  id: string;
  name: string;
  type: string;
  min_delivery_days: number | null;
  max_delivery_days: number | null;
};

type ZoneView = {
  id: string;
  name: string;
  countries: string[];
  isDefault: boolean;
  methods: Array<{
    id: string;
    name: string;
    baseFee: number;
    perKgFee: number;
    freeShippingThreshold: number | null;
    minDays: number | null;
    maxDays: number | null;
  }>;
};

async function getZoneViews(): Promise<ZoneView[] | null> {
  const supabase = getPublicServerClient();
  const [zonesRes, ratesRes, methodsRes] = await Promise.all([
    supabase
      .from("shipping_zones")
      .select("id, name, countries, is_default")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("shipping_rates")
      .select("zone_id, method_id, base_fee, per_kg_fee, free_shipping_threshold")
      .eq("is_active", true),
    supabase
      .from("shipping_methods")
      .select("id, name, type, min_delivery_days, max_delivery_days")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order"),
  ]);

  if (zonesRes.error ?? ratesRes.error ?? methodsRes.error) return null;

  const zones = (zonesRes.data ?? []) as ZoneRow[];
  const rates = (ratesRes.data ?? []) as RateRow[];
  const methods = (methodsRes.data ?? []) as MethodRow[];

  return zones.map((zone) => ({
    id: zone.id,
    name: zone.name,
    countries: zone.countries ?? [],
    isDefault: Boolean(zone.is_default),
    methods: rates
      .filter((rate) => rate.zone_id === zone.id)
      .map((rate) => {
        const method = methods.find((m) => m.id === rate.method_id);
        return {
          id: rate.method_id,
          name: method?.name ?? "Shipping method",
          baseFee: Number(rate.base_fee ?? 0),
          perKgFee: Number(rate.per_kg_fee ?? 0),
          freeShippingThreshold:
            rate.free_shipping_threshold == null ? null : Number(rate.free_shipping_threshold),
          minDays: method?.min_delivery_days ?? null,
          maxDays: method?.max_delivery_days ?? null,
        };
      }),
  }));
}

export default async function ShippingPage() {
  const [zones, settings] = await Promise.all([getZoneViews(), getPublicStoreSettings()]);
  const currency = settings.currency ?? "USD";
  const hasData = (zones ?? []).some((zone) => zone.methods.length > 0);

  return (
    <div className="mx-auto max-w-4xl px-4 pt-28 pb-20">
      <header className="text-center mb-12">
        <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold">Policy</p>
        <h1 className="text-3xl md:text-5xl font-extrabold mt-2">
          Shipping <span className="text-gradient-neon">Policy</span>
        </h1>
      </header>

      <div className="glass-strong rounded-3xl p-8 space-y-8">
        {/* Live zones & methods straight from the shipping configuration */}
        <section>
          <h2 className="text-xl font-extrabold mb-1 flex items-center gap-2">
            <Truck className="h-5 w-5 text-accent" />
            Delivery Options
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            These rates come straight from our live shipping configuration.
          </p>

          {!hasData && (
            <p className="glass rounded-xl p-4 text-sm text-muted-foreground">
              Published delivery options are being updated right now. Live methods, fees and
              timeframes are always shown at checkout before you place an order.
            </p>
          )}

          <div className="space-y-5">
            {(zones ?? []).map((zone) => (
              <div key={zone.id} className="glass rounded-xl p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-bold">{zone.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {zone.countries.length > 0
                      ? zone.countries.map(countryName).join(", ")
                      : zone.isDefault
                        ? "All other destinations"
                        : ""}
                  </p>
                </div>

                {zone.methods.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-2">
                    Methods for this zone are being configured — the live list appears at checkout.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2 text-sm">
                    {zone.methods.map((method) => (
                      <li
                        key={method.id}
                        className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-2 last:border-0 last:pb-0"
                      >
                        <span className="font-semibold">{method.name}</span>
                        <span className="text-muted-foreground">
                          {method.minDays != null && method.maxDays != null
                            ? `${method.minDays}-${method.maxDays} business days`
                            : "Delivery timeframe shown at checkout"}
                        </span>
                        <span className="font-bold text-gradient-neon">
                          {formatCurrency(method.baseFee, currency)}
                          {method.perKgFee > 0 && (
                            <span className="text-xs font-normal text-muted-foreground">
                              {" "}+ {formatCurrency(method.perKgFee, currency)}/kg
                            </span>
                          )}
                          {method.freeShippingThreshold != null && (
                            <span className="text-xs font-normal text-green-400">
                              {" "}· free over {formatCurrency(method.freeShippingThreshold, currency)}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* How the final fee is calculated */}
        <section className="glass rounded-xl p-6 border border-green-500/30">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-green-500/20 grid place-items-center shrink-0">
              <Calculator className="h-6 w-6 text-green-400" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-green-400">Final fee calculated on the server</h3>
              <p className="text-sm text-muted-foreground mt-1">
                The exact shipping fee is recalculated on the server when you choose your delivery
                address and at checkout — from the destination zone, order subtotal and package
                weight. Free-shipping thresholds shown above apply automatically when your order
                qualifies. You always see and confirm the shipping fee before placing the order.
              </p>
            </div>
          </div>
        </section>

        {/* Delivery Times */}
        <section>
          <h2 className="text-xl font-extrabold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-accent" />
            Delivery Times
          </h2>
          <p className="text-sm text-muted-foreground">
            Processing and delivery windows depend on the shipping method you select and are shown
            next to each option at checkout. Custom-printed items additionally need production time,
            which is confirmed with your order.
          </p>
        </section>

        {/* International */}
        <section>
          <h2 className="text-xl font-extrabold mb-4 flex items-center gap-2">
            <Globe className="h-5 w-5 text-accent" />
            International Shipping
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            We ship to the destinations listed above. International shipping rates are calculated
            based on destination and package weight. Please note that international orders may be
            subject to customs duties and taxes, which are the responsibility of the customer.
          </p>
        </section>

        {/* Weight basis */}
        <section>
          <h2 className="text-xl font-extrabold mb-4 flex items-center gap-2">
            <Package className="h-5 w-5 text-accent" />
            Weight-Based Rates
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Some methods include a per-kilogram component (shown next to the base fee above). The
            package weight is measured from your actual items — it is never taken from the browser.
          </p>
        </section>
      </div>
    </div>
  );
}
