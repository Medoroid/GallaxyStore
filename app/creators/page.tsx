import type { Metadata } from "next";
import { CreatorsDirectoryView } from "@/app/components/CreatorsDirectoryView";
import { CreatorsUnavailable } from "@/app/components/CreatorsUnavailable";
import {
  fetchCreatorDirectory,
  MigrationsRequiredError,
} from "@/lib/creator/directory";

// ISR like the other public discovery pages (/stores, /creators/[username]):
// the directory is re-rendered every 5 minutes, tab/pagination-free so the
// page stays statically cacheable.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Creators | Gallaxy Store",
  description:
    "Discover independent creators and browse their approved products and gallery designs on Gallaxy Store.",
};

export default async function CreatorsPage() {
  // Pending manual migrations are a known condition: fall back to an honest
  // "not available yet" notice so both the build and the public page stay
  // truthful. Every other failure still throws to the error page. The JSX
  // itself is built outside the rejection handler (react-hooks rule).
  const data = await fetchCreatorDirectory().catch((error) => {
    if (error instanceof MigrationsRequiredError) return null;
    throw error;
  });

  if (!data) return <CreatorsUnavailable />;
  return (
    <CreatorsDirectoryView creators={data.creators} gallery={data.gallery} />
  );
}
