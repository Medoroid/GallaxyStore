import type { Metadata } from "next";
import CustomPrintStudio from "@/app/components/custom-print/CustomPrintStudio";

export const metadata: Metadata = {
  title: "Custom Print Studio | Gallaxy Store",
  description:
    "Upload your artwork, preview it on real product mockups and order custom prints through Galaxy Store.",
};

/**
 * Customer-facing Custom Print Studio. The quote-request workflow remains
 * available through /api/custom-print and the admin queue for unsupported
 * product types; this page is the self-service cart path.
 */
export default function CustomPrintPage() {
  return <CustomPrintStudio />;
}
