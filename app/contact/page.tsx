import { Mail, Phone, MapPin, Clock } from "lucide-react";
import { getPublicStoreSettings } from "@/lib/storeSettings";
import { ContactForm } from "./contact-form";

export const metadata = {
  title: "Contact",
  description: "Get in touch with the Galaxy Store team.",
};

/**
 * B4 — contact channels come from the admin-managed `store_settings` table.
 * Unset channels are hidden (no invented phone numbers or inboxes).
 */
export default async function ContactPage() {
  const settings = await getPublicStoreSettings();

  const channels = [
    settings.support_email && {
      icon: Mail,
      label: "Email",
      value: settings.support_email,
      href: `mailto:${settings.support_email}`,
    },
    settings.support_phone && {
      icon: Phone,
      label: "Phone",
      value: settings.support_phone,
      href: `tel:${settings.support_phone.replace(/[^\d+]/g, "")}`,
    },
    settings.address && {
      icon: MapPin,
      label: "Address",
      value: settings.address,
      href: undefined as string | undefined,
    },
  ].filter(Boolean) as Array<{
    icon: typeof Mail;
    label: string;
    value: string;
    href: string | undefined;
  }>;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-28 pb-20">
      <header className="text-center max-w-3xl mx-auto mb-12">
        <p className="text-xs uppercase tracking-[0.3em] text-secondary font-semibold">Contact</p>
        <h1 className="text-3xl md:text-5xl font-extrabold mt-2">
          Get in <span className="text-gradient-neon">Touch</span>
        </h1>
        <p className="text-muted-foreground mt-3">
          Have a question or need help? We&apos;d love to hear from you.
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-10 items-start">
        {/* Contact channels — only what the store owner has actually configured */}
        <div className="space-y-4">
          {channels.map((channel) => {
            const Inner = (
              <div className="glass rounded-2xl p-5 flex items-start gap-4 hover:pink-glow transition-all">
                <div className="h-11 w-11 rounded-xl bg-secondary/20 grid place-items-center shrink-0">
                  <channel.icon className="h-5 w-5 text-secondary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">{channel.label}</p>
                  <p className="font-semibold break-words">{channel.value}</p>
                </div>
              </div>
            );
            return channel.href ? (
              <a key={channel.label} href={channel.href}>
                {Inner}
              </a>
            ) : (
              <div key={channel.label}>{Inner}</div>
            );
          })}

          {channels.length === 0 && (
            <div className="glass rounded-2xl p-6 text-sm text-muted-foreground">
              Contact details are being configured. Check back shortly — or use the form to
              send us a message.
            </div>
          )}

          <div className="glass rounded-2xl p-5 flex items-start gap-4">
            <div className="h-11 w-11 rounded-xl bg-primary/20 grid place-items-center shrink-0">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Response time</p>
              <p className="font-semibold">We reply as soon as we can, usually within 1-2 business days.</p>
            </div>
          </div>
        </div>

        {/* Form — only shown when a real delivery address exists server-side */}
        {settings.support_email ? (
          <ContactForm />
        ) : (
          <div className="glass rounded-2xl p-8 text-center space-y-3">
            <h3 className="text-lg font-bold">Contact form unavailable</h3>
            <p className="text-sm text-muted-foreground">
              The store support email has not been configured yet, so this form cannot deliver
              messages. Please check back soon.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
