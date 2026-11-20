import { Megaphone } from "lucide-react";
import { getPublicStoreSettings } from "@/lib/storeSettings";
import { getResolvedTheme } from "@/lib/themes/server";

/**
 * B4 — announcement bar driven by the admin-managed `announcement` setting,
 * with the active theme taking precedence: a seasonal theme's
 * `assets.announcement` replaces the store-wide text while set (and the
 * theme's own bar text is cleared again when the theme rolls off — no
 * manual cleanup). Renders nothing while both are empty, so no placeholder
 * promo text is ever shown to visitors.
 */
export async function AnnouncementBar() {
  const [settings, { theme }] = await Promise.all([
    getPublicStoreSettings(),
    getResolvedTheme(),
  ]);

  const themeAnnouncement = theme.config.assets.announcement?.trim();
  const text = themeAnnouncement || settings.announcement;
  if (!text) return null;

  return (
    <div className="w-full bg-gradient-neon text-white text-center text-sm py-2 px-4 relative z-40">
      <span className="inline-flex items-center gap-2">
        <Megaphone className="h-3.5 w-3.5" />
        {text}
      </span>
    </div>
  );
}
