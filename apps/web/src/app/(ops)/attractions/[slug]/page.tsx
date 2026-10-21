import { AttractionDetail } from "@/components/attraction-detail";
import { ATTRACTIONS } from "@/lib/demo/seed";

export const metadata = { title: "Attraction" };

// Required by the static (GitHub Pages) export; the seeded park's slugs. Other slugs still
// render on demand in the normal server build.
export function generateStaticParams() {
  return ATTRACTIONS.map((a) => ({ slug: a.slug }));
}

export default function AttractionPage() {
  return <AttractionDetail />;
}
