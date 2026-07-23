import type { Metadata } from "next";
import { cookies } from "next/headers";

import { AppearanceRuntime } from "@/components/personalization/appearance-runtime";
import { StartupRuntime } from "@/components/personalization/startup-runtime";
import { RouteAppShell } from "@/components/app-shell/route-app-shell";
import {
  APPEARANCE_COOKIE_NAME,
  parseAppearanceCookie,
} from "@/lib/personalization/appearance-cookie";
import { resolveRootAppearanceAttributes } from "@/lib/personalization/appearance-runtime";
import { DEFAULT_APP_APPEARANCE_PREFERENCES } from "@/lib/personalization/defaults";
import "./globals.css";

export const metadata: Metadata = {
  title: "MediaTracker - Medya Takip Uygulaması",
  description:
    "Film, dizi, anime, manga, manhwa ve kitaplarını tek yerden takip et.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialIdentity = parseAppearanceCookie(
    cookieStore.get(APPEARANCE_COOKIE_NAME)?.value,
  );
  const initialAttributes = resolveRootAppearanceAttributes({
    ...DEFAULT_APP_APPEARANCE_PREFERENCES,
    baseTheme: initialIdentity.baseTheme,
    accentMode: initialIdentity.accentMode,
  }, "neutral", initialIdentity.resolvedTheme !== "porcelain");

  return (
    <html
      lang="tr"
      className="h-full antialiased"
      data-theme={initialAttributes.theme}
      data-base-theme={initialAttributes.baseTheme}
      data-accent-mode={initialAttributes.accentMode}
      data-resolved-accent={initialAttributes.resolvedAccent}
      data-effects={initialAttributes.effects}
      data-density={initialAttributes.density}
      style={{ colorScheme: initialAttributes.colorScheme }}
    >
      <body className="min-h-full flex flex-col font-sans">
        <AppearanceRuntime initialIdentity={initialIdentity}>
          <StartupRuntime>
            <RouteAppShell>{children}</RouteAppShell>
          </StartupRuntime>
        </AppearanceRuntime>
      </body>
    </html>
  );
}
