import { Shield, Lock, Eye, Database, Cookie, Mail } from "lucide-react";

export const metadata = {
  title: "Privacy Policy",
  description: "Learn how we collect, use, and protect your personal information.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-28 pb-20">
      <header className="text-center mb-12">
        <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold">Legal</p>
        <h1 className="text-3xl md:text-5xl font-extrabold mt-2">
          Privacy <span className="text-gradient-neon">Policy</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-3">Last updated: January 1, 2024</p>
      </header>

      <div className="glass-strong rounded-3xl p-8 space-y-8">
        {/* Introduction */}
        <section>
          <p className="text-muted-foreground leading-relaxed">
            Galaxy Store (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy.
            This Privacy Policy explains how we collect, use, disclose, and safeguard your information
            when you visit our website and purchase our products.
          </p>
        </section>

        {/* Information We Collect */}
        <section>
          <h2 className="text-xl font-extrabold mb-4 flex items-center gap-2">
            <Database className="h-5 w-5 text-accent" />
            Information We Collect
          </h2>
          <div className="space-y-4 text-muted-foreground">
            <div>
              <h3 className="font-bold text-foreground mb-1">Personal Information</h3>
              <ul className="list-disc pr-6 space-y-1 text-sm">
                <li>Name and email address</li>
                <li>Shipping and billing address</li>
                <li>Phone number</li>
                <li>Payment information (processed securely via Stripe)</li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-foreground mb-1">Usage Information</h3>
              <ul className="list-disc pr-6 space-y-1 text-sm">
                <li>Browser type and version</li>
                <li>Pages visited and time spent</li>
                <li>Referring website</li>
                <li>IP address</li>
              </ul>
            </div>
          </div>
        </section>

        {/* How We Use Information */}
        <section>
          <h2 className="text-xl font-extrabold mb-4 flex items-center gap-2">
            <Eye className="h-5 w-5 text-accent" />
            How We Use Your Information
          </h2>
          <ul className="space-y-2 text-muted-foreground text-sm">
            {[
              "Process and fulfill your orders",
              "Send order updates and shipping notifications",
              "Respond to customer service inquiries",
              "Improve our website and products",
              "Send marketing communications (with your consent)",
              "Prevent fraud and ensure security",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-accent mt-1">•</span>
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* Data Security */}
        <section>
          <h2 className="text-xl font-extrabold mb-4 flex items-center gap-2">
            <Lock className="h-5 w-5 text-accent" />
            Data Security
          </h2>
          <p className="text-muted-foreground leading-relaxed text-sm">
            We implement industry-standard security measures to protect your personal information.
            All payment transactions are processed through Stripe, which uses PCI-compliant encryption.
            However, no method of transmission over the Internet is 100% secure.
          </p>
        </section>

        {/* Cookies */}
        <section>
          <h2 className="text-xl font-extrabold mb-4 flex items-center gap-2">
            <Cookie className="h-5 w-5 text-accent" />
            Cookies
          </h2>
          <p className="text-muted-foreground leading-relaxed text-sm">
            We use cookies to enhance your browsing experience, remember your preferences, and
            analyze site traffic. You can control cookies through your browser settings.
          </p>
        </section>

        {/* Third Parties */}
        <section>
          <h2 className="text-xl font-extrabold mb-4">Third-Party Services</h2>
          <ul className="space-y-2 text-muted-foreground text-sm">
            {[
              { name: "Supabase", purpose: "Authentication and database" },
              { name: "Stripe", purpose: "Payment processing" },
              { name: "Vercel", purpose: "Hosting and analytics" },
            ].map((item) => (
              <li key={item.name} className="flex items-start gap-2">
                <span className="text-accent mt-1">•</span>
                <span><strong className="text-foreground">{item.name}:</strong> {item.purpose}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Your Rights */}
        <section>
          <h2 className="text-xl font-extrabold mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-accent" />
            Your Rights
          </h2>
          <ul className="space-y-2 text-muted-foreground text-sm">
            {[
              "Access your personal data",
              "Correct inaccurate data",
              "Delete your account and data",
              "Opt out of marketing emails",
              "Export your data",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-accent mt-1">•</span>
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* Contact */}
        <section className="glass rounded-xl p-6 text-center">
          <Mail className="h-8 w-8 mx-auto text-accent mb-3" />
          <p className="font-bold mb-1">Questions about Privacy?</p>
          <p className="text-sm text-muted-foreground mb-4">
            Contact us at <a href="mailto:privacy@galaxystore.com" className="text-secondary hover:text-secondary/80">privacy@galaxystore.com</a>
          </p>
        </section>
      </div>
    </div>
  );
}
