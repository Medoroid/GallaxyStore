import { Truck, Clock, Globe, Package } from "lucide-react";

export const metadata = {
  title: "Shipping Policy",
  description: "Learn about our shipping options, delivery times, and costs.",
};

export default function ShippingPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-28 pb-20">
      <header className="text-center mb-12">
        <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold">Policy</p>
        <h1 className="text-3xl md:text-5xl font-extrabold mt-2">
          Shipping <span className="text-gradient-neon">Policy</span>
        </h1>
      </header>

      <div className="glass-strong rounded-3xl p-8 space-y-8">
        {/* Shipping Options */}
        <section>
          <h2 className="text-xl font-extrabold mb-4 flex items-center gap-2">
            <Truck className="h-5 w-5 text-accent" />
            Shipping Options
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="glass rounded-xl p-4">
              <h3 className="font-bold mb-2">Standard Shipping</h3>
              <p className="text-sm text-muted-foreground">5-7 business days</p>
              <p className="text-lg font-extrabold text-gradient-gold mt-2">$4.99</p>
            </div>
            <div className="glass rounded-xl p-4">
              <h3 className="font-bold mb-2">Express Shipping</h3>
              <p className="text-sm text-muted-foreground">2-3 business days</p>
              <p className="text-lg font-extrabold text-gradient-gold mt-2">$12.99</p>
            </div>
          </div>
        </section>

        {/* Free Shipping */}
        <section className="glass rounded-xl p-6 border border-green-500/30">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-green-500/20 grid place-items-center shrink-0">
              <Package className="h-6 w-6 text-green-400" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-green-400">Free Shipping</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Orders over <span className="font-bold text-foreground">$500</span> qualify for free standard shipping.
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
          <div className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-white/10 pb-3">
              <span className="text-muted-foreground">Processing Time</span>
              <span className="font-semibold">1-2 business days</span>
            </div>
            <div className="flex justify-between border-b border-white/10 pb-3">
              <span className="text-muted-foreground">Domestic (USA)</span>
              <span className="font-semibold">5-7 business days</span>
            </div>
            <div className="flex justify-between border-b border-white/10 pb-3">
              <span className="text-muted-foreground">International</span>
              <span className="font-semibold">10-21 business days</span>
            </div>
          </div>
        </section>

        {/* International */}
        <section>
          <h2 className="text-xl font-extrabold mb-4 flex items-center gap-2">
            <Globe className="h-5 w-5 text-accent" />
            International Shipping
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            We ship to over 50 countries worldwide. International shipping rates are calculated at checkout
            based on destination and package weight. Please note that international orders may be subject
            to customs duties and taxes, which are the responsibility of the customer.
          </p>
        </section>
      </div>
    </div>
  );
}
