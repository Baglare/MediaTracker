import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { annotationToolAccessForHost } from "@/features/recommendations/evaluation/annotation-tool/server/access";
import { AnnotationToolClient } from "@/features/recommendations/evaluation/annotation-tool/ui/annotation-tool-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "D7 Annotation Tool · Local Development",
  robots: { index: false, follow: false },
};

export default async function RecommendationAnnotationPage() {
  const requestHeaders = await headers();
  if (!annotationToolAccessForHost(requestHeaders.get("host")).allowed) notFound();
  return <AnnotationToolClient />;
}
