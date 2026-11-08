import { Megaphone } from "lucide-react";
import { getPublicStoreSettings } from "@/lib/storeSettings";

/**
 * B4 — announcement bar driven by the admin-managed `announcement` setting.
 * Renders nothing while the setting is empty, so no placeholder promo text
 * is ever shown to visitors.
 */
export async function AnnouncementBar() {
  const settings = await getPublicStoreSettings();
  if (!settings.announcement) return null;

  return (
    <div className="w-full bg-gradient-neon text-white text-center text-sm py-2 px-4 relative z-40">
      <span className="inline-flex items-center gap-2">
        <Megaphone className="h-3.5 w-3.5" />
        {settings.announcement}
      </span>
    </div>
  );
}
