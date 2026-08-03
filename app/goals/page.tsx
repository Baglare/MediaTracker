import type { Metadata } from "next";

import { GoalsPageClient } from "@/features/goals/components/goals-page-client";

export const metadata: Metadata = {
  title: "Hedefler · MediaTracker",
  description: "Owner-scoped manuel medya hedeflerini yönet.",
};

export default function GoalsPage() {
  return <GoalsPageClient />;
}
