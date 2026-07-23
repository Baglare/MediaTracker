import type { ReactNode } from "react";

import { PageHero, type PageHeroTone } from "@/components/ui/page-hero";

export function AppPageHeader({
  title,
  subtitle,
  actions,
  icon,
  eyebrow,
  summary,
  tone = "neutral",
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  icon?: ReactNode;
  eyebrow?: string;
  summary?: ReactNode;
  tone?: PageHeroTone;
}) {
  return <PageHero title={title} description={subtitle} actions={actions} icon={icon} eyebrow={eyebrow} summary={summary} tone={tone} />;
}
